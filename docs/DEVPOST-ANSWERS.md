# Devpost-ready short answers (draft)

## What we built

**Policy Desk** — a policy-gated Solana Devnet USDC spending desk for a research agent. The agent can only buy from a server-side demo catalog; spends above a threshold pause for a human operator; Phantom signs prepared USDC transfers; the desk confirms on-chain then delivers paid content into a cited research answer with an Explorer receipt.

## The problem

Agents that can pay are useful until they are dangerous. Blank-check wallets, client-supplied merchants, and silent LLM spend create drain risk. Judges need to see **block before sign**, not custody theater.

## How it works

1. Wallet login (challenge-bound signature) + optional operator login (HttpOnly + CSRF from auth JSON).
2. Task + USDC budget → fixture (or optional live) agent inspects catalog `resourceId`s.
3. Policy engine: allow / block / needs_approval (caps, mint, allowlists).
4. Human approval widget above threshold → settle/prepare (re-check + simulate) → Phantom sign → settle/confirm (TransferChecked + prepare binding) → deliver → answer + receipt.
5. SQLite ledger persists reservations across restarts; Streams webhook is ticker-only.

## What’s unique

- **Catalog as control plane** — client/model cannot set payee, amount, or mint; only `resourceId`.
- **Honest demo labels** — fixture mode and demo-catalog content are visible, not faked as live oracles.
- **Settlement binding** — confirm requires matching `prepareId`, reconciles stored signatures, rejects client `toOwner`.
- **Attack demos that fail** — adversarial merchant blocked with clear reasons (JailbreakMe-style clarity).

## Next steps

- Hosted durable deploy (Railway/Vercel with persistent volume or Postgres).
- Live LLM verified end-to-end with `OPENAI_API_KEY`.
- QuickNode Streams payment reconcile (do not claim bounty until shipped).
- Optional P1: richer research citations in chat (Hive/Neur pattern) without expanding to marketplace/vaults.
