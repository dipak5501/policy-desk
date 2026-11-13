# Feature backlog — gallery best-of → Policy Desk

Priorities distilled from MBC 2025 gallery synthesis (`guarded-agent-treasury/docs/MBC-2025-GALLERY-NOTES.md` §5) and what already ships in this repo.  
**P0** = demo-critical for Fri Nov 20 · **P1** = high leverage if P0 green · **P2** = only after polish buffer.

Owners: **Dipak** (full-stack / product) · **Utkarsh** (cybersecurity) · **Kashif** (blockchain).

---

## P0 — must ship for the killer path

| ID | Feature | Gallery source | Acceptance criteria | Owner | Status |
|---|---|---|---|---|---|
| P0-1 | Human approval interrupt widget | SeaPay | Above-threshold spend pauses at widget; Approve/Reject via operator token; no Phantom prompt before Approve | Dipak · gate Utkarsh | **In app** — harden copy + failure UX |
| P0-2 | Visible policy decisions + audit log | Agent Guard | Every propose shows allow/block/needs_approval + reason; transitions append audit; desk shows decision text judges can read | Dipak · Utkarsh | **In app** — keep ledger/audit durable across demo restarts |
| P0-3 | x402 quote → pay → resume | Instant Markets, Quarry, SeaPay | `/api/x402/weather` returns challenge; under-threshold auto path and above-threshold approval path both resume with body after settle | Kashif · Dipak UI | **In app** — exact seller verify regression tests |
| P0-4 | Receipt + explorer link | PolyHedge, Quarry | Settled row shows signature, amount, payee, Devnet explorer URL; copyable | Dipak · Kashif | **In app** — verify cold-path |
| P0-5 | Clear payment state machine | Gallery UX pattern | UI steps match propose→…→settled; blocked never offers Sign | Dipak | **In app** — `PaymentProgress` |
| P0-6 | Dry-run / simulate before broadcast | Agent Guard, PolyHedge | Prepare simulates; insufficient SOL/USDC surfaces before sign; dry-run scenario does not spend | Kashif · Dipak | **In app** — judge-script dry-run button reliable |
| P0-7 | Honest block-before-sign | Aegis / our thesis | Non-allowlisted merchant **never** builds a signable tx; no fake escrow vault claimed | Utkarsh · Kashif | **In app** — adversarial tests must stay green |
| P0-8 | Trust strip + organizer resources | Density/trust cues | Devnet, mint `4zMMC9…`, wallet, allowlist posture + ResourceStrip links live | Dipak | **In app** |
| P0-9 | 90s demo script reliability | Win plan | Blocked + approval + settle path runs twice cold without manual ledger wipe | All | **Active** — Day 1–2 DoD |
| P0-10 | Streams LIVE feed *(if time)* | QuickNode bounty | Webhook auth + ticker shows `stream` beside ledger; documented in STREAMS.md | Kashif · Utkarsh secret | **Wired** — configure live stream or drop bounty claim |

---

## P1 — high leverage after P0

| ID | Feature | Gallery source | Acceptance criteria | Owner | Status |
|---|---|---|---|---|---|
| P1-1 | Fee / balance clarity | Gasless Hub (friction lesson) | Desk shows SOL + USDC; clear error when either insufficient | Dipak · Kashif | Partial |
| P1-2 | Treasury posture labels | FRCT | Defensive / Neutral / Aggressive (or equivalent) tied to policy regime | Dipak | Partial (`regime`) |
| P1-3 | Stronger adversarial suite | Security craft | Signature-only confirm rejected; wrong mint/over-cap/non-allowlist covered in CI `npm test` | Utkarsh | Partial — expand |
| P1-4 | Private Devnet RPC | Demo reliability | QuickNode (or equiv) URL in `.env.local`; public RPC only fallback | Kashif | Checklist |
| P1-5 | Public tunnel / deploy URL | Judging | `npm run tunnel:refresh` or hosted URL stable for video + Devpost | Dipak | Ops |
| P1-6 | Pitch video 2–3 min | PITCH pattern | Problem → path → live clip → threat honesty → close | Dipak (cut) · all on camera path | Not started |

---

## P2 — defer unless ahead of schedule

| ID | Feature | Gallery source | Why deferred |
|---|---|---|---|
| P2-1 | Sponsored / gasless fees | Gasless Hub, Instant Markets | Not required; faucet path sufficient |
| P2-2 | On-chain escrow PDAs | SolMail, Trust Pay | Conflicts with honest block-before-sign MVP |
| P2-3 | NFT / attestation receipt mint | PolyHedge, Quarry | Nice shareable; not needed for settle proof |
| P2-4 | Chat-first proposal UX | SeaPay, SolMail | Scenario cards already tell the story |
| P2-5 | CCTP / cross-chain USDC | FRCT, HyperSphere | Off killer path; eligibility noise |
| P2-6 | Ollama live propose | — | Non-deterministic demos |
| P2-7 | Agent marketplace | agent rank | Out of scope |

---

## Definition of “gallery P0 done”

Judges can, without coaching beyond the 90s script:

1. See a **block** with no wallet popup.  
2. See a **human approval** interrupt, then Approve.  
3. See **simulate → sign → settle → explorer receipt**.  
4. Optionally see an **x402 resume** and a **Streams** tick.

Anything that does not serve that sequence is not P0.
