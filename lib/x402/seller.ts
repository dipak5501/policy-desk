import { DEMO_PAYEE } from "@/lib/policy/config";
import { X402_DEVNET_NETWORK } from "@/lib/solana/config";
import {
  DEFAULT_X402_PRICE_BASE_UNITS,
  defaultWeatherRequirement,
  defaultWeatherResource,
  type PaymentPayload,
  type PaymentRequiredBody,
  type PaymentResponseBody,
  requirementAmount,
} from "./types";

export function weatherPayTo(): string {
  return process.env.X402_PAY_TO ?? DEMO_PAYEE;
}

export function buildWeatherChallenge(amount?: string): PaymentRequiredBody {
  const req = defaultWeatherRequirement(weatherPayTo());
  if (amount) req.amount = amount;
  return {
    x402Version: 2,
    resource: defaultWeatherResource(),
    accepts: [req],
    error: "Payment Required",
  };
}

/**
 * Local demo facilitator: verify payload shape + amount, then acknowledge.
 * Full self-facilitated broadcast happens via settle confirm for signed SPL.
 */
export function verifyWeatherPayment(
  payload: PaymentPayload,
  expectedAmount = DEFAULT_X402_PRICE_BASE_UNITS,
): PaymentResponseBody {
  const accepted = payload.accepted;
  if (!accepted || accepted.scheme !== "exact") {
    return {
      x402Version: 2,
      success: false,
      network: X402_DEVNET_NETWORK,
      errorReason: "Missing exact requirement",
    };
  }
  if (requirementAmount(accepted) !== expectedAmount) {
    return {
      x402Version: 2,
      success: false,
      network: X402_DEVNET_NETWORK,
      errorReason: `Amount mismatch: expected ${expectedAmount}`,
    };
  }
  if (!payload.payload?.transaction) {
    return {
      x402Version: 2,
      success: false,
      network: X402_DEVNET_NETWORK,
      errorReason: "Missing signed transaction payload",
    };
  }
  return {
    x402Version: 2,
    success: true,
    network: accepted.network,
    transaction: payload.payload.transaction,
  };
}
