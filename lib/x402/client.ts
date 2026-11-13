import type { PaymentRequiredBody, PaymentRequirement } from "./types";
import { requirementAmount } from "./types";
import { DEVNET_USDC_MINT } from "@/lib/solana/config";

export async function fetchPaymentChallenge(
  resourceUrl: string,
  origin?: string,
): Promise<PaymentRequiredBody> {
  const url = resourceUrl.startsWith("http")
    ? resourceUrl
    : `${origin ?? "http://127.0.0.1:3000"}${resourceUrl}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (res.status !== 402) {
    const text = await res.text();
    throw new Error(
      `Expected HTTP 402 Payment Required from ${url}, got ${res.status}: ${text.slice(0, 200)}`,
    );
  }

  return (await res.json()) as PaymentRequiredBody;
}

export function selectExactUsdcRequirement(
  body: PaymentRequiredBody,
  expectedAmount?: string,
): PaymentRequirement {
  const match = body.accepts.find(
    (a) =>
      a.scheme === "exact" &&
      a.asset === DEVNET_USDC_MINT &&
      (!expectedAmount || requirementAmount(a) === expectedAmount),
  );
  if (!match) {
    throw new Error("No exact USDC payment requirement in 402 challenge");
  }
  return match;
}
