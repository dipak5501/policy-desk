# Policy Desk

> **Built during UBC Hackathon 2026** (official hacking began Thu Nov 12, 6:00 PM CST).  
> Prep research / gallery notes lived in a separate private reference project — **this repository’s git history starts after kickoff.**  
> Flip the GitHub repo to **public** before Devpost submit if it is still private.

Policy-gated Solana USDC spending for a **research agent** that buys useful data within budget. Flow judges can see in ~90 seconds:

**start task → inspect catalog → blocked recover → approve (if needed) → simulate → Phantom sign → confirm (TransferChecked validated) → deliver paid content → answer + structured receipt**

Agent execution ships as labeled **fixture mode** (deterministic tools). Optional **live** mode (`OPENAI_API_KEY`) runs a bounded, schema-validated tool loop with approval/payment pauses — never present fixture steps as silent live-model execution. Without the key: **LIVE UNVERIFIED**.

## Pitch

AI agents that can pay are useful until they are dangerous. Policy Desk gives an agent a USDC budget on Solana Devnet, then enforces allowlists, caps, and a human approval widget above a threshold. Money only moves when policy says yes — and the desk shows every decision.

**Agents get a budget — not a blank check.**

## Control plane framing (AgentiPy-style)

**Policy + catalog** is the reusable control plane: the model/UI may only request a server `resourceId`. Payee, mint, amount, and settlement path are bound server-side. Approvals, prepare/confirm, and delivery are separate gates — not “agent has a wallet.”

## Engineering team

| GitHub | Name | Role · ownership |
|---|---|---|
| [@dipak5501](https://github.com/dipak5501) | Dipak Yadav | Full-stack developer · product/engineering lead — desk UX, APIs, demo, Devpost |
| [@ubiiii](https://github.com/ubiiii) | Utkarsh Lubal | Cybersecurity engineer — threat model, operator gate, adversarial tests |
| [@KashifManzer](https://github.com/KashifManzer) | Kashif Manzer | Blockchain engineer — Solana USDC settle, Phantom, x402, Streams |

Day-by-day ownership: [docs/TEAM-SPLIT.md](docs/TEAM-SPLIT.md).

## Documentation

| Doc | Purpose |
|---|---|
| [docs/WIN-PLAN.md](docs/WIN-PLAN.md) | Track targets, thesis, 90s story, non-goals |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | propose→…→receipt, x402, trust boundaries |
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) | Guarantees + limitations (matches code) |
| [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md) | 2–3 min filming script |
| [docs/DEVPOST-ANSWERS.md](docs/DEVPOST-ANSWERS.md) | Short Devpost draft answers |
| [docs/ORGANIZER-RESOURCES.md](docs/ORGANIZER-RESOURCES.md) | Sponsor/organizer checklist |
| [docs/FEATURE-BACKLOG.md](docs/FEATURE-BACKLOG.md) | P0/P1/P2 |
| [docs/STREAMS.md](docs/STREAMS.md) | QuickNode Streams webhook (ticker only) |

## Architecture

```
Task + budget → fixture/live agent tools → catalog resourceId
                     ↓
              lib/policy (allow / block / needs_approval)
                     ↓
              Human approval widget (if needed)
                     ↓
         settle/prepare (re-check + simulate + quote bind)
                     ↓
         Phantom sign → settle/confirm (template validate) → explorer receipt
                     ↓
         x402 deliver only after settled → answer cites purchase
```

Ledger durability: **SQLite** (`.data/ledger.sqlite`) with `BEGIN IMMEDIATE` writes. In-process `withLedgerLock` covers async interleaving in one Node process — not a substitute for multi-worker DB locking documentation. Full write-up: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Demo catalog (3 purchasable + 1 adversarial)

| ID | Price | Role |
|---|---|---|
| `weather-brief` | $0.10 | Under-threshold purchase |
| `market-pulse` | $0.25 | Distinct mid-price product |
| `weather-deep` | $0.60 | Needs operator approval |
| `evil-drain` | $2.50 | Labeled adversarial — must block |

Paid bodies are team-authored **demo catalog** briefs (`[DEMO CATALOG]`), unlocked only after settlement — not live oracles.

## Run locally

```bash
export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH"  # if needed
cd policy-desk
cp .env.example .env.local   # set OPERATOR_TOKEN + SESSION_SECRET (server-only)
npm install
npm test
npm run typecheck
npm run build
npm run start   # or: npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Public demo tunnel (Cloudflare)

```bash
npm run tunnel:refresh
cat .tunnel-url
```

### Wallet / faucet

1. Phantom → **Devnet**
2. SOL — https://faucet.solana.com
3. USDC — https://faucet.circle.com (Solana / Devnet / USDC)

## Demo script (~60–90s live / 2–3 min film)

See [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md).

1. Connect Phantom → sign wallet login (HttpOnly + CSRF from auth JSON).
2. Operator login for above-threshold approvals.
3. Point at **Fixture mode** + **demo catalog**.
4. Task budget $1.00 → block $2.50 → approve $0.60 → simulate → sign → confirm → deliver → receipt.
5. One-liner: “Agents get a budget — not a blank check.”

**Limits:** SQLite prototype (single writer preferred); local x402 is a ledger-gated demo merchant; Streams ticker ≠ bounty reconcile; demo catalog content is labeled; live mode unverified without `OPENAI_API_KEY`.

## Threat model (JailbreakMe-style honesty)

Attacks that **fail with clear reasons** (see tests + UI):

- Client payee/amount/mint overrides on `/api/agent/propose`
- Non-allowlisted / adversarial merchant
- Cross-user content unlock
- CSRF without auth JSON token
- Confirm without matching `prepareId` / with client `toOwner`

Details: [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## Eligibility note

UBC Hackathon 2026 requires projects built during the hackathon. This app was scaffolded and committed in the allowed window. Do **not** submit older pre-kickoff prep repositories as the Devpost artifact.
