import type { PolicyConfig, PolicyDecision } from "./types";

/** FRCT-style treasury posture for the desk. */
export type RiskRegime = "defensive" | "neutral" | "aggressive" | "paused";

export type RegimeSnapshot = {
  regime: RiskRegime;
  label: string;
  score: number;
  remainingBaseUnits: string;
  usedBps: number;
  explain: string;
};

export function remainingDaily(
  config: PolicyConfig,
  dailySpentBaseUnits: bigint,
): bigint {
  const rem = config.dailyCapBaseUnits - dailySpentBaseUnits;
  return rem > 0n ? rem : 0n;
}

export function treasuryRiskScore(
  config: PolicyConfig,
  dailySpentBaseUnits: bigint,
): number {
  if (config.paused) return 100;
  if (config.dailyCapBaseUnits <= 0n) return 100;
  const used =
    Number((dailySpentBaseUnits * 10_000n) / config.dailyCapBaseUnits) / 100;
  const txTightness =
    config.perTxCapBaseUnits <= config.approvalThresholdBaseUnits ? 15 : 0;
  return Math.min(100, Math.round(used * 0.85 + txTightness));
}

export function deriveRegime(
  config: PolicyConfig,
  dailySpentBaseUnits: bigint,
): RegimeSnapshot {
  const rem = remainingDaily(config, dailySpentBaseUnits);
  const usedBps =
    config.dailyCapBaseUnits > 0n
      ? Number((dailySpentBaseUnits * 10_000n) / config.dailyCapBaseUnits)
      : 10_000;
  const score = treasuryRiskScore(config, dailySpentBaseUnits);

  if (config.paused) {
    return {
      regime: "paused",
      label: "Paused",
      score,
      remainingBaseUnits: rem.toString(),
      usedBps,
      explain: "Kill-switch engaged — all agent spends are blocked.",
    };
  }

  if (usedBps >= 7_000 || rem < config.approvalThresholdBaseUnits) {
    return {
      regime: "defensive",
      label: "Defensive",
      score,
      remainingBaseUnits: rem.toString(),
      usedBps,
      explain:
        "Daily headroom is tight — prefer under-threshold allowlisted spends only.",
    };
  }

  if (usedBps >= 3_500) {
    return {
      regime: "neutral",
      label: "Neutral",
      score,
      remainingBaseUnits: rem.toString(),
      usedBps,
      explain: "Balanced runway. Above-threshold spends still need a human.",
    };
  }

  return {
    regime: "aggressive",
    label: "Aggressive",
    score,
    remainingBaseUnits: rem.toString(),
    usedBps,
    explain: "Ample daily capacity. Policy still enforces allowlists and caps.",
  };
}

export function proposalRiskScore(args: {
  amountBaseUnits: bigint;
  config: PolicyConfig;
  decision: PolicyDecision;
  resource: string;
  allowlisted: boolean;
}): number {
  let score = 10;
  if (args.decision.status === "block") score += 55;
  if (args.decision.status === "needs_approval") score += 30;
  if (!args.allowlisted) score += 25;
  if (args.amountBaseUnits > args.config.approvalThresholdBaseUnits) score += 15;
  if (args.amountBaseUnits > args.config.perTxCapBaseUnits) score += 20;
  if (args.resource.includes("evil") || args.resource.includes("drain")) {
    score += 20;
  }
  return Math.min(100, score);
}

export type PaymentQuote = {
  amountBaseUnits: string;
  amountUsdc: string;
  resource: string;
  payee: string;
  settlementKind: string;
  mint: string;
  narrative: string;
};

export function buildPaymentQuote(args: {
  amountBaseUnits: bigint;
  resource: string;
  payee: string;
  settlementKind: string;
  mint: string;
}): PaymentQuote {
  const usdc = Number(args.amountBaseUnits) / 1_000_000;
  return {
    amountBaseUnits: args.amountBaseUnits.toString(),
    amountUsdc: usdc.toFixed(6),
    resource: args.resource,
    payee: args.payee,
    settlementKind: args.settlementKind,
    mint: args.mint,
    narrative:
      args.settlementKind === "x402"
        ? `x402 quote → pay ${usdc.toFixed(2)} USDC → resume resource`
        : `SPL USDC transfer of ${usdc.toFixed(2)} USDC`,
  };
}
