import { NextResponse } from "next/server";
import { fulfillPurchasedIfSettled } from "@/lib/x402/fulfill";
import { buildWeatherChallenge } from "@/lib/x402/seller";
import { DEFAULT_X402_PRICE_BASE_UNITS } from "@/lib/x402/types";
import { readWalletSession } from "@/lib/security/session";

function amountFromUrl(request: Request, fallback: string): string {
  const { searchParams } = new URL(request.url);
  return searchParams.get("amount") ?? fallback;
}

/**
 * Shared x402 demo-merchant handlers for catalog products.
 * GET without entryId → 402 quote; delivery requires wallet + settled entryId.
 */
export function makeMerchantHandlers(defaultAmount = DEFAULT_X402_PRICE_BASE_UNITS) {
  async function GET(request: Request) {
    const amount = amountFromUrl(request, defaultAmount);
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

    const fulfilled = fulfillPurchasedIfSettled({
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

  async function POST(request: Request) {
    const amount = amountFromUrl(request, defaultAmount);
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
      const fulfilled = fulfillPurchasedIfSettled({
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

  return { GET, POST };
}
