# Architecture — Policy Desk (judge-aligned)

Policy-gated Solana Devnet USDC spending for a **research agent** that buys useful data. Settlement is **non-custodial**: Phantom holds keys; the desk decides whether a spend may be prepared, confirmed, and fulfilled.

> Target workflow: task + budget → preview → propose → policy → block/recover or approve → sign → **confirm settle** → deliver content → answer + receipt.  
> Detail: [JUDGE-REVIEW.md](./JUDGE-REVIEW.md) · [WIN-PLAN.md](./WIN-PLAN.md).

## End-to-end research-agent flow

```
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ User task +  │───▶│ Catalog preview │───▶│ Agent request    │
│ USDC budget  │    │ (free metadata) │    │ resource via API │
└──────────────┘    └─────────────────┘    └────────┬─────────┘
                                                     ▼
                                            ┌──────────────────┐
                                            │ Policy engine    │
                                            │ allow|block|     │
                                            │ needs_approval   │
                                            └────────┬─────────┘
                     ┌───────────────────────────────┼─────────────────────────┐
                     ▼                               ▼                         ▼
              ┌─────────────┐              ┌────────────────┐         ┌──────────────┐
              │ BLOCK +     │              │ Human approve  │         │ allow        │
              │ recover to  │              │ (SeaPay card)  │         │ (under thr.) │
              │ alt resource│              └───────┬────────┘         └──────┬───────┘
              └─────────────┘                      ▼                         │
                                          ┌────────────────┐                 │
                                          │ settle/prepare │◀────────────────┘
                                          │ re-check +     │
                                          │ simulate +     │
                                          │ template valid │
                                          └────────┬───────┘
                                                   ▼
                                          ┌────────────────┐
                                          │ Phantom sign   │
                                          └────────┬───────┘
                                                   ▼
                                          ┌────────────────┐     ┌─────────────────────┐
                                          │ settle/confirm │────▶│ Deliver resource    │
                                          │ + reconcile    │     │ then agent answer   │
                                          └────────────────┘     │ + structured receipt│
                                                                 └─────────────────────┘
```

### State machine (payment)

`proposed → blocked | pending_approval | approved | ready_to_sign → confirming → settled → fulfilled`  
(plus `rejected` / failed / `unknown` / `paid_delivery_pending` paths).  
Never show optimistic success for unconfirmed payments.

### Signing honesty (five layers)

| Layer | Meaning |
|---|---|
| Policy authorization | Server rules allow this intent |
| Operator approval | Human gate above threshold (if required) |
| Wallet signature | Phantom signs prepared bytes |
| On-chain confirmation | Tx succeeded at documented commitment |
| Resource delivery | Paid content released; answer may use it |

Under-threshold ≠ autonomous settlement if Phantom still signs.

### x402 / paid-resource branch

```
resource quote (expiry + exact base units)
  → policy + prepare + Phantom sign
  → confirm settlement (idempotent / reconcile)
  → deliver body / digest
  → resume agent answer
```

CAIP-2 network: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (Devnet). Mint: Circle Devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.

## Module map (current + target)

