import { listCatalog } from "@/lib/catalog/resources";
import {
  appendTaskEvent,
  getLedgerEntry,
  getTask,
  updateTask,
  withLedgerLock,
} from "@/lib/ledger/store";
import { evaluateCatalogPropose } from "@/lib/propose/evaluate";
import { fulfillWeatherIfSettled } from "@/lib/x402/fulfill";

export type LiveStepResult = {
  mode: "live";
  verified: boolean;
  message: string;
  task: ReturnType<typeof getTask>;
  toolTrace: Array<{ tool: string; result: unknown }>;
  blocker?: string;
};

/**
 * Live model adapter using schema-validated tools only.
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
    };
  }

  // Minimal tool-using loop (one turn): model chooses among constrained tools via JSON.
  const tools = {
    list_resources: () =>
      listCatalog().map((r) => ({
        id: r.id,
        title: r.title,
        preview: r.preview,
        amountBaseUnits: r.amountBaseUnits,
        merchantLabel: r.merchantLabel,
      })),
    preview_resource: (id: string) => {
      const r = listCatalog().find((x) => x.id === id);
      if (!r) throw new Error("unknown resource");
      return r;
    },
    request_purchase: (id: string) =>
      withLedgerLock(() =>
        evaluateCatalogPropose({
          resourceId: id,
          taskId,
          fromOwner: ownerWallet,
        }),
      ),
    get_purchase_status: (entryId: string) => getLedgerEntry(entryId),
    read_purchased_resource: (entryId: string) =>
      fulfillWeatherIfSettled({ entryId, ownerWallet }),
  };

  const system = `You are a research agent on Policy Desk. Use only these tools by returning JSON:
{"tool":"list_resources"|"preview_resource"|"request_purchase"|"get_purchase_status"|"read_purchased_resource","arg":"..."}
Never invent URLs, payees, or amounts. Catalog is server-controlled. Sample weather content is not live weather.
User task: ${task.prompt}
User message: ${userMessage ?? "Complete the research using purchased sample weather if needed."}`;

  const toolTrace: Array<{ tool: string; result: unknown }> = [];

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: "Call one tool now as JSON only." },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    return {
      mode: "live",
      verified: false,
      message: `OpenAI error: ${text.slice(0, 200)}`,
      task: getTask(taskId),
      toolTrace,
      blocker: "Live model HTTP call failed",
    };
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  let parsed: { tool?: string; arg?: string } = {};
  try {
    parsed = JSON.parse(content.replace(/```json|```/g, "").trim()) as {
      tool?: string;
      arg?: string;
    };
  } catch {
    appendTaskEvent(taskId, {
      kind: "agent.live_parse_error",
      message: "Model did not return valid tool JSON",
      meta: { content: content.slice(0, 500) },
    });
    return {
      mode: "live",
      verified: true,
      message: "Model response was not valid tool JSON",
      task: getTask(taskId),
      toolTrace,
    };
  }

  let result: unknown;
  switch (parsed.tool) {
    case "list_resources":
      result = tools.list_resources();
      break;
    case "preview_resource":
      result = tools.preview_resource(parsed.arg ?? "");
      break;
    case "request_purchase":
      result = await tools.request_purchase(parsed.arg ?? "");
      break;
    case "get_purchase_status":
      result = tools.get_purchase_status(parsed.arg ?? "");
      break;
    case "read_purchased_resource":
      result = tools.read_purchased_resource(parsed.arg ?? "");
      break;
    default:
      result = { error: "unknown or disallowed tool" };
  }
  toolTrace.push({ tool: parsed.tool ?? "none", result });
  appendTaskEvent(taskId, {
    kind: "agent.live_tool",
    message: `Live tool ${parsed.tool}`,
    meta: { arg: parsed.arg, resultPreview: JSON.stringify(result).slice(0, 400) },
  });
  updateTask(taskId, { mode: "live" });

  return {
    mode: "live",
    verified: true,
    message: `Executed tool ${parsed.tool}`,
    task: getTask(taskId),
    toolTrace,
  };
}
