import { NextResponse } from "next/server";
import { runFixtureStep } from "@/lib/agent/fixture";
import { runLiveStep } from "@/lib/agent/live";
import { getTask } from "@/lib/ledger/store";
import {
  allowRate,
  clientKey,
  rateLimitResponse,
  readJsonBody,
} from "@/lib/security/httpLimits";
import { assertCsrf, readWalletSession } from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  taskId?: string;
  action?:
    | "inspect"
    | "request_blocked"
    | "request_approved"
    | "request_approval_tier"
    | "compose_answer"
    | "live_turn";
  userMessage?: string;
};

export async function POST(request: Request) {
  try {
    if (!allowRate(`agent-run:${clientKey(request)}`, 60, 60_000)) {
      return rateLimitResponse();
    }
    const wallet = readWalletSession(request);
    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet session required" },
        { status: 401 },
      );
    }
    if (!assertCsrf(request)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }

    const parsed = await readJsonBody<Body>(request, 16_384);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status },
      );
    }
    const body = parsed.body;
    if (!body.taskId || !body.action) {
      return NextResponse.json(
        { error: "taskId and action are required" },
        { status: 400 },
      );
    }
    const task = getTask(body.taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (task.ownerWallet !== wallet) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (body.action === "live_turn") {
      const result = await runLiveStep(body.taskId, wallet, body.userMessage);
      return NextResponse.json(result);
    }

    const result = await runFixtureStep(body.taskId, body.action, wallet);
    return NextResponse.json({
      ...result,
      disclaimer:
        "Fixture mode: steps are deterministic scripted tools, visibly labeled — not a live LLM.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
