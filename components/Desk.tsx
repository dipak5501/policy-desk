"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LedgerEntry,
  ResearchTask,
  StreamEvent,
} from "@/lib/ledger/types";
import type { CatalogResource } from "@/lib/catalog/resources";
import { formatSol, formatUsdc, shortKey } from "@/lib/format";
import { Atmosphere } from "./Atmosphere";
import {
  WalletProvider,
  useWallet,
  isEphemeralTunnelHost,
} from "./WalletProvider";
import { TrustStrip } from "./TrustStrip";
import { PaymentProgress } from "./PaymentProgress";
import { ReceiptCard } from "./ReceiptCard";
import { EventTicker } from "./EventTicker";
import { approveEntry, settleEntry } from "./settle";
import { csrfHeaders, setCsrfToken } from "./csrfStore";

type FlowStage =
  | "connect"
  | "start"
  | "timeline"
  | "approval"
  | "settle"
  | "receipt";

const FLOW_STEPS: Array<{ id: FlowStage; label: string }> = [
  { id: "connect", label: "Connect" },
  { id: "start", label: "Start" },
  { id: "timeline", label: "Timeline" },
  { id: "approval", label: "Approval" },
  { id: "settle", label: "Settle" },
  { id: "receipt", label: "Receipt" },
];

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
    fixtureAgentNote?: string;
  };
};

type Balances = {
  sol: number;
  usdcBaseUnits: string;
  canCoverFee: boolean;
  feeHintSol: number;
};

/** Short hint — Treasury Desk style (no Recheck-inject doom loop). */
function WalletHint({
  onTunnel,
  installed,
}: {
  onTunnel: boolean;
  installed: boolean;
}) {
  if (onTunnel) {
    return (
      <p className="wallet-help" role="status">
        Tunnel origins are a bad wallet origin. Open{" "}
        <a href="http://127.0.0.1:3000">
          <strong>http://127.0.0.1:3000</strong>
        </a>{" "}
        in Chrome with Phantom, then Connect. Empty wallet is fine — fund later.
      </p>
    );
  }
  if (!installed) {
    return (
      <p className="wallet-help" role="status">
        Install Phantom (Chrome), unlock it, set network to{" "}
        <strong>Devnet</strong>, then click Connect. Empty wallet is fine for
        login.
      </p>
    );
  }
  return (
    <p className="wallet-help" role="status">
      Set Phantom to <strong>Devnet</strong>. Connect signs a login challenge
      (empty wallet OK — funding is separate).
    </p>
  );
}

