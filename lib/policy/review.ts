import type { PolicyConfig, PolicyDecision, SpendRequest } from "./types";

export const SPL_TRANSFER_RESOURCE = "spl:transfer";

function extractDomain(resource: string): string | undefined {
  try {
    if (resource.startsWith("/")) return "localhost";
    const url = new URL(resource);
    return url.hostname;
  } catch {
    return undefined;
  }
}

export function resourcePath(resource: string): string {
  try {
    if (resource.startsWith("/")) {
      return resource.split("?")[0]!.split("#")[0]!;
    }
    return new URL(resource).pathname;
  } catch {
    return resource.split("?")[0] ?? resource;
  }
}

function resourceAllowed(request: SpendRequest, config: PolicyConfig): boolean {
  const path = resourcePath(request.resource);
  if (
    config.allowlistedResources.includes(request.resource) ||
    config.allowlistedResources.includes(path)
  ) {
    return true;
  }

  try {
    if (request.resource.startsWith("http")) {
      const url = new URL(request.resource);
      if (config.allowlistedResources.includes(url.pathname)) return true;
      const domain = request.domain ?? url.hostname;
      if (
        domain &&
        config.allowlistedDomains.includes(domain) &&
        config.allowlistedResources.some(
          (r) => r.startsWith("/") && url.pathname === r,
        )
      ) {
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function isAllowlisted(
  request: SpendRequest,
  config: PolicyConfig,
): boolean {
  const payeeOk = config.allowlistedPayees.includes(request.payee);

  if (request.resource === SPL_TRANSFER_RESOURCE) {
    return payeeOk;
  }

  return payeeOk && resourceAllowed(request, config);
}

/**
 * Deterministic spend firewall. Runs BEFORE any signature or RPC send.
 * The model (if any) may propose; this module decides.
 */
export function reviewSpend(
  request: SpendRequest,
  config: PolicyConfig,
  dailySpentBaseUnits: bigint = 0n,
): PolicyDecision {
  if (config.paused) {
    return { status: "block", code: "paused", reason: "Treasury is paused" };
  }

  if (request.amountBaseUnits <= 0n) {
    return {
      status: "block",
      code: "invalid_amount",
      reason: "Amount must be positive",
    };
  }

  if (request.mint !== config.allowedMint) {
    return {
      status: "block",
      code: "wrong_mint",
      reason: `Only mint ${config.allowedMint} is allowed`,
    };
  }

  if (!isAllowlisted(request, config)) {
    const domain = request.domain ?? extractDomain(request.resource);
    if (
      domain &&
      !config.allowlistedDomains.includes(domain) &&
      !config.allowlistedResources.includes(request.resource) &&
      !config.allowlistedPayees.includes(request.payee)
    ) {
      return {
        status: "block",
        code: "domain_blocked",
        reason: `Domain ${domain} is not on the allowlist`,
      };
    }
    return {
      status: "block",
      code: "not_allowlisted",
      reason:
        "Spend requires an allowlisted payee and an allowlisted resource/domain",
    };
  }

  if (request.amountBaseUnits > config.perTxCapBaseUnits) {
    return {
      status: "block",
      code: "over_per_tx_cap",
      reason: `Amount exceeds per-transaction cap (${config.perTxCapBaseUnits} base units)`,
    };
  }

  if (dailySpentBaseUnits + request.amountBaseUnits > config.dailyCapBaseUnits) {
    return {
      status: "block",
      code: "over_daily_cap",
      reason: "Amount would exceed daily USDC cap",
    };
  }

  if (request.amountBaseUnits > config.approvalThresholdBaseUnits) {
    return {
      status: "needs_approval",
      reason: `Above human-approval threshold (${config.approvalThresholdBaseUnits} base units)`,
    };
  }

  return { status: "allow", reason: "Within policy — ready to settle" };
}

export function withSessionPayee(
  config: PolicyConfig,
  payee: string | undefined,
): PolicyConfig {
  if (!payee) return config;
  if (config.allowlistedPayees.includes(payee)) return config;
  return {
    ...config,
    allowlistedPayees: [...config.allowlistedPayees, payee],
  };
}
