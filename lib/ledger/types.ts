import type { PolicyCode, PolicyDecision } from "@/lib/policy/types";

export type PaymentStatus =
  | "proposed"
  | "policy_evaluated"
  | "blocked"
  | "pending"
  | "awaiting_approval"
  | "approved"
  | "ready_to_sign"
  | "confirming"
  | "settled"
  | "failed"
  | "rejected"
  | "cancelled";

export type SettlementKind = "spl_usdc" | "x402" | "none";

export type LedgerEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  resource: string;
  payee: string;
  amountBaseUnits: string;
  mint: string;
  status: PaymentStatus;
  policyStatus?: PolicyDecision["status"];
  policyReason?: string;
  policyCode?: PolicyCode;
  settlementKind: SettlementKind;
  intentHash?: string;
  fromOwner?: string;
  prepareId?: string;
  prepareExpiresAt?: string;
  signature?: string;
  explorerUrl?: string;
  paymentResponse?: string;
  error?: string;
  simulateOk?: boolean;
  feeLamportsEstimate?: string;
  scenario?: "blocked_demo" | "approved_demo" | "approval_demo" | "custom";
};

export type CreateLedgerInput = {
  label: string;
  resource: string;
  payee: string;
  amountBaseUnits: string;
  mint: string;
  settlementKind?: SettlementKind;
  scenario?: LedgerEntry["scenario"];
};

export const IMMUTABLE_INTENT_FIELDS = [
  "label",
  "resource",
  "payee",
  "amountBaseUnits",
  "mint",
  "scenario",
] as const;

/** Visible state machine for the desk UI. */
export const PAYMENT_STATE_ORDER: PaymentStatus[] = [
  "proposed",
  "policy_evaluated",
  "awaiting_approval",
  "approved",
  "ready_to_sign",
  "confirming",
  "settled",
];
