/** Spend request the agent wants to make (before any chain write). */
export type SpendRequest = {
  id?: string;
  label?: string;
  resource: string;
  payee: string;
  amountBaseUnits: bigint;
  mint: string;
  domain?: string;
  /** Server/catalog trusted origin for relative merchant paths. */
  trustedOrigin?: string;
};

export type PolicyDecision =
  | { status: "allow"; reason: string }
  | { status: "block"; reason: string; code: PolicyCode }
  | { status: "needs_approval"; reason: string };

export type PolicyCode =
  | "over_per_tx_cap"
  | "over_daily_cap"
  | "over_task_budget"
  | "not_allowlisted"
  | "wrong_mint"
  | "paused"
  | "invalid_amount"
  | "domain_blocked"
  | "unknown_resource";

export type PolicyConfig = {
  perTxCapBaseUnits: bigint;
  dailyCapBaseUnits: bigint;
  approvalThresholdBaseUnits: bigint;
  allowlistedPayees: string[];
  allowlistedResources: string[];
  allowlistedDomains: string[];
  allowedMint: string;
  paused: boolean;
};

export type PolicyConfigView = {
  perTxCapBaseUnits: string;
  dailyCapBaseUnits: string;
  approvalThresholdBaseUnits: string;
  allowlistedPayees: string[];
  allowlistedResources: string[];
  allowlistedDomains: string[];
  allowedMint: string;
  paused: boolean;
};

export function toPolicyView(config: PolicyConfig): PolicyConfigView {
  return {
    perTxCapBaseUnits: config.perTxCapBaseUnits.toString(),
    dailyCapBaseUnits: config.dailyCapBaseUnits.toString(),
    approvalThresholdBaseUnits: config.approvalThresholdBaseUnits.toString(),
    allowlistedPayees: [...config.allowlistedPayees],
    allowlistedResources: [...config.allowlistedResources],
    allowlistedDomains: [...config.allowlistedDomains],
    allowedMint: config.allowedMint,
    paused: config.paused,
  };
}
