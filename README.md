# Policy Desk

> **Built during UBC Hackathon 2026** (official hacking began Thu Nov 12, 6:00 PM CST).  
> Prep research / gallery notes lived in a separate private reference project — **this repository’s git history starts after kickoff.**  
> Repo stays **private** until Devpost submission; flip to public before submit.

Policy-gated Solana USDC spending for AI agents. Flow judges can see in ~90 seconds:

**propose → policy evaluate → human approve → dry-run simulate → Phantom sign → Devnet settle → receipt**

## Team

| GitHub | Name | Role |
|---|---|---|
| [@dipak5501](https://github.com/dipak5501) | Dipak Yadav | Owner |
| [@ubiiii](https://github.com/ubiiii) | Utkarsh Lubal | Collaborator |
| [@KashifManzer](https://github.com/KashifManzer) | Kashif Manzer | Collaborator |

## Pitch

AI agents that can pay are useful until they are dangerous. Policy Desk gives an agent a USDC budget on Solana Devnet, then enforces allowlists, caps, and a human approval widget above a threshold. Money only moves when policy says yes — and the desk shows every decision.

## Architecture

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

## Gallery-inspired features (demo-visible)

1. Human approval widgets (SeaPay-style pause)
2. Visible policy decisions + audit log (Agent Guard twin)
3. x402 quote → pay → resume
4. Clear payment state machine
5. First-class receipts with explorer links
6. Dry-run / simulate before broadcast
7. Honest **block before sign** (no fake escrow vault)
8. Gas/fee clarity + insufficient SOL/USDC handling
9. Treasury desk metaphor + posture labels + LIVE ticker
10. Trust strip: Devnet, mint, wallet, allowlist
11. Official resource strip (faucets, Phantom, x402, Circle mint, Streams)
12. QuickNode Streams webhook → LIVE feed (`docs/STREAMS.md`)

Deferred: sponsored/gasless fees, on-chain escrow PDAs, CCTP, NFT attestation, Ollama propose.

## Organizer APIs wired

See [docs/RESOURCES.md](docs/RESOURCES.md). Core: Solana Devnet RPC, Circle Devnet USDC mint, Phantom connect/sign, x402 V2 weather quote, SOL + Circle faucets. Optional: QuickNode Streams.

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

### Wallet / faucet

1. Phantom → **Devnet**
2. SOL — https://faucet.solana.com
3. USDC — https://faucet.circle.com (Solana / Devnet / USDC)

## Demo script (~60–90s)

1. Open Policy Desk → Connect Phantom (Devnet) → show trust strip + posture.
2. **Run 90s demo**:
   - Non-allowlisted merchant → **blocked** (no tx).
   - Above-threshold x402 → **human approval** widget → Approve.
   - Simulate → Phantom sign → **settled** receipt + explorer.
3. One-liner: “Agents get a budget — not a blank check.”

## Threat model

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for enforced guarantees and honest limitations.

## Eligibility note

UBC Hackathon 2026 requires projects built during the hackathon. This app was scaffolded and committed in the allowed window. Do **not** submit older pre-kickoff prep repositories as the Devpost artifact.
