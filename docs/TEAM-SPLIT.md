# Team split — Day 1–5 (→ Fri Nov 20, 12:00 PM CST)

Serious engineering squad shipping a production-minded hackathon prototype. Clear RACI, parallel streams, daily DoD.

## Roster

| Engineer | GitHub | Discipline | Accountable for |
|---|---|---|---|
| **Dipak Yadav** | [@dipak5501](https://github.com/dipak5501) | Full-stack developer · product/engineering lead | Desk UX, API glue, demo script, Devpost, merge cadence, judge path |
| **Utkarsh Lubal** | [@ubiiii](https://github.com/ubiiii) | Cybersecurity engineer | Threat model, operator auth, adversarial tests, audit integrity, public-demo hardening |
| **Kashif Manzer** | [@KashifManzer](https://github.com/KashifManzer) | Blockchain engineer | Solana Devnet USDC, Phantom settle, x402 exact verify, RPC/Streams, explorer receipts |

**RACI shorthand:** Dipak = **A** on product demo · Kashif = **A** on chain settle · Utkarsh = **A** on security claims · each is **C** on the others’ P0 merges.

Calendar context: hacking window open; **hard stop Fri Nov 20 12:00 PM CST**. Days below are build days with a submit morning buffer.

| Day | Date (2026) | Theme |
|---|---|---|
| 1 | Sat Nov 15 | Lock killer path + P0 gaps |
| 2 | Sun Nov 16 | Chain + x402 harden |
| 3 | Mon Nov 17 | Security pass + adversarial |
| 4 | Tue Nov 18 | Streams (if claiming) + polish |
| 5 | Wed Nov 19 → Thu Nov 20 AM | Pitch, video, Devpost, submit by noon CST Fri |

*(If the team works Fri Nov 14, treat it as Day 1 early start; do not slip Day 5.)*

---

## Day 1 — Lock the killer path

**Parallel**

| Stream | Owner | Work |
|---|---|---|
| Full-stack | Dipak | Cold-run 90s script; fix UI blockers on approve/progress/receipt; ResourceStrip + trust strip accurate |
| Blockchain | Kashif | Verify Devnet mint, balances API, prepare simulate, confirm TransferChecked on happy path |
| Security | Utkarsh | Draft/expand [THREAT-MODEL.md](./THREAT-MODEL.md); confirm operator fail-closed; list attack cases for Day 3 |

**Handoffs**

- Kashif → Dipak: prepare/confirm error shapes for UI.  
- Utkarsh → both: “never claim X” list for README/pitch.

**DoD**

- [ ] Blocked merchant demo: no Phantom prompt.  
- [ ] Approval demo reaches Approve widget.  
- [ ] One successful settle + explorer link on Devnet.  
- [ ] `npm test` + `npm run build` green.

---

## Day 2 — Solana + x402 reliability

**Parallel**

| Stream | Owner | Work |
|---|---|---|
| Blockchain | Kashif | x402 weather under + above threshold; seller exact verify; fee/USDC insufficient paths |
| Full-stack | Dipak | Wire failure copy; guided “Run 90s demo” stable; tunnel script documented |
| Security | Utkarsh | Review settle/confirm for signature-only / intent mutation gaps; ticket any P0 holes |

**Handoffs**

- Kashif → Dipak: x402 resume payload contract for UI.  
- Utkarsh → Kashif: must-fix confirm cases before Day 3 suite.

**DoD**

- [ ] x402 quote → pay → resume twice cold.  
- [ ] Above-threshold x402 requires approval.  
- [ ] Insufficient SOL/USDC fails before sign with clear UI.  
- [ ] No mainnet config possible (devnet lock holds).

---

## Day 3 — Security engineering day

**Parallel**

| Stream | Owner | Work |
|---|---|---|
| Security | Utkarsh | Expand `lib/security/adversarial.test.ts`; finalize THREAT-MODEL guarantees vs limitations; webhook secret guidance |
| Blockchain | Kashif | Implement Utkarsh’s confirm/prepare fixes; private RPC in `.env.local` |
| Full-stack | Dipak | Surface audit/decision text for judges; remove any overclaim copy |

**Handoffs**

- Utkarsh → Kashif: failing tests first (red), then green together.  
- Dipak → Utkarsh: public tunnel threat notes for threat model “limitations”.

**DoD**

- [ ] Adversarial suite covers: non-allowlist block, wrong mint, over cap, signature-only reject.  
- [ ] THREAT-MODEL.md reviewed by all three.  
- [ ] Operator token rotation note for public demo.

---

## Day 4 — Streams (optional bounty) + polish

**Parallel**

| Stream | Owner | Work |
|---|---|---|
| Blockchain | Kashif | Configure QuickNode Stream → `/api/streams/webhook`; prove LIVE `stream` tick **or** formally drop bounty claim |
| Full-stack | Dipak | Visual polish only on the killer path; backup screen recording |
| Security | Utkarsh | Webhook auth review; rate/abuse notes; final “honest guarantees” pass on pitch kit language |

**Handoffs**

- Kashif → Dipak: one Streams screenshot/GIF for Devpost.  
- If Streams slips: Dipak removes bounty claim from pitch; no half-claims.

**DoD**

- [ ] Either Streams live end-to-end **or** bounty deselected everywhere.  
- [ ] Full 90s path recorded as backup.  
- [ ] Docs links from README all resolve.

---

## Day 5 — Ship package (Wed Nov 19 → Fri Nov 20 noon CST)

**Parallel**

| Stream | Owner | Work |
|---|---|---|
| Lead | Dipak | Devpost writeup, video edit, repo public flip before submit, final README, live URL |
| Blockchain | Kashif | Pre-flight faucet balances; RPC health; settle smoke 30 min before judging/submit |
| Security | Utkarsh | Final threat-model quote for Devpost; rotate demo operator token if URL is public |

**Submit checklist**

- [ ] Devpost artifact = **policy-desk only** (not prep GAT).  
- [ ] Tracks: Agentic Payments and AI + Best use of Solana (+ Streams only if live).  
- [ ] Video ≤3 min covering block → approve → settle → receipt.  
- [ ] Repo public (or per organizer rule) at submit time.  
- [ ] Hard stop: **Fri Nov 20, 12:00 PM CST**.

**DoD**

- [ ] Submission uploaded and confirmed.  
- [ ] Team handles listed accurately (Dipak / Utkarsh / Kashif + GitHubs).  
- [ ] One spare laptop/browser with Phantom Devnet funded.

---

## What each person does **next** (immediate)

| Engineer | Next actions |
|---|---|
| **Dipak** | Own Day 1 cold 90s runs; close UI gaps on approval → receipt; keep docs ↔ product aligned; schedule Devpost draft |
| **Utkarsh** | Own [THREAT-MODEL.md](./THREAT-MODEL.md); enumerate adversarial cases; verify operator fail-closed on approvals API |
| **Kashif** | Own Devnet settle + x402 exact path; set private RPC; Streams config decision by end of Day 4 |

## Communication

- Merge through Dipak unless hotfix on chain/security.  
- No scope adds without cutting something from [FEATURE-BACKLOG.md](./FEATURE-BACKLOG.md) P0.  
- Overclaim ban: if it is not enforced in code + tests, it is not in the pitch.
