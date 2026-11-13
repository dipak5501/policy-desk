import { createHash } from "node:crypto";
import { getCatalogResource, listCatalog } from "@/lib/catalog/resources";
import {
  appendTaskEvent,
  createLedgerEntry,
  dailySpentBaseUnits,
  getLedgerEntry,
  getTask,
  setLedgerStatus,
  syncTaskBudgetFromLedger,
  taskRemainingBaseUnits,
  tryReserveAgainstDailyCap,
  updateTask,
  withLedgerLock,
} from "@/lib/ledger/store";
import type { ResearchTask } from "@/lib/ledger/types";
import { getActivePolicy } from "@/lib/policy/active";
import { reviewSpend } from "@/lib/policy/review";
import { POLICY_VERSION } from "@/lib/policy/version";
import { X402_DEVNET_NETWORK } from "@/lib/solana/config";
import { fulfillWeatherIfSettled } from "@/lib/x402/fulfill";
import { randomUUID } from "node:crypto";

export type FixtureStepResult = {
  task: ResearchTask;
  entryId?: string;
  decision?: unknown;
  next:
    | "preview"
    | "blocked_recover"
    | "await_human_approval"
    | "settle"
    | "deliver"
    | "complete"
    | "none";
  mode: "fixture";
  message: string;
};

async function proposeCatalogResource(
  taskId: string,
  resourceId: string,
): Promise<{ entryId: string; decision: ReturnType<typeof reviewSpend> }> {
  return withLedgerLock(() => {
    const resource = getCatalogResource(resourceId);
    if (!resource) throw new Error(`Unknown resource ${resourceId}`);
    const task = getTask(taskId);
    if (!task) throw new Error("Task not found");

    const amount = BigInt(resource.amountBaseUnits);
    const config = getActivePolicy();
    if (!tryReserveAgainstDailyCap(amount, config.dailyCapBaseUnits)) {
      throw new Error("Insufficient daily budget");
    }
    if (amount > taskRemainingBaseUnits(taskId)) {
      throw new Error("Insufficient task budget");
    }

    const quoteId = randomUUID();
    const quoteExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const entry = createLedgerEntry({
      label: resource.title,
      resource: resource.resource,
      payee: resource.payee,
      amountBaseUnits: resource.amountBaseUnits,
      mint: resource.mint,
      settlementKind: resource.settlementKind,
      scenario: "custom",
      taskId,
      resourceId,
      network: X402_DEVNET_NETWORK,
      policyVersion: POLICY_VERSION,
      quoteId,
      quoteExpiresAt,
    });

    const decision = reviewSpend(
      {
        id: entry.id,
        label: resource.title,
        resource: resource.resource,
        payee: resource.payee,
        amountBaseUnits: amount,
        mint: resource.mint,
      },
      config,
      dailySpentBaseUnits(),
    );

    setLedgerStatus(entry.id, "policy_evaluated", {
      policyStatus: decision.status,
      policyReason: decision.reason,
      policyCode: decision.status === "block" ? decision.code : undefined,
      quoteId,
      quoteExpiresAt,
    });

    if (decision.status === "block") {
      setLedgerStatus(entry.id, "blocked", {
        policyStatus: "block",
        policyReason: decision.reason,
        policyCode: decision.code,
        settlementKind: "none",
      });
    } else if (decision.status === "needs_approval") {
      setLedgerStatus(entry.id, "awaiting_approval", {
        policyStatus: "needs_approval",
        policyReason: decision.reason,
        approvalExpiresAt: quoteExpiresAt,
      });
    } else {
      setLedgerStatus(entry.id, "approved", {
        policyStatus: "allow",
        policyReason: decision.reason,
      });
    }

    syncTaskBudgetFromLedger(taskId);
    updateTask(taskId, { lastEntryId: entry.id });
    return { entryId: entry.id, decision };
  });
}

