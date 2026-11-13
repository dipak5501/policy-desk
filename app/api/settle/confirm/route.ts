import { NextResponse } from "next/server";
import { getLedgerEntry, setLedgerStatus } from "@/lib/ledger/store";
import { appendAudit } from "@/lib/security/audit";
import { assertDevnetOnly, getConnection } from "@/lib/solana/connection";
import { explorerTx } from "@/lib/solana/config";
import { explainSolanaError } from "@/lib/solana/errors";
import { Transaction } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertDevnetOnly();
    const body = (await request.json()) as {
      entryId?: string;
      prepareId?: string;
      signedTransactionBase64?: string;
    };

    if (!body.entryId || !body.signedTransactionBase64) {
      return NextResponse.json(
        { error: "entryId and signedTransactionBase64 are required" },
        { status: 400 },
      );
    }

    const entry = getLedgerEntry(body.entryId);
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    if (entry.status === "settled") {
      return NextResponse.json(
        { error: "Already settled", entry },
        { status: 409 },
      );
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

    setLedgerStatus(entry.id, "confirming");

    const raw = Buffer.from(body.signedTransactionBase64, "base64");
    const tx = Transaction.from(raw);
    const connection = getConnection();
    const signature = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
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

    appendAudit("settle.confirm", {
      entryId: entry.id,
      signature,
      explorerUrl: settled.explorerUrl,
    });

    return NextResponse.json({
      entry: settled,
      signature,
      explorerUrl: settled.explorerUrl,
      feePayer: tx.feePayer?.toBase58(),
    });
  } catch (err) {
    try {
      const body = (await request.clone().json()) as { entryId?: string };
      if (body.entryId) {
        setLedgerStatus(body.entryId, "failed", {
          error: explainSolanaError(err),
        });
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
