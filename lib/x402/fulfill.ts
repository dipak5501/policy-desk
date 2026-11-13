import { createHash } from "node:crypto";
import { getCatalogResource } from "@/lib/catalog/resources";
import { getLedgerEntry, updateLedgerEntry } from "@/lib/ledger/store";
import type { LedgerEntry } from "@/lib/ledger/types";
import { DEMO_X402_RESOURCE } from "@/lib/policy/config";

export type WeatherPayload = {
  ok: true;
  resource: string;
  forecast: string;
  paidAmount: string;
  resumed: true;
  entryId: string;
  contentDigest: string;
  note: string;
  sampleContent: true;
};

function digestContent(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export type FulfillArgs = {
  entryId: string;
  /** Authenticated wallet session — must own the payment intent. */
  ownerWallet: string;
  expectedProductIds?: string[];
};

/**
 * Deliver weather sample content only for the rightful purchaser’s settled intent.
 * No “any matching settled payment” fallback.
 */
export function fulfillWeatherIfSettled(args: FulfillArgs):
  | { ok: true; body: WeatherPayload; entry: LedgerEntry }
  | {
      ok: false;
      error: string;
      code:
        | "not_settled"
        | "not_found"
        | "forbidden"
        | "mismatch";
    } {
  const entry = getLedgerEntry(args.entryId);
  if (!entry) {
    return { ok: false, error: "Payment intent not found", code: "not_found" };
  }

  if (!entry.fromOwner || entry.fromOwner !== args.ownerWallet) {
    return {
      ok: false,
      error: "Authenticated wallet does not own this payment intent",
      code: "forbidden",
    };
  }

  if (entry.status !== "settled" && entry.status !== "paid_delivery_pending") {
    return {
      ok: false,
      error: `Payment not settled (status=${entry.status})`,
      code: "not_settled",
    };
  }

  if (!entry.signature) {
    return {
      ok: false,
      error: "Settled intent missing verified signature",
      code: "not_settled",
    };
  }

  const catalog = entry.resourceId
    ? getCatalogResource(entry.resourceId)
    : undefined;
  if (!catalog || catalog.adversarialFixture) {
    return {
      ok: false,
      error: "Intent is not bound to a purchasable weather product",
      code: "mismatch",
    };
  }

  if (!entry.resource.startsWith(DEMO_X402_RESOURCE.split("?")[0]!)) {
    return {
      ok: false,
      error: "Resource path is not the weather merchant product",
      code: "mismatch",
    };
  }

  if (entry.amountBaseUnits !== catalog.amountBaseUnits) {
    return {
      ok: false,
      error: "Amount does not match catalog quote",
      code: "mismatch",
    };
  }

  if (entry.payee !== catalog.payee || entry.mint !== catalog.mint) {
    return {
      ok: false,
      error: "Merchant/mint does not match catalog binding",
      code: "mismatch",
    };
  }

  if (
    args.expectedProductIds &&
    catalog.productId &&
    !args.expectedProductIds.includes(catalog.productId)
  ) {
    return {
      ok: false,
      error: "Product id mismatch",
      code: "mismatch",
    };
  }

  // Idempotent re-delivery for rightful owner
  if (entry.deliveredResource && entry.contentDigest) {
    const body: WeatherPayload = {
      ok: true,
      resource: "weather",
      forecast: entry.deliveredResource,
      paidAmount: entry.amountBaseUnits,
      resumed: true,
      entryId: entry.id,
      contentDigest: entry.contentDigest,
      note: "Re-delivered without re-charging.",
      sampleContent: true,
    };
    return { ok: true, body, entry };
  }

  const forecast =
    "[SAMPLE CONTENT — not live weather] Clear skies on Solana Devnet sample brief for the research agent. Wind calm; visibility high. Team-operated merchant fixture.";
  const contentDigest = digestContent(forecast);

  const updated = updateLedgerEntry(entry.id, {
    deliveredResource: forecast,
    contentDigest,
    deliveryStatus: "delivered",
    paymentResponse: "x402-fulfilled",
  });

  const body: WeatherPayload = {
    ok: true,
    resource: "weather",
    forecast,
    paidAmount: entry.amountBaseUnits,
    resumed: true,
    entryId: updated.id,
    contentDigest,
    note: "Sample content delivered after verified settlement for this intent only.",
    sampleContent: true,
  };
  return { ok: true, body, entry: updated };
}
