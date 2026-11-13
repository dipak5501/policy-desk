import { NextResponse } from "next/server";
import {
  allowRate,
  clientKey,
  rateLimitResponse,
  readJsonBody,
} from "@/lib/security/httpLimits";
import { createWalletChallenge } from "@/lib/security/session";
import { PublicKey } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!allowRate(`wallet-challenge:${clientKey(request)}`, 30, 60_000)) {
    return rateLimitResponse();
  }
  try {
    const parsed = await readJsonBody<{ wallet?: string }>(request, 4_096);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status },
      );
    }
    const body = parsed.body;
    if (!body.wallet) {
      return NextResponse.json({ error: "wallet required" }, { status: 400 });
    }
    try {
      new PublicKey(body.wallet);
    } catch {
      return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
    }
    const challenge = createWalletChallenge(body.wallet);
    return NextResponse.json(challenge);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
