"use client";

import type { LedgerEntry, ResearchTask } from "@/lib/ledger/types";
import { formatUsdc, shortKey } from "@/lib/format";

export function ReceiptCard({
  entry,
  task,
}: {
  entry: LedgerEntry;
  task?: ResearchTask | null;
}) {
  return (
    <article className="receipt" aria-label="Payment receipt">
      <header>
        <h3>Structured receipt</h3>
        <span className={`pill status-${entry.status}`}>{entry.status}</span>
      </header>
      <p className="receipt-label">{entry.label}</p>
      <dl>
        {task ? (
          <div>
            <dt>Task</dt>
            <dd className="mono">{shortKey(task.id, 6)}</dd>
          </div>
        ) : entry.taskId ? (
          <div>
            <dt>Task</dt>
            <dd className="mono">{shortKey(entry.taskId, 6)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Intent</dt>
          <dd className="mono">{shortKey(entry.id, 6)}</dd>
        </div>
        {entry.quoteId ? (
          <div>
            <dt>Quote</dt>
            <dd className="mono">{shortKey(entry.quoteId, 6)}</dd>
          </div>
        ) : null}
        {entry.policyVersion ? (
          <div>
            <dt>Policy version</dt>
            <dd className="mono">{entry.policyVersion}</dd>
          </div>
        ) : null}
        <div>
          <dt>Decision</dt>
          <dd>
            {entry.policyStatus ?? "—"}
            {entry.policyReason ? ` — ${entry.policyReason}` : ""}
          </dd>
        </div>
        {entry.approvalId ? (
          <div>
            <dt>Approval</dt>
            <dd className="mono">{shortKey(entry.approvalId, 6)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Amount</dt>
          <dd>{formatUsdc(entry.amountBaseUnits)} USDC</dd>
        </div>
        <div>
          <dt>Merchant / payee</dt>
          <dd className="mono">{shortKey(entry.payee, 6)}</dd>
        </div>
        <div>
          <dt>Network / mint</dt>
          <dd className="mono">
            {entry.network ?? "solana:devnet"} · {shortKey(entry.mint, 4)}
          </dd>
        </div>
        <div>
          <dt>Rail</dt>
          <dd>{entry.settlementKind}</dd>
        </div>
        <div>
          <dt>Confirmation</dt>
          <dd>{entry.status === "settled" ? "confirmed" : entry.status}</dd>
        </div>
        {entry.signature ? (
          <div>
            <dt>Signature</dt>
            <dd className="mono">{shortKey(entry.signature, 8)}</dd>
          </div>
        ) : null}
        {entry.contentDigest ? (
          <div>
            <dt>Content digest</dt>
            <dd className="mono">{shortKey(entry.contentDigest, 10)}</dd>
          </div>
        ) : null}
        {task?.contentDigest ? (
          <div>
            <dt>Answer digest</dt>
            <dd className="mono">{shortKey(task.contentDigest, 10)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="muted small">
        A content digest binds bytes; it does not prove quality or truth.
      </p>
      {entry.explorerUrl ? (
        <a
          className="btn primary"
          href={entry.explorerUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open Solana Explorer
        </a>
      ) : (
        <p className="muted">No explorer link yet — settle to mint one.</p>
      )}
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          const payload = {
            taskId: task?.id ?? entry.taskId,
            intentId: entry.id,
            quoteId: entry.quoteId,
            policyVersion: entry.policyVersion,
            decision: entry.policyStatus,
            approvalId: entry.approvalId,
            signature: entry.signature,
            network: entry.network,
            mint: entry.mint,
            amountBaseUnits: entry.amountBaseUnits,
            merchant: entry.payee,
            confirmation: entry.status,
            contentDigest: entry.contentDigest,
            answerDigest: task?.contentDigest,
          };
          void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        }}
      >
        Copy receipt JSON
      </button>
    </article>
  );
}
