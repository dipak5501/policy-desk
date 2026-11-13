import { createHash } from "node:crypto";
import { listCatalog } from "@/lib/catalog/resources";
import {
  appendTaskEvent,
  getLedgerEntry,
  getTask,
  updateTask,
  withLedgerLock,
} from "@/lib/ledger/store";
import type { LiveAgentProgress, ResearchTask } from "@/lib/ledger/types";
import { evaluateCatalogPropose } from "@/lib/propose/evaluate";
import { fulfillWeatherIfSettled } from "@/lib/x402/fulfill";

const MAX_TOOL_CALLS = 8;

export type LiveStepResult = {
  mode: "live";
  verified: boolean;
  message: string;
  task: ResearchTask | undefined;
  toolTrace: Array<{ tool: string; result: unknown }>;
  blocker?: string;
  pauseReason?: "approval" | "payment";
  entryId?: string;
  next?: "await_human_approval" | "settle" | "continue" | "complete" | "none";
};

type ToolName =
  | "list_resources"
  | "preview_resource"
  | "request_purchase"
  | "get_purchase_status"
  | "read_purchased_resource"
  | "final_answer";

type ChatMessage = LiveAgentProgress["messages"][number];

const ALLOWED_TOOLS = new Set<ToolName>([
  "list_resources",
  "preview_resource",
  "request_purchase",
  "get_purchase_status",
  "read_purchased_resource",
  "final_answer",
]);

function systemPrompt(task: ResearchTask): string {
  return `You are a research agent on Policy Desk (Solana Devnet USDC).
Use ONLY these tools by returning a single JSON object:
{"tool":"list_resources"|"preview_resource"|"request_purchase"|"get_purchase_status"|"read_purchased_resource"|"final_answer","arg":"..."}

Rules:
- Never invent URLs, payees, amounts, mints, or settlement details — catalog is server-controlled.
- Never request operator credentials, private keys, or arbitrary URL fetch.
- Demo catalog content is labeled [DEMO CATALOG] — not live oracles.
- When you have enough purchased content, call final_answer with your research summary.
- If a purchase needs approval or payment, stop after request_purchase / get_purchase_status.

User task: ${task.prompt}
Task budget (base units): ${task.budgetBaseUnits}`;
}

async function callModel(
  apiKey: string,
  messages: ChatMessage[],
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      messages: messages.map((m) => ({
        role: m.role === "tool" ? "user" : m.role,
        content:
          m.role === "tool"
            ? `Tool ${m.tool ?? "result"} returned:\n${m.content}`
            : m.content,
      })),
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    return { ok: false, error: text.slice(0, 300) };
  }
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return { ok: true, content: data.choices?.[0]?.message?.content ?? "" };
}

function parseToolCall(
  content: string,
): { tool: ToolName; arg: string } | null {
  try {
    const cleaned = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { tool?: string; arg?: string };
    if (!parsed.tool || !ALLOWED_TOOLS.has(parsed.tool as ToolName)) return null;
    return { tool: parsed.tool as ToolName, arg: parsed.arg ?? "" };
  } catch {
    return null;
  }
}

/**
 * Live model adapter with a bounded tool loop, persisted progress,
 * and pause/continue for approval or payment.
 * Requires OPENAI_API_KEY. Without credentials, reports unverified and keeps fixture usable.
 */
