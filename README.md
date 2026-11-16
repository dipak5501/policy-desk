# Policy Desk

> **Built during UBC Hackathon 2026** (official hacking began Thu Nov 12, 6:00 PM CST).

Policy-gated Solana USDC spending for a **research agent** that buys useful data within budget. Flow judges can see in ~90 seconds:

**start task → inspect catalog → blocked recover → approve (if needed) → simulate → Phantom sign → confirm (TransferChecked validated) → deliver paid content → answer + structured receipt**

Agent execution ships as labeled **fixture mode** (deterministic tools). Optional **live** mode (`OPENAI_API_KEY`) runs a bounded, schema-validated tool loop with approval/payment pauses — Desk **Live** radio + **Live turn** never present fixture steps as silent live-model execution. Without the key: **LIVE UNVERIFIED**. Prove live: set key → restart → Live → Start task → Live turn.

**ElevenLabs voice desk** (`ELEVENLABS_API_KEY`, product `eleven_multilingual_v2`) narrates policy block / settle briefs and research answers (auto-speak on when keyed; mute with `ELEVENLABS_AUTO_SPEAK=0`). **Show audio in the demo video** to claim the ElevenLabs bounty.

**QuickNode Streams** (`QUICKNODE_STREAM_WEBHOOK_SECRET`) is a **core observation source**: webhook hits reconcile to ledger signatures (`matched` / `unmatched`). Configure Stream filter + destination per [docs/STREAMS.md](docs/STREAMS.md) before claiming the Streams bounty.

## Pitch

AI agents that can pay are useful until they are dangerous. Policy Desk gives an agent a USDC budget on Solana Devnet, then enforces allowlists, caps, and a human approval widget above a threshold. Money only moves when policy says yes — and the desk shows every decision.

**Agents get a budget — not a blank check.**

## Control plane framing (AgentiPy-style)

**Policy + catalog** is the reusable control plane: the model/UI may only request a server `resourceId`. Payee, mint, amount, and settlement path are bound server-side. Approvals, prepare/confirm, and delivery are separate gates — not “agent has a wallet.”

## Engineering team

| GitHub | Name | Role |
|---|---|---|
| [@dipak5501](https://github.com/dipak5501) | Dipak Yadav | Full-stack developer |
| [@ubiiii](https://github.com/ubiiii) | Utkarsh Lubal | Cybersecurity engineer |
| [@KashifManzer](https://github.com/KashifManzer) | Kashif Manzer | Blockchain engineer |

## Documentation

| Doc | Purpose |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | propose→…→receipt, x402, trust boundaries |
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) | Guarantees + limitations (matches code) |
| [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md) | 2–3 min filming script |
| [docs/DEVPOST-ANSWERS.md](docs/DEVPOST-ANSWERS.md) | Short Devpost draft answers |
| [docs/ORGANIZER-RESOURCES.md](docs/ORGANIZER-RESOURCES.md) | Sponsor/organizer checklist |
| [docs/STREAMS.md](docs/STREAMS.md) | QuickNode Streams reconcile (matched / unmatched) |

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

## Solana (Best use of Solana)

Policy Desk settles **real Devnet USDC** before paid content unlocks. The desk never holds keys — Phantom signs a server-prepared transaction; confirm validates the full instruction template.

| Item | Value / role |
|---|---|
| Cluster | `devnet` only (`NEXT_PUBLIC_SOLANA_CLUSTER`) |
| Circle Devnet USDC mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| SPL Token program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| Associated Token program | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` |
| Settlement path | `TransferChecked` (+ idempotent ATA create if needed) |
| CAIP-2 (x402) | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| Explorer receipt | `explorer.solana.com/tx/…?cluster=devnet` |

**How Solana is used in the demo:** policy approve → `settle/prepare` builds + simulates the transfer → Phantom signs → `settle/confirm` validates template + confirms on-chain → only then does x402 deliver the demo-catalog body. Code: `lib/solana/*`, `app/api/settle/*`.

## Demo catalog (3 purchasable + 1 adversarial)

| ID | Price | Role |
|---|---|---|
| `weather-brief` | $0.10 | Under-threshold purchase |
| `market-pulse` | $0.25 | Distinct mid-price product |
| `weather-deep` | $0.60 | Needs operator approval |
| `evil-drain` | $2.50 | Labeled adversarial — must block |

Paid bodies are team-authored **demo catalog** briefs (`[DEMO CATALOG]`), unlocked only after settlement — not live oracles.

## Run locally

Requires Node.js 22.5 or later (`node:sqlite` is built in).

```bash
cd policy-desk
cp .env.example .env.local
npm install
npm test
npm run typecheck
npm run build
npm run start   # or: npm run dev
```

Copy values from `.env.example` into `.env.local` (operator session secrets, optional OpenAI / ElevenLabs / Streams). Open [http://localhost:3000](http://localhost:3000).

### Public demo tunnel (Cloudflare)

```bash
npm run tunnel          # or: npm run dev:public
cat remote-link         # auto-updated HTTPS URL (also mirrored in .tunnel-url)
```

Starts Next on `127.0.0.1:3000` if needed, opens a Cloudflare quick tunnel, writes the public URL to `remote-link`, and keeps a watchdog running so the file refreshes if the tunnel dies or the trycloudflare hostname changes. Use `npm run tunnel:refresh` to force a new URL; `npm run tunnel:url` / `tunnel:status` to inspect.

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

**Limits:** SQLite prototype (single writer preferred); local x402 is a ledger-gated demo merchant; Streams needs a live QuickNode Stream id in STREAMS.md for judges; demo catalog content is labeled; live mode unverified without `OPENAI_API_KEY`.

## Threat model (JailbreakMe-style honesty)

Attacks that **fail with clear reasons** (see tests + UI):

- Client payee/amount/mint overrides on `/api/agent/propose`
- Non-allowlisted / adversarial merchant
- Cross-user content unlock
- CSRF without auth JSON token
- Confirm without matching `prepareId` / with client `toOwner`

Details: [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

## Eligibility

UBC Hackathon 2026 requires projects built during the hackathon. This app was scaffolded and committed in the allowed window.
