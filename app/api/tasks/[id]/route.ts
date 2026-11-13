import { NextResponse } from "next/server";
import { getTask, syncTaskBudgetFromLedger } from "@/lib/ledger/store";
import { readWalletSession } from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const wallet = readWalletSession(request);
  if (!wallet) {
    return NextResponse.json({ error: "Wallet session required" }, { status: 401 });
  }
  const { id } = await context.params;
  let task = getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.ownerWallet !== wallet) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  task = syncTaskBudgetFromLedger(id);
  return NextResponse.json({ task, mode: task.mode });
}
