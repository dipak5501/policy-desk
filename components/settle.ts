import { Transaction } from "@solana/web3.js";
import type { LedgerEntry } from "@/lib/ledger/types";
import { csrfHeaders } from "./csrfStore";

type PhantomLike = {
  signTransaction: (tx: Transaction) => Promise<Transaction>;
};

export async function settleEntry(args: {
  entryId: string;
  fromOwner: string;
  provider: PhantomLike;
  selfPay?: boolean;
}): Promise<LedgerEntry> {
  const prepareRes = await fetch("/api/settle/prepare", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({
      entryId: args.entryId,
      selfPay: args.selfPay,
    }),
  });
  const prepare = await prepareRes.json();
  if (!prepareRes.ok) {
    throw new Error(prepare.error ?? "Prepare failed");
  }
  if (!prepare.simulation?.ok) {
    throw new Error(
      prepare.simulation?.error ??
        prepare.error ??
        "Dry-run simulation failed — fix balances/fees before signing",
    );
  }

  const raw = Buffer.from(prepare.transactionBase64 as string, "base64");
  const tx = Transaction.from(raw);
  const signed = await args.provider.signTransaction(tx);
  const signedBase64 = Buffer.from(
    signed.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  const confirmRes = await fetch("/api/settle/confirm", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({
      entryId: args.entryId,
      prepareId: prepare.entry?.prepareId,
      signedTransactionBase64: signedBase64,
    }),
  });
  const confirm = await confirmRes.json();
  if (!confirmRes.ok) {
    throw new Error(confirm.error ?? "Confirm failed");
  }
  return confirm.entry as LedgerEntry;
}

export async function approveEntry(
  entryId: string,
  intentHash?: string,
): Promise<LedgerEntry> {
  const res = await fetch(`/api/approvals/${entryId}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(),
    },
    body: JSON.stringify({ action: "approve", intentHash }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Approve failed");
  return data.entry as LedgerEntry;
}
