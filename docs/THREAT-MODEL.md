# Threat model — Policy Desk

**Owner:** Utkarsh Lubal (@ubiiii), cybersecurity engineer  
**Scope:** UBC Hackathon 2026 Devnet demo — not a production custody product.  
**Companion:** short summary historically in `THREAT_MODEL.md` (same content family).

---

## Assets we protect (demo-relevant)

| Asset | Why it matters |
|---|---|
| User Phantom keys | Never leave the wallet; phishing UX is out of scope but we never ask for seed |
| USDC balances on Devnet | Demo funds; still treat transfers as irreversible |
| Policy decisions | Integrity of allow/block/approve story for judges |
| Ledger / audit trail | Demo credibility; not legally tamper-proof |
| Operator approve capability | Can authorize spends above threshold |

---

## Trust model

| Component | Trust level |
|---|---|
| Phantom | Trusted for signing; untrusted for “policy” (policy is server-side) |
| Browser UI | Untrusted — can call APIs with arbitrary JSON |
| Next.js API + `.data` | Trusted compute for this demo (single operator machine) |
| Solana Devnet validators | Trusted for settlement truth |
| Public RPC | Partially trusted — availability/integrity risks |
| QuickNode Streams webhook caller | Untrusted unless shared secret matches |
| Operator token holder | Fully trusted for approvals (shared secret) |

---

## Guarantees we **do** enforce

1. **Policy before signature** — `reviewSpend` runs on propose; prepare **re-runs** policy + destination checks before returning an unsigned tx.
2. **Allowlist / mint / caps / pause** — non-allowlisted payee/resource, wrong mint, per-tx/daily caps, and pause can block.
3. **Human threshold** — spends above `approvalThresholdBaseUnits` require Approve via operator token.
4. **Immutable payment intent** — `label`, `resource`, `payee`, `amountBaseUnits`, `mint`, `scenario` cannot change after ledger create (tested).
5. **Devnet-only** — cluster hard-fails if not `devnet`.
6. **Block before sign** — blocked entries do not get a prepared transaction for broadcast.
7. **Streams auth (when configured)** — webhook rejects wrong `QUICKNODE_STREAM_WEBHOOK_SECRET`.

---

## Explicit non-guarantees (do not claim)

| Claim to avoid | Reality |
|---|---|
| “Audited smart contract vault” | No on-chain escrow PDA in MVP |
| “MPC / HSM agent keys” | Agent is scripted scenarios + optional future LLM; no custody |
| “Production auth” | Operator token is a shared secret, not SSO / wallet-bound operator identity |
| “Tamper-proof audit” | Local `.data/audit.jsonl` — operator machine can edit files |
| “Production x402 facilitator” | Local demo seller verifies shape/amount; not a public facilitator network |
| “Censorship-resistant desk” | Single Next process; RPC can fail |

---

## Abuse cases & mitigations

| Abuse | Mitigation | Residual risk |
|---|---|---|
| UI sends mutated payee after approve | Immutable intent + prepare destination re-check | Compromised server can still lie |
| Spend without operator approval | Threshold → awaiting_approval; settle prepare should reject unapproved | Bug in status gate = critical — test daily |
| Operator token leaked on public tunnel | Rotate token before public demo; prefer short-lived tunnel | Anyone with token can Approve |
| Wrong mint drained | Policy `allowedMint` + TransferChecked mint | Must keep mint constant in env |
| Daily cap bypass via many pending | Daily spent includes pending/approved reservation | Race under multi-instance (we are single-process) |
| Streams spam | Shared secret | Empty secret = open webhook (dev only) |
| Phishing / fake desk | Out of scope | Users must open known URL |

---

## Fail-safe paths (demo)

| Failure | Expected UX |
|---|---|
| Policy block | Status blocked; message; **no** Phantom prompt |
| Low SOL | Warning + faucet.solana.com link; settle refused |
| Low USDC | Warning + faucet.circle.com; settle refused |
| Simulate fails | `simulateOk: false`; do not encourage blind sign |
| RPC 429 / down | Error copy; dry-run still shows policy path |
| User rejects Phantom | Entry stays ready_to_sign / failed with message |

---

## Testing owned by security

- `lib/security/adversarial.test.ts` — intent mutation, destination checks, daily reservation  
- `lib/policy/review.test.ts` — allow / block / threshold  
- Manual: approve without token → 401; blocked scenario → no prepare tx  

**Definition of done for Day 2:** new adversarial cases for missing operator token + unapproved settle attempt.

---

## Pitch language (approved)

> “We don’t fake an escrow vault. Policy and a human gate run **before** any signature is built. On Devnet, Phantom settles USDC only after that — and the explorer receipt is the proof.”

Avoid: “bank-grade,” “unhackable,” “on-chain policy oracle,” “audited.”
