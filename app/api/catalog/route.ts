import { NextResponse } from "next/server";
import { listCatalog } from "@/lib/catalog/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    resources: listCatalog(),
    note: "Server-side catalog only — agents resolve resourceId; they cannot supply arbitrary merchant URLs.",
  });
}
