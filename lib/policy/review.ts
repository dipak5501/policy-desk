import type { PolicyConfig, PolicyDecision, SpendRequest } from "./types";

export const SPL_TRANSFER_RESOURCE = "spl:transfer";

/**
 * Allowlisting rules (fail closed):
 * - Relative merchant paths must be exactly allowlisted AND paired with a trusted origin
 *   from server config / catalog (never arbitrary Host headers).
 * - Absolute URLs must match an allowlisted exact resource string OR
 *   (allowlisted origin host+port+scheme AND exact allowlisted pathname).
 * - Pathname-only matches on foreign origins are rejected.
 */
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

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  if (h.endsWith(".local")) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

export function resourceAllowed(
  request: SpendRequest,
  config: PolicyConfig,
): boolean {
  const resource = request.resource;

  if (resource === SPL_TRANSFER_RESOURCE) {
    return true;
  }

  // Exact allowlisted string (including query for deep weather)
  if (config.allowlistedResources.includes(resource)) {
    if (resource.startsWith("/")) {
      // Relative path: require trusted origin binding from catalog/server
      const origin = request.trustedOrigin;
      if (!origin) return false;
      try {
        const u = new URL(origin);
        if (u.protocol !== "http:" && u.protocol !== "https:") return false;
        if (!config.allowlistedDomains.includes(u.hostname)) return false;
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  // Absolute URL: require scheme+host(+port) allowlist AND exact path allowlist
  try {
    if (!resource.startsWith("http://") && !resource.startsWith("https://")) {
      return false;
    }
    const url = new URL(resource);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;

    const path = url.pathname;
    const pathOk = config.allowlistedResources.some(
      (r) => r.startsWith("/") && (r === path || r.split("?")[0] === path),
    );
    if (!pathOk) return false;

    // Reject unapproved hosts — pathname match alone is insufficient
    if (!config.allowlistedDomains.includes(url.hostname)) {
      return false;
    }

    // Optional: block unexpected private-network targets unless explicitly allowlisted
    if (
      isPrivateOrLocalHostname(url.hostname) &&
      !config.allowlistedDomains.includes(url.hostname)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
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
 * @param dailySpentExcludingThis Intent already reserved should be excluded by caller.
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
    try {
      if (request.resource.startsWith("http")) {
        const host = new URL(request.resource).hostname;
        if (!config.allowlistedDomains.includes(host)) {
          return {
            status: "block",
            code: "domain_blocked",
            reason: `Origin host ${host} is not on the allowlist (pathname match alone is insufficient)`,
          };
        }
      }
    } catch {
      /* fall through */
    }
    return {
      status: "block",
      code: "not_allowlisted",
      reason:
        "Spend requires an allowlisted payee and an allowlisted origin+resource from the server catalog",
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
