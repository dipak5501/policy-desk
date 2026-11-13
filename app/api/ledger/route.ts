import { NextResponse } from "next/server";
import { listLedger } from "@/lib/ledger/store";
import { listAudit } from "@/lib/security/audit";
import { readOperatorSession, readWalletSession } from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const wallet = readWalletSession(request);
  const isOperator = readOperatorSession(request);
  if (!wallet && !isOperator) {
    return NextResponse.json(
      { error: "Wallet or operator session required" },
      { status: 401 },
    );
  }

  const entries = listLedger().filter((e) => {
    if (isOperator) return true;
    return e.fromOwner === wallet || (!e.fromOwner && false);
  });

  return NextResponse.json({
    entries,
    audit: isOperator ? listAudit(40) : listAudit(40).filter((a) => {
      // purchasers see only their entry-related audit when entryId known
      if (!a.entryId) return false;
      return entries.some((e) => e.id === a.entryId);
    }),
  });
}
