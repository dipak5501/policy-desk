"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  LedgerEntry,
  ResearchTask,
  StreamEvent,
} from "@/lib/ledger/types";
import type { CatalogResource } from "@/lib/catalog/resources";
import { formatSol, formatUsdc, shortKey } from "@/lib/format";
import { WalletProvider, useWallet } from "./WalletProvider";
import { TrustStrip } from "./TrustStrip";
import { TeamStrip } from "./TeamStrip";
import { PaymentProgress } from "./PaymentProgress";
import { ReceiptCard } from "./ReceiptCard";
import { EventTicker } from "./EventTicker";
import { ResourceStrip } from "./ResourceStrip";
import { approveEntry, settleEntry } from "./settle";

type PolicyPayload = {
  policy: {
    perTxCapBaseUnits: string;
    dailyCapBaseUnits: string;
    approvalThresholdBaseUnits: string;
    allowlistedPayees: string[];
    allowlistedResources: string[];
    allowedMint: string;
    paused: boolean;
  };
  budget?: {
    availableBaseUnits: string;
    reservedBaseUnits: string;
    confirmedBaseUnits: string;
    remainingBaseUnits: string;
    dailyCapBaseUnits: string;
  };
  policyVersion?: string;
  dailySpentBaseUnits: string;
  regime: {
    label: string;
    regime: string;
    explain: string;
    remainingBaseUnits: string;
  };
  audit: Array<{
    ts: string;
    kind: string;
    entryId?: string;
    detail?: Record<string, unknown>;
  }>;
  trust: {
    cluster: string;
    mint: string;
    blockBeforeSign: boolean;
    escrowClaim: boolean;
    escrowNote: string;
    streamsReconcile?: boolean;
    streamsNote?: string;
  };
};

type Balances = {
  sol: number;
  usdcBaseUnits: string;
  canCoverFee: boolean;
  feeHintSol: number;
};

