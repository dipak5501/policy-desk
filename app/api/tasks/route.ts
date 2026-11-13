import { NextResponse } from "next/server";
import { createTask, listTasks } from "@/lib/ledger/store";
import { assertCsrf, readWalletSession } from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const wallet = readWalletSession(request);
  if (!wallet) {
    return NextResponse.json({ error: "Wallet session required" }, { status: 401 });
  }
  const tasks = listTasks().filter((t) => t.ownerWallet === wallet);
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  try {
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

    const body = (await request.json()) as {
      prompt?: string;
      budgetBaseUnits?: string;
      mode?: "fixture" | "live";
    };
    const prompt =
      body.prompt?.trim() ||
      "Summarize Devnet weather using a paid research brief within budget.";
    // Default $1.00 — coherent with $0.10 brief + $0.60 deep (blocked 2.5 never reserved)
    const budgetBaseUnits = body.budgetBaseUnits ?? "1000000";
    try {
      const n = BigInt(budgetBaseUnits);
      if (n <= 0n) throw new Error("budget must be positive");
    } catch {
      return NextResponse.json(
        { error: "budgetBaseUnits must be a positive integer string" },
        { status: 400 },
      );
    }
    const mode = body.mode === "live" ? "live" : "fixture";
    const task = createTask({
      prompt,
      budgetBaseUnits,
      ownerWallet: wallet,
      mode,
    });
    return NextResponse.json({
      task,
      mode: task.mode,
      label:
        task.mode === "fixture"
          ? "Fixture mode — deterministic agent tools (not live model execution)."
          : "Live mode — requires OPENAI_API_KEY server-side.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
