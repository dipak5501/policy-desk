# Three-judge review — Policy Desk

> **Disclaimer:** Simulated judges based on plan + gallery notes — **not** a verified code audit or organizer judging.

**Agreed headline:** Strengthen **one complete agent workflow** before adding more features.

## Review summary

| Judge | Main objection | Agreed decision |
|---|---|---|
| Product and originality | “This could look too similar to Aegis or Agent Guard.” | Show an agent purchasing useful information, recovering from a blocked request, and completing its task. |
| Blockchain engineering | “A successful transfer alone does not prove a reliable payment system.” | Bind quotes to transactions, confirm settlement, and prevent duplicate payments during retries. |
| Security | “Security claims need demonstrable evidence.” | Make adversarial tests and visible rejection reasons essential deliverables. |

Vault and sponsored fees were considered. **Decision: defer the vault; make sponsorship optional.** Useful agent workflow, transaction correctness, and security evidence come first.

## Differentiation vs Aegis / Agent Guard

Gallery notes tagged **Aegis** as “limited overlap,” but its stated purpose (agent vaults, hard limits, human overrides) makes it a **close conceptual competitor**. Use that comparison to sharpen differentiation — do not dismiss it.

| Competitor | What they emphasize | How Policy Desk must differ |
|---|---|---|
| **Aegis** (Solana) | Smart vaults, hard limits, one-click human overrides | We do **not** ship a new custody vault this weekend. We **block before sign**, enforce server policy + budgets, and complete a **research purchase workflow** with receipts tied to useful content. |
| **Agent Guard** (Base / Polymarket) | Policy engine, visible decisions, on-chain decision logs for trading | We are **Solana Devnet USDC + x402 agent commerce**, not a Polymarket sandbox. Borrow **visible rule pass/fail + reasons**; do not copy trading-market scope. |

**Differentiation one-liner:** A research agent buys useful data within a budget, handles a blocked purchase safely, requests approval when needed, and returns an answer backed by purchased information and payment receipts.

## Agreed product direction

One complete workflow (narrow research task + small approved resource catalog — not a marketplace):

> A research agent buys useful data within a user-defined budget, handles a blocked purchase safely, requests approval when necessary, and returns an answer supported by purchased information and payment receipts.

### 12 demonstration steps

1. User starts a task with a defined USDC budget.
2. A real model uses constrained tools to inspect available resources *(fixture mode allowed if labeled; never silent script-as-live)*.
3. User inspects free preview, description, price, and merchant.
4. Agent requests a resource through the policy API.
5. Server evaluates deterministic rules.
6. A prohibited request is **blocked**.
7. Agent chooses an approved alternative and continues.
8. An above-threshold purchase pauses for **operator approval**.
9. Wallet authorizes the prepared transaction (Phantom).
10. Settlement is **confirmed** before paid content is delivered.
11. Agent uses purchased content in its final answer.
12. A **receipt** connects task, decision, payment, resource, and answer.

Team-operated merchant endpoint is acceptable if clearly labeled. Use a **separate merchant wallet** for the primary demo. Keep a **deterministic fixture mode** for reliable demos, visibly labeled.

## Gallery features to adapt (priorities)

| Inspiration | Feature for Policy Desk | Priority |
|---|---|---|
| Quarry | Resource preview → exact quote → payment → useful result | **Essential** |
| SeaPay | Approval card that pauses and resumes the agent’s task | **Essential** |
| Agent Guard | Visible policy checks with concrete rejection reasons | **Essential** |
| Quarry / PolyHedge | Structured receipt connecting purchase to result | **Essential** |
| FRCT | Clear balances, reserved funds, and remaining budget | **Essential** |
| Gasless Hub | Sponsored transaction fees | **Optional** after core works |

## Security foundation (requirements)

- Policy enforcement stays on the **server**. Model must not control recipients, mint, limits, policy config, operator credentials, or arbitrary merchant/RPC URLs.
- Schema-validated **resource IDs** resolved through an approved server-side catalog.
- Bind payment intents to wallet, task, resource, merchant, network, mint, exact base-unit amount, quote expiry, and policy version.
- Integer **base units** for all financial math.
- **Atomic, durable budget reservation** (smallest storage appropriate). Concurrency model must be defined.
  - Two concurrent requests cannot exceed remaining budget.
  - Rejection / safe expiry releases reservations exactly once.
  - Uncertain settlement stays reserved until reconciled.
  - Approval applies only to its bound intent; changed/expired intents cannot reuse approval.
  - Operator credentials unavailable to the agent; auth scoped to wallet/session.
- Validate the **complete transaction** against a permitted instruction template. Finding one matching `TransferChecked` is insufficient.
  - Reject unexpected transfers, programs, delegate approvals, authority changes, account closures, fee payers, or excessive compute/fee instructions.
  - Define exactly which legitimate setup instructions are permitted.
- **Idempotent retries.** Reconcile an existing transaction before creating a replacement. Timeout ≠ failure.
- Mark settlement successful only after verifying expected tx succeeded on configured network at documented commitment.
- Separate payment confirmation from resource delivery; if paid but delivery fails, retry fulfillment **without** charging again.
- Pause/policy changes effective at last execution boundary the app controls; document that the server cannot revoke an already signed tx broadcast elsewhere.

## Signing and audit honesty

Distinguish clearly:

1. Policy authorization  
2. Operator approval  
3. Wallet signature  
4. On-chain confirmation  
5. Resource delivery  

If Phantom signs every payment, under-threshold means **no additional operator approval** — not autonomous settlement.

Do not add EVM-style ERC-20 allowance approval to ordinary SPL transfers.

Describe server-controlled audit storage accurately: local append-only files + hashes alone are **not** an independently immutable on-chain audit trail.

## Streams (conditional) · Vault · Sponsorship

| Item | Decision |
|---|---|
| **QuickNode Streams** | After core works: reconcile known payments + flag unmatched outgoing transfers. Auth, dedupe, delay tracking, outcome verify. Must improve monitoring — not merely animate a ticker. Manual webhook ≠ proof of integration. Incomplete → remove bounty claim. |
| **On-chain vault** | **Deferred** |
| **Sponsored fees** | **Optional** after core; fee limits + abuse controls; disclose ATA creation cost coverage; never claim sponsorship removes wallet authorization |

## Tests + security demo evidence

**Required tests:** unauthorized merchant/resource; wrong mint/amount/recipient/authority/network; extra malicious instructions; missing/expired/mismatched approval; quote and tx replay; concurrent budget exhaustion; duplicate prepare/confirm; wallet rejection / expired blockhash; timeout then successful reconcile; paid delivery retry without duplicate charge; restart persistence + wallet/session isolation.

**Reproducible security demo (show real outcomes):**

1. Unauthorized merchant request  
2. Tampered payment  
3. Concurrent requests competing for insufficient remaining budget  
4. Legitimate purchase that completes successfully  

Label fixtures and injected malicious content.

## Defer list

Do **not** add: cross-chain bridges, prediction markets, escrow, new custody vault, marketplace rankings, NFT receipts, NFC, FHE, fiat off-ramps, decorative charts, fake activity, unsupported counters, or security badges.

## Delivery order

1. Verified baseline  
2. Payment correctness and security  
3. Useful agent workflow  
4. Clear interface and evidence  
5. Optional Streams or sponsorship  

## Doc status note

This review drives planning. Application code changes are **out of scope for this PDF revision** (“only modify in pdf for now”). Implement against this plan in a later pass.
