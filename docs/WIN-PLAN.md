# Win plan — Policy Desk (UBC Hackathon 2026)

**Submit:** Fri Nov 20, 12:00 PM CST · **Artifact:** this repo only (`policy-desk`) · **Repo:** private until Devpost flip  
**Eligibility:** Built during the official hacking window. Do **not** submit prep / `guarded-agent-treasury` as the Devpost project.

## Track targets (select on Devpost)

| Priority | Track / bounty | Why we fit |
|---|---|---|
| Primary | **Agentic Payments and AI** | Policy-gated agent USDC spend + x402 quote→pay→resume |
| Chain | **Best use of Solana** | Devnet USDC, Phantom sign, TransferChecked settle, explorer receipts |
| Bounty | **QuickNode Streams** (if P0 time allows) | Webhook → LIVE audit ticker beside policy decisions |
| Auto | Official UBC Winner | Clean demo + eligibility + honest craft |

## Thesis

AI agents that can pay are useful until they are dangerous. **Policy Desk** gives an agent a Solana Devnet USDC budget, then enforces allowlists, caps, and a human approval gate above threshold. Money only moves when policy says yes — and the desk shows every decision.

One-liner for judges: **Agents get a budget — not a blank check.**

## 90-second judge story

1. **Connect** Phantom (Devnet) → trust strip: RPC cluster, Circle mint `4zMMC9…`, wallet, allowlist posture.
2. **Block** — non-allowlisted merchant propose → **blocked** (no transaction materializes).
3. **Approve** — above-threshold x402 weather → human approval widget → operator Approve.
4. **Settle** — dry-run simulate → Phantom sign → Devnet settle → receipt + explorer link.
5. **Close** — “The model proposes. Policy decides. Humans co-sign the big ones.” (Optional: Streams hit on LIVE ticker.)

## Killer demo path (one path only)

```
propose → policy evaluate → human approve (if needed)
        → simulate → Phantom sign → settle → receipt
        ↘ x402 weather quote → pay → resume
```

Everything else is support for this path. Do not fork the demo into a second product narrative.

## What NOT to build (eligibility + focus)

| Skip | Why |
|---|---|
| Arc, Circle Agent Wallets (no Solana), CCTP bridges | Off-track / time sink |
| Gemini, ElevenLabs, Grok as core UX | Distracts from Solana + agentic payments |
| Full Agent Kit plugin surface | Scope explosion |
| On-chain Anchor escrow / PDA vault | Honest MVP = **block before sign**, not fake custody |
| Sponsored/gasless fee payer | P2; Phantom + faucet path is enough |
| NFT attestation mints | P2 polish only after P0 locked |
| Ollama / live LLM propose | Scenario packs are deterministic for judges |
| Submitting prep GAT repo | Eligibility risk — **policy-desk only** |

## Success criteria

| Gate | Done when |
|---|---|
| Demo reliability | Cold-start → block + approve + settle + receipt in ≤90s, twice in a row |
| Policy honesty | Non-allowlisted spend never reaches Phantom; caps + threshold visible |
| Chain truth | Settled rows have Solana explorer links on Devnet USDC mint |
| x402 | Weather quote → pay → resume works under and above approval threshold |
| Security story | `THREAT-MODEL.md` lists guarantees **and** limitations; adversarial tests green |
| Eligibility | Git history starts in hackathon window; Devpost points at this private→public repo |
| Submit package | README + docs, 2–3 min video, Devpost writeup, live tunnel or deploy URL |

## Engineering team (RACI)

| Person | Role | Owns |
|---|---|---|
| **Dipak Yadav** ([@dipak5501](https://github.com/dipak5501)) | Full-stack developer · product/engineering lead | Desk UX, API routes, demo script, Devpost, integration glue |
| **Utkarsh Lubal** ([@ubiiii](https://github.com/ubiiii)) | Cybersecurity engineer | Threat model, operator gate, adversarial tests, audit integrity |
| **Kashif Manzer** ([@KashifManzer](https://github.com/KashifManzer)) | Blockchain engineer | Solana RPC/USDC, Phantom settle, x402 exact verify, Streams |

Review gates: Kashif signs off settle/x402; Utkarsh signs off trust boundaries; Dipak owns merge + judge path.

## Day map (→ Fri Nov 20 noon CST)

See [TEAM-SPLIT.md](./TEAM-SPLIT.md). Feature order: [FEATURE-BACKLOG.md](./FEATURE-BACKLOG.md).
