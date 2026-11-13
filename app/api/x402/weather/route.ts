import { NextResponse } from "next/server";
import {
  buildWeatherChallenge,
  verifyWeatherPayment,
} from "@/lib/x402/seller";
import {
  DEFAULT_X402_PRICE_BASE_UNITS,
  type PaymentPayload,
} from "@/lib/x402/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function amountFromUrl(request: Request): string {
  const { searchParams } = new URL(request.url);
  return searchParams.get("amount") ?? DEFAULT_X402_PRICE_BASE_UNITS;
}

/** GET without payment → 402 quote. With PAYMENT-SIGNATURE → resource. */
export async function GET(request: Request) {
  const amount = amountFromUrl(request);
  const sig = request.headers.get("payment-signature");

  if (!sig) {
    return NextResponse.json(buildWeatherChallenge(amount), { status: 402 });
  }

  try {
    const payload = JSON.parse(sig) as PaymentPayload;
    const verified = verifyWeatherPayment(payload, amount);
    if (!verified.success) {
      return NextResponse.json(
        { ...buildWeatherChallenge(amount), error: verified.errorReason },
        { status: 402 },
      );
    }
    return NextResponse.json({
      ok: true,
      resource: "weather",
      forecast: "Clear skies on Solana Devnet — payment accepted.",
      paidAmount: amount,
      resumed: true,
      note: "x402 quote → pay → resume demo path",
    });
  } catch {
    return NextResponse.json(buildWeatherChallenge(amount), { status: 402 });
  }
}

export async function POST(request: Request) {
  const amount = amountFromUrl(request);
  try {
    const payload = (await request.json()) as PaymentPayload;
    const verified = verifyWeatherPayment(payload, amount);
    if (!verified.success) {
      return NextResponse.json(
        { error: verified.errorReason, challenge: buildWeatherChallenge(amount) },
        { status: 402 },
      );
    }
    return NextResponse.json({
      ok: true,
      resource: "weather",
      forecast: "Clear skies on Solana Devnet — payment accepted.",
      paidAmount: amount,
      resumed: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
