# Policy Desk — filming script (2–3 min)

User films. Do **not** invent a successful Phantom cold-run in docs if credentials were unavailable at prep time.

## Pre-flight (off camera)

1. Phantom → **Devnet** · funded SOL + Devnet USDC (`faucet.solana.com`, `faucet.circle.com`).
2. `cp .env.example .env.local` · set `OPERATOR_TOKEN`, `SESSION_SECRET` (never commit).
3. Optional live LLM: set `OPENAI_API_KEY` — without it, stay on **Fixture mode** (honest).
4. `npm run build && npm run start` (or `npm run dev`) · open local or tunnel URL.
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

## If live LLM is configured

Say “Live mode” once, show bounded tool loop pauses for approval/payment, then same settle path. If `OPENAI_API_KEY` missing: **LIVE UNVERIFIED** — film fixture only.

## Backup if Phantom unavailable

Film UI + fixture steps through approve/simulate; narrate sign/confirm as the missing cold step; show a prior Explorer receipt screenshot only if you have a real one from an earlier run (never fabricate).
