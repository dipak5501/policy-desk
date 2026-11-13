# Policy Desk

> **Built during UBC Hackathon 2026** (official hacking began Thu Nov 12, 6:00 PM CST).  
> Prep research / gallery notes lived in a separate private reference project — **this repository’s git history starts after kickoff.**  
> Repo stays **private** until Devpost submission; flip to **public** before submit.

Policy-gated Solana USDC spending for AI agents. Flow judges can see in ~90 seconds:

**propose → policy evaluate → human approve → dry-run simulate → Phantom sign → Devnet settle → receipt**

**One-liner:** Agents get a budget — not a blank check.

## Team

| GitHub | Name | Role |
|---|---|---|
| [@dipak5501](https://github.com/dipak5501) | Dipak Yadav | Full-stack / product lead (owner) |
| [@ubiiii](https://github.com/ubiiii) | Utkarsh Lubal | Cybersecurity engineer |
| [@KashifManzer](https://github.com/KashifManzer) | Kashif Manzer | Blockchain engineer |

## Winning docs (start here)

| Doc | Purpose |
|---|---|
| [docs/WIN-PLAN.md](docs/WIN-PLAN.md) | Prize targets, 90s demo, what we will **not** build |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Trust boundaries, settle + x402 loops, API map |
| [docs/ORGANIZER-RESOURCES.md](docs/ORGANIZER-RESOURCES.md) | Official APIs/resources checklist + owners |
| [docs/FEATURE-BACKLOG.md](docs/FEATURE-BACKLOG.md) | P0/P1/P2 from gallery — ruthless cuts |
| [docs/TEAM-SPLIT.md](docs/TEAM-SPLIT.md) | Day 1–5 plan by specialty + handoffs |
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) | Honest guarantees + limitations |
| [docs/STREAMS.md](docs/STREAMS.md) | Optional QuickNode Streams bounty |
| [docs/RESOURCES.md](docs/RESOURCES.md) | Short link index |

## Prize stack (planned Devpost selections)

- Main track: **Agentic Payments and AI**
- Chain award: **Best use of Solana** (not Arc)
- Bounty: **QuickNode Streams** only if go/no-go passes (see TEAM-SPLIT Day 3)

## Architecture (sketch)

```
Agent propose → lib/policy (allow / block / needs_approval)
                     ↓
              Human approval widget (if needed)
                     ↓
         settle/prepare (re-check + simulate)
                     ↓
         Phantom sign → settle/confirm → explorer receipt
                     ↘
                   x402 quote → pay → resume (/api/x402/weather)
```

## Run locally

```bash
export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH"  # if needed
cd policy-desk
cp .env.example .env.local
npm install
npm test
npm run build
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Public demo tunnel (Cloudflare)

```bash
npm run tunnel:refresh
cat .tunnel-url
```

### Wallet / faucet (official)

1. Phantom → **Devnet** — https://phantom.app/download  
2. SOL — https://faucet.solana.com  
3. USDC — https://faucet.circle.com (Solana / Devnet / USDC)  
4. Mint — `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

## Demo script (~60–90s)

1. Open Policy Desk → Connect Phantom (Devnet) → show trust strip + posture.  
2. **Run 90s demo**:
   - Non-allowlisted merchant → **blocked** (no tx).
   - Above-threshold spend → **human approval** → Approve.
   - Simulate → Phantom sign → **settled** receipt + explorer.
3. Close: “Agents get a budget — not a blank check.”

## Eligibility note

UBC Hackathon 2026 requires projects built during the hackathon. Submit **this** repository only — not older prep repos.
