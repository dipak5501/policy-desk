"use client";

import type { LedgerEntry, StreamEvent } from "@/lib/ledger/types";
import { formatUsdc } from "@/lib/format";

function tone(status: LedgerEntry["status"]): string {
  if (status === "blocked" || status === "rejected" || status === "failed") {
    return "tick-bad";
  }
  if (status === "pending" || status === "proposed" || status === "awaiting_approval") {
    return "tick-warn";
  }
  if (status === "settled" || status === "approved") return "tick-ok";
  return "tick-neutral";
}

export function EventTicker({
  entries,
  streamEvents = [],
}: {
  entries: LedgerEntry[];
  streamEvents?: StreamEvent[];
}) {
  const recent = entries.slice(0, 10);
  const streams = streamEvents.slice(0, 4);

  if (recent.length === 0 && streams.length === 0) {
    return (
      <section
        className="event-ticker event-ticker-empty"
        aria-label="Ledger feed"
      >
        <span className="live-dot" aria-hidden />
        <span className="ticker-label">LIVE</span>
        <span className="muted small">
          Waiting for proposals — blocked, settled, and Streams hits appear here.
        </span>
      </section>
    );
  }

  const loop =
    recent.length >= 3
      ? [
          ...recent.map((entry) => ({
            entry,
            key: `${entry.id}-original`,
          })),
          ...recent.map((entry) => ({
            entry,
            key: `${entry.id}-duplicate`,
          })),
        ]
      : recent.map((entry) => ({ entry, key: entry.id }));

  return (
    <section
      className="event-ticker"
      aria-label="Recent ledger events"
    >
      <div className="ticker-fixed">
        <span className="live-dot" aria-hidden />
        <span className="ticker-label">LIVE</span>
      </div>
      <div className="ticker-track">
        <ul
          className={`ticker-list${recent.length >= 3 ? " ticker-list-scroll" : ""}`}
        >
          {streams.map((ev) => (
            <li key={`stream-${ev.id}`} className="ticker-item tick-ok">
              <span className="ticker-status">stream</span>
              <span className="ticker-sep" aria-hidden>
                ·
              </span>
              <span className="ticker-label-text">{ev.summary}</span>
            </li>
          ))}
          {loop.map(({ entry, key }) => (
            <li key={key} className={`ticker-item ${tone(entry.status)}`}>
              <span className="ticker-status">{entry.status}</span>
              <span className="ticker-sep" aria-hidden>
                ·
              </span>
              <span className="ticker-label-text">{entry.label}</span>
              <span className="ticker-amt">
                ${formatUsdc(entry.amountBaseUnits)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
