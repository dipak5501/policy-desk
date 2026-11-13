import { DEVNET_USDC_MINT } from "@/lib/solana/config";
import type { PolicyConfig } from "./types";

/**
 * Demo merchant for approved USDC settles.
 * Deterministic seed: sha256("policy-desk-demo-payee-v1").
 */
export const DEMO_PAYEE =
  process.env.NEXT_PUBLIC_DEMO_PAYEE ??
  "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr";

export const DEMO_X402_RESOURCE = "/api/x402/weather";
export const DEMO_X402_MARKET_RESOURCE = "/api/x402/market";
export const DEMO_X402_RESEARCH_RESOURCE = "/api/x402/research";
export const DEMO_BLOCKED_RESOURCE = "https://evil.example/buy-everything";

function parseBaseUnits(value: string | undefined, fallback: bigint): bigint {
  if (!value) return fallback;
  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
}

export function defaultPolicyConfig(): PolicyConfig {
  return {
    perTxCapBaseUnits: parseBaseUnits(
      process.env.POLICY_PER_TX_CAP_BASE_UNITS,
      1_000_000n,
    ),
    dailyCapBaseUnits: parseBaseUnits(
      process.env.POLICY_DAILY_CAP_BASE_UNITS,
      5_000_000n,
    ),
    approvalThresholdBaseUnits: parseBaseUnits(
      process.env.POLICY_APPROVAL_THRESHOLD_BASE_UNITS,
      500_000n,
    ),
    allowlistedPayees: [DEMO_PAYEE],
    allowlistedResources: [
      DEMO_X402_RESOURCE,
      DEMO_X402_MARKET_RESOURCE,
      DEMO_X402_RESEARCH_RESOURCE,
      "spl:transfer",
    ],
    allowlistedDomains: ["127.0.0.1", "localhost"],
    allowedMint: process.env.NEXT_PUBLIC_USDC_MINT ?? DEVNET_USDC_MINT,
    paused: process.env.POLICY_PAUSED === "true",
  };
}
