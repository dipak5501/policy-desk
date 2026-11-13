import { createHash } from "node:crypto";
import {
  catalogResourcePathPrefixes,
  getCatalogResource,
} from "@/lib/catalog/resources";
import { getLedgerEntry, updateLedgerEntry } from "@/lib/ledger/store";
import type { LedgerEntry } from "@/lib/ledger/types";

export type PurchasedPayload = {
  ok: true;
  resource: string;
  resourceId: string;
  title: string;
  forecast: string;
  content: string;
  paidAmount: string;
  resumed: true;
  entryId: string;
  contentDigest: string;
  note: string;
  /** Honest label: demo catalog content, not a live oracle. */
  demoCatalog: true;
  sampleContent: true;
};

function digestContent(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function resourcePathMatchesCatalog(
  entryResource: string,
  catalogResource: string,
): boolean {
  const entryPath = entryResource.split("?")[0] ?? entryResource;
  const catalogPath = catalogResource.split("?")[0] ?? catalogResource;
  if (entryPath === catalogPath) return true;
  return catalogResourcePathPrefixes().some(
    (p) => entryPath === p || entryPath.startsWith(`${p}/`),
  );
}

export type FulfillArgs = {
  entryId: string;
  /** Authenticated wallet session — must own the payment intent. */
  ownerWallet: string;
  expectedProductIds?: string[];
};

/**
 * Deliver demo-catalog content only for the rightful purchaser’s settled intent.
 * No “any matching settled payment” fallback.
 */
export function fulfillPurchasedIfSettled(args: FulfillArgs):
  | { ok: true; body: PurchasedPayload; entry: LedgerEntry }
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
      error: "Intent is not bound to a purchasable catalog product",
      code: "mismatch",
    };
  }

  if (!resourcePathMatchesCatalog(entry.resource, catalog.resource)) {
    return {
      ok: false,
      error: "Resource path does not match catalog binding",
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

  const toPayload = (
    content: string,
    contentDigest: string,
    note: string,
  ): PurchasedPayload => ({
    ok: true,
    resource: catalog.id,
    resourceId: catalog.id,
    title: catalog.title,
    forecast: content,
    content,
    paidAmount: entry.amountBaseUnits,
    resumed: true,
    entryId: entry.id,
    contentDigest,
    note,
    demoCatalog: true,
    sampleContent: true,
  });

  // Idempotent re-delivery for rightful owner
  if (entry.deliveredResource && entry.contentDigest) {
    return {
      ok: true,
      body: toPayload(
        entry.deliveredResource,
        entry.contentDigest,
        "Re-delivered without re-charging.",
      ),
      entry,
    };
  }

  const content = catalog.paidBody;
  const contentDigest = digestContent(content);

  const updated = updateLedgerEntry(entry.id, {
    deliveredResource: content,
    contentDigest,
    deliveryStatus: "delivered",
    paymentResponse: "x402-fulfilled",
  });

  return {
    ok: true,
    body: toPayload(
      content,
      contentDigest,
      "Demo catalog content delivered after verified settlement for this intent only.",
    ),
    entry: updated,
  };
}

/** @deprecated Prefer fulfillPurchasedIfSettled — kept for call-site compatibility. */
export const fulfillWeatherIfSettled = fulfillPurchasedIfSettled;
export type WeatherPayload = PurchasedPayload;
