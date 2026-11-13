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
import {
  assertSignedMatchesPrepared,
  validateSignedUsdcTransfer,
} from "@/lib/solana/validateTransfer";
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signatureFromSignedTx(raw: Buffer): string {
  const tx = Transaction.from(raw);
  const sig = tx.signature;
  if (!sig) {
    const s = tx.signatures[0]?.signature;
    if (!s) throw new Error("Signed transaction missing signature");
    return bs58.encode(s);
  }
  return bs58.encode(sig);
}

async function settleFromConfirmedSig(
  entryId: string,
  signature: string,
  settlementKind: string | undefined,
  taskId: string | undefined,
  reconciled: boolean,
) {
  const settled = setLedgerStatus(entryId, "settled", {
    signature,
    explorerUrl: explorerTx(signature),
    paymentResponse: settlementKind === "x402" ? "x402-resumed" : "spl",
    error: undefined,
    deliveryStatus: "pending",
  });
  if (taskId) syncTaskBudgetFromLedger(taskId);
  appendAudit("settle.confirm", {
    entryId,
    signature,
    explorerUrl: settled.explorerUrl,
    validated: true,
    reconciled,
  });
  return NextResponse.json({
    entry: settled,
    signature,
    explorerUrl: settled.explorerUrl,
    reconciled,
  });
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

      if (!entry.preparedTxBase64) {
        return NextResponse.json(
          { error: "Prepared attempt missing preparedTxBase64" },
          { status: 400 },
        );
      }

      const connection = getConnection();

      // Reconcile any stored signature BEFORE accepting another transaction
      if (entry.signature) {
        const status = await connection.getSignatureStatuses([entry.signature]);
        const existing = status.value[0];
        if (
          existing &&
          (existing.confirmationStatus === "confirmed" ||
            existing.confirmationStatus === "finalized")
        ) {
          if (existing.err) {
            setLedgerStatus(entry.id, "failed", {
              signature: entry.signature,
              error: `On-chain execution failed: ${JSON.stringify(existing.err)}`,
            });
            return NextResponse.json(
              {
                error: "Stored signature confirmed but failed execution",
                entry: getLedgerEntry(entry.id),
              },
              { status: 400 },
            );
          }
          return settleFromConfirmedSig(
            entry.id,
            entry.signature,
            entry.settlementKind,
            entry.taskId,
            true,
          );
        }

        // Still in-flight / unknown — do not accept a different signed tx
        let incomingSig: string | undefined;
        try {
          incomingSig = signatureFromSignedTx(
            Buffer.from(body.signedTransactionBase64!, "base64"),
          );
        } catch {
          incomingSig = undefined;
        }
        if (incomingSig && incomingSig !== entry.signature) {
          return NextResponse.json(
            {
              error:
                "Entry already has an in-flight signature — reconcile before submitting another transaction",
              signature: entry.signature,
              entry: getLedgerEntry(entry.id),
            },
            { status: 409 },
          );
        }
        // Same signature resubmitted — fall through to broadcast/confirm path
      }

      const raw = Buffer.from(body.signedTransactionBase64!, "base64");
      const tx = Transaction.from(raw);

      const preparedBind = assertSignedMatchesPrepared(tx, entry.preparedTxBase64);
      if (!preparedBind.ok) {
        appendAudit("settle.reject_prepared_mismatch", {
          entryId: entry.id,
          error: preparedBind.error,
        });
        if (entry.status === "confirming" && entry.signature) {
          return NextResponse.json(
            { error: preparedBind.error, entry },
            { status: 400 },
          );
        }
        setLedgerStatus(entry.id, "failed", { error: preparedBind.error });
        return NextResponse.json({ error: preparedBind.error }, { status: 400 });
      }

      // Expected properties derived from stored prepared attempt (not client body)
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

      // Persist signature from signed bytes before broadcast
      setLedgerStatus(entry.id, "confirming", { signature: derivedSig });

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
            {
              error: "Transaction confirmed but failed execution",
              entry: getLedgerEntry(entry.id),
            },
            { status: 400 },
          );
        }
        return settleFromConfirmedSig(
          entry.id,
          derivedSig,
          entry.settlementKind,
          entry.taskId,
          true,
        );
      }

      try {
        await connection.sendRawTransaction(raw, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
      } catch (sendErr) {
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
