import { NextResponse } from "next/server";
import { listCatalogWithFixtures } from "@/lib/catalog/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public catalog view — never includes paidBody. */
export async function GET() {
  const resources = listCatalogWithFixtures().map(
    ({ paidBody: _paid, ...publicRow }) => publicRow,
  );
  return NextResponse.json({
    resources,
    catalogKind: "demo",
    note: "Demo catalog (3 purchasable + 1 adversarial fixture). Agents resolve resourceId only — no arbitrary merchant URLs. Paid bodies unlock after settlement.",
  });
}
