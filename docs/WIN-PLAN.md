# Win plan — Policy Desk (UBC Hackathon 2026)

> **Disclaimer:** Simulated judges based on plan + gallery notes — **not** a verified code audit or organizer judging. See [JUDGE-REVIEW.md](./JUDGE-REVIEW.md).

**Submit:** Fri Nov 20, 12:00 PM CST · **Artifact:** this repo only (`policy-desk`) · **Repo:** private until Devpost flip  
**Eligibility:** Built during the official hacking window. Do **not** submit prep / `guarded-agent-treasury` as the Devpost project.

## Track targets (select on Devpost)

| Priority | Track / bounty | Why we fit |
|---|---|---|
| Primary | **Agentic Payments and AI** | Research agent buys data under policy + x402 quote→pay→resume |
| Chain | **Best use of Solana** | Devnet USDC, Phantom sign, TransferChecked settle, explorer receipts |
| Bounty | **QuickNode Streams** (only if core green + real integration) | Reconcile payments / unmatched transfers — not a decorative ticker |
| Auto | Official UBC Winner | Clean demo + eligibility + honest craft |

## Thesis (judge-aligned)

AI agents that can pay are useful until they are dangerous. **Policy Desk** gives a research agent a Solana Devnet USDC budget, enforces allowlists and caps, blocks unsafe purchases, pauses for human approval above threshold, and only delivers paid content after confirmed settlement — with a receipt that ties task → decision → payment → answer.

One-liner for judges: **Agents get a budget — not a blank check.**  
Differentiation: **Buy useful information, recover from a block, finish the task with proof.**

## Agreed product direction

One complete workflow (see 12 steps in [JUDGE-REVIEW.md](./JUDGE-REVIEW.md)):

> A research agent buys useful data within a user-defined budget, handles a blocked purchase safely, requests approval when necessary, and returns an answer supported by purchased information and payment receipts.

Narrow catalog · labeled merchant · fixture mode allowed if visible · no marketplace.

## 90-second judge story (aligned to workflow)

1. **Start task** — connect Phantom (Devnet); set USDC budget; trust strip shows cluster, mint `4zMMC9…`, wallet, posture.
2. **Block → recover** — agent requests prohibited resource → **blocked** with visible reason → picks approved alternative.
3. **Approve** — above-threshold purchase pauses on SeaPay-style approval card → operator Approve.
4. **Settle → answer** — simulate → Phantom sign → confirm settle → deliver content → agent uses it in final answer → structured receipt.
5. **Close** — “The model proposes. Policy decides. Humans co-sign the big ones. Receipts prove what was bought.” (Streams only if real.)

## Killer demo path (one path only)

```
start task + budget → preview catalog → propose resource
  → policy evaluate → BLOCK (recover) | needs_approval | allow
  → operator approve (if needed) → simulate → Phantom sign
  → confirm settlement → deliver paid content → answer + receipt
```

Everything else supports this path. Do not fork into a second product narrative.

## What NOT to build (eligibility + focus)

| Skip | Why |
|---|---|
| New on-chain custody vault / Anchor escrow | Judges deferred vault; honesty = **block before sign** |
| Sponsored/gasless fee payer (as P0) | Optional **after** core; faucet path is enough |
| Arc, Circle Agent Wallets (no Solana), CCTP bridges | Off-track / time sink |
| Gemini, ElevenLabs, Grok as core UX | Distracts from Solana + agentic payments |
| Full Agent Kit plugin surface / agent marketplace | Scope explosion |
| NFT attestation mints, prediction markets, NFC, FHE, fiat off-ramps | Deferred |
| Silent “live model” when running fixtures | Label fixture mode; never fake live execution |
| Submitting prep GAT repo | Eligibility risk — **policy-desk only** |

## Success criteria

| Gate | Done when |
|---|---|
| Workflow completeness | All 12 demo steps runnable (fixture OK if labeled) |
| Demo reliability | Cold-start → block + recover + approve + settle + answer + receipt ≤90s, twice |
| Policy honesty | Non-allowlisted spend never reaches Phantom; rejection reasons visible |
| Payment correctness | Quote bound to tx; settlement confirmed before content; retries idempotent |
| Chain truth | Settled rows have Solana explorer links on Devnet USDC mint |
| Security evidence | Adversarial suite + 4-step security demo with real outcomes |
| Streams | Claim only if authenticated provider events reconcile payments |
| Eligibility | Git history starts in hackathon window; Devpost → this repo |
| Submit package | README + docs, 2–3 min video, Devpost writeup, live tunnel or deploy URL |

## Engineering team (RACI)

Professionals by discipline — full-stack, cybersecurity, and blockchain — with explicit ownership (no invented employers, years, or certs).

| Person | Role | Owns |
|---|---|---|
| **Dipak Yadav** ([@dipak5501](https://github.com/dipak5501)) | Full-stack developer · product/engineering lead | Task timeline UX, API routes, demo script, Devpost, integration glue |
| **Utkarsh Lubal** ([@ubiiii](https://github.com/ubiiii)) | Cybersecurity engineer | Threat model, operator gate, adversarial tests, audit honesty, security demo |
| **Kashif Manzer** ([@KashifManzer](https://github.com/KashifManzer)) | Blockchain engineer | Solana RPC/USDC, intent binding, TransferChecked template validation, settle/confirm, x402, Streams |

Review gates: Kashif signs off settle/x402; Utkarsh signs off trust boundaries; Dipak owns merge + judge path.

## Delivery order (from judges)

1. Verified baseline  
2. Payment correctness and security  
3. Useful agent workflow  
4. Clear interface and evidence  
5. Optional Streams or sponsorship  

Day map: [TEAM-SPLIT.md](./TEAM-SPLIT.md). Backlog: [FEATURE-BACKLOG.md](./FEATURE-BACKLOG.md). Review detail: [JUDGE-REVIEW.md](./JUDGE-REVIEW.md).
