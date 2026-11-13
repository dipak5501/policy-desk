"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LedgerEntry } from "@/lib/ledger/types";
import type { AgentProposal } from "@/lib/agent/scenarios";
import { formatSol, formatUsdc, shortKey } from "@/lib/format";
import { WalletProvider, useWallet } from "./WalletProvider";
import { TrustStrip } from "./TrustStrip";
import { TeamStrip } from "./TeamStrip";
import { PaymentProgress } from "./PaymentProgress";
import { ReceiptCard } from "./ReceiptCard";
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
  dailySpentBaseUnits: string;
  regime: {
    label: string;
    regime: string;
    explain: string;
    remainingBaseUnits: string;
  };
  audit: Array<{ ts: string; kind: string; entryId?: string; detail?: Record<string, unknown> }>;
  trust: {
    cluster: string;
    mint: string;
    blockBeforeSign: boolean;
    escrowClaim: boolean;
    escrowNote: string;
  };
};

type Balances = {
  sol: number;
  usdcBaseUnits: string;
  canCoverFee: boolean;
  feeHintSol: number;
};

function DeskInner() {
  const { address, provider, connect, installed, connecting, ready } =
    useWallet();
  const [policy, setPolicy] = useState<PolicyPayload | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [audit, setAudit] = useState<PolicyPayload["audit"]>([]);
  const [scenarios, setScenarios] = useState<AgentProposal[]>([]);
  const [focus, setFocus] = useState<LedgerEntry | null>(null);
  const [receipt, setReceipt] = useState<LedgerEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const operatorToken =
    process.env.NEXT_PUBLIC_OPERATOR_TOKEN ?? "policy-desk-dev-operator";

  const refresh = useCallback(async () => {
    const [p, l, s] = await Promise.all([
      fetch("/api/policy").then((r) => r.json()),
      fetch("/api/ledger").then((r) => r.json()),
      fetch("/api/agent/propose").then((r) => r.json()),
    ]);
    setPolicy(p);
    setEntries(l.entries ?? []);
    setAudit(l.audit ?? p.audit ?? []);
    setScenarios(s.scenarios ?? []);
    if (address) {
      const b = await fetch(`/api/balances?address=${address}`).then((r) =>
        r.json(),
      );
      if (b.balances) setBalances(b.balances);
      if (b.error) setError(b.error);
    }
  }, [address]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const pending = useMemo(
    () =>
      entries.filter((e) =>
        ["pending", "awaiting_approval"].includes(e.status),
      ),
    [entries],
  );

  async function propose(
    scenario: AgentProposal,
    opts?: { dryRun?: boolean; selfPay?: boolean },
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/agent/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: scenario.scenario,
          label: scenario.label,
          resource: scenario.resource,
          payee: opts?.selfPay && address ? address : scenario.payee,
          amountBaseUnits: scenario.amountBaseUnits,
          mint: scenario.mint,
          settlementKind: opts?.selfPay ? "spl_usdc" : scenario.settlementKind,
          selfPay: opts?.selfPay,
          dryRun: opts?.dryRun,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Propose failed");
      setFocus(data.entry);
      setMessage(
        `${data.decision.status}: ${data.decision.reason}${
          opts?.dryRun ? " (dry-run — no broadcast)" : ""
        }`,
      );
      await refresh();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onApprove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const entry = await approveEntry(id, operatorToken);
      setFocus(entry);
      setMessage("Human approved — ready to prepare & sign.");
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
        headers: {
          "Content-Type": "application/json",
          "x-operator-token": operatorToken,
        },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setFocus(data.entry);
      setMessage(`Spend ${action}ed — no signature built.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSettle(entry: LedgerEntry, selfPay = false) {
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
        selfPay,
      });
      setFocus(settled);
      setReceipt(settled);
      setMessage(`Settled on Devnet — ${settled.signature}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function runGuidedDemo() {
    if (!address || !provider) {
      setError("Connect Phantom (Devnet) before the guided demo.");
      return;
    }
    if (
      !balances ||
      balances.sol < 0.02 ||
      BigInt(balances.usdcBaseUnits) < 600_000n
    ) {
      setError(
        "Fund Devnet wallet: ≥0.02 SOL (faucet.solana.com) and ≥0.60 USDC (faucet.circle.com).",
      );
      return;
    }
    const blocked = scenarios.find((s) => s.scenario === "blocked_demo");
    const approval = scenarios.find((s) => s.scenario === "approval_demo");
    if (!blocked || !approval) {
      setError("Scenarios not loaded.");
      return;
    }

    setBusy(true);
    setReceipt(null);
    setError(null);
    try {
      setMessage("1/3 Policy firewall — proposing non-allowlisted drain…");
      await propose(blocked);

      setMessage(
        "2/3 Human approval widget — allowlisted spend above threshold…",
      );
      const mid = await propose(approval);
      if (mid?.entry?.id) {
        await onApprove(mid.entry.id);
        setMessage("3/3 Dry-run simulate → Phantom sign → settle (self-pay)…");
        const approvedEntry = {
          ...mid.entry,
          status: "approved" as const,
        };
        // Re-fetch after approve
        await refresh();
        const latest = (await fetch("/api/ledger").then((r) => r.json()))
          .entries as LedgerEntry[];
        const target =
          latest.find((e) => e.id === approvedEntry.id) ?? approvedEntry;
        await onSettle(target, true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="desk-shell">
      <div className="atmosphere" aria-hidden>
        <div className="atm-grid" />
        <div className="atm-glow" />
      </div>

      <header className="hero">
        <p className="eyebrow">UBC Hackathon 2026 · Solana · Agentic Payments</p>
        <h1 className="brand">Policy Desk</h1>
        <p className="lede">
          Agents propose. Policy decides. Humans approve. Solana settles.
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
              onClick={() => void runGuidedDemo()}
            >
              Run 90s demo
            </button>
          )}
          <button
            className="btn ghost"
            disabled={busy || scenarios.length === 0}
            onClick={() => {
              const s = scenarios.find((x) => x.scenario === "blocked_demo");
              if (s) void propose(s, { dryRun: true });
            }}
          >
            Dry-run blocked path
          </button>
        </div>
        {address ? (
          <p className="wallet-line mono">
            {shortKey(address, 6)} · SOL{" "}
            {balances ? formatSol(balances.sol) : "…"} · USDC{" "}
            {balances ? formatUsdc(balances.usdcBaseUnits) : "…"}
            {balances && !balances.canCoverFee ? (
              <span className="warn"> · low SOL for fees</span>
            ) : null}
          </p>
        ) : null}
      </header>

      {policy ? (
        <TrustStrip
          cluster={policy.trust.cluster}
          mint={policy.trust.mint}
          wallet={address}
          allowlistCount={policy.policy.allowlistedPayees.length}
          blockBeforeSign={policy.trust.blockBeforeSign}
        />
      ) : null}

      <section className="panel posture">
        <h2>Treasury posture</h2>
        {policy ? (
          <>
            <p className={`regime regime-${policy.regime.regime}`}>
              {policy.regime.label}
            </p>
            <p className="muted">{policy.regime.explain}</p>
            <ul className="meta-list">
              <li>
                Per-tx cap {formatUsdc(policy.policy.perTxCapBaseUnits)} USDC
              </li>
              <li>
                Daily cap {formatUsdc(policy.policy.dailyCapBaseUnits)} USDC ·
                spent {formatUsdc(policy.dailySpentBaseUnits)}
              </li>
              <li>
                Human approval above{" "}
                {formatUsdc(policy.policy.approvalThresholdBaseUnits)} USDC
              </li>
              <li>{policy.trust.escrowNote}</li>
            </ul>
          </>
        ) : (
          <p className="muted">Loading policy…</p>
        )}
      </section>

      <section className="panel ops">
        <h2>Agent proposals</h2>
        <p className="muted">
          Scripted scenarios for the judge path — no LLM required.
        </p>
        <div className="scenario-grid">
          {scenarios.map((s) => (
            <article key={s.scenario} className="scenario">
              <h3>{s.label}</h3>
              <p>{s.rationale}</p>
              <p className="mono">
                {formatUsdc(s.amountBaseUnits)} USDC · {s.settlementKind}
              </p>
              <div className="cta-row">
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void propose(s)}
                >
                  Propose
                </button>
                <button
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => void propose(s, { dryRun: true })}
                >
                  Dry-run
                </button>
                {s.scenario !== "blocked_demo" && address ? (
                  <button
                    className="btn ghost"
                    disabled={busy}
                    onClick={() => void propose(s, { selfPay: true })}
                  >
                    Propose → self-pay
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel approvals" id="approvals">
        <h2>Human approval</h2>
        <p className="muted">
          SeaPay-style pause: above-threshold spends wait here until OK.
        </p>
        {pending.length === 0 ? (
          <p className="muted">No spends awaiting approval.</p>
        ) : (
          <ul className="approval-list">
            {pending.map((e) => (
              <li key={e.id}>
                <div>
                  <strong>{e.label}</strong>
                  <p className="mono">
                    {formatUsdc(e.amountBaseUnits)} USDC · {e.policyReason}
                  </p>
                </div>
                <div className="cta-row">
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void onApprove(e.id)}
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
                  <button
                    className="btn ghost"
                    disabled={busy}
                    onClick={() => void onReject(e.id, "cancel")}
                  >
                    Cancel
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
            {focus.feeLamportsEstimate ? (
              <p className="muted">
                Fee estimate ~{focus.feeLamportsEstimate} lamports
                {focus.simulateOk === false
                  ? " · simulation failed"
                  : focus.simulateOk
                    ? " · simulation OK"
                    : ""}
              </p>
            ) : null}
            {["approved", "ready_to_sign", "failed"].includes(focus.status) &&
            address ? (
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => void onSettle(focus, true)}
              >
                Simulate → sign → settle (self-pay)
              </button>
            ) : null}
            {focus.error ? <p className="warn">{focus.error}</p> : null}
          </div>
        ) : (
          <p className="muted">Propose a spend to see the state machine.</p>
        )}
        {message ? <p className="ok-msg">{message}</p> : null}
        {error ? <p className="warn">{error}</p> : null}
      </section>

      {receipt ? <ReceiptCard entry={receipt} /> : null}

      <section className="panel ledger">
        <h2>Decision log</h2>
        <p className="muted">
          Agent Guard twin — every policy decision is visible.
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
                  {e.explorerUrl ? (
                    <a href={e.explorerUrl} target="_blank" rel="noreferrer">
                      explorer
                    </a>
                  ) : null}
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
      </section>

      <TeamStrip />

      <footer className="footer">
        <p>
          Built during UBC Hackathon 2026. Prep research lived in a private
          reference repo — this submission history starts after kickoff.
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