/** Labeled fixture agent — deterministic research workflow (not a live model). */
export async function runFixtureStep(
  taskId: string,
  action:
    | "inspect"
    | "request_blocked"
    | "request_approved"
    | "request_approval_tier"
    | "compose_answer",
): Promise<FixtureStepResult> {
  const task = getTask(taskId);
  if (!task) throw new Error("Task not found");

  if (action === "inspect") {
    const catalog = listCatalog();
    const next = appendTaskEvent(taskId, {
      kind: "agent.inspect",
      message:
        "Fixture agent inspected the approved resource catalog (preview, price, merchant).",
      meta: {
        mode: "fixture",
        resources: catalog.map((r) => ({
          id: r.id,
          title: r.title,
          amountBaseUnits: r.amountBaseUnits,
          allowlisted: r.allowlisted,
          merchantLabel: r.merchantLabel,
        })),
      },
    });
    return {
      task: next,
      next: "preview",
      mode: "fixture",
      message: "Catalog inspected under fixture mode.",
    };
  }

  if (action === "request_blocked") {
    const { entryId, decision } = await proposeCatalogResource(
      taskId,
      "evil-drain",
    );
    const entry = getLedgerEntry(entryId)!;
    const next = appendTaskEvent(taskId, {
      kind: "policy.blocked",
      message: `Blocked: ${decision.reason}`,
      entryId,
      meta: {
        policyStatus: decision.status,
        policyCode: decision.status === "block" ? decision.code : undefined,
        rules: decision,
      },
    });
    appendTaskEvent(taskId, {
      kind: "agent.recover",
      message:
        "Fixture agent recovered — selecting allowlisted weather brief instead.",
    });
    return {
      task: getTask(taskId) ?? next,
      entryId,
      decision,
      next: "blocked_recover",
      mode: "fixture",
      message: entry.policyReason ?? "Blocked",
    };
  }

  if (action === "request_approved" || action === "request_approval_tier") {
    const resourceId =
      action === "request_approval_tier" ? "weather-deep" : "weather-brief";
    const { entryId, decision } = await proposeCatalogResource(
      taskId,
      resourceId,
    );
    const entry = getLedgerEntry(entryId)!;
    if (decision.status === "needs_approval") {
      appendTaskEvent(taskId, {
        kind: "approval.required",
        message: `Paused for operator approval: ${decision.reason}`,
        entryId,
        meta: {
          merchant: entry.payee,
          amountBaseUnits: entry.amountBaseUnits,
          resource: entry.resource,
          budgetImpact: entry.amountBaseUnits,
          expiresAt: entry.approvalExpiresAt ?? entry.quoteExpiresAt,
        },
      });
      updateTask(taskId, { status: "awaiting_approval", lastEntryId: entryId });
      return {
        task: getTask(taskId)!,
        entryId,
        decision,
        next: "await_human_approval",
        mode: "fixture",
        message: decision.reason,
      };
    }
    appendTaskEvent(taskId, {
      kind: "policy.allow",
      message: `Policy allowed: ${decision.reason}`,
      entryId,
    });
    updateTask(taskId, { status: "awaiting_signature", lastEntryId: entryId });
    return {
      task: getTask(taskId)!,
      entryId,
      decision,
      next: "settle",
      mode: "fixture",
      message: decision.reason,
    };
  }

  // compose_answer — requires settled + delivered content
  const entryId = task.lastEntryId;
  if (!entryId) throw new Error("No purchase on task");
  const entry = getLedgerEntry(entryId);
  if (!entry || entry.status !== "settled") {
    throw new Error("Settlement not confirmed — cannot compose paid answer");
  }
  const fulfilled = fulfillWeatherIfSettled({
    amountBaseUnits: entry.amountBaseUnits,
    entryId,
  });
  if (!fulfilled.ok) {
    throw new Error(fulfilled.error);
  }
  const answer = [
    `Research answer (fixture mode) for: “${task.prompt}”`,
    "",
    `Purchased resource ${entry.resourceId ?? entry.resource} from ${entry.payee}.`,
    `Paid content: ${fulfilled.body.forecast}`,
    "",
    `Receipt binds task ${task.id}, intent ${entry.id}, signature ${entry.signature}, content digest ${fulfilled.body.contentDigest}.`,
    "Note: a content digest binds bytes; it does not prove quality or truth.",
  ].join("\n");
  const contentDigest = createHash("sha256").update(answer).digest("hex");
  appendTaskEvent(taskId, {
    kind: "agent.answer",
    message: "Fixture agent composed answer citing purchased content.",
    entryId,
    meta: { contentDigest },
  });
  const completed = updateTask(taskId, {
    status: "completed",
    answer,
    contentDigest,
  });
  return {
    task: completed,
    entryId,
    next: "complete",
    mode: "fixture",
    message: "Task completed with paid evidence.",
  };
}
