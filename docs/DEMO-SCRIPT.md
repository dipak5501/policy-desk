# Policy Desk — filming script (2–3 min)

User films. Do **not** invent a successful Phantom cold-run in docs if credentials were unavailable at prep time.

## Pre-flight (off camera)

1. Phantom → **Devnet** · funded SOL + Devnet USDC (`faucet.solana.com`, `faucet.circle.com`).
2. `cp .env.example .env.local` · set `OPERATOR_TOKEN`, `SESSION_SECRET` (never commit).
3. Optional live LLM: set `OPENAI_API_KEY=` in `.env.local` (see `.env.example`) — without it, stay on **Fixture mode** or expect **LIVE UNVERIFIED**.
4. `npm run build && npm run start` (or `npm run dev -- --hostname 127.0.0.1 --port 3000`) · open `http://127.0.0.1:3000`.
5. Operator password is the value of `OPERATOR_TOKEN` in `.env.local`.

## On-camera cold run (~2–3 min)

| Time | Say / show |
|---|---|
| 0:00 | “Policy Desk — agents get a budget, not a blank check.” |
| 0:10 | Connect Phantom (Devnet) → sign wallet login challenge. Point at: HttpOnly session; CSRF from auth JSON, not `document.cookie`. |
| 0:25 | Operator login (password) for above-threshold approvals. |
| 0:35 | Point at **Fixture mode** + **demo catalog** ($0.10 weather / $0.25 market / $0.60 deep memo + adversarial fixture). |
| 0:50 | Start task with **$1.00** budget (base units `1000000`). |
| 1:00 | Inspect catalog → **Request blocked** ($2.50 evil drain). Show block + no reservation. |
| 1:20 | **Request above threshold** ($0.60 deep memo). Show pause for human approval. |
| 1:35 | Operator **Approve** → **Simulate** → Phantom **Sign** → **Confirm**. |
| 1:55 | Deliver paid content → compose answer citing purchased brief → receipt with **Explorer** link. |
| 2:10 | One-liner: jailbreak / client override fails (catalog-only propose). Optional: show threat-model slide. |
| 2:25 | Close: “Policy + catalog is a reusable control plane for agent spend.” |

## Prove live agent (one-click path)

1. Add `OPENAI_API_KEY=sk-…` to `.env.local` · restart Next.
2. Open desk → Connect Phantom → Sign in → Operator login (if needed).
3. Select **Live** → **Start task** → **Live turn**.
4. Banner must read **LIVE** (not FIXTURE, not silent). If key missing/fail: **LIVE UNVERIFIED**.
5. Approve / Simulate → sign → settle when the model pauses → **Live turn** again → answer cites purchase.

If `OPENAI_API_KEY` missing: film **Fixture** only — never present fixture as live.

## Backup if Phantom unavailable

Film UI + fixture steps through approve/simulate; narrate sign/confirm as the missing cold step; show a prior Explorer receipt screenshot only if you have a real one from an earlier run (never fabricate).
