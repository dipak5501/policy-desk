# Devpost-ready short answers (draft)

## What we built

**Policy Desk** — a policy-gated Solana Devnet USDC spending desk for a research agent. The agent can only buy from a server-side demo catalog; spends above a threshold pause for a human operator; Phantom signs prepared USDC transfers; the desk confirms on-chain then delivers paid content into a **spoken + cited** research answer with an Explorer receipt. **QuickNode Streams** watches the chain and reconciles signatures to the ledger (matched settles vs unmatched alerts).

## The problem

Agents that can pay are useful until they are dangerous. Blank-check wallets, client-supplied merchants, and silent LLM spend create drain risk. Judges need to see **block before sign**, independent **chain observation**, and a clear operator voice — not custody theater.

## How it works

1. Wallet login (challenge-bound signature) + optional operator login (HttpOnly + CSRF from auth JSON).
2. Task + USDC budget → **Fixture** (labeled deterministic tools) or **Live** agent (`OPENAI_API_KEY` → bounded tool loop; without key → **LIVE UNVERIFIED**).
3. Policy engine: allow / block / needs_approval (caps, mint, allowlists) on catalog `resourceId` only.
4. Human approval widget above threshold → settle/prepare (re-check + simulate) → Phantom sign → settle/confirm (TransferChecked + prepare binding) → deliver → answer + **ElevenLabs Speak** + receipt.
5. SQLite ledger persists reservations across restarts. **QuickNode Streams** webhook reconciles observed signatures to ledger settles and flags unmatched USDC hits.

## What’s unique

- **Catalog as control plane** — client/model cannot set payee, amount, or mint; only `resourceId`.
- **Streams as observation plane** — provider webhook → matched / unmatched reconcile (not a decorative ticker).
- **Voice desk** — ElevenLabs narrates policy block, settle, and research answers (demo video must play audio).
- **Honest demo labels** — fixture vs live vs LIVE UNVERIFIED; demo-catalog content is not faked as live oracles.
- **Settlement binding** — confirm requires matching `prepareId`, reconciles stored signatures, rejects client `toOwner`.

## Track / bounty selections (recommended)

| Select | Why |
|---|---|
| **Agentic Payments and AI** (main) | Policy-gated agent USDC spend + x402-style settle-before-deliver |
| **Best use of Solana** (chain) | Devnet USDC, Phantom, TransferChecked, program IDs in README |
| **QuickNode Streams** | Core observation + reconcile — document Stream filter/destination in [STREAMS.md](./STREAMS.md) |
| **ElevenLabs** | Core voice desk — TTS on answers + settle/block briefs; show audio in the video |

## What we do **not** claim

- Live weather/market oracles (paid bodies are `[DEMO CATALOG]` briefs).
- On-chain escrow vault or mainnet production custody.
- Gemini / Grok Bot / Arc (not in product).

## Next steps

- Hosted durable deploy (Railway/Vercel with persistent volume or Postgres).
- Keep Streams filter filled with live Stream id after QuickNode create.
- Optional P1: richer research citations without expanding to marketplace/vaults.
