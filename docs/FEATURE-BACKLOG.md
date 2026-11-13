# Feature backlog — judge-aligned P0 → Policy Desk

Priorities rewritten to match the **three-judge agreed decision** ([JUDGE-REVIEW.md](./JUDGE-REVIEW.md)): one complete research-agent workflow, payment correctness, and security evidence first.

Gallery inspiration from MBC 2025 notes (`guarded-agent-treasury/docs/MBC-2025-GALLERY-NOTES.md`). Treat notes as inspiration — do not repeat unverified award claims or copy another project’s code/branding.

**P0** = demo-critical · **P1** = after P0 green · **P2** = optional / deferred.

Owners: **Dipak** (full-stack / product) · **Utkarsh** (cybersecurity) · **Kashif** (blockchain).

---

## P0 — research workflow + payment correctness + security evidence

| ID | Feature | Gallery / judge source | Acceptance criteria | Owner | Status |
|---|---|---|---|---|---|
| P0-1 | Task + budget start (“Run a task”) | Judge workflow §1 | User starts research task with defined USDC budget; timeline is central | Dipak | **Plan** — align UI to task-first |
| P0-2 | Resource catalog preview | Quarry | Free preview, description, price, merchant visible before purchase | Dipak · Kashif catalog | **Plan** |
| P0-3 | Policy evaluate via server API | Agent Guard | Resource request → deterministic rules; model cannot set recipients/mint/limits | Utkarsh · Dipak | **In app (partial)** — extend to resource IDs |
| P0-4 | Block + recover path | Product judge | Prohibited request blocked with concrete reason; agent chooses approved alternative | Dipak · Utkarsh | **In app (block)** — recover narrative **Plan** |
| P0-5 | Approval card in task timeline | SeaPay | Above-threshold pauses; shows merchant, resource, amount, reason, budget impact, expiry; progress survives refresh | Dipak · gate Utkarsh | **In app** — harden into timeline |
| P0-6 | Intent binding + quote expiry | Blockchain judge | Intent bound to wallet, task, resource, merchant, network, mint, base-unit amount, quote expiry, policy version | Kashif · Utkarsh | **Partial** — harden |
| P0-7 | TransferChecked **template** validation | Security / chain | Full tx matches permitted instruction template; reject extras (delegates, authority changes, unexpected programs, etc.) | Kashif · Utkarsh | **Partial** — “one TransferChecked” insufficient |
| P0-8 | Atomic budget reservation | FRCT + security | Available / reserved / confirmed / remaining visible; concurrent requests cannot overspend; release once on reject/expiry | Kashif · Dipak | **Partial** |
| P0-9 | Idempotent prepare/confirm + reconcile | Blockchain judge | Retry reconciles existing tx before replacement; timeout ≠ failure; settle only after network confirm at documented commitment | Kashif | **Plan / harden** |
| P0-10 | Settlement before content delivery | Quarry | Paid content only after confirmed settle; delivery retry without re-charge | Kashif · Dipak | **Plan** |
| P0-11 | Answer uses purchased content | Product judge | Final answer cites/uses delivered resource; fixture mode labeled if used | Dipak | **Plan** |
| P0-12 | Structured receipt | Quarry / PolyHedge | Receipt links task, intent, quote, policy version, decision, approval ref, sig, network, mint, amount, merchant, confirm status, content digest; export without NFT | Dipak · Kashif | **Partial** — expand fields |
| P0-13 | Visible policy pass/fail reasons | Agent Guard | Desk shows which rules passed/failed; distinguish model justification from policy evaluation | Dipak · Utkarsh | **In app** — strengthen copy |
| P0-14 | Adversarial tests + security demo | Security judge | Suite covers unauthorized, tamper, concurrent budget, happy path; 4-step demo with real outcomes | Utkarsh · Kashif | **Partial** — expand to checklist |
| P0-15 | Dry-run / simulate before broadcast | Agent Guard, PolyHedge | Insufficient SOL/USDC surfaces before sign; dry-run does not spend | Kashif · Dipak | **In app** |
| P0-16 | Trust strip + organizer resources | Density/trust | Devnet, mint `4zMMC9…`, wallet, posture + ResourceStrip links | Dipak | **In app** |
| P0-17 | 90s demo reliability | Win plan | Full block→recover→approve→settle→answer→receipt twice cold | All | **Active** |

---

## P1 — high leverage after P0

| ID | Feature | Source | Acceptance criteria | Owner |
|---|---|---|---|---|
| P1-1 | Fee / balance clarity | Gasless Hub lesson / FRCT | SOL + USDC; clear insufficient errors | Dipak · Kashif |
| P1-2 | Posture presets map to enforced rules | FRCT | Defensive/Neutral/Aggressive (or equiv) = real policy, not labels only | Dipak · Utkarsh |
| P1-3 | Private Devnet RPC | Reliability | QuickNode (or equiv) in `.env.local` | Kashif |
| P1-4 | Public tunnel / deploy URL | Judging | Stable URL for video + Devpost | Dipak |
| P1-5 | Pitch video 2–3 min | Submit | Problem → workflow → live clip → threat honesty → close | Dipak · all |

---

## P2 — optional / deferred (judges)

| ID | Feature | Source | Decision |
|---|---|---|---|
| P2-1 | Sponsored / gasless fees | Gasless Hub | **Optional after core** — fee limits, abuse controls, ATA cost disclosure |
| P2-2 | QuickNode Streams reconcile | Streams bounty | **Conditional** — real provider events only; else drop claim |
| P2-3 | On-chain custody vault / escrow | Aegis-like | **Deferred** |
| P2-4 | NFT / attestation receipt mint | PolyHedge, Quarry | Deferred — structured export is enough |
| P2-5 | Chat-first marketplace / rankings | SeaPay, agent rank | Out of scope |
| P2-6 | CCTP / bridges / prediction / NFC / FHE / fiat | Various | Deferred |

---

## Definition of “judge P0 done”

Without coaching beyond the 90s script, judges can see:

1. **Task + budget** started.  
2. **Preview** of a purchasable resource.  
3. A **block** with concrete reason and **recovery** to an approved resource.  
4. An **approval** interrupt, then Approve.  
5. **Simulate → sign → confirm settle → deliver content → answer**.  
6. A **receipt** tying task / payment / resource / answer.  
7. A **security demo** (unauthorized, tamper, concurrent budget, success) with real outcomes.

Anything that does not serve that sequence is not P0.
