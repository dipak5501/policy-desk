# Threat model — Policy Desk

**Owner:** Utkarsh Lubal ([@ubiiii](https://github.com/ubiiii)), cybersecurity engineer  
**Reviewers:** Dipak Yadav (product/engineering), Kashif Manzer (blockchain)  
**Scope:** Solana **Devnet** hackathon prototype (UBC 2026). Not a production custody product.  
**Audit status:** No third-party security audit has been performed on this repository.

## Assets

| Asset | Why it matters |
|---|---|
| USDC in the connected Phantom wallet | Devnet funds the human controls; desk must not trick-sign drains |
| Daily / per-tx spend budget | Prevents agent overspend within the desk session |
| Allowlisted payees & resources | Stops arbitrary merchant drains |
| Ledger + audit trail | Demo integrity and post-hoc review |
| Operator token | Gates human approve / reject |
| Streams webhook secret | Prevents forged LIVE feed events when bounty path is enabled |

## Trust boundaries

```
[Untrusted] Browser UI, agent/scenario text, seller HTTP, webhook JSON
      │
      ▼
[Server policy + ledger]  reviewSpend → immutable intent → prepare/confirm
      │
      ▼
[Wallet] Phantom signs only what prepare built
      │
      ▼
[Solana Devnet] SPL USDC / x402 seller self-facilitate
```

| Boundary | Rule |
|---|---|
| Model → policy | Scenario/agent text never sets caps, mint, or allowlists |
| Browser → approvals | `x-operator-token` / Bearer must match `OPERATOR_TOKEN` (fail closed if unset) |
| Browser → settle | Prepare re-checks policy + destination; confirm validates TransferChecked |
| Seller → desk | x402 seller verifies amount, mint, payTo, and signed transfer shape |
| Webhook → ledger | Streams verifies shared secret **when configured**; otherwise acknowledge-only |
| Config → network | Cluster/RPC guards refuse mainnet configuration |

## Enforced guarantees (this build)

1. **Policy before materialization** — `reviewSpend` on propose and again on prepare; blocked spends never get a transaction.
2. **Immutable payment intent** — `payee`, `amount`, `mint`, and `resource` cannot be patched after create (`intentHash`).
3. **Destination binding at settle** — payee must be allowlisted **or** equal the spending wallet on an allowlisted resource (pay-self demo).
4. **Signed tx matches intent** — confirm decodes TransferChecked (mint, amount, ATAs, authority) before treating settle as valid; signature-only confirm is rejected.
5. **Human gate above threshold** — `needs_approval` requires operator Approve before prepare/sign.
6. **Budget reservation** — pending / approved / ready_to_sign / confirming / settled count toward the daily cap.
7. **Replay resistance (desk-level)** — settled entries cannot be settled again; prepare binds `prepareId` + expiry.
8. **Devnet lock** — refuse mainnet cluster/RPC configuration.
9. **Audit log** — status transitions append to durable audit trail (best-effort `.data/audit.jsonl`).

## Honest limitations

| Limitation | Why |
|---|---|
| Operator token is a shared secret | Demo auth — not SSO, WebAuthn, or wallet-signed approvals |
| In-process / file ledger | Not multi-region HA; wiping `.data` loses history; not a bank ledger |
| No on-chain policy program | Caps live in the Next.js process, not an Anchor vault |
| Safety model is block-before-sign | No escrow PDA locks funds; honesty over custody theater |
| x402 seller is a local demo facilitator | Not a hosted facilitator / compliance network |
| Streams webhook | Secret must be set for untrusted internet exposure; optional bounty path |
| Phantom UX | User can still sign unrelated txs outside this desk |
| Public tunnel / deploy URL | Anyone with the URL + operator token can hit approval APIs — rotate token for public demos |
| RPC / faucet availability | External dependency; dry-run still shows policy path if chain is down |

## Adversarial coverage

Primary suites: `lib/security/adversarial.test.ts`, policy review tests, TransferChecked validation tests.

Expected red-team cases (owners: Utkarsh design · Kashif chain fixes · Dipak UI honesty):

- Signature-only confirm rejection  
- Wrong-mint / over-cap / non-allowlisted propose blocks  
- Destination allowlist enforcement  
- TransferChecked amount/payee mismatch detection  
- Approval without valid operator token rejected  

## What we will not claim in pitch

- Production-grade custody, MPC, or hardware-enforced agent keys  
- Formal verification or external audit  
- Mainnet readiness  
- That policy lives on-chain in this MVP  

## Related

- [ARCHITECTURE.md](./ARCHITECTURE.md) — flow and boundaries  
- [FEATURE-BACKLOG.md](./FEATURE-BACKLOG.md) — P1 adversarial expansion  
- [STREAMS.md](./STREAMS.md) — webhook secret configuration  
