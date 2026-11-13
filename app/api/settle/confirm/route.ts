import { NextResponse } from "next/server";
import {
  getLedgerEntry,
  setLedgerStatus,
  syncTaskBudgetFromLedger,
  withLedgerLock,
} from "@/lib/ledger/store";
import { appendAudit } from "@/lib/security/audit";
import { assertCsrf, readWalletSession } from "@/lib/security/session";
import { assertDevnetOnly, getConnection } from "@/lib/solana/connection";
import { explorerTx } from "@/lib/solana/config";
import { explainSolanaError } from "@/lib/solana/errors";
import { validateSignedUsdcTransfer } from "@/lib/solana/validateTransfer";
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signatureFromSignedTx(raw: Buffer): string {
  // Legacy Transaction: first signature slot
  const tx = Transaction.from(raw);
  const sig = tx.signature;
  if (!sig) {
    // Fall back to first signatures entry
    const s = tx.signatures[0]?.signature;
    if (!s) throw new Error("Signed transaction missing signature");
    return bs58.encode(s);
  }
  return bs58.encode(sig);
}

export async function POST(request: Request) {
  let entryIdForFail: string | undefined;
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
      prepareId?: string;
      signedTransactionBase64?: string;
      toOwner?: string;
    };

    if (body.toOwner) {
      return NextResponse.json(
        { error: "Client destination override is not allowed" },
        { status: 400 },
      );
    }

    if (!body.entryId || !body.signedTransactionBase64 || !body.prepareId) {
      return NextResponse.json(
        {
          error:
            "entryId, prepareId, and signedTransactionBase64 are required",
        },
        { status: 400 },
      );
    }
    entryIdForFail = body.entryId;

    return await withLedgerLock(async () => {
      const entry = getLedgerEntry(body.entryId!);
      if (!entry) {
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });
      }

      if (entry.fromOwner !== wallet) {
        return NextResponse.json(
          { error: "Wallet session does not own this payment intent" },
          { status: 403 },
        );
      }

      if (entry.status === "settled" && entry.signature) {
        return NextResponse.json({
          entry,
          signature: entry.signature,
          explorerUrl: entry.explorerUrl,
          idempotent: true,
        });
      }

      if (entry.status !== "ready_to_sign" && entry.status !== "confirming") {
        return NextResponse.json(
          { error: `Cannot confirm from status ${entry.status}` },
          { status: 400 },
        );
      }

      if (!entry.prepareId || entry.prepareId !== body.prepareId) {
        return NextResponse.json(
          { error: "prepareId required and must match prepared attempt" },
          { status: 409 },
        );
      }

      if (
        entry.prepareExpiresAt &&
        Date.parse(entry.prepareExpiresAt) < Date.now() &&
        !entry.signature
      ) {
        // Do not release if a signature may have landed — keep confirming if sig exists
        setLedgerStatus(entry.id, "failed", { error: "Prepare expired" });
        return NextResponse.json(
          { error: "Prepare expired — re-run prepare" },
          { status: 410 },
        );
      }

      if (!entry.fromOwner || !entry.preparedToOwner) {
        return NextResponse.json(
          { error: "Prepared attempt missing bound fromOwner/toOwner" },
          { status: 400 },
        );
      }

      const raw = Buffer.from(body.signedTransactionBase64!, "base64");
      const tx = Transaction.from(raw);

      const validation = validateSignedUsdcTransfer(tx, {
        fromOwner: entry.fromOwner,
        toOwner: entry.preparedToOwner,
        mint: entry.mint,
        amountBaseUnits: entry.amountBaseUnits,
      });
      if (!validation.ok) {
        appendAudit("settle.reject_template", {
          entryId: entry.id,
          error: validation.error,
        });
        // Do not overwrite uncertain/successful prior state
        if (entry.status === "confirming" && entry.signature) {
          return NextResponse.json(
            {
              error: `Transaction template rejected: ${validation.error}`,
              entry,
            },
            { status: 400 },
          );
        }
        setLedgerStatus(entry.id, "failed", {
          error: `Transaction template rejected: ${validation.error}`,
        });
        return NextResponse.json(
          { error: `Transaction template rejected: ${validation.error}` },
          { status: 400 },
        );
      }

      let derivedSig: string;
      try {
        derivedSig = signatureFromSignedTx(raw);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : String(err) },
          { status: 400 },
        );
      }

      // Persist signature before broadcast for reconcile
      setLedgerStatus(entry.id, "confirming", { signature: derivedSig });

      const connection = getConnection();

      // Reconcile existing signature first
      const status = await connection.getSignatureStatuses([derivedSig]);
      const existing = status.value[0];
      if (
        existing &&
        (existing.confirmationStatus === "confirmed" ||
          existing.confirmationStatus === "finalized")
      ) {
        if (existing.err) {
          setLedgerStatus(entry.id, "failed", {
            signature: derivedSig,
            error: `On-chain execution failed: ${JSON.stringify(existing.err)}`,
          });
          return NextResponse.json(
            { error: "Transaction confirmed but failed execution", entry: getLedgerEntry(entry.id) },
            { status: 400 },
          );
        }
        const settled = setLedgerStatus(entry.id, "settled", {
          signature: derivedSig,
          explorerUrl: explorerTx(derivedSig),
          paymentResponse:
            entry.settlementKind === "x402" ? "x402-resumed" : "spl",
          error: undefined,
          deliveryStatus: "pending",
        });
        if (entry.taskId) syncTaskBudgetFromLedger(entry.taskId);
        return NextResponse.json({
          entry: settled,
          signature: derivedSig,
          explorerUrl: settled.explorerUrl,
          reconciled: true,
        });
      }

      try {
        await connection.sendRawTransaction(raw, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
      } catch (sendErr) {
        // Ambiguous — keep confirming with signature for later reconcile
        setLedgerStatus(entry.id, "confirming", {
          signature: derivedSig,
          error: `Uncertain broadcast: ${explainSolanaError(sendErr)}`,
        });
        return NextResponse.json(
          {
            error: `Broadcast uncertain — reconcile before retry: ${explainSolanaError(sendErr)}`,
            signature: derivedSig,
            entry: getLedgerEntry(entry.id),
          },
          { status: 409 },
        );
      }

      const blockhash =
        entry.preparedBlockhash ??
        (await connection.getLatestBlockhash("confirmed")).blockhash;
      const lastValidBlockHeight =
        entry.preparedLastValidBlockHeight ??
        (await connection.getLatestBlockhash("confirmed")).lastValidBlockHeight;

      const confirmation = await connection.confirmTransaction(
        {
          signature: derivedSig,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed",
      );

      if (confirmation.value.err) {
        setLedgerStatus(entry.id, "failed", {
          signature: derivedSig,
          error: `On-chain execution failed: ${JSON.stringify(confirmation.value.err)}`,
        });
        return NextResponse.json(
          {
            error: "Transaction failed on-chain — not marked settled",
            err: confirmation.value.err,
          },
          { status: 400 },
        );
      }

      const settled = setLedgerStatus(entry.id, "settled", {
        signature: derivedSig,
        explorerUrl: explorerTx(derivedSig),
        paymentResponse: entry.settlementKind === "x402" ? "x402-resumed" : "spl",
        error: undefined,
        deliveryStatus: "pending",
      });
      if (entry.taskId) syncTaskBudgetFromLedger(entry.taskId);

      appendAudit("settle.confirm", {
        entryId: entry.id,
        signature: derivedSig,
        explorerUrl: settled.explorerUrl,
        validated: true,
      });

      return NextResponse.json({
        entry: settled,
        signature: derivedSig,
        explorerUrl: settled.explorerUrl,
        feePayer: tx.feePayer?.toBase58(),
      });
    });
  } catch (err) {
    try {
      if (entryIdForFail) {
        const existing = getLedgerEntry(entryIdForFail);
        if (existing?.signature && existing.status === "confirming") {
          setLedgerStatus(entryIdForFail, "confirming", {
            error: `Uncertain settlement — reconcile before retry: ${explainSolanaError(err)}`,
          });
        } else if (existing && existing.status !== "settled") {
          setLedgerStatus(entryIdForFail, "failed", {
            error: explainSolanaError(err),
          });
        }
      }
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { error: explainSolanaError(err) },
      { status: 500 },
    );
  }
}
