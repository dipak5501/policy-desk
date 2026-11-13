import { createHash } from "node:crypto";
import {
  getLedgerEntry,
  listLedger,
  setLedgerStatus,
  updateLedgerEntry,
} from "@/lib/ledger/store";
import type { LedgerEntry } from "@/lib/ledger/types";

export type WeatherPayload = {
  ok: true;
  resource: string;
  forecast: string;
  paidAmount: string;
  resumed: true;
  entryId: string;
  contentDigest: string;
  note: string;
};

function digestContent(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Deliver paid weather content only after ledger shows settled for this amount/resource.
 * Retries fulfillment without requiring a new charge.
 */
export function fulfillWeatherIfSettled(args: {
  amountBaseUnits: string;
  resourcePath?: string;
  entryId?: string;
  signatureHint?: string;
}):
  | { ok: true; body: WeatherPayload; entry: LedgerEntry }
  | { ok: false; error: string; code: "not_settled" | "not_found" } {
  let entry: LedgerEntry | undefined;
  if (args.entryId) {
    entry = getLedgerEntry(args.entryId);
  } else if (args.signatureHint) {
    entry = listLedger().find((e) => e.signature === args.signatureHint);
  } else {
    entry = listLedger().find(
      (e) =>
        e.status === "settled" &&
        e.amountBaseUnits === args.amountBaseUnits &&
        e.resource.startsWith("/api/x402/weather") &&
        !e.deliveredResource,
    );
  }

  if (!entry) {
    return { ok: false, error: "No matching settled payment found", code: "not_found" };
  }
  if (entry.status !== "settled" && entry.status !== "paid_delivery_pending") {
    return {
      ok: false,
      error: `Payment not settled (status=${entry.status})`,
      code: "not_settled",
    };
  }
  if (entry.amountBaseUnits !== args.amountBaseUnits) {
    return {
      ok: false,
      error: "Settled amount does not match quote",
      code: "not_settled",
    };
  }

  // Idempotent re-delivery
  if (entry.deliveredResource && entry.contentDigest) {
    const body: WeatherPayload = {
      ok: true,
      resource: "weather",
      forecast: entry.deliveredResource,
      paidAmount: args.amountBaseUnits,
      resumed: true,
      entryId: entry.id,
      contentDigest: entry.contentDigest,
      note: "Re-delivered without re-charging (settle-before-deliver).",
    };
    return { ok: true, body, entry };
  }

  const forecast =
    "Clear skies on Solana Devnet — structured brief for the research agent. Wind calm; visibility high. (Team-operated merchant content.)";
  const contentDigest = digestContent(forecast);

  const updated = updateLedgerEntry(entry.id, {
    deliveredResource: forecast,
    contentDigest,
    paymentResponse: "x402-fulfilled",
  });
  if (updated.status === "paid_delivery_pending") {
    setLedgerStatus(updated.id, "settled");
  }

  const body: WeatherPayload = {
    ok: true,
    resource: "weather",
    forecast,
    paidAmount: args.amountBaseUnits,
    resumed: true,
    entryId: updated.id,
    contentDigest,
    note: "Content delivered only after on-chain settlement confirmation.",
  };
  return { ok: true, body, entry: updated };
}
