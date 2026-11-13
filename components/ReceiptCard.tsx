"use client";

import type { LedgerEntry } from "@/lib/ledger/types";
import { formatUsdc, shortKey } from "@/lib/format";

export function ReceiptCard({ entry }: { entry: LedgerEntry }) {
  return (
    <article className="receipt" aria-label="Payment receipt">
      <header>
        <h3>Receipt</h3>
        <span className={`pill status-${entry.status}`}>{entry.status}</span>
      </header>
      <p className="receipt-label">{entry.label}</p>
      <dl>
        <div>
          <dt>Amount</dt>
          <dd>{formatUsdc(entry.amountBaseUnits)} USDC</dd>
        </div>
        <div>
          <dt>Payee</dt>
          <dd className="mono">{shortKey(entry.payee, 6)}</dd>
        </div>
        <div>
          <dt>Rail</dt>
          <dd>{entry.settlementKind}</dd>
        </div>
        {entry.signature ? (
          <div>
            <dt>Signature</dt>
            <dd className="mono">{shortKey(entry.signature, 8)}</dd>
          </div>
        ) : null}
      </dl>
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
    </article>
  );
}
