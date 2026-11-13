import { getCatalogResource } from "@/lib/catalog/resources";
import type { LedgerEntry } from "@/lib/ledger/types";

type CatalogIntent = Pick<
  LedgerEntry,
  | "resourceId"
  | "resource"
  | "payee"
  | "amountBaseUnits"
  | "mint"
  | "settlementKind"
>;

/** Catalog purchases must settle to the same server-bound merchant they quote. */
export function matchesCatalogSettlementDestination(
  entry: CatalogIntent,
  destination: string,
): boolean {
  if (!entry.resourceId) return false;
  const catalog = getCatalogResource(entry.resourceId);
  return Boolean(
    catalog &&
      !catalog.adversarialFixture &&
      entry.resource === catalog.resource &&
      entry.payee === catalog.payee &&
      entry.amountBaseUnits === catalog.amountBaseUnits &&
      entry.mint === catalog.mint &&
      entry.settlementKind === catalog.settlementKind &&
      destination === catalog.payee,
  );
}
