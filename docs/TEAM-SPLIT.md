# Team split — Day 1–5 (judge-aligned workflow)

Three working engineers shipping the **one complete research-agent workflow** agreed by simulated judges ([JUDGE-REVIEW.md](./JUDGE-REVIEW.md)). Clear RACI, parallel streams, daily DoD.

> Delivery order: baseline → payment correctness → agent workflow → UI/evidence → optional Streams.

## Roster

| Engineer | GitHub | Discipline | Accountable for |
|---|---|---|---|
| **Dipak Yadav** | [@dipak5501](https://github.com/dipak5501) | Full-stack developer · product/engineering lead | Task timeline UX, catalog/preview UI, approval card, receipt/answer surface, demo script, Devpost, merge cadence |
| **Utkarsh Lubal** | [@ubiiii](https://github.com/ubiiii) | Cybersecurity engineer | Threat model, operator auth, adversarial suite, security demo evidence, audit honesty, policy claim accuracy |
| **Kashif Manzer** | [@KashifManzer](https://github.com/KashifManzer) | Blockchain engineer | Intent binding, TransferChecked template validation, atomic budgets, idempotent settle/confirm, x402 delivery gate, Streams (if claimed) |

**RACI:** Dipak = **A** on product demo · Kashif = **A** on chain settle · Utkarsh = **A** on security claims · each is **C** on the others’ P0 merges.

| Day | Date (2026) | Theme |
|---|---|---|
| 1 | Sat Nov 15 | Verified baseline + gap list vs 12 steps |
| 2 | Sun Nov 16 | Payment correctness + security foundation |
| 3 | Mon Nov 17 | Useful agent workflow (block→recover→approve→answer) |
| 4 | Tue Nov 18 | UI/evidence polish; Streams only if core green |
| 5 | Wed Nov 19 → Thu Nov 20 AM | Pitch, video, Devpost; submit by noon CST Fri |

*(If the team works Fri Nov 14, treat it as Day 1 early start; do not slip Day 5.)*

---

## Day 1 — Verified baseline

**Parallel**

| Stream | Owner | Work |
|---|---|---|
| Full-stack | Dipak | Map current UI to 12 demo steps; cold-run existing block/approve/settle; list gaps; keep trust strip accurate |
| Blockchain | Kashif | Verify Devnet mint, balances, prepare simulate, confirm TransferChecked happy path; note template-validation gaps |
| Security | Utkarsh | Baseline adversarial run; expand [THREAT-MODEL.md](./THREAT-MODEL.md) honesty notes; operator fail-closed check |

**DoD**

- [ ] Written baseline: verified / partial / mocked / documented-missing (no invented results).  
- [ ] Gap list mapped to P0 IDs in [FEATURE-BACKLOG.md](./FEATURE-BACKLOG.md).  
- [ ] `npm test` + `npm run build` green on current main.

---

## Day 2 — Payment correctness + security

**Parallel**

| Stream | Owner | Work |
|---|---|---|
| Blockchain | Kashif | Intent binding fields; full instruction-template validation; atomic reservation concurrency; idempotent retry/reconcile; settle-before-delivery gate |
| Security | Utkarsh | Tests: wrong mint/amount/recipient/network; extra instructions; approval mismatch; replay; concurrent budget; duplicate prepare/confirm |
| Full-stack | Dipak | Surface reservation/budget states; never optimistic “paid” before confirm; error states for reject/timeout/unknown |

**DoD**

- [ ] Concurrent requests cannot exceed remaining budget.  
- [ ] Malicious extra-instruction txs rejected.  
- [ ] Timeout path reconciles before re-prepare.  
- [ ] Security demo steps 1–3 (unauthorized, tamper, concurrent) show real outcomes.

---

## Day 3 — Useful agent workflow

**Parallel**

| Stream | Owner | Work |
|---|---|---|
| Full-stack | Dipak | Task-first timeline; catalog preview; block→recover UX; approval card in timeline; answer + receipt after delivery |
| Blockchain | Kashif | Small approved resource catalog + merchant wallet; quote expiry; x402/resource delivery after confirm |
| Security | Utkarsh | Visible rejection reasons; fixture vs live labeling; operator credentials never exposed to agent path |

**DoD**

- [ ] Steps 1–12 runnable (fixture mode OK if labeled).  
- [ ] Blocked request never materializes a signable tx.  
- [ ] Above-threshold requires operator Approve before Phantom.  
- [ ] Final answer uses purchased content; receipt fields filled.

---

## Day 4 — Interface, evidence, optional Streams

**Parallel**

| Stream | Owner | Work |
|---|---|---|
| Full-stack | Dipak | Expandable inspection views; loading/empty/approval/signing/rejected/failed/confirming/unknown/paid-pending/completed; backup recording |
| Blockchain | Kashif | Streams **only if** core green: auth, dedupe, reconcile known payments — else formally drop bounty claim |
| Security | Utkarsh | Finalize 4-step security demo; audit-honesty language; webhook secret review if Streams claimed |

**DoD**

- [ ] Security demo step 4 (legitimate success) + full adversarial suite green.  
- [ ] Streams live end-to-end **or** bounty deselected everywhere.  
- [ ] Full 90s path recorded as backup.

---

## Day 5 — Ship package (Wed Nov 19 → Fri Nov 20 noon CST)

**Parallel**

| Stream | Owner | Work |
|---|---|---|
| Lead | Dipak | Devpost writeup, video edit, repo public flip, final README, live URL |
| Blockchain | Kashif | Pre-flight faucet balances; RPC health; settle smoke 30 min before submit |
| Security | Utkarsh | Final threat-model quote for Devpost; rotate demo operator token if URL is public |

**Submit checklist**

- [ ] Devpost artifact = **policy-desk only** (not prep GAT).  
- [ ] Tracks: Agentic Payments and AI + Best use of Solana (+ Streams only if live).  
- [ ] Video ≤3 min: task → block/recover → approve → settle → answer → receipt.  
- [ ] Repo public (or per organizer rule) at submit time.  
- [ ] Hard stop: **Fri Nov 20, 12:00 PM CST**.

---

## What each person does **next** (immediate)

| Engineer | Next actions |
|---|---|
| **Dipak** | Own task-timeline UX plan from 12 steps; keep docs ↔ product aligned; schedule Devpost draft |
| **Utkarsh** | Own adversarial expansion + security demo script; audit honesty in pitch language |
| **Kashif** | Own payment correctness (template validation, budgets, idempotent settle); Streams decision after core |

## Communication

- Merge through Dipak unless hotfix on chain/security.  
- No scope adds without cutting something from [FEATURE-BACKLOG.md](./FEATURE-BACKLOG.md) P0.  
- Overclaim ban: if it is not enforced in code + tests, it is not in the pitch.  
- This doc revision is planning-only until the implementation pass.
