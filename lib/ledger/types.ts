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
  | "cancelled"
  | "paid_delivery_pending";

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
  /** Bound research task (optional for legacy entries). */
  taskId?: string;
  resourceId?: string;
  network?: string;
  policyVersion?: string;
  quoteExpiresAt?: string;
  quoteId?: string;
  approvalId?: string;
  approvalExpiresAt?: string;
  contentDigest?: string;
  deliveredResource?: string;
  reservationReleased?: boolean;
};

export type CreateLedgerInput = {
  label: string;
  resource: string;
  payee: string;
  amountBaseUnits: string;
  mint: string;
  settlementKind?: SettlementKind;
  scenario?: LedgerEntry["scenario"];
  taskId?: string;
  resourceId?: string;
  network?: string;
  policyVersion?: string;
  quoteExpiresAt?: string;
  quoteId?: string;
  fromOwner?: string;
};

export type BudgetSnapshot = {
  availableBaseUnits: string;
  reservedBaseUnits: string;
  confirmedBaseUnits: string;
  remainingBaseUnits: string;
  dailyCapBaseUnits: string;
};

/** QuickNode Streams webhook hits (optional — incomplete until reconcile). */
export type StreamEvent = {
  id: string;
  receivedAt: string;
  source: "quicknode_streams";
  signature?: string;
  summary: string;
  raw?: unknown;
};

export type TimelineEvent = {
  id: string;
  ts: string;
  kind: string;
  message: string;
  entryId?: string;
  meta?: Record<string, unknown>;
};

export type ResearchTask = {
  id: string;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  budgetBaseUnits: string;
  reservedBaseUnits: string;
  spentBaseUnits: string;
  status:
    | "running"
    | "awaiting_approval"
    | "awaiting_signature"
    | "completed"
    | "failed";
  mode: "fixture";
  timeline: TimelineEvent[];
  answer?: string;
  lastEntryId?: string;
  contentDigest?: string;
};

export const IMMUTABLE_INTENT_FIELDS = [
  "label",
  "resource",
  "payee",
  "amountBaseUnits",
  "mint",
  "scenario",
  "taskId",
  "resourceId",
  "network",
  "policyVersion",
  "quoteId",
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

export const RESERVED_STATUSES: PaymentStatus[] = [
  "pending",
  "awaiting_approval",
  "approved",
  "ready_to_sign",
  "confirming",
  "paid_delivery_pending",
];

export const CONFIRMED_STATUSES: PaymentStatus[] = ["settled"];
