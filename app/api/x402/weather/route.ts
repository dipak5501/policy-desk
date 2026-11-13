import { NextResponse } from "next/server";
import { buildWeatherChallenge } from "@/lib/x402/seller";
import { fulfillWeatherIfSettled } from "@/lib/x402/fulfill";
import {
  DEFAULT_X402_PRICE_BASE_UNITS,
} from "@/lib/x402/types";
import { readWalletSession } from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function amountFromUrl(request: Request): string {
  const { searchParams } = new URL(request.url);
  return searchParams.get("amount") ?? DEFAULT_X402_PRICE_BASE_UNITS;
}

/**
 * GET without auth → 402 quote (local demo paywall).
 * Delivery requires wallet session + exact settled entryId.
 * This is a ledger-gated demo merchant — not claimed as a full hosted x402 facilitator.
 */
export async function GET(request: Request) {
  const amount = amountFromUrl(request);
  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get("entryId") ?? undefined;

  if (!entryId) {
    return NextResponse.json(buildWeatherChallenge(amount), { status: 402 });
  }

  const wallet = readWalletSession(request);
  if (!wallet) {
    return NextResponse.json(
      {
        ...buildWeatherChallenge(amount),
        error: "Wallet session required to unlock paid content",
      },
      { status: 401 },
    );
  }

  const fulfilled = fulfillWeatherIfSettled({
    entryId,
    ownerWallet: wallet,
  });
  if (fulfilled.ok) {
    return NextResponse.json(fulfilled.body);
  }
  return NextResponse.json(
    {
      ...buildWeatherChallenge(amount),
      error: fulfilled.error,
      code: fulfilled.code,
    },
    { status: fulfilled.code === "forbidden" ? 403 : 402 },
  );
}

export async function POST(request: Request) {
  const amount = amountFromUrl(request);
  try {
    const body = (await request.json()) as { entryId?: string };
    if (!body.entryId) {
      return NextResponse.json(
        {
          error: "entryId required — no anonymous settled-payment fallback",
          challenge: buildWeatherChallenge(amount),
        },
        { status: 402 },
      );
    }
    const wallet = readWalletSession(request);
    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet session required" },
        { status: 401 },
      );
    }
    const fulfilled = fulfillWeatherIfSettled({
      entryId: body.entryId,
      ownerWallet: wallet,
    });
    if (fulfilled.ok) {
      return NextResponse.json(fulfilled.body);
    }
    return NextResponse.json(
      {
        error: fulfilled.error,
        code: fulfilled.code,
        challenge: buildWeatherChallenge(amount),
      },
      { status: fulfilled.code === "forbidden" ? 403 : 402 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
