import { NextResponse } from "next/server";
import { buildWeatherChallenge } from "@/lib/x402/seller";
import { fulfillWeatherIfSettled } from "@/lib/x402/fulfill";
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

/**
 * GET without payment → 402 quote.
 * With PAYMENT-SIGNATURE or ?entryId= after settle → deliver content (no re-charge).
 */
export async function GET(request: Request) {
  const amount = amountFromUrl(request);
  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get("entryId") ?? undefined;
  const sigHeader = request.headers.get("payment-signature");

  // Prefer ledger settle-before-deliver when entryId is known
  if (entryId) {
    const fulfilled = fulfillWeatherIfSettled({
      amountBaseUnits: amount,
      entryId,
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
      { status: 402 },
    );
  }

  if (!sigHeader) {
    return NextResponse.json(buildWeatherChallenge(amount), { status: 402 });
  }

  try {
    const payload = JSON.parse(sigHeader) as PaymentPayload & {
      entryId?: string;
    };
    // Signature alone is not enough — require settled ledger entry
    const hint =
      payload.entryId ??
      (typeof payload.payload?.transaction === "string"
        ? undefined
        : undefined);
    const fulfilled = fulfillWeatherIfSettled({
      amountBaseUnits: amount,
      entryId: hint,
      signatureHint:
        typeof payload.payload?.transaction === "string"
          ? payload.payload.transaction.slice(0, 88)
          : undefined,
    });
    if (fulfilled.ok) {
      return NextResponse.json(fulfilled.body);
    }
    // Fallback: look for any matching settled unpaid delivery
    const again = fulfillWeatherIfSettled({ amountBaseUnits: amount });
    if (again.ok) {
      return NextResponse.json(again.body);
    }
    return NextResponse.json(
      {
        ...buildWeatherChallenge(amount),
        error:
          "Payment signature present but ledger settlement not confirmed — settle via Policy Desk first",
      },
      { status: 402 },
    );
  } catch {
    return NextResponse.json(buildWeatherChallenge(amount), { status: 402 });
  }
}

export async function POST(request: Request) {
  const amount = amountFromUrl(request);
  try {
    const body = (await request.json()) as PaymentPayload & {
      entryId?: string;
    };
    const fulfilled = fulfillWeatherIfSettled({
      amountBaseUnits: amount,
      entryId: body.entryId,
    });
    if (fulfilled.ok) {
      return NextResponse.json(fulfilled.body);
    }
    const again = fulfillWeatherIfSettled({ amountBaseUnits: amount });
    if (again.ok) {
      return NextResponse.json(again.body);
    }
    return NextResponse.json(
      {
        error:
          fulfilled.error ??
          "Settle on Devnet via Policy Desk before resource delivery",
        challenge: buildWeatherChallenge(amount),
      },
      { status: 402 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
