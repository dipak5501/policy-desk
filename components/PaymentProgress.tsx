"use client";

import type { PaymentStatus } from "@/lib/ledger/types";
import { PAYMENT_STATE_ORDER } from "@/lib/ledger/types";

const LABELS: Record<string, string> = {
  proposed: "Proposed",
  policy_evaluated: "Policy evaluated",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  ready_to_sign: "Ready to sign",
  confirming: "Confirming",
  settled: "Settled",
  blocked: "Blocked",
  failed: "Failed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  pending: "Awaiting approval",
};

export function PaymentProgress({ status }: { status?: PaymentStatus | null }) {
  const terminalFail = status
    ? ["blocked", "failed", "rejected", "cancelled"].includes(status)
    : false;
  const active =
    status === "pending"
      ? "awaiting_approval"
      : status && PAYMENT_STATE_ORDER.includes(status)
        ? status
        : status === "blocked"
          ? "policy_evaluated"
          : null;
  const activeIdx = active ? PAYMENT_STATE_ORDER.indexOf(active) : -1;

  return (
    <ol className={`state-machine ${terminalFail ? "is-fail" : ""}`}>
      {PAYMENT_STATE_ORDER.map((step, i) => {
        const done = activeIdx > i || status === "settled";
        const current = active === step;
        return (
          <li
            key={step}
            className={done ? "done" : current ? "current" : ""}
            data-status={step}
          >
            <span className="dot" />
            <span>{LABELS[step] ?? step}</span>
          </li>
        );
      })}
      {terminalFail && status ? (
        <li className="fail current">
          <span className="dot" />
          <span>{LABELS[status] ?? status}</span>
        </li>
      ) : null}
    </ol>
  );
}
