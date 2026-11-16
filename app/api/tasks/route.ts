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
    if (body.mode === "live") {
      return NextResponse.json(
        {
          error:
            "Live agent mode was removed. Create tasks in fixture mode (default).",
        },
        { status: 410 },
      );
    }
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
    const task = createTask({
      prompt,
      budgetBaseUnits,
      ownerWallet: wallet,
    });
    return NextResponse.json({
      task,
      mode: task.mode,
      label: "Fixture mode — deterministic agent tools (not a live LLM).",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