function DeskInner() {
  const {
    address,
    provider,
    connect,
    ensureSession,
    installed,
    connecting,
    signingIn,
    ready,
    sessionReady,
  } = useWallet();
  const [policy, setPolicy] = useState<PolicyPayload | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [streamStats, setStreamStats] = useState<{
    total: number;
    matched: number;
    unmatched: number;
    noSignature: number;
  } | null>(null);
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
  const [onTunnel, setOnTunnel] = useState(false);
  const [voiceConfigured, setVoiceConfigured] = useState(false);
  const [voiceAutoSpeak, setVoiceAutoSpeak] = useState(false);
  const pollCache = useRef<Record<string, string>>({});

  useEffect(() => {
    setOnTunnel(isEphemeralTunnelHost(window.location.hostname));
  }, []);

  const taskId = task?.id;

  const refresh = useCallback(async () => {
    try {
      const [p, l, c, streams, op, walletSession, voiceStatus] =
        await Promise.all([
          fetch("/api/policy")
            .then((r) => r.json())
            .catch(() => null),
          fetch("/api/ledger", { credentials: "include" })
            .then((r) => r.json())
            .catch(() => ({ entries: [] })),
          fetch("/api/catalog")
            .then((r) => r.json())
            .catch(() => ({ resources: [] })),
          fetch("/api/streams/webhook")
            .then((r) => r.json())
            .catch(() => ({ events: [], stats: null })),
          fetch("/api/operator/session", { credentials: "include" })
            .then((r) => r.json())
            .catch(() => ({ authenticated: false, csrf: null })),
          fetch("/api/wallet/session", { credentials: "include" })
            .then((r) => r.json())
            .catch(() => ({ authenticated: false, csrf: null })),
          fetch("/api/voice/status")
            .then((r) => r.json())
            .catch(() => ({ configured: false, autoSpeak: false })),
        ]);
      setOperatorAuthed((prev) => {
        const next = Boolean(op.authenticated);
        return prev === next ? prev : next;
      });
      // Prefer freshest CSRF from authenticated sessions (never document.cookie)
      if (typeof op.csrf === "string" && op.csrf) setCsrfToken(op.csrf);
      else if (typeof walletSession.csrf === "string" && walletSession.csrf) {
        setCsrfToken(walletSession.csrf);
      }
      // Skip setState when payload unchanged — stops ticker/CSS blink on polls.
      const apply = <T,>(key: string, setter: (v: T) => void, next: T) => {
        const raw = JSON.stringify(next);
        if (pollCache.current[key] === raw) return;
        pollCache.current[key] = raw;
        setter(next);
      };
      if (p) apply("policy", setPolicy, p as PolicyPayload);
      apply("entries", setEntries, (l.entries ?? []) as LedgerEntry[]);
      apply(
        "audit",
        setAudit,
        (l.audit ?? p?.audit ?? []) as PolicyPayload["audit"],
      );
      apply("catalog", setCatalog, (c.resources ?? []) as CatalogResource[]);
      apply(
        "streams",
        setStreamEvents,
        (streams.events ?? []) as StreamEvent[],
      );
      apply(
        "streamStats",
        setStreamStats,
        (streams.stats ?? null) as {
          total: number;
          matched: number;
          unmatched: number;
          noSignature: number;
        } | null,
      );
      setVoiceConfigured((prev) => {
        const next = Boolean(voiceStatus.configured);
        return prev === next ? prev : next;
      });
      setVoiceAutoSpeak((prev) => {
        const next = Boolean(voiceStatus.autoSpeak);
        return prev === next ? prev : next;
      });
      if (taskId) {
        const t = await fetch(`/api/tasks/${taskId}`)
          .then((r) => r.json())
          .catch(() => ({}));
        if (t.task) apply("task", setTask, t.task as ResearchTask);
      }
      if (address) {
        const b = await fetch(`/api/balances?address=${address}`)
          .then((r) => r.json())
          .catch(() => ({}));
        if (b.balances) apply("balances", setBalances, b.balances as Balances);
        if (b.error) setError(b.error);
      }
    } catch (err) {
      console.error("desk refresh failed", err);
    }
  }, [address, taskId]);

  useEffect(() => {
    void refresh();
    // Slower poll — less UI churn; actions still call refresh() explicitly.
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

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
      if (typeof data.csrf === "string") setCsrfToken(data.csrf);
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

  const flowStage: FlowStage = useMemo(() => {
    if (receipt) return "receipt";
    if (
      focus &&
      ["approved", "ready_to_sign", "confirming", "failed"].includes(
        focus.status,
      )
    ) {
      return "settle";
    }
    if (pending.length > 0) return "approval";
    if (task) return "timeline";
    if (sessionReady) return "start";
    return "connect";
  }, [receipt, focus, pending.length, task, sessionReady]);

  const flowIndex = FLOW_STEPS.findIndex((s) => s.id === flowStage);

  function mapWalletSessionError(raw: string): string {
    if (/wallet session required/i.test(raw)) {
      return "Connect Phantom and sign the login challenge first (Sign in with Phantom). Operator login alone is not enough.";
    }
    return raw;
  }

  async function signInWithPhantom() {
    setBusy(true);
    setError(null);
    try {
      // Treasury Desk pattern: one Connect click — opens install if missing,
      // otherwise phantom.connect() + login challenge.
      if (!address) {
        await connect();
      } else if (!sessionReady) {
        await ensureSession();
      }
      setMessage("Wallet session active — you can run the demo.");
      await refresh();
    } catch (err) {
      setError(
        mapWalletSessionError(
          err instanceof Error ? err.message : String(err),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function startTask() {
    if (!sessionReady) {
      setError(
        "Connect Phantom and sign the login challenge first (Sign in with Phantom).",
      );
      return;
    }
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
          mode: "fixture",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start task");
      setTask(data.task);
      setMessage("Fixture task started — scripted tools, labeled catalog.");
      await refresh();
    } catch (err) {
      setError(
        mapWalletSessionError(
          err instanceof Error ? err.message : String(err),
        ),
      );
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
    if (!sessionReady) {
      setError(
        "Connect Phantom and sign the login challenge first (Sign in with Phantom).",
      );
      return;
    }
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
      setMessage(
        `${data.label ?? "FIXTURE"}: ${data.message}${
          data.disclaimer ? ` — ${data.disclaimer}` : ""
        }`,
      );
      if (data.entryId) {
        const entry =
          (await fetch("/api/ledger").then((r) => r.json())).entries?.find(
            (e: LedgerEntry) => e.id === data.entryId,
          ) ?? null;
        if (entry) setFocus(entry);
      }
      await refresh();
      if (action === "compose_answer" && data.task?.answer) {
        void maybeAutoSpeak(String(data.task.answer));
      }
      return data;
    } catch (err) {
      setError(
        mapWalletSessionError(
          err instanceof Error ? err.message : String(err),
        ),
      );
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

  async function speakAnswer(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Nothing to speak yet — compose an answer first.");
      return;
    }
    if (!sessionReady) {
      setError("Sign in with Phantom before Speak answer.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ text: trimmed.slice(0, 2500) }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        const data = contentType.includes("application/json")
          ? await res.json().catch(() => ({}))
          : {};
        throw new Error(
          (data as { error?: string }).error ??
            `Speak failed (${res.status})`,
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      await audio.play();
      setMessage("Playing ElevenLabs narration of the research answer.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  /** Auto-narrate when ElevenLabs is configured (mute with ELEVENLABS_AUTO_SPEAK=0). */
  async function maybeAutoSpeak(text: string) {
    try {
      const status = await fetch("/api/voice/status", {
        credentials: "include",
      }).then((r) => r.json());
      if (!status?.configured || !status?.autoSpeak) return;
      await speakAnswer(text);
    } catch {
      /* voice path — ignore soft failures */
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
      void maybeAutoSpeak(
        `Settled on Solana Devnet. Signature ${String(settled.signature).slice(0, 12)}.`,
      );
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
      setError(
        "Connect Phantom and sign the login challenge first (Chrome/Brave with Phantom).",
      );
      return;
    }
    if (!sessionReady) {
      setError(
        "Sign in with Phantom first — approve the wallet login challenge, then Run demo.",
      );
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
          mode: "fixture",
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
      void maybeAutoSpeak(
        "Policy blocked a bad merchant. No reservation. No signature.",
      );

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
      const composed = await step("compose_answer");
      await refresh();
      if (composed?.task?.answer) {
        void maybeAutoSpeak(String(composed.task.answer));
      }
    } catch (err) {
      setError(
        mapWalletSessionError(
          err instanceof Error ? err.message : String(err),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="desk-shell">
      <Atmosphere />

      <header className="desk-hero">
        <div className="brand-mark">
          <span className="brand-glyph" aria-hidden>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 10 V7 a6 6 0 0 1 12 0 v3" />
              <rect x="5" y="10" width="14" height="11" rx="1.5" />
              <path d="M12 14 v3" />
            </svg>
          </span>
          <div>
            <h1 className="brand-name">Policy Desk</h1>
            <span className="brand-sub">Solana Devnet · Agentic Payments</span>
          </div>
        </div>
        <p className="hero-headline">Agents get a budget — not a blank check</p>
        <p className="lede">
          A research agent buys useful data under policy. Bad merchants are
          blocked, humans approve above threshold, and Solana settles before
          content unlocks.
        </p>
        <div className="cta-row hero-cta">
          {onTunnel ? (
            <a className="btn primary" href="http://127.0.0.1:3000">
              Open localhost (wallet works here)
            </a>
          ) : null}
          {!ready ? (
            <button className="btn primary" type="button" disabled>
              Checking wallet…
            </button>
          ) : !address ? (
            <button
              type="button"
              className="btn primary"
              disabled={connecting || signingIn || busy}
              onClick={() => void signInWithPhantom()}
              autoFocus
            >
              {!installed
                ? "Install Phantom"
                : connecting || signingIn
                  ? "Connecting…"
                  : "Connect Phantom"}
            </button>
          ) : !sessionReady ? (
            <button
              className="btn primary"
              disabled={busy || signingIn || connecting}
              onClick={() => void signInWithPhantom()}
              autoFocus
            >
              {signingIn ? "Sign the challenge…" : "Sign in with Phantom"}
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void runResearchDemo()}
              autoFocus
            >
              Run research demo
            </button>
          )}
        </div>
        <div className="hero-meta">
          {sessionReady ? (
            <p className="wallet-help ok" role="status">
              Wallet session active — demo unlocked.
            </p>
          ) : address && !sessionReady ? (
            <p className="wallet-help" role="status">
              Connected — approve the Phantom login message to continue.
            </p>
          ) : (
            <WalletHint onTunnel={onTunnel} installed={installed} />
          )}
        </div>
      </header>

      {address ? (
        <p className="wallet-line mono" style={{ margin: "0 0 1.25rem" }}>
          {shortKey(address, 6)}
          {sessionReady ? " · signed in" : " · needs sign-in"} · SOL{" "}
          {balances ? formatSol(balances.sol) : "…"} · USDC{" "}
          {balances ? formatUsdc(balances.usdcBaseUnits) : "…"}
          {balances && !balances.canCoverFee ? (
            <span className="warn"> · low SOL for fees</span>
          ) : null}
        </p>
      ) : null}

      <ol className="flow-rail" aria-label="Demo flow">
        {FLOW_STEPS.map((step, i) => (
          <li
            key={step.id}
            className={
              i < flowIndex ? "is-done" : i === flowIndex ? "is-active" : ""
            }
          >
            <span className="flow-n">{i + 1}</span>
            {step.label}
          </li>
        ))}
      </ol>

      <EventTicker entries={entries} streamEvents={streamEvents} />

      {streamStats ? (
        <p className="muted small streams-stats" role="status">
          QuickNode Streams reconcile · matched {streamStats.matched} ·
          unmatched {streamStats.unmatched} · events {streamStats.total}
          {policy?.trust.streamsNote ? ` — ${policy.trust.streamsNote}` : null}
        </p>
      ) : null}

      {policy ? (
        <TrustStrip
          cluster={policy.trust.cluster}
          mint={policy.trust.mint}
          wallet={address}
          allowlistCount={policy.policy.allowlistedPayees.length}
          blockBeforeSign={policy.trust.blockBeforeSign}
          streamsReconcile={Boolean(policy.trust.streamsReconcile)}
          voiceReady={voiceConfigured}
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
          <p className="panel-kicker">Step 2 · Start</p>
          <h2>Run a task</h2>
          <p className="muted">
            Set a USDC budget, then run the agent. Content unlocks only after
            settlement.
          </p>
          <p className="fixture-banner" role="status">
            <strong>Fixture</strong> · deterministic demo agent · catalog is
            labeled sample data
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
          {!sessionReady ? (
            <p className="wallet-help" role="status">
              Connect Phantom above before Start task. Operator login alone is
              not enough.
            </p>
          ) : null}
          <div className="cta-row">
            <button
              type="button"
              className="btn primary"
              disabled={busy || !sessionReady}
              onClick={() => void startTask()}
            >
              Start task
            </button>
            {sessionReady ? (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void runResearchDemo()}
              >
                One-click demo
              </button>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={busy || !task || !sessionReady}
              onClick={() => void agentStep("inspect")}
            >
              Inspect catalog
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !task || !sessionReady}
              onClick={() => void agentStep("request_blocked")}
            >
              Request blocked
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !task || !sessionReady}
              onClick={() => void agentStep("request_approved")}
            >
              Request approved
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !task || !sessionReady}
              onClick={() => void agentStep("request_approval_tier")}
            >
              Request above threshold
            </button>
          </div>

          <h3>Catalog</h3>
          <p className="muted">
            Three research briefs ($0.10 / $0.25 / $0.60) and one adversarial
            merchant. Paid content unlocks after settlement.
          </p>
          {catalog.length === 0 ? (
            <div className="empty-state">
              <strong>Loading catalog…</strong>
              <p>Server demo resources will appear here.</p>
            </div>
          ) : (
            <ul className="catalog-list">
              {catalog.map((r) => (
                <li key={r.id}>
                  <div className="catalog-item-head">
                    <strong>{r.title}</strong>
                    <span
                      className={`pill ${r.allowlisted ? "status-approved" : "status-blocked"}`}
                    >
                      {r.adversarialFixture
                        ? "adversarial"
                        : r.allowlisted
                          ? "purchasable"
                          : "blocked"}
                    </span>
                  </div>
                  <p className="muted">{r.preview}</p>
                  <p className="mono">
                    {formatUsdc(r.amountBaseUnits)} USDC · {r.merchantLabel}
                    {r.teamOperated ? " · team-operated" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="desk-stack">
          <section className="panel timeline-panel">
            <p className="panel-kicker">Step 3 · Timeline</p>
            <h2>Task timeline</h2>
            {!task ? (
              <div className="empty-state">
                <strong>No active task</strong>
                <p>
                  Start a task or run the one-click demo to watch policy decide
                  each purchase.
                </p>
              </div>
            ) : (
              <>
                <p className="fixture-banner">
                  Mode: <strong>FIXTURE</strong> · budget{" "}
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
                    <div className="cta-row" style={{ marginTop: "0.75rem" }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy || !sessionReady || !voiceConfigured}
                        onClick={() => void speakAnswer(String(task.answer))}
                      >
                        Speak answer (ElevenLabs)
                      </button>
                      <span className="muted small">
                        {voiceConfigured
                          ? voiceAutoSpeak
                            ? "Voice desk on — auto-narrates answers after purchase."
                            : "Voice configured — click Speak for demo audio."
                          : "Add ELEVENLABS_API_KEY to enable voice desk."}
                      </span>
                    </div>
                  </article>
                ) : null}
              </>
            )}
          </section>

          <section className="panel approvals" id="approvals">
            <p className="panel-kicker">Step 4 · Approval</p>
            <h2>Approval card</h2>
            <p className="muted">
              Human pause before spend — merchant, amount, reason, and expiry.
              Operator auth is an HttpOnly server session.
            </p>
            {!operatorAuthed ? (
              <div className="operator-gate">
                <p className="muted small" style={{ margin: 0 }}>
                  Required for above-threshold spends.
                </p>
                <div className="cta-row">
                  <input
                    type="password"
                    className="mono"
                    placeholder="Operator password"
                    value={operatorPassword}
                    onChange={(e) => setOperatorPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && operatorPassword) {
                        void operatorLogin();
                      }
                    }}
                    aria-label="Operator password"
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || !operatorPassword}
                    onClick={() => void operatorLogin()}
                  >
                    Operator login
                  </button>
                </div>
              </div>
            ) : (
              <p className="ok-msg">Operator session active</p>
            )}
            {pending.length === 0 ? (
              <div className="empty-state">
                <strong>Queue clear</strong>
                <p>
                  When a purchase needs approval, the card appears here with
                  Approve / Reject.
                </p>
              </div>
            ) : (
              <ul className="approval-list">
                {pending.map((e) => (
                  <li key={e.id} className="approval-card">
                    <div className="approval-card-top">
                      <div>
                        <strong>{e.label}</strong>
                        <p className="muted small" style={{ margin: "0.2rem 0 0" }}>
                          {e.resource}
                        </p>
                      </div>
                      <div className="approval-amount">
                        ${formatUsdc(e.amountBaseUnits)}
                      </div>
                    </div>
                    <dl className="approval-card-body">
                      <div className="approval-row">
                        <dt>Payee</dt>
                        <dd className="mono">{shortKey(e.payee, 4)}</dd>
                      </div>
                      <div className="approval-row">
                        <dt>Reason</dt>
                        <dd>{e.policyReason}</dd>
                      </div>
                      {e.approvalExpiresAt ? (
                        <div className="approval-row">
                          <dt>Expires</dt>
                          <dd className="mono">{e.approvalExpiresAt}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="approval-card-actions">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={busy}
                        onClick={() => void onApprove(e)}
                        autoFocus
                      >
                        Approve
                      </button>
                      <button
                        type="button"
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
            <p className="panel-kicker">Step 5 · Settle</p>
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
                    type="button"
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
              <div className="empty-state">
                <strong>No payment in focus</strong>
                <p>Run a task step to focus an intent for settlement.</p>
              </div>
            )}
            {message ? (
              <p className="status-banner is-ok" role="status">
                {message}
              </p>
            ) : null}
            {error ? (
              <p className="status-banner is-err" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {receipt ? <ReceiptCard entry={receipt} task={task} /> : null}

      <section className="panel ledger">
        <p className="panel-kicker">Decision log</p>
        <h2>Payments &amp; audit</h2>
        <p className="muted">
          Visible policy decisions — not an on-chain immutable trail.
        </p>
        <div className="split">
          <div>
            <h3>Payments</h3>
            {entries.length === 0 ? (
              <div className="empty-state">
                <strong>No payments yet</strong>
                <p>Settled and blocked intents will list here.</p>
              </div>
            ) : (
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
                      <span className={`pill status-${e.status}`}>
                        {e.status}
                      </span>{" "}
                      {e.label} · {formatUsdc(e.amountBaseUnits)} USDC
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Audit</h3>
            {audit.length === 0 ? (
              <div className="empty-state">
                <strong>Quiet so far</strong>
                <p>Policy and settle events append as the demo runs.</p>
              </div>
            ) : (
              <ul className="log-list mono">
                {audit.slice(0, 12).map((a, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Audit events can share timestamps.
                  <li key={`${a.ts}-${i}`}>
                    {a.ts.slice(11, 19)} {a.kind}
                    {a.entryId ? ` · ${shortKey(a.entryId, 4)}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {policy?.trust.fixtureAgentNote ? (
          <p className="muted small">{policy.trust.fixtureAgentNote}</p>
        ) : null}
      </section>

      <footer className="footer">
        <span className="footer-tag">Built for UBC Agentic Payments</span>
        <p>
          Dipak Yadav · Utkarsh Lubal · Kashif Manzer — Solana Devnet USDC ·
          Phantom · policy before sign.
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
