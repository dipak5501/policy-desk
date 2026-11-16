# Organizer / sponsor resources — checklist

Source of truth (organizers):  
[Hackathon Guide UBC 26](https://docs.google.com/document/d/1QaySCo7u3VxMVNdk3C5Ab3ewc2E46AuLntti-Uzx5EY/edit?usp=sharing) ·  
[Office Hours & Workshop Schedule](https://docs.google.com/document/d/1eI8S0gBu6xI36DFqgqGZlO1qX6YYzFTEXBx9L5ve_zA/edit?usp=sharing) ·  
[Devpost Resources](https://ubc-hackathon-2026.devpost.com/resources)

Real UBC Hackathon 2026 / sponsor resources only. **No invented APIs.**  
Owners: Dipak (product wiring) · Kashif (chain/RPC/Streams) · Utkarsh (webhook secret / abuse review).

## Community & schedule

| Resource | Link | Status |
|---|---|---|
| Hackathon guide (official Google Doc) | [Hackathon Guide UBC 26](https://docs.google.com/document/d/1QaySCo7u3VxMVNdk3C5Ab3ewc2E46AuLntti-Uzx5EY/edit?usp=sharing) | **Linked** in ResourceStrip |
| Workshop / office hours schedule | [UBC 2026 Office Hours & Workshops](https://docs.google.com/document/d/1eI8S0gBu6xI36DFqgqGZlO1qX6YYzFTEXBx9L5ve_zA/edit?usp=sharing) | **Linked** — Nov 16–19 CST |
| Telegram | [t.me/+Q0hy2P7nbIk2YWIx](https://t.me/+Q0hy2P7nbIk2YWIx) | **Linked** |
| Devpost | [ubc-hackathon-2026.devpost.com](https://ubc-hackathon-2026.devpost.com/) | **Linked** |
| Submission deadline | Fri Nov 20, **12:00 PM CST** | Track in README / demo script |

Office hours (drop-in Zoom/Meet — see schedule doc for live Meet links):

| Day (CST) | Mentors of note for Policy Desk |
|---|---|
| Mon Nov 16, 6–8pm | Solana, Circle (6–7); Gemini (7–8) |
| Tue Nov 17, 6–8pm | Cursor (6–6:30); Gemini (7–8) |
| Wed Nov 18, 6–8pm | Solana, Circle (6–7); **QuickNode** (7–8) |
| Thu Nov 19, 7–8pm | Solana; Gemini |

## Wired for Policy Desk (Solana · Agentic Payments)

| Resource | Link | Wired | Owner | Status |
|---|---|---|---|---|
| Solana Devnet RPC | [api.devnet.solana.com](https://api.devnet.solana.com) / private QuickNode via `SOLANA_RPC_URL` | `lib/solana/connection.ts` | Kashif | **Wired** |
| Solana Developer Docs | [docs.solana.com](https://docs.solana.com/) | ResourceStrip | Dipak | **Linked** |
| Solana Cookbook | [solanacookbook.com](https://solanacookbook.com/) | ResourceStrip | Dipak | **Linked** |
| Anchor Framework | [anchor-lang.com](https://anchor-lang.com/) | Docs only (no custom program this build) | Kashif | **Referenced** |
| Circle Devnet USDC mint | [USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses) · `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | Policy, balances, settle | Kashif | **Wired** |
| Circle Testnet Faucet | [faucet.circle.com](https://faucet.circle.com/) | ResourceStrip + README | Dipak | **Linked** |
| SOL faucet | [faucet.solana.com](https://faucet.solana.com) | ResourceStrip + README | Dipak | **Linked** |
| Phantom wallet | [phantom.app/download](https://phantom.app/download) | WalletProvider / settle | Dipak + Kashif | **Wired** |
| x402 on Solana (V2) | [Agentic payments / x402](https://solana.com/docs/payments/agentic-payments/x402) · CAIP-2 `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | `/api/x402/*` demo merchant | Kashif | **Wired** (demo merchant — honest label) |
| Circle Developer Docs | [developers.circle.com](https://developers.circle.com/) | ResourceStrip | Dipak | **Linked** |
| QuickNode Streams | [Streams quickstart](https://www.quicknode.com/docs/streams/quickstart) · [Solana program data](https://www.quicknode.com/guides/quicknode-products/streams/how-to-stream-solana-program-data) · [Filters](https://www.quicknode.com/guides/quicknode-products/streams/how-to-use-filters-with-streams) · [Backfill](https://www.quicknode.com/docs/streams/backfilling) · [REST API](https://www.quicknode.com/docs/streams/rest-api) | `/api/streams/webhook` + ledger reconcile | Kashif · secret Utkarsh | **Claimable** after Stream filter+destination configured ([STREAMS.md](./STREAMS.md)) |
| QuickNode credits (hackathon) | [Credits guide](https://quicknode.notion.site/quicknode-credits-for-college-xyz) | Claim for private RPC / Streams | Kashif | **Linked** — claim ASAP |
| Solana explorer (Devnet) | Receipt links from confirm | UI receipts | Kashif | **Wired** |

Track guidance (guide § Agentic Payments): *“recommended to use x402, Circle Agent Wallets or Nanopayments, or Solana Agent Kit.”* We ship **x402-style settle-before-deliver** + policy guardrails on Solana Devnet USDC.

## Sponsor perks (claim)

| Perk | How | Notes |
|---|---|---|
| ElevenLabs coupons | Discord [VnBvbbcdEC](https://discord.com/invite/VnBvbbcdEC) → `#│coupon-codes` → Start Redemption → event **University Blockchain Conference (UBC Hackathon)** · [video](https://youtu.be/S143_JtCtV8) | Voice desk: `ELEVENLABS_API_KEY` → Speak answer + auto-narrate block/settle/answer (`eleven_multilingual_v2`). **Show audio in demo video** to claim bounty. |
| Cursor / Grok Pro | Log into Grok first, then [referral link](https://grok.com/plans/referral/?sku=sku_iFHd43ge7daR&interval=MONTHLY&code=2MAZ-XB7W-XZR2-CG5V#subscribe) | Limited redemptions; new accounts |
| QuickNode credits | [Notion credits guide](https://quicknode.notion.site/quicknode-credits-for-college-xyz) | Use for RPC + Streams |

## SKIP for Policy Desk core demo (still linked in guide)

| Skip | Reason |
|---|---|
| Arc + Hardhat/Foundry | Wrong chain award for our Solana path |
| Circle Agent Wallets / CCTP as core | No Solana agent-wallet path this build; CCTP is cross-chain |
| Gemini Prediction Markets APIs | Dilutes Agentic Payments + Solana story (P2) |
| Grok Bot as core feature | Not in product — leave bounty deselected |
| Full Solana Agent Kit plugin matrix | Scope; x402 + policy catalog is the control plane |

## UI surface

`components/ResourceStrip.tsx` exposes faucets, Phantom, x402, mint, Solana/Circle docs, Streams, credits, Telegram, and the official guide + workshop schedule.

## Pre-judge faucet checklist

1. Phantom → **Devnet**
2. SOL ≥ ~0.02 from [faucet.solana.com](https://faucet.solana.com)
3. USDC ≥ ~0.60 from [faucet.circle.com](https://faucet.circle.com/) (Solana / Devnet / USDC)
4. Trust strip mint = `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
5. Claim QuickNode credits if using private RPC / Streams
6. Streams: create QuickNode Stream (filter + webhook destination) and fill Stream id in [STREAMS.md](./STREAMS.md) before claiming bounty
7. ElevenLabs: ensure Speak plays in the filmed demo (unmute / auto-speak on)

## Companion docs

- Compact status table: [RESOURCES.md](./RESOURCES.md)
- Streams setup: [STREAMS.md](./STREAMS.md)