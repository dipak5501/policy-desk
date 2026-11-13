import { NextResponse } from "next/server";
import { listLedger } from "@/lib/ledger/store";
import { listAudit } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    entries: listLedger(),
    audit: listAudit(40),
  });
}
