import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getLedgerEntry,
  setLedgerStatus,
  syncTaskBudgetFromLedger,
} from "@/lib/ledger/store";
import { assertOperator } from "@/lib/security/operator";
import { appendAudit } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: "approve" | "reject" | "cancel";
  /** Client must echo intentHash so approval cannot apply to a mutated intent. */
  intentHash?: string;
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

    if (
      entry.approvalExpiresAt &&
      Date.parse(entry.approvalExpiresAt) < Date.now()
    ) {
      const expired = setLedgerStatus(id, "failed", {
        error: "Approval window expired",
        settlementKind: "none",
      });
      if (entry.taskId) syncTaskBudgetFromLedger(entry.taskId);
      return NextResponse.json(
        { error: "Approval window expired", entry: expired },
        { status: 410 },
      );
    }

    if (body.intentHash && entry.intentHash && body.intentHash !== entry.intentHash) {
      return NextResponse.json(
        { error: "intentHash mismatch — approval does not bind to this intent" },
        { status: 409 },
      );
    }

    const action = body.action ?? "approve";
    if (action === "approve") {
      const approvalId = randomUUID();
      const approved = setLedgerStatus(id, "approved", {
        policyStatus: "allow",
        policyReason: "Human operator approved",
        approvalId,
      });
      appendAudit("approval.approve", {
        entryId: id,
        approvalId,
        intentHash: entry.intentHash,
      });
      if (entry.taskId) syncTaskBudgetFromLedger(entry.taskId);
      return NextResponse.json({ entry: approved, next: "settle", approvalId });
    }

    if (action === "cancel") {
      const cancelled = setLedgerStatus(id, "cancelled", {
        settlementKind: "none",
        error: "Cancelled by operator",
      });
      appendAudit("approval.cancel", { entryId: id });
      if (entry.taskId) syncTaskBudgetFromLedger(entry.taskId);
      return NextResponse.json({ entry: cancelled, next: "none" });
    }

    const rejected = setLedgerStatus(id, "rejected", {
      settlementKind: "none",
      error: "Rejected by operator",
    });
    appendAudit("approval.reject", { entryId: id });
    if (entry.taskId) syncTaskBudgetFromLedger(entry.taskId);
    return NextResponse.json({ entry: rejected, next: "none" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
