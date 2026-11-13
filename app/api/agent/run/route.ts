import { NextResponse } from "next/server";
import { runFixtureStep } from "@/lib/agent/fixture";
import { getTask } from "@/lib/ledger/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  taskId?: string;
  action?:
    | "inspect"
    | "request_blocked"
    | "request_approved"
    | "request_approval_tier"
    | "compose_answer";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    if (!body.taskId || !body.action) {
      return NextResponse.json(
        { error: "taskId and action are required" },
        { status: 400 },
      );
    }
    if (!getTask(body.taskId)) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const result = await runFixtureStep(body.taskId, body.action);
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
