import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  allowRate,
  clientKey,
  rateLimitResponse,
  readJsonBody,
} from "@/lib/security/httpLimits";
import {
  consumeWalletChallenge,
  getWalletChallenge,
  issueWalletSession,
} from "@/lib/security/session";
import { PublicKey } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verify a Phantom-signed challenge. Connected address alone is not auth —
 * signature must cover the exact server-issued challenge message.
 * Nonce is consumed only after successful verification.
 */
export async function POST(request: Request) {
  if (!allowRate(`wallet-verify:${clientKey(request)}`, 20, 60_000)) {
    return rateLimitResponse();
  }
  try {
    const parsed = await readJsonBody<{
      wallet?: string;
      nonce?: string;
      message?: string;
      signatureBase58?: string;
    }>(request, 8_192);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status },
      );
    }
    const body = parsed.body;
    if (!body.wallet || !body.nonce || !body.signatureBase58) {
      return NextResponse.json(
        { error: "wallet, nonce, signatureBase58 required" },
        { status: 400 },
      );
    }

    const challenge = getWalletChallenge(body.wallet);
    if (!challenge) {
      return NextResponse.json(
        { error: "Challenge missing or expired" },
        { status: 401 },
      );
    }
    if (challenge.nonce !== body.nonce) {
      return NextResponse.json(
        { error: "Challenge nonce mismatch" },
        { status: 401 },
      );
    }
    // Reject client-supplied alternate messages even if signed
    if (body.message && body.message !== challenge.message) {
      return NextResponse.json(
        { error: "Challenge message mismatch" },
        { status: 401 },
      );
    }

    const pubkey = new PublicKey(body.wallet);
    const ok = nacl.sign.detached.verify(
      new TextEncoder().encode(challenge.message),
      bs58.decode(body.signatureBase58),
      pubkey.toBytes(),
    );
    if (!ok) {
      // Do not consume — allow a retry within expiry
      return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }

    if (!consumeWalletChallenge(body.wallet, body.nonce)) {
      return NextResponse.json(
        { error: "Challenge already consumed or expired" },
        { status: 401 },
      );
    }

    const session = issueWalletSession(body.wallet, request);
    const res = NextResponse.json({
      ok: true,
      wallet: body.wallet,
      csrf: session.csrf,
    });
    for (const c of session.setCookies) {
      res.headers.append("Set-Cookie", c);
    }
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
