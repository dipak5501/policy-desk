import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  consumeWalletChallenge,
  issueWalletSession,
} from "@/lib/security/session";
import { PublicKey } from "@solana/web3.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verify a Phantom-signed challenge. Connected address alone is not auth —
 * signature over the nonce message is required.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      wallet?: string;
      nonce?: string;
      message?: string;
      signatureBase58?: string;
    };
    if (!body.wallet || !body.nonce || !body.message || !body.signatureBase58) {
      return NextResponse.json(
        { error: "wallet, nonce, message, signatureBase58 required" },
        { status: 400 },
      );
    }
    if (!consumeWalletChallenge(body.wallet, body.nonce)) {
      return NextResponse.json(
        { error: "Challenge missing or expired" },
        { status: 401 },
      );
    }
    const pubkey = new PublicKey(body.wallet);
    const ok = nacl.sign.detached.verify(
      new TextEncoder().encode(body.message),
      bs58.decode(body.signatureBase58),
      pubkey.toBytes(),
    );
    if (!ok) {
      return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }
    const session = issueWalletSession(body.wallet);
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
