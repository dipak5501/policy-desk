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
| Browser → approvals | Operator HttpOnly session from `/api/operator/login` + CSRF from auth/session JSON (fail closed if `OPERATOR_TOKEN` unset). No `NEXT_PUBLIC_` operator secrets; CSRF is not read via `document.cookie`. |
| Browser → settle | Prepare re-checks policy + destination; confirm binds `prepareId` + `preparedTxBase64` message, reconciles stored signature first, validates TransferChecked + `confirmTransaction.err` |
| Browser → propose | `/api/agent/propose` requires wallet session + CSRF; catalog `resourceId` only — client payee/amount/mint overrides rejected; task ownership enforced |
| Wallet login | Signature verified against server-stored challenge message; nonce consumed only after success |
| Seller → desk | x402 seller verifies amount, mint, payTo, and signed transfer shape |
| Webhook → ledger | Streams verifies shared secret **when configured**; otherwise acknowledge-only |
| Config → network | Cluster/RPC guards refuse mainnet configuration |

## Enforced guarantees (this build)

1. **Policy before materialization** — `reviewSpend` on propose and again on prepare; blocked spends never get a transaction.
2. **Immutable payment intent** — `payee`, `amount`, `mint`, and `resource` cannot be patched after create (`intentHash`).
3. **Destination binding at settle** — payee must be allowlisted **or** equal the spending wallet on an allowlisted resource (pay-self demo).
4. **Signed tx matches intent** — confirm decodes TransferChecked (mint, amount, ATAs, authority) before treating settle as valid; signature-only confirm is rejected.
5. **Human gate above threshold** — `needs_approval` requires operator Approve before prepare/sign.
6. **Budget reservation** — reserved statuses hold daily/task budget; reject/block/cancel releases once; confirmed spend is separate; in-process mutex serializes reserves.
7. **Replay resistance (desk-level)** — settled entries cannot be settled again; prepare binds `prepareId` + expiry; confirming+signature must reconcile before re-prepare.
8. **Settle-before-deliver** — x402 weather content is gated on ledger `settled`; re-delivery does not re-charge.
9. **Devnet lock** — refuse mainnet cluster/RPC configuration.
10. **Audit log** — status transitions append to durable server-controlled audit trail (best-effort `.data/audit.jsonl`). This is **not** an independently immutable on-chain audit trail.
11. **Catalog binding** — agents request `resourceId` resolved server-side; arbitrary merchant URLs are not trusted as allowlist keys from the model.

## Honest limitations

| Limitation | Why |
|---|---|
| Operator token is a shared secret | Demo auth — not SSO, WebAuthn, or wallet-signed approvals |
| In-process / file ledger | Not multi-region HA; wiping `.data` loses history; not a bank ledger |
| No on-chain policy program | Caps live in the Next.js process, not an Anchor vault |
| Safety model is block-before-sign | No escrow PDA locks funds; honesty over custody theater |
| x402 seller is a local demo facilitator | Not a hosted facilitator / compliance network |
| Streams webhook | Ticker only — not payment reconcile; do not claim Streams bounty yet |
| Fixture agent | Deterministic tools labeled in UI — not a live model |
| Live agent | Bounded tool loop with server credentials; unverified without `OPENAI_API_KEY`; no arbitrary URL fetch / operator secrets |
| File-store concurrency | Mutex is single-process only; not multi-instance safe |
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
