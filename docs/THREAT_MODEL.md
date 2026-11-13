# Threat model — Policy Desk (honest limitations)

## What we enforce

- **Policy before signature** — allowlist, mint check, per-tx / daily caps, pause, human threshold.
- **Immutable payment intent** — amount/payee/resource cannot be mutated after create.
- **Prepare re-check** — settle prepare re-runs policy + destination checks and simulates the transfer.
- **Operator gate** — approve/reject requires `OPERATOR_TOKEN` (shared secret for the desk demo).
- **Devnet only** — cluster hard-fails if not `devnet`.

## What we do **not** claim

- Not production custody / MPC / hardware-enforced agent keys.
- No on-chain escrow vault in this MVP — safety is **block before sign**, not locked funds.
- Operator token is demo auth, not SSO / wallet-bound operator identity.
- x402 seller is a local demo facilitator; not a production payment facilitator network.
- RPC / faucet availability can break live demos; dry-run still shows the policy path.

## Trust boundaries

| Boundary | Trust |
|---|---|
| Browser wallet (Phantom) | User signs; we never hold their key |
| Next.js API | Enforces policy + ledger; single-process `.data` store |
| Solana Devnet | Settlement truth for explorer receipts |
| Operator token | Anyone with the token can approve — rotate for public demos |
