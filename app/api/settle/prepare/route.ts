import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  dailySpentBaseUnits,
  getLedgerEntry,
  setLedgerStatus,
} from "@/lib/ledger/store";
import { getActivePolicy } from "@/lib/policy/active";
import { isSettledDestinationAllowed } from "@/lib/policy/destination";
import {
  reviewSpend,
  withSessionPayee,
  SPL_TRANSFER_RESOURCE,
} from "@/lib/policy/review";
import { appendAudit } from "@/lib/security/audit";
import { assertDevnetOnly } from "@/lib/solana/connection";
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
import { PublicKey } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertDevnetOnly();
    const body = (await request.json()) as {
      entryId?: string;
      fromOwner?: string;
      selfPay?: boolean;
      dryRun?: boolean;
    };
    if (!body.entryId || !body.fromOwner) {
      return NextResponse.json(
        { error: "entryId and fromOwner are required" },
        { status: 400 },
      );
    }

    try {
      // eslint-disable-next-line no-new
      new PublicKey(body.fromOwner);
    } catch {
      return NextResponse.json(
        { error: "fromOwner is not a valid Solana public key" },
        { status: 400 },
      );
    }

    const entry = getLedgerEntry(body.entryId);
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
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
      // Uncertain settlement: do not create a replacement until reconciled
      return NextResponse.json(
        {
          error:
            entry.signature
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

    if (entry.fromOwner && entry.fromOwner !== body.fromOwner) {
      return NextResponse.json(
        {
          error:
            "fromOwner does not match the wallet bound to this payment intent",
        },
        { status: 403 },
      );
    }

    const base = getActivePolicy();
    const config =
      body.selfPay || entry.resource === SPL_TRANSFER_RESOURCE
        ? withSessionPayee(base, body.fromOwner)
        : base;

    const payee =
      body.selfPay || entry.resource === SPL_TRANSFER_RESOURCE
        ? body.fromOwner
        : entry.payee;

    if (
      !isSettledDestinationAllowed({
        payee,
        fromOwner: body.fromOwner,
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
      },
      config,
      dailySpentBaseUnits(),
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
      const origin = new URL(request.url).origin;
      const challenge = await fetchPaymentChallenge(entry.resource, origin);
      const req = selectExactUsdcRequirement(challenge, entry.amountBaseUnits);
      amount = BigInt(requirementAmount(req));
      toOwner = req.payTo;
      // Bind quote to immutable intent — reject drift
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
      fromOwner: body.fromOwner,
      toOwner,
      amountBaseUnits: amount,
      mint: entry.mint,
    });

    const simulation = await simulateTransfer(built.transaction);
    const prepareId = randomUUID();
    const expires = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const updated = setLedgerStatus(entry.id, "ready_to_sign", {
      fromOwner: body.fromOwner,
      prepareId,
      prepareExpiresAt: expires,
      simulateOk: simulation.ok,
      feeLamportsEstimate: String(simulation.feeLamportsEstimate),
      error: simulation.ok ? undefined : simulation.error,
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
