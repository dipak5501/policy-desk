import { randomUUID } from "node:crypto";
import {
  assertPurchasableCatalogId,
  getCatalogResource,
  type CatalogResource,
} from "@/lib/catalog/resources";
import {
  createLedgerEntry,
  dailySpentBaseUnits,
  setLedgerStatus,
  syncTaskBudgetFromLedger,
  taskRemainingBaseUnits,
  tryReserveAgainstDailyCap,
} from "@/lib/ledger/store";
import type { LedgerEntry } from "@/lib/ledger/types";
import { getActivePolicy } from "@/lib/policy/active";
import { reviewSpend } from "@/lib/policy/review";
import type { PolicyDecision } from "@/lib/policy/types";
import { POLICY_VERSION } from "@/lib/policy/version";
import { X402_DEVNET_NETWORK } from "@/lib/solana/config";

export type EvaluateProposeInput = {
  resourceId: string;
  taskId?: string;
  fromOwner?: string;
  label?: string;
  /** Allow adversarial fixture IDs (evil-drain) for demos. */
  allowAdversarialFixture?: boolean;
};

export type EvaluateProposeResult = {
  entry: LedgerEntry;
  decision: PolicyDecision;
  reserved: boolean;
  next: "none" | "await_human_approval" | "settle";
};

/**
 * Evaluate catalog-bound proposals:
 * 1) Resolve server catalog (fail closed)
 * 2) Policy review BEFORE reservation
 * 3) Never reserve on block
 * 4) Structured over_task_budget / over_daily_cap decisions
 */
export function evaluateCatalogPropose(
  input: EvaluateProposeInput,
): EvaluateProposeResult {
  let resource: CatalogResource | undefined;
  if (input.allowAdversarialFixture) {
    resource = getCatalogResource(input.resourceId);
  } else {
    try {
      resource = assertPurchasableCatalogId(input.resourceId);
    } catch {
      resource = undefined;
    }
  }
  if (!resource) {
    const entry = createLedgerEntry({
      label: input.label ?? "Unknown resource",
      resource: "unknown",
      payee: "11111111111111111111111111111111",
      amountBaseUnits: "1",
      mint: getActivePolicy().allowedMint,
      settlementKind: "none",
      taskId: input.taskId,
      resourceId: input.resourceId,
      network: X402_DEVNET_NETWORK,
      policyVersion: POLICY_VERSION,
      fromOwner: input.fromOwner,
    });
    const blocked = setLedgerStatus(entry.id, "blocked", {
      settlementKind: "none",
      policyStatus: "block",
      policyCode: "unknown_resource",
      policyReason: "Unknown catalog resourceId",
      reservationReleased: true,
    });
    return {
      entry: blocked,
      decision: {
        status: "block",
        code: "unknown_resource",
        reason: "Unknown catalog resourceId",
      },
      reserved: false,
      next: "none",
    };
  }

  const config = getActivePolicy();
  const amount = BigInt(resource.amountBaseUnits);
  const spendReq = {
    label: resource.title,
    resource: resource.resource,
    payee: resource.payee,
    amountBaseUnits: amount,
    mint: resource.mint,
    trustedOrigin: resource.trustedOrigin,
  };

  let decision = reviewSpend(spendReq, config, dailySpentBaseUnits());

  if (
    decision.status !== "block" &&
    input.taskId &&
    amount > taskRemainingBaseUnits(input.taskId)
  ) {
    decision = {
      status: "block",
      code: "over_task_budget",
      reason: `Insufficient remaining task budget (need ${amount.toString()}, have ${taskRemainingBaseUnits(input.taskId).toString()})`,
    };
  }

  if (
    decision.status !== "block" &&
    !tryReserveAgainstDailyCap(amount, config.dailyCapBaseUnits)
  ) {
    decision = {
      status: "block",
      code: "over_daily_cap",
      reason: "Insufficient remaining daily budget for this reservation",
    };
  }

  const quoteId = randomUUID();
  const quoteExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const entry = createLedgerEntry({
    label: input.label ?? resource.title,
    resource: resource.resource,
    payee: resource.payee,
    amountBaseUnits: resource.amountBaseUnits,
    mint: resource.mint,
    settlementKind:
      decision.status === "block" ? "none" : resource.settlementKind,
    scenario: resource.adversarialFixture ? "blocked_demo" : "custom",
    taskId: input.taskId,
    resourceId: resource.id,
    productId: resource.productId,
    network: X402_DEVNET_NETWORK,
    policyVersion: POLICY_VERSION,
    quoteId,
    quoteExpiresAt,
    fromOwner: input.fromOwner,
  });

  if (decision.status === "block") {
    const blocked = setLedgerStatus(entry.id, "blocked", {
      policyStatus: "block",
      policyReason: decision.reason,
      policyCode: decision.code,
      settlementKind: "none",
      reservationReleased: true,
      quoteId,
      quoteExpiresAt,
    });
    if (input.taskId) syncTaskBudgetFromLedger(input.taskId);
    return { entry: blocked, decision, reserved: false, next: "none" };
  }

  if (decision.status === "needs_approval") {
    const pending = setLedgerStatus(entry.id, "awaiting_approval", {
      policyStatus: "needs_approval",
      policyReason: decision.reason,
      approvalExpiresAt: quoteExpiresAt,
      quoteId,
      quoteExpiresAt,
    });
    if (input.taskId) syncTaskBudgetFromLedger(input.taskId);
    return {
      entry: pending,
      decision,
      reserved: true,
      next: "await_human_approval",
    };
  }

  const approved = setLedgerStatus(entry.id, "approved", {
    policyStatus: "allow",
    policyReason: decision.reason,
    quoteId,
    quoteExpiresAt,
  });
  if (input.taskId) syncTaskBudgetFromLedger(input.taskId);
  return { entry: approved, decision, reserved: true, next: "settle" };
}