| Layer | Path | Responsibility |
|---|---|---|
| Desk UI | `app/page.tsx`, `components/*` | Task timeline, catalog preview, approval card, progress, receipts, resource strip |
| Propose / task | `app/api/agent/*` | Task + resource request → `reviewSpend` → ledger intent |
| Policy | `lib/policy/*` | Caps, allowlists, mint, pause, approval threshold, regime → real rules |
| Catalog | *(target)* server-side approved resources | Schema-validated resource IDs; merchants; previews; prices |
| Approvals | `app/api/approvals/[id]` | Operator-gated approve/reject bound to intent |
| Settle | `app/api/settle/prepare`, `confirm` | Re-check policy, simulate, template validate, bind prepareId; verify + broadcast + reconcile |
| Solana | `lib/solana/*` | Connection, balances, TransferChecked build/**full template** validate |
| x402 / delivery | `lib/x402/*`, resource routes | Quote, seller verify, settle-before-deliver, retry fulfillment without re-charge |
| Ledger / budget | `lib/ledger/store` + `lib/ledger/db` | Durable SQLite (`.data/ledger.sqlite`) with `BEGIN IMMEDIATE`; in-process lock for async only |
| Audit | `lib/security/audit` | Append-only `.data/audit.jsonl` (server-controlled — not on-chain immutability) |
| Streams | `app/api/streams/webhook` | Optional reconcile / unmatched-transfer flags (not ticker theater) |
| Operator | `lib/security/operator` | Shared-secret gate (`OPERATOR_TOKEN`); never exposed to agent |

## Trust boundaries

```
[Untrusted]
  Browser UI · model/agent text · seller HTTP · Streams webhook JSON · fixture scripts
        │
        ▼
[Trusted desk server]
  catalog resolve · reviewSpend · intent bind · prepare re-check · template validate
  confirm / reconcile · delivery gate · Operator token for approve/reject
        │
        ▼
[Wallet boundary]
  Phantom signs only the prepared transaction bytes
  Desk never holds user keys
        │
        ▼
[Solana Devnet]
  SPL USDC TransferChecked / x402 exact settle
  Explorer = settlement truth for receipts
```

| Boundary | Rule |
|---|---|
| Model → policy | Agent text never sets caps, mint, allowlists, operator creds, or arbitrary RPC/merchant URLs |
| Browser → approvals | Operator HttpOnly session from `/api/operator/login` + CSRF from auth JSON (fail closed if `OPERATOR_TOKEN` unset) |
| Browser → settle | Prepare re-runs policy + destination binding; confirm validates **full** permitted template |
| Seller → desk | Exact amount, mint, payTo, signed transfer shape; delivery only after confirm |
| Webhook → ledger | Streams verifies provider auth when configured; dedupe; else do not claim bounty |
| Config → cluster | Devnet lock — refuse mainnet RPC/cluster configuration |

## Security foundation (architecture requirements)

1. **Server policy** — only path to materialize a payment.  
2. **Intent binding** — wallet, task, resource, merchant, network, mint, base-unit amount, quote expiry, policy version.  
3. **Integer base units** — no float money math.  
4. **Atomic budgets** — concurrent requests cannot exceed remaining; release once; uncertain stays reserved until reconciled.  
5. **Template validation** — entire tx vs allowlisted instruction set (not “find one TransferChecked”).  
6. **Idempotent retries** — reconcile before replace; timeout ≠ failure.  
7. **Settle before fulfill** — delivery retries do not re-charge.  
8. **No vault this build** — block-before-sign; sponsorship optional later.

## Devnet USDC

| Item | Value |
|---|---|
| Cluster | `devnet` (`NEXT_PUBLIC_SOLANA_CLUSTER`) |
| RPC | `SOLANA_RPC_URL` (prefer private QuickNode; fallback public Devnet) |
| Mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Decimals | 6 (base units: `1_000_000` = $1) |
| Wallet | Phantom · user switches network to Devnet |
| Faucets | SOL: faucet.solana.com · USDC: faucet.circle.com |

## Design choices (production-minded prototype)

1. **Block before sign** — vault deferred; honesty over custody theater.  
2. **One research workflow** — small catalog beats marketplace.  
3. **Fixture mode labeled** — reliable demos without faking live models.  
4. **Double policy check** — propose and prepare both call `reviewSpend`.  
5. **Audit honesty** — local append-only ≠ independently immutable on-chain trail.  
6. **SQLite ledger** — durable across process restart; prefer a single writer. Do not claim in-process `withLedgerLock` alone is cross-process protection.

## Related docs

- [JUDGE-REVIEW.md](./JUDGE-REVIEW.md) — simulated panel decisions  
- [WIN-PLAN.md](./WIN-PLAN.md) — demo path and non-goals  
- [FEATURE-BACKLOG.md](./FEATURE-BACKLOG.md) — P0 rewritten to judges  
- [TEAM-SPLIT.md](./TEAM-SPLIT.md) — 5-day execution  
- [THREAT-MODEL.md](./THREAT-MODEL.md) — guarantees and limitations  
- [STREAMS.md](./STREAMS.md) — optional QuickNode wiring  
- [ORGANIZER-RESOURCES.md](./ORGANIZER-RESOURCES.md) — sponsor links and status  
