import { NextResponse } from "next/server";
import { createTask, listTasks } from "@/lib/ledger/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ tasks: listTasks() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      budgetBaseUnits?: string;
    };
    const prompt =
      body.prompt?.trim() ||
      "Summarize Devnet weather using a paid research brief within budget.";
    const budgetBaseUnits = body.budgetBaseUnits ?? "1000000"; // $1.00 default
    try {
      const n = BigInt(budgetBaseUnits);
      if (n <= 0n) throw new Error("budget must be positive");
    } catch {
      return NextResponse.json(
        { error: "budgetBaseUnits must be a positive integer string" },
        { status: 400 },
      );
    }
    const task = createTask({ prompt, budgetBaseUnits });
    return NextResponse.json({
      task,
      mode: "fixture",
      label:
        "Fixture mode — deterministic agent tools (not live model execution).",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
