import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  dailySpentBaseUnits,
  getLedgerEntry,
  setLedgerStatus,
} from "@/lib/ledger/store";
import { getActivePolicy } from "@/lib/policy/active";
import { getCatalogResource } from "@/lib/catalog/resources";
import { isSettledDestinationAllowed } from "@/lib/policy/destination";
import {
  reviewSpend,
  withSessionPayee,
  SPL_TRANSFER_RESOURCE,
} from "@/lib/policy/review";
import { appendAudit } from "@/lib/security/audit";
import { assertCsrf, readWalletSession } from "@/lib/security/session";
import { assertDevnetOnly, getConnection } from "@/lib/solana/connection";
import { explainSolanaError } from "@/lib/solana/errors";
import {
  buildUsdcTransfer,
  serializeTransactionBase64,
  simulateTransfer,
} from "@/lib/solana/transfer";
import {
  fetchPaymentChallenge,
  selectExactUsdcRequirement,
} from "@/lib/x402/client";
import { requirementAmount } from "@/lib/x402/types";
import { matchesCatalogSettlementDestination } from "@/lib/x402/catalogBinding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertDevnetOnly();
    const wallet = readWalletSession(request);
    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet session required" },
        { status: 401 },
      );
    }
    if (!assertCsrf(request)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }

    const body = (await request.json()) as {
      entryId?: string;
      selfPay?: boolean;
      dryRun?: boolean;
    };
    if (!body.entryId) {
      return NextResponse.json(
        { error: "entryId is required" },
        { status: 400 },
      );
    }

    const entry = getLedgerEntry(body.entryId);
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (entry.fromOwner && entry.fromOwner !== wallet) {
      return NextResponse.json(
        { error: "Wallet session does not own this payment intent" },
        { status: 403 },
      );
    }

    if (entry.status === "settled") {
      return NextResponse.json(
        {
          error: "Entry already settled — replay denied",
          entry,
          idempotent: true,
        },
        { status: 409 },
      );
    }
    if (entry.status === "confirming") {
      return NextResponse.json(
        {
          error: entry.signature
            ? "Entry has an in-flight signature — reconcile via confirm before re-preparing"
            : "Entry is already confirming on-chain",
          entry,
          signature: entry.signature,
        },
        { status: 409 },
      );
    }
    if (
      entry.quoteExpiresAt &&
      Date.parse(entry.quoteExpiresAt) < Date.now()
    ) {
      setLedgerStatus(entry.id, "failed", { error: "Quote expired" });
      return NextResponse.json(
        { error: "Quote expired — re-propose for a fresh quote" },
        { status: 410 },
      );
    }
    if (["pending", "awaiting_approval"].includes(entry.status)) {
      return NextResponse.json(
        { error: "Human approval required before settle" },
        { status: 403 },
      );
    }
    if (
      !["approved", "ready_to_sign", "failed", "cancelled", "policy_evaluated"].includes(
        entry.status,
      )
    ) {
      return NextResponse.json(
        { error: `Entry status ${entry.status} is not settleable` },
        { status: 400 },
      );
    }

    if (entry.resourceId && body.selfPay) {
      return NextResponse.json(
        { error: "Catalog-bound purchases cannot use a self-pay destination" },
        { status: 400 },
      );
    }

    // Bind wallet once
    if (!entry.fromOwner) {
      setLedgerStatus(entry.id, entry.status, { fromOwner: wallet });
    }

    const base = getActivePolicy();
    const config =
      body.selfPay || entry.resource === SPL_TRANSFER_RESOURCE
        ? withSessionPayee(base, wallet)
        : base;

    const payee =
      body.selfPay || entry.resource === SPL_TRANSFER_RESOURCE
        ? wallet
        : entry.payee;

    if (
      entry.resourceId &&
      !matchesCatalogSettlementDestination(entry, payee)
    ) {
      return NextResponse.json(
        { error: "Intent diverged from server catalog settlement binding" },
        { status: 409 },
      );
    }

    if (
      !isSettledDestinationAllowed({
        payee,
        fromOwner: wallet,
        resource: body.selfPay ? SPL_TRANSFER_RESOURCE : entry.resource,
        config,
      })
    ) {
      return NextResponse.json(
        { error: "Settle destination not allowed by policy" },
        { status: 403 },
      );
    }

    const decision = reviewSpend(
      {
        id: entry.id,
        label: entry.label,
        resource: body.selfPay ? SPL_TRANSFER_RESOURCE : entry.resource,
        payee,
        amountBaseUnits: BigInt(entry.amountBaseUnits),
        mint: entry.mint,
        trustedOrigin: entry.resourceId
          ? getCatalogResource(entry.resourceId)?.trustedOrigin
          : undefined,
      },
      config,
      // Exclude this intent so recheck does not double-count its reservation
      dailySpentBaseUnits(entry.id),
    );

    if (decision.status === "block") {
      setLedgerStatus(entry.id, "blocked", {
        policyStatus: "block",
        policyReason: decision.reason,
        policyCode: decision.code,
        settlementKind: "none",
      });
      return NextResponse.json(
        { error: decision.reason, decision },
        { status: 403 },
      );
    }
    if (decision.status === "needs_approval" && entry.status !== "approved") {
      return NextResponse.json(
        { error: "Human approval still required", decision },
        { status: 403 },
      );
    }

    let amount = BigInt(entry.amountBaseUnits);
    let toOwner = payee;

    if (entry.settlementKind === "x402" && !body.selfPay) {
      const catalog = entry.resourceId
        ? getCatalogResource(entry.resourceId)
        : undefined;
      const origin =
        catalog?.trustedOrigin ?? new URL(request.url).origin;
      const challenge = await fetchPaymentChallenge(entry.resource, origin);
      const req = selectExactUsdcRequirement(challenge, entry.amountBaseUnits);
      amount = BigInt(requirementAmount(req));
      toOwner = req.payTo;
      if (amount !== BigInt(entry.amountBaseUnits)) {
        return NextResponse.json(
          {
            error: `x402 quote amount ${amount} does not match intent ${entry.amountBaseUnits}`,
          },
          { status: 409 },
        );
      }
      if (toOwner !== entry.payee) {
        return NextResponse.json(
          {
            error: `x402 payTo ${toOwner} does not match intent payee ${entry.payee}`,
          },
          { status: 409 },
        );
      }
    }

    const built = await buildUsdcTransfer({
      fromOwner: wallet,
      toOwner,
      amountBaseUnits: amount,
      mint: entry.mint,
    });

    const simulation = await simulateTransfer(built.transaction);
    const prepareId = randomUUID();
    const expires = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const connection = getConnection();
    const latest = await connection.getLatestBlockhash("confirmed");

    const updated = setLedgerStatus(entry.id, "ready_to_sign", {
      fromOwner: wallet,
      prepareId,
      prepareExpiresAt: expires,
      simulateOk: simulation.ok,
      feeLamportsEstimate: String(simulation.feeLamportsEstimate),
      error: simulation.ok ? undefined : simulation.error,
      preparedTxBase64: serializeTransactionBase64(built.transaction),
      preparedBlockhash: built.transaction.recentBlockhash ?? latest.blockhash,
      preparedLastValidBlockHeight: latest.lastValidBlockHeight,
      preparedToOwner: toOwner,
    });

    appendAudit("settle.prepare", {
      entryId: entry.id,
      prepareId,
      simulateOk: simulation.ok,
      dryRun: Boolean(body.dryRun),
      feeLamportsEstimate: simulation.feeLamportsEstimate,
    });

    return NextResponse.json({
      entry: updated,
      transactionBase64: serializeTransactionBase64(built.transaction),
      simulation,
      fee: {
        lamportsEstimate: simulation.feeLamportsEstimate,
        note: "Payer signs and pays SOL fee on Devnet. No sponsored gas in this MVP.",
      },
      dryRun: Boolean(body.dryRun),
      next: body.dryRun || !simulation.ok ? "review" : "sign",
    });
  } catch (err) {
    return NextResponse.json(
      { error: explainSolanaError(err) },
      { status: 500 },
    );
  }
}
