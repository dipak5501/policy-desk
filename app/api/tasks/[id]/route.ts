import { NextResponse } from "next/server";
import { getTask, syncTaskBudgetFromLedger } from "@/lib/ledger/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let task = getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  task = syncTaskBudgetFromLedger(id);
  return NextResponse.json({ task, mode: task.mode });
}
