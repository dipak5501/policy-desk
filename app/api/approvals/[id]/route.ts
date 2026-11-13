import { NextResponse } from "next/server";
import { getLedgerEntry, setLedgerStatus } from "@/lib/ledger/store";
import { assertOperator } from "@/lib/security/operator";
import { appendAudit } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: "approve" | "reject" | "cancel";
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!assertOperator(request)) {
      return NextResponse.json(
        { error: "Operator token required (x-operator-token)" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const body = (await request.json()) as Body;
    const entry = getLedgerEntry(id);
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (!["pending", "awaiting_approval"].includes(entry.status)) {
      return NextResponse.json(
        { error: `Entry status ${entry.status} is not awaiting approval` },
        { status: 400 },
      );
    }

    const action = body.action ?? "approve";
    if (action === "approve") {
      const approved = setLedgerStatus(id, "approved", {
        policyStatus: "allow",
        policyReason: "Human operator approved",
      });
      appendAudit("approval.approve", { entryId: id });
      return NextResponse.json({ entry: approved, next: "settle" });
    }

    if (action === "cancel") {
      const cancelled = setLedgerStatus(id, "cancelled", {
        settlementKind: "none",
        error: "Cancelled by operator",
      });
      appendAudit("approval.cancel", { entryId: id });
      return NextResponse.json({ entry: cancelled, next: "none" });
    }

    const rejected = setLedgerStatus(id, "rejected", {
      settlementKind: "none",
      error: "Rejected by operator",
    });
    appendAudit("approval.reject", { entryId: id });
    return NextResponse.json({ entry: rejected, next: "none" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