function DeskInner() {
  const { address, provider, connect, installed, connecting, ready, sessionReady } =
    useWallet();
  const [policy, setPolicy] = useState<PolicyPayload | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [audit, setAudit] = useState<PolicyPayload["audit"]>([]);
  const [catalog, setCatalog] = useState<CatalogResource[]>([]);
  const [task, setTask] = useState<ResearchTask | null>(null);
  const [budgetInput, setBudgetInput] = useState("1000000");
  const [promptInput, setPromptInput] = useState(
    "Summarize Devnet weather using a paid research brief within budget.",
  );
  const [focus, setFocus] = useState<LedgerEntry | null>(null);
  const [receipt, setReceipt] = useState<LedgerEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operatorAuthed, setOperatorAuthed] = useState(false);
  const [operatorPassword, setOperatorPassword] = useState("");

  const refresh = useCallback(async () => {
    const [p, l, c, streams, op] = await Promise.all([
      fetch("/api/policy").then((r) => r.json()),
      fetch("/api/ledger", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/catalog").then((r) => r.json()),
      fetch("/api/streams/webhook")
        .then((r) => r.json())
        .catch(() => ({ events: [] })),
      fetch("/api/operator/session", { credentials: "include" })
        .then((r) => r.json())
        .catch(() => ({ authenticated: false })),
    ]);
    setOperatorAuthed(Boolean(op.authenticated));
    setPolicy(p);
    setEntries(l.entries ?? []);
    setAudit(l.audit ?? p.audit ?? []);
    setCatalog(c.resources ?? []);
    setStreamEvents(streams.events ?? []);
    if (task?.id) {
      const t = await fetch(`/api/tasks/${task.id}`).then((r) => r.json());
      if (t.task) setTask(t.task);
    }
    if (address) {
      const b = await fetch(`/api/balances?address=${address}`).then((r) =>
        r.json(),
      );
      if (b.balances) setBalances(b.balances);
      if (b.error) setError(b.error);
    }
  }, [address, task?.id, sessionReady]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  function csrfHeaders(): HeadersInit {
    if (typeof document === "undefined") return {};
    const match = document.cookie.match(/(?:^|; )pd_csrf=([^;]*)/);
    const csrf = match?.[1] ? decodeURIComponent(match[1]) : "";
    return csrf ? { "x-csrf-token": csrf } : {};
  }

  async function operatorLogin() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/operator/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: operatorPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Operator login failed");
      setOperatorAuthed(true);
      setOperatorPassword("");
      setMessage("Operator session active (HttpOnly cookie).");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const pending = useMemo(
    () =>
      entries.filter((e) =>
        ["pending", "awaiting_approval"].includes(e.status),
      ),
    [entries],
  );

  async function startTask() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setReceipt(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({
          prompt: promptInput,
          budgetBaseUnits: budgetInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start task");
      setTask(data.task);
      setMessage(
        "Fixture mode task started — agent will inspect catalog next.",
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function agentStep(
    action:
      | "inspect"
      | "request_blocked"
      | "request_approved"
      | "request_approval_tier"
      | "compose_answer",
  ) {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ taskId: task.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Agent step failed");
      setTask(data.task);
      setMessage(`${data.mode}: ${data.message}`);
      if (data.entryId) {
        const entry =
          (await fetch("/api/ledger").then((r) => r.json())).entries?.find(
            (e: LedgerEntry) => e.id === data.entryId,
          ) ?? null;
        if (entry) setFocus(entry);
      }
      await refresh();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onApprove(entry: LedgerEntry) {
    setBusy(true);
    setError(null);
    try {
      const updated = await approveEntry(entry.id, entry.intentHash);
      setFocus(updated);
      setMessage("Operator approved — wallet may prepare & sign.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onReject(id: string, action: "reject" | "cancel") {
    setBusy(true);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setFocus(data.entry);
      setMessage(`Spend ${action}ed — reservation released.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSettle(entry: LedgerEntry) {
    if (!address || !provider) {
      setError("Connect Phantom (Devnet) first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const settled = await settleEntry({
        entryId: entry.id,
        fromOwner: address,
        provider: provider as never,
        selfPay: false,
      });
      setFocus(settled);
      setReceipt(settled);
      setMessage(`Settled on Devnet — ${settled.signature}`);
      await refresh();
      if (task) {
        await agentStep("compose_answer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function runResearchDemo() {
    if (!address || !provider) {
      setError("Connect Phantom (Devnet) before the guided demo.");
      return;
    }
    if (
      !balances ||
      balances.sol < 0.02 ||
      BigInt(balances.usdcBaseUnits) < 100_000n
    ) {
      setError(
        "Fund Devnet wallet: ≥0.02 SOL (faucet.solana.com) and ≥0.10 USDC (faucet.circle.com).",
      );
      return;
    }

    setBusy(true);
    setReceipt(null);
    setError(null);
    try {
      setMessage("Starting fixture research task…");
      const created = await fetch("/api/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({
          prompt: promptInput,
          budgetBaseUnits: budgetInput,
        }),
      }).then((r) => r.json());
      if (!created.task) throw new Error(created.error ?? "Task failed");
      setTask(created.task);
      const taskId = created.task.id as string;

      async function step(action: Parameters<typeof agentStep>[0]) {
        const res = await fetch("/api/agent/run", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...csrfHeaders() },
          body: JSON.stringify({ taskId, action }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? action);
        setTask(data.task);
        setMessage(data.message);
        return data;
      }

      setMessage("Inspect catalog (fixture)…");
      await step("inspect");

      setMessage("Blocked purchase — policy reasons (no reservation)…");
      await step("request_blocked");

      setMessage("Approved alternative (above threshold) — operator approval…");
      const deep = await step("request_approval_tier");
      if (deep.next === "await_human_approval" && deep.entryId) {
        if (!operatorAuthed) {
          throw new Error(
            "Log in as operator first (server session) to approve above-threshold spends.",
          );
        }
        const ledger = await fetch("/api/ledger", {
          credentials: "include",
        }).then((r) => r.json());
        const pendingEntry = (ledger.entries as LedgerEntry[]).find(
          (e) => e.id === deep.entryId,
        );
        if (!pendingEntry) throw new Error("Approval entry missing");
        await approveEntry(pendingEntry.id, pendingEntry.intentHash);
      }

      const ledger2 = await fetch("/api/ledger", {
        credentials: "include",
      }).then((r) => r.json());
      const entry = (ledger2.entries as LedgerEntry[]).find(
        (e) => e.id === deep.entryId,
      );
      if (!entry) throw new Error("Entry missing after approval");
      setFocus(entry);
      setMessage("Simulate → Phantom sign → settle to merchant…");
      const settled = await settleEntry({
        entryId: entry.id,
        fromOwner: address,
        provider: provider as never,
        selfPay: false,
      });
      setFocus(settled);
      setReceipt(settled);
      setMessage("Compose answer from purchased sample content…");
      await step("compose_answer");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="desk-shell">
      <div className="atmosphere" aria-hidden>
        <div className="atm-wash" />
        <div className="atm-grid" />
        <div className="atm-band" />
      </div>

      <header className="hero">
        <p className="eyebrow">
          UBC Hackathon 2026 · Agentic Payments · Best use of Solana
        </p>
        <h1 className="brand">Policy Desk</h1>
        <p className="lede">
          A research agent buys useful data within budget — policy blocks bad
          merchants, humans approve when needed, Solana settles before content.
        </p>
        <div className="cta-row">
          {!address ? (
            <button
              className="btn primary"
              disabled={!ready || !installed || connecting}
              onClick={() => void connect()}
            >
              {!installed
                ? "Install Phantom"
                : connecting
                  ? "Connecting…"
                  : "Connect Phantom (Devnet)"}
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void runResearchDemo()}
            >
              Run research demo
            </button>
          )}
        </div>
        <p className="fixture-banner" role="status">
          Fixture mode is labeled — deterministic tools, not a silent live LLM.
        </p>
        {address ? (
          <p className="wallet-line mono">
            {shortKey(address, 6)} · SOL{" "}
            {balances ? formatSol(balances.sol) : "…"} · USDC{" "}
            {balances ? formatUsdc(balances.usdcBaseUnits) : "…"}
            {balances && !balances.canCoverFee ? (
              <span className="warn"> · low SOL for fees</span>
            ) : null}
          </p>
        ) : (
          <p className="wallet-line muted">
            Phantom on Devnet · fund via faucet.solana.com + faucet.circle.com
          </p>
        )}
      </header>

      <EventTicker entries={entries} streamEvents={streamEvents} />

      {policy ? (
        <TrustStrip
          cluster={policy.trust.cluster}
          mint={policy.trust.mint}
          wallet={address}
          allowlistCount={policy.policy.allowlistedPayees.length}
          blockBeforeSign={policy.trust.blockBeforeSign}
        />
      ) : null}

      {policy?.budget ? (
        <section className="metrics" aria-label="Budget strip">
          <div className="metric">
            <span className="metric-k">Available</span>
            <strong className="metric-v mono">
              {formatUsdc(policy.budget.availableBaseUnits)} USDC
            </strong>
          </div>
          <div className="metric">
            <span className="metric-k">Reserved</span>
            <strong className="metric-v mono">
              {formatUsdc(policy.budget.reservedBaseUnits)} USDC
            </strong>
          </div>
          <div className="metric">
            <span className="metric-k">Confirmed spend</span>
            <strong className="metric-v mono">
              {formatUsdc(policy.budget.confirmedBaseUnits)} USDC
            </strong>
          </div>
          <div className="metric">
            <span className="metric-k">Daily remaining</span>
            <strong className="metric-v mono">
              {formatUsdc(policy.budget.remainingBaseUnits)} USDC
            </strong>
            <p className="metric-note">
              Cap {formatUsdc(policy.budget.dailyCapBaseUnits)} ·{" "}
              {policy.policyVersion}
            </p>
          </div>
        </section>
      ) : null}

      <div className="desk-grid">
        <section className="panel ops">
          <h2>Run a task</h2>
          <p className="muted">
            Start with a USDC budget. The fixture agent inspects the catalog,
            hits a blocked merchant, recovers to an approved resource, then
            settles before using the paid content.
          </p>
          <label className="field">
            <span>Prompt</span>
            <textarea
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              rows={3}
            />
          </label>
          <label className="field">
            <span>Task budget (USDC base units, 6 decimals)</span>
            <input
              className="mono"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <div className="cta-row">
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void startTask()}
            >
              Start task
            </button>
            <button
              className="btn"
              disabled={busy || !task}
              onClick={() => void agentStep("inspect")}
            >
              Inspect catalog
            </button>
            <button
              className="btn"
              disabled={busy || !task}
              onClick={() => void agentStep("request_blocked")}
            >
              Request blocked
            </button>
            <button
              className="btn"
              disabled={busy || !task}
              onClick={() => void agentStep("request_approved")}
            >
              Request approved
            </button>
            <button
              className="btn"
              disabled={busy || !task}
              onClick={() => void agentStep("request_approval_tier")}
            >
              Request above threshold
            </button>
          </div>

          <h3>Catalog preview</h3>
          <ul className="catalog-list">
            {catalog.map((r) => (
              <li key={r.id}>
                <strong>{r.title}</strong>
                <span
                  className={`pill ${r.allowlisted ? "status-approved" : "status-blocked"}`}
                >
                  {r.allowlisted ? "allowlisted" : "blocked"}
                </span>
                <p className="muted">{r.preview}</p>
                <p className="mono">
                  {formatUsdc(r.amountBaseUnits)} USDC · {r.merchantLabel}
                  {r.teamOperated ? " · team-operated" : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <div className="desk-stack">
          <section className="panel timeline-panel">
            <h2>Task timeline</h2>
            {!task ? (
              <p className="muted empty-slot">
                No active task — start one to see the research workflow.
              </p>
            ) : (
              <>
                <p className="fixture-banner">
                  Mode: <strong>{task.mode}</strong> · budget{" "}
                  {formatUsdc(task.budgetBaseUnits)} · reserved{" "}
                  {formatUsdc(task.reservedBaseUnits)} · spent{" "}
                  {formatUsdc(task.spentBaseUnits)}
                </p>
                <ol className="timeline">
                  {task.timeline.map((ev) => (
                    <li key={ev.id}>
                      <span className="mono">{ev.ts.slice(11, 19)}</span>
                      <strong>{ev.kind}</strong>
                      <p>{ev.message}</p>
                      {ev.kind === "policy.blocked" && ev.meta ? (
                        <details>
                          <summary>Policy inspection</summary>
                          <pre className="mono small">
                            {JSON.stringify(ev.meta, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ol>
                {task.answer ? (
                  <article className="answer-card">
                    <h3>Answer (cites purchase)</h3>
                    <pre>{task.answer}</pre>
                  </article>
                ) : null}
              </>
            )}
          </section>

          <section className="panel approvals" id="approvals">
            <h2>Approval card</h2>
            <p className="muted">
              SeaPay-style pause — merchant, amount, reason, budget impact,
              expiry. Operator auth is a server HttpOnly session (not a public
              browser token).
            </p>
            {!operatorAuthed ? (
              <div className="cta-row" style={{ marginBottom: "0.75rem" }}>
                <input
                  type="password"
                  className="mono"
                  placeholder="Operator password"
                  value={operatorPassword}
                  onChange={(e) => setOperatorPassword(e.target.value)}
                  aria-label="Operator password"
                />
                <button
                  className="btn"
                  disabled={busy || !operatorPassword}
                  onClick={() => void operatorLogin()}
                >
                  Operator login
                </button>
              </div>
            ) : (
              <p className="ok-msg">Operator session active</p>
            )}
            {pending.length === 0 ? (
              <p className="muted empty-slot">No spends awaiting approval.</p>
            ) : (
              <ul className="approval-list">
                {pending.map((e) => (
                  <li key={e.id} className="approval-card">
                    <div>
                      <strong>{e.label}</strong>
                      <p className="mono">
                        {formatUsdc(e.amountBaseUnits)} USDC →{" "}
                        {shortKey(e.payee, 4)}
                      </p>
                      <p className="muted">{e.policyReason}</p>
                      <p className="muted small">
                        Resource {e.resource}
                        {e.approvalExpiresAt
                          ? ` · expires ${e.approvalExpiresAt}`
                          : ""}
                      </p>
                    </div>
                    <div className="cta-row">
                      <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() => void onApprove(e)}
                      >
                        Approve
                      </button>
                      <button
                        className="btn danger"
                        disabled={busy}
                        onClick={() => void onReject(e.id, "reject")}
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel focus">
            <h2>Payment state</h2>
            <PaymentProgress status={focus?.status ?? null} />
            {focus ? (
              <div className="focus-card">
                <p>
                  <strong>{focus.label}</strong>
                </p>
                <p className="muted">
                  {focus.policyStatus}: {focus.policyReason}
                </p>
                {["approved", "ready_to_sign", "failed"].includes(
                  focus.status,
                ) && address ? (
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void onSettle(focus)}
                  >
                    Simulate → sign → settle
                  </button>
                ) : null}
                {focus.error ? <p className="warn">{focus.error}</p> : null}
              </div>
            ) : (
              <p className="muted">Run a task step to focus a payment.</p>
            )}
            {message ? (
              <p className="ok-msg" role="status">
                {message}
              </p>
            ) : null}
            {error ? (
              <p className="warn" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {receipt ? <ReceiptCard entry={receipt} task={task} /> : null}

      <section className="panel ledger">
        <h2>Decision log</h2>
        <p className="muted">
          Visible policy decisions and audit events — not an on-chain immutable
          trail.
        </p>
        <div className="split">
          <div>
            <h3>Payments</h3>
            <ul className="log-list">
              {entries.slice(0, 12).map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => {
                      setFocus(e);
                      if (e.status === "settled") setReceipt(e);
                    }}
                  >
                    <span className={`pill status-${e.status}`}>{e.status}</span>{" "}
                    {e.label} · {formatUsdc(e.amountBaseUnits)} USDC
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Audit</h3>
            <ul className="log-list mono">
              {audit.slice(0, 12).map((a, i) => (
                <li key={`${a.ts}-${i}`}>
                  {a.ts.slice(11, 19)} {a.kind}
                  {a.entryId ? ` · ${shortKey(a.entryId, 4)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {policy?.trust.streamsNote ? (
          <p className="muted small">{policy.trust.streamsNote}</p>
        ) : null}
      </section>

      <ResourceStrip />
      <TeamStrip />

      <footer className="footer">
        <p>
          Built during UBC Hackathon 2026 by Dipak Yadav (full-stack developer),
          Utkarsh Lubal (cybersecurity engineer), and Kashif Manzer (blockchain
          engineer). Solana Devnet USDC · Phantom · x402. Streams ticker is not
          a reconcile bounty claim yet.
        </p>
      </footer>
    </div>
  );
}

export function Desk() {
  return (
    <WalletProvider>
      <DeskInner />
    </WalletProvider>
  );
}
