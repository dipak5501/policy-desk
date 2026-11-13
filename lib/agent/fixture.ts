import { createHash } from "node:crypto";
import { listCatalogWithFixtures } from "@/lib/catalog/resources";
import {
  appendTaskEvent,
  getLedgerEntry,
  getTask,
  updateTask,
  withLedgerLock,
} from "@/lib/ledger/store";
import type { ResearchTask } from "@/lib/ledger/types";
import { evaluateCatalogPropose } from "@/lib/propose/evaluate";
import { fulfillWeatherIfSettled } from "@/lib/x402/fulfill";

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

/** Labeled fixture agent — deterministic research workflow (not a live model). */
export async function runFixtureStep(
  taskId: string,
  action:
    | "inspect"
    | "request_blocked"
    | "request_approved"
    | "request_approval_tier"
    | "compose_answer",
  ownerWallet: string,
): Promise<FixtureStepResult> {
  const task = getTask(taskId);
  if (!task) throw new Error("Task not found");
  if (task.ownerWallet && task.ownerWallet !== ownerWallet) {
    throw new Error("Task owned by another wallet");
  }

  if (action === "inspect") {
    const catalog = listCatalogWithFixtures();
    const next = appendTaskEvent(taskId, {
      kind: "agent.inspect",
      message:
        "Fixture agent inspected catalog (purchasable + labeled adversarial fixture).",
      meta: {
        mode: "fixture",
        resources: catalog.map((r) => ({
          id: r.id,
          title: r.title,
          amountBaseUnits: r.amountBaseUnits,
          allowlisted: r.allowlisted,
          adversarialFixture: Boolean(r.adversarialFixture),
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

  if (
    action === "request_blocked" ||
    action === "request_approved" ||
    action === "request_approval_tier"
  ) {
    const resourceId =
      action === "request_blocked"
        ? "evil-drain"
        : action === "request_approval_tier"
          ? "weather-deep"
          : "weather-brief";

    const result = await withLedgerLock(() =>
      evaluateCatalogPropose({
        resourceId,
        taskId,
        fromOwner: ownerWallet,
        allowAdversarialFixture: action === "request_blocked",
      }),
    );

    updateTask(taskId, { lastEntryId: result.entry.id });

    if (result.decision.status === "block") {
      appendTaskEvent(taskId, {
        kind: "policy.blocked",
        message: `Blocked: ${result.decision.reason}`,
        entryId: result.entry.id,
        meta: {
          policyStatus: result.decision.status,
          policyCode:
            result.decision.status === "block"
              ? result.decision.code
              : undefined,
          reserved: result.reserved,
          concreteRequest: {
            resourceId,
            resource: result.entry.resource,
            payee: result.entry.payee,
            amountBaseUnits: result.entry.amountBaseUnits,
          },
        },
      });
      if (action === "request_blocked") {
        appendTaskEvent(taskId, {
          kind: "agent.recover",
          message:
            "Fixture agent recovered — selecting allowlisted weather brief instead.",
        });
        return {
          task: getTask(taskId)!,
          entryId: result.entry.id,
          decision: result.decision,
          next: "blocked_recover",
          mode: "fixture",
          message: result.decision.reason,
        };
      }
      return {
        task: getTask(taskId)!,
        entryId: result.entry.id,
        decision: result.decision,
        next: "none",
        mode: "fixture",
        message: result.decision.reason,
      };
    }

    if (result.next === "await_human_approval") {
      appendTaskEvent(taskId, {
        kind: "approval.required",
        message: `Paused for operator approval: ${result.decision.reason}`,
        entryId: result.entry.id,
        meta: {
          merchant: result.entry.payee,
          amountBaseUnits: result.entry.amountBaseUnits,
          resource: result.entry.resource,
          expiresAt: result.entry.approvalExpiresAt ?? result.entry.quoteExpiresAt,
        },
      });
      updateTask(taskId, {
        status: "awaiting_approval",
        lastEntryId: result.entry.id,
      });
      return {
        task: getTask(taskId)!,
        entryId: result.entry.id,
        decision: result.decision,
        next: "await_human_approval",
        mode: "fixture",
        message: result.decision.reason,
      };
    }

    appendTaskEvent(taskId, {
      kind: "policy.allow",
      message: `Policy allowed: ${result.decision.reason}`,
      entryId: result.entry.id,
    });
    updateTask(taskId, {
      status: "awaiting_signature",
      lastEntryId: result.entry.id,
    });
    return {
      task: getTask(taskId)!,
      entryId: result.entry.id,
      decision: result.decision,
      next: "settle",
      mode: "fixture",
      message: result.decision.reason,
    };
  }

  const entryId = task.lastEntryId;
  if (!entryId) throw new Error("No purchase on task");
  const entry = getLedgerEntry(entryId);
  if (!entry || entry.status !== "settled") {
    throw new Error("Settlement not confirmed — cannot compose paid answer");
  }
  const fulfilled = fulfillWeatherIfSettled({
    entryId,
    ownerWallet,
  });
  if (!fulfilled.ok) {
    throw new Error(fulfilled.error);
  }
  const answer = [
    `Research answer (fixture mode) for: “${task.prompt}”`,
    "",
    `Purchased resource ${entry.resourceId ?? entry.resource} from ${entry.payee}.`,
    `Paid content (SAMPLE): ${fulfilled.body.forecast}`,
    "",
    `Receipt binds task ${task.id}, intent ${entry.id}, signature ${entry.signature}, content digest ${fulfilled.body.contentDigest}.`,
    "Note: a content digest binds bytes; it does not prove quality or truth.",
    "Note: weather body is labeled sample content — not live weather data.",
  ].join("\n");
  const contentDigest = createHash("sha256").update(answer).digest("hex");
  appendTaskEvent(taskId, {
    kind: "agent.answer",
    message: "Fixture agent composed answer citing purchased sample content.",
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
