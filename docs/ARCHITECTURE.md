# Architecture — Policy Desk

Policy-gated Solana Devnet USDC spending for AI agents. Settlement is **non-custodial**: Phantom holds keys; the desk decides whether a spend may be prepared and confirmed.

## End-to-end flow

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ Agent       │────▶│ Policy engine    │────▶│ Ledger + audit     │
│ propose     │     │ allow|block|     │     │ immutable intent   │
│ /api/agent  │     │ needs_approval   │     │                    │
└─────────────┘     └────────┬─────────┘     └─────────┬──────────┘
                             │                         │
                             ▼                         │
                    ┌────────────────┐                 │
                    │ Human approve  │  (if threshold) │
                    │ /api/approvals │                 │
                    └────────┬───────┘                 │
                             ▼                         │
                    ┌────────────────┐                 │
                    │ settle/prepare │◀────────────────┘
                    │ re-check +     │
                    │ simulate       │
                    └────────┬───────┘
                             ▼
                    ┌────────────────┐     ┌─────────────────────┐
                    │ Phantom sign   │────▶│ settle/confirm      │
                    │ (wallet)       │     │ TransferChecked /   │
                    └────────────────┘     │ x402 seller verify  │
                                           └──────────┬──────────┘
                                                      ▼
                                           ┌─────────────────────┐
                                           │ Receipt + explorer  │
                                           │ (+ optional Streams)│
                                           └─────────────────────┘
```

### State machine (payment)

`proposed → blocked | pending_approval | approved | ready_to_sign → confirming → settled`  
(plus `rejected` / failed paths). UI `PaymentProgress` mirrors these states for judges.

### x402 branch

```
GET/POST /api/x402/weather
  → 402 + PAYMENT-* challenge (quote)
  → policy + prepare + Phantom sign
  → seller verifies exact amount/mint/payTo/transfer shape
  → resume with resource body
```

CAIP-2 network: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (Devnet). Mint: Circle Devnet USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.

## Module map

| Layer | Path | Responsibility |
|---|---|---|
| Desk UI | `app/page.tsx`, `components/*` | Connect wallet, scenarios, approval widget, progress, receipts, resource strip |
| Propose | `app/api/agent/propose` | Scenario/custom spend → `reviewSpend` → ledger entry |
| Policy | `lib/policy/*` | Caps, allowlists, mint, pause, approval threshold, regime labels |
| Approvals | `app/api/approvals/[id]` | Operator-gated approve/reject |
| Settle | `app/api/settle/prepare`, `confirm` | Re-check policy, simulate, bind prepareId; verify + broadcast |
| Solana | `lib/solana/*` | Connection, balances, TransferChecked build/validate |
| x402 | `lib/x402/*`, `app/api/x402/weather` | Quote, seller self-facilitate, resume |
| Ledger | `lib/ledger/store` | Durable `.data/ledger.json` + status transitions |
| Audit | `lib/security/audit` | Append-only `.data/audit.jsonl` |
| Streams | `app/api/streams/webhook` | Optional QuickNode ingest → LIVE ticker |
| Operator | `lib/security/operator` | Shared-secret gate (`OPERATOR_TOKEN`) |

## Trust boundaries

```
[Untrusted]
  Browser UI · agent/scenario text · seller HTTP body · Streams webhook JSON
        │
        ▼
[Trusted desk server]
  reviewSpend · ledger intentHash · prepare re-check · confirm decode
  Operator token required for approve/reject
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
| Model → policy | Scenario/agent text never sets caps, mint, or allowlists |
| Browser → approvals | `x-operator-token` / Bearer must match `OPERATOR_TOKEN` (fail closed if unset) |
| Browser → settle | Prepare re-runs policy + destination binding; confirm validates TransferChecked |
| Seller → desk | x402 seller checks amount, mint, payTo, signed transfer shape |
| Webhook → ledger | Streams verifies shared secret when configured; otherwise acknowledge-only |
| Config → cluster | Devnet lock — refuse mainnet RPC/cluster configuration |

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

1. **Block before sign** — no Anchor escrow PDA in this build; honesty over theater.
2. **Immutable intent** — payee / amount / mint / resource bound at create (`intentHash`).
3. **Double policy check** — propose and prepare both call `reviewSpend`.
4. **Budget reservation** — pending / approved / ready_to_sign / confirming / settled count toward daily cap.
5. **Single-process ledger** — fine for hackathon demo; not multi-region HA (documented in threat model).

## Related docs

- [WIN-PLAN.md](./WIN-PLAN.md) — demo path and non-goals  
- [THREAT-MODEL.md](./THREAT-MODEL.md) — guarantees and limitations  
- [STREAMS.md](./STREAMS.md) — optional QuickNode bounty wiring  
- [ORGANIZER-RESOURCES.md](./ORGANIZER-RESOURCES.md) — sponsor links and status  
