import { NextResponse } from "next/server";
import { fetchBalances } from "@/lib/solana/balances";
import { explainSolanaError } from "@/lib/solana/errors";
import { assertDevnetOnly } from "@/lib/solana/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertDevnetOnly();
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    if (!address) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }
    const balances = await fetchBalances(address);
    return NextResponse.json({ balances });
  } catch (err) {
    return NextResponse.json(
      { error: explainSolanaError(err) },
      { status: 500 },
    );
  }
}
