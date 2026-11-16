import {
  appendStreamEvent,
  findLedgerBySignature,
} from "@/lib/ledger/store";
import type { LedgerEntry, StreamEvent } from "@/lib/ledger/types";

export type StreamMatchStatus = "matched" | "unmatched" | "no_signature";

export type ReconcileResult = {
  event: StreamEvent;
  matchStatus: StreamMatchStatus;
  matchedEntryId?: string;
  matchedEntry?: LedgerEntry;
};

/**
 * QuickNode Streams → Policy Desk reconcile.
 * Matches observed Solana signatures to ledger settlements.
 * Unmatched hits are security signals (unexpected USDC movement).
 */
export function reconcileStreamPayload(input: {
  signature?: string;
  raw?: unknown;
  summary?: string;
}): ReconcileResult {
  const signature = input.signature?.trim() || undefined;

  if (!signature) {
    const event = appendStreamEvent({
      summary: input.summary ?? "Stream event · no signature",
      raw: input.raw,
      matchStatus: "no_signature",
    });
    return { event, matchStatus: "no_signature" };
  }

  const matched = findLedgerBySignature(signature);
  if (matched) {
    const event = appendStreamEvent({
      signature,
      summary:
        input.summary ??
        `Streams matched settle · ${matched.label} · ${signature.slice(0, 8)}…`,
      raw: input.raw,
      matchStatus: "matched",
      matchedEntryId: matched.id,
    });
    return {
      event,
      matchStatus: "matched",
      matchedEntryId: matched.id,
      matchedEntry: matched,
    };
  }

  const event = appendStreamEvent({
    signature,
    summary:
      input.summary ??
      `Streams unmatched transfer · ${signature.slice(0, 8)}… (not in ledger)`,
    raw: input.raw,
    matchStatus: "unmatched",
  });
  return { event, matchStatus: "unmatched" };
}

export function streamsReconcileEnabled(): boolean {
  return true;
}