export async function runLiveStep(
  taskId: string,
  ownerWallet: string,
  userMessage?: string,
): Promise<LiveStepResult> {
  const task = getTask(taskId);
  if (!task) throw new Error("Task not found");
  if (task.ownerWallet !== ownerWallet) throw new Error("Forbidden");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    appendTaskEvent(taskId, {
      kind: "agent.live_blocked",
      message:
        "Live model adapter present but OPENAI_API_KEY is not configured — live execution unverified. Use fixture mode.",
    });
    return {
      mode: "live",
      verified: false,
      message: "Live execution unverified — missing OPENAI_API_KEY",
      task: getTask(taskId),
      toolTrace: [],
      blocker: "Set OPENAI_API_KEY on the server to enable live mode.",
      next: "none",
    };
  }

  const tools = {
    list_resources: () =>
      listCatalog().map((r) => ({
        id: r.id,
        title: r.title,
        preview: r.preview,
        amountBaseUnits: r.amountBaseUnits,
        merchantLabel: r.merchantLabel,
        allowlisted: r.allowlisted,
      })),
    preview_resource: (id: string) => {
      const r = listCatalog().find((x) => x.id === id);
      if (!r) throw new Error("unknown resource");
      return {
        id: r.id,
        title: r.title,
        preview: r.preview,
        amountBaseUnits: r.amountBaseUnits,
        merchantLabel: r.merchantLabel,
        allowlisted: r.allowlisted,
      };
    },
    request_purchase: (id: string) =>
      withLedgerLock(() =>
        evaluateCatalogPropose({
          resourceId: id,
          taskId,
          fromOwner: ownerWallet,
        }),
      ),
    get_purchase_status: (entryId: string) => {
      const entry = getLedgerEntry(entryId);
      if (!entry) return { error: "not_found" };
      if (entry.taskId !== taskId || entry.fromOwner !== ownerWallet) {
        return { error: "forbidden" };
      }
      return {
        id: entry.id,
        status: entry.status,
        policyStatus: entry.policyStatus,
        policyReason: entry.policyReason,
        amountBaseUnits: entry.amountBaseUnits,
        resourceId: entry.resourceId,
        signature: entry.signature,
      };
    },
    read_purchased_resource: (entryId: string) =>
      fulfillWeatherIfSettled({ entryId, ownerWallet }),
  };

  let progress: LiveAgentProgress = task.liveProgress ?? {
    messages: [
      { role: "system", content: systemPrompt(task) },
      {
        role: "user",
        content:
          userMessage ??
          "Complete the research using purchased sample weather if needed. Call tools as JSON only.",
      },
    ],
    toolCallCount: 0,
    status: "running",
  };

  // Resume after pause: clear pause once human/wallet advanced the entry
  if (progress.pauseReason && progress.pendingEntryId) {
    const pending = getLedgerEntry(progress.pendingEntryId);
    if (progress.pauseReason === "approval") {
      if (
        pending &&
        ["approved", "ready_to_sign", "confirming", "settled"].includes(
          pending.status,
        )
      ) {
        progress = {
          ...progress,
          pauseReason: undefined,
          status: "running",
          messages: [
            ...progress.messages,
            {
              role: "user",
              content: `Purchase ${progress.pendingEntryId} was approved. Continue; settle status is ${pending.status}.`,
            },
          ],
        };
      } else {
        return {
          mode: "live",
          verified: true,
          message: "Still awaiting operator approval",
          task: getTask(taskId),
          toolTrace: [],
          pauseReason: "approval",
          entryId: progress.pendingEntryId,
          next: "await_human_approval",
        };
      }
    } else if (progress.pauseReason === "payment") {
      if (pending && pending.status === "settled") {
        progress = {
          ...progress,
          pauseReason: undefined,
          status: "running",
          messages: [
            ...progress.messages,
            {
              role: "user",
              content: `Purchase ${progress.pendingEntryId} settled with signature ${pending.signature}. Continue — read purchased resource and answer.`,
            },
          ],
        };
      } else {
        return {
          mode: "live",
          verified: true,
          message: "Still awaiting wallet settlement",
          task: getTask(taskId),
          toolTrace: [],
          pauseReason: "payment",
          entryId: progress.pendingEntryId,
          next: "settle",
        };
      }
    }
  }

  updateTask(taskId, { mode: "live", liveProgress: progress });

  const toolTrace: Array<{ tool: string; result: unknown }> = [];

  while (progress.toolCallCount < MAX_TOOL_CALLS) {
    const model = await callModel(apiKey, progress.messages);
    if (!model.ok) {
      progress = { ...progress, status: "failed" };
      updateTask(taskId, { liveProgress: progress, status: "failed" });
      return {
        mode: "live",
        verified: false,
        message: `OpenAI error: ${model.error}`,
        task: getTask(taskId),
        toolTrace,
        blocker: "Live model HTTP call failed",
        next: "none",
      };
    }

    progress = {
      ...progress,
      messages: [
        ...progress.messages,
        { role: "assistant", content: model.content },
      ],
    };

    const parsed = parseToolCall(model.content);
    if (!parsed) {
      appendTaskEvent(taskId, {
        kind: "agent.live_parse_error",
        message: "Model did not return valid tool JSON",
        meta: { content: model.content.slice(0, 500) },
      });
      updateTask(taskId, { liveProgress: progress });
      return {
        mode: "live",
        verified: true,
        message: "Model response was not valid tool JSON",
        task: getTask(taskId),
        toolTrace,
        next: "continue",
      };
    }

    if (parsed.tool === "final_answer") {
      const answer = [
        `Research answer (live mode) for: “${task.prompt}”`,
        "",
        parsed.arg || model.content,
        "",
        progress.pendingEntryId
          ? `Last purchase intent: ${progress.pendingEntryId}`
          : "No purchase intent recorded on this turn.",
      ].join("\n");
      const contentDigest = createHash("sha256").update(answer).digest("hex");
      progress = { ...progress, status: "completed" };
      appendTaskEvent(taskId, {
        kind: "agent.answer",
        message: "Live agent composed final answer",
        entryId: progress.pendingEntryId,
        meta: { contentDigest, mode: "live" },
      });
      updateTask(taskId, {
        status: "completed",
        answer,
        contentDigest,
        liveProgress: progress,
        mode: "live",
      });
      return {
        mode: "live",
        verified: true,
        message: "Live agent completed with final answer",
        task: getTask(taskId),
        toolTrace,
        next: "complete",
        entryId: progress.pendingEntryId,
      };
    }

    let result: unknown;
    try {
      switch (parsed.tool) {
        case "list_resources":
          result = tools.list_resources();
          break;
        case "preview_resource":
          result = tools.preview_resource(parsed.arg);
          break;
        case "request_purchase":
          result = await tools.request_purchase(parsed.arg);
          break;
        case "get_purchase_status":
          result = tools.get_purchase_status(parsed.arg);
          break;
        case "read_purchased_resource":
          result = tools.read_purchased_resource(parsed.arg);
          break;
        default:
          result = { error: "unknown or disallowed tool" };
      }
    } catch (err) {
      result = { error: err instanceof Error ? err.message : String(err) };
    }

    progress = {
      ...progress,
      toolCallCount: progress.toolCallCount + 1,
      messages: [
        ...progress.messages,
        {
          role: "tool",
          tool: parsed.tool,
          content: JSON.stringify(result).slice(0, 4000),
        },
      ],
    };
    toolTrace.push({ tool: parsed.tool, result });
    appendTaskEvent(taskId, {
      kind: "agent.live_tool",
      message: `Live tool ${parsed.tool}`,
      meta: {
        arg: parsed.arg,
        resultPreview: JSON.stringify(result).slice(0, 400),
        toolCallCount: progress.toolCallCount,
      },
    });

    // Pause for approval / payment after request_purchase
    if (
      parsed.tool === "request_purchase" &&
      result &&
      typeof result === "object" &&
      "entry" in result &&
      "next" in result
    ) {
      const purchase = result as {
        entry: { id: string };
        next: string;
        decision?: { status?: string };
      };
      updateTask(taskId, { lastEntryId: purchase.entry.id });
      if (purchase.next === "await_human_approval") {
        progress = {
          ...progress,
          status: "paused",
          pauseReason: "approval",
          pendingEntryId: purchase.entry.id,
        };
        updateTask(taskId, {
          status: "awaiting_approval",
          liveProgress: progress,
          lastEntryId: purchase.entry.id,
        });
        return {
          mode: "live",
          verified: true,
          message: "Paused for operator approval",
          task: getTask(taskId),
          toolTrace,
          pauseReason: "approval",
          entryId: purchase.entry.id,
          next: "await_human_approval",
        };
      }
      if (purchase.next === "settle") {
        progress = {
          ...progress,
          status: "paused",
          pauseReason: "payment",
          pendingEntryId: purchase.entry.id,
        };
        updateTask(taskId, {
          status: "awaiting_signature",
          liveProgress: progress,
          lastEntryId: purchase.entry.id,
        });
        return {
          mode: "live",
          verified: true,
          message: "Paused for wallet settlement",
          task: getTask(taskId),
          toolTrace,
          pauseReason: "payment",
          entryId: purchase.entry.id,
          next: "settle",
        };
      }
    }

    updateTask(taskId, { liveProgress: progress, mode: "live" });
  }

  progress = { ...progress, status: "paused" };
  updateTask(taskId, { liveProgress: progress });
  appendTaskEvent(taskId, {
    kind: "agent.live_budget",
    message: `Live tool loop hit max ${MAX_TOOL_CALLS} calls — call live_turn again to continue or compose answer.`,
  });
  return {
    mode: "live",
    verified: true,
    message: `Reached max tool calls (${MAX_TOOL_CALLS}) — continue with another live_turn`,
    task: getTask(taskId),
    toolTrace,
    next: "continue",
  };
}
