import { NextResponse } from "next/server";
import {
  getLedgerEntry,
  setLedgerStatus,
  syncTaskBudgetFromLedger,
} from "@/lib/ledger/store";
import { appendAudit } from "@/lib/security/audit";
import { assertDevnetOnly, getConnection } from "@/lib/solana/connection";
import { explorerTx } from "@/lib/solana/config";
import { explainSolanaError } from "@/lib/solana/errors";
import { validateSignedUsdcTransfer } from "@/lib/solana/validateTransfer";
import { Transaction } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let entryIdForFail: string | undefined;
  try {
    assertDevnetOnly();
    const body = (await request.json()) as {
      entryId?: string;
      prepareId?: string;
      signedTransactionBase64?: string;
      toOwner?: string;
    };

    if (!body.entryId || !body.signedTransactionBase64) {
      return NextResponse.json(
        { error: "entryId and signedTransactionBase64 are required" },
        { status: 400 },
      );
    }
    entryIdForFail = body.entryId;

    const entry = getLedgerEntry(body.entryId);
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Idempotent: already settled
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
    if (entry.prepareId && body.prepareId && entry.prepareId !== body.prepareId) {
      return NextResponse.json(
        { error: "prepareId mismatch — re-run prepare" },
        { status: 409 },
      );
    }
    if (
      entry.prepareExpiresAt &&
      Date.parse(entry.prepareExpiresAt) < Date.now()
    ) {
      setLedgerStatus(entry.id, "failed", { error: "Prepare expired" });
      return NextResponse.json(
        { error: "Prepare expired — re-run prepare" },
        { status: 410 },
      );
    }
    if (!entry.fromOwner) {
      return NextResponse.json(
        { error: "Payment intent has no bound fromOwner" },
        { status: 400 },
      );
    }

    const toOwner = body.toOwner ?? entry.payee;
    const raw = Buffer.from(body.signedTransactionBase64, "base64");
    const tx = Transaction.from(raw);

    const validation = validateSignedUsdcTransfer(tx, {
      fromOwner: entry.fromOwner,
      toOwner,
      mint: entry.mint,
      amountBaseUnits: entry.amountBaseUnits,
    });
    if (!validation.ok) {
      appendAudit("settle.reject_template", {
        entryId: entry.id,
        error: validation.error,
      });
      setLedgerStatus(entry.id, "failed", {
        error: `Transaction template rejected: ${validation.error}`,
      });
      return NextResponse.json(
        { error: `Transaction template rejected: ${validation.error}` },
        { status: 400 },
      );
    }

    setLedgerStatus(entry.id, "confirming");

    const connection = getConnection();

    // Reconcile: if a signature was already recorded mid-flight, verify it
    if (entry.signature) {
      const status = await connection.getSignatureStatuses([entry.signature]);
      const value = status.value[0];
      if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
        if (!value.err) {
          const settled = setLedgerStatus(entry.id, "settled", {
            explorerUrl: explorerTx(entry.signature),
            paymentResponse:
              entry.settlementKind === "x402" ? "x402-resumed" : "spl",
            error: undefined,
          });
          if (entry.taskId) syncTaskBudgetFromLedger(entry.taskId);
          return NextResponse.json({
            entry: settled,
            signature: entry.signature,
            explorerUrl: settled.explorerUrl,
            reconciled: true,
          });
        }
      }
    }

    const signature = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    // Persist signature early so timeout can reconcile later
    setLedgerStatus(entry.id, "confirming", { signature });

    const latest = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      "confirmed",
    );

    const settled = setLedgerStatus(entry.id, "settled", {
      signature,
      explorerUrl: explorerTx(signature),
      paymentResponse: entry.settlementKind === "x402" ? "x402-resumed" : "spl",
      error: undefined,
    });
    if (entry.taskId) syncTaskBudgetFromLedger(entry.taskId);

    appendAudit("settle.confirm", {
      entryId: entry.id,
      signature,
      explorerUrl: settled.explorerUrl,
      validated: true,
    });

    return NextResponse.json({
      entry: settled,
      signature,
      explorerUrl: settled.explorerUrl,
      feePayer: tx.feePayer?.toBase58(),
    });
  } catch (err) {
    try {
      if (entryIdForFail) {
        const existing = getLedgerEntry(entryIdForFail);
        // Timeout / send failure: keep confirming if signature exists (uncertain)
        if (existing?.signature && existing.status === "confirming") {
          setLedgerStatus(entryIdForFail, "confirming", {
            error: `Uncertain settlement — reconcile before retry: ${explainSolanaError(err)}`,
          });
        } else {
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
