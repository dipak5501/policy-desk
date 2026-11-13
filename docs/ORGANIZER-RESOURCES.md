# Organizer / sponsor resources — checklist

Real UBC Hackathon 2026 / sponsor resources only. **No invented APIs.**  
Owners: Dipak (product wiring) · Kashif (chain/RPC/Streams) · Utkarsh (webhook secret / abuse review).

| Resource | Link | Wired in policy-desk | Owner | Status |
|---|---|---|---|---|
| Solana Devnet RPC | [api.devnet.solana.com](https://api.devnet.solana.com) / private QuickNode HTTP URL via `SOLANA_RPC_URL` | `lib/solana/connection.ts`, `.env.example` | Kashif | **Wired** — prefer private endpoint for demos |
| Circle Devnet USDC mint | [USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses) · `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | Policy allowlist, balances, settle, trust strip | Kashif | **Wired** |
| Phantom wallet | [phantom.app/download](https://phantom.app/download) | Connect + sign (`WalletProvider`, settle path) | Dipak + Kashif | **Wired** — judges must switch to Devnet |
| x402 on Solana (V2) | [Agentic payments / x402](https://solana.com/docs/payments/agentic-payments/x402) · CAIP-2 `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | `/api/x402/weather` quote → pay → resume | Kashif | **Wired** |
| SOL faucet | [faucet.solana.com](https://faucet.solana.com) | `ResourceStrip` + README | Dipak | **Linked** |
| Circle USDC faucet | [faucet.circle.com](https://faucet.circle.com/) · Solana / Devnet / USDC | `ResourceStrip` + README | Dipak | **Linked** |
| QuickNode Streams | [Streams quickstart](https://www.quicknode.com/docs/streams/quickstart) · [Solana program data guide](https://www.quicknode.com/guides/quicknode-products/streams/how-to-stream-solana-program-data) | `POST/GET /api/streams/webhook` + LIVE ticker | Kashif · secret review Utkarsh | **Wired (optional bounty)** — configure stream + `QUICKNODE_STREAM_WEBHOOK_SECRET`; see [STREAMS.md](./STREAMS.md) |
| Circle docs (stablecoins) | [developers.circle.com](https://developers.circle.com/stablecoins/usdc-contract-addresses) | Mint constant + UI note | Kashif | **Referenced** |
| Solana explorer (Devnet) | Receipt links from settle confirm | Settled ledger / UI receipts | Kashif | **Wired** |

## UI surface

`components/ResourceStrip.tsx` exposes faucet, Phantom, x402, mint, and Streams links on the desk.

## SKIP (per track / scope)

| Skip | Reason |
|---|---|
| Arc | Not Solana demo path |
| Circle Agent Wallets | No Solana |
| CCTP cross-chain | Out of killer demo path |
| Gemini / ElevenLabs / Grok as core | Not needed for Solana + agentic payments story |
| Full Agent Kit plugin matrix | Scope |

## Pre-judge faucet checklist

1. Phantom → **Devnet**
2. SOL ≥ ~0.02 from [faucet.solana.com](https://faucet.solana.com)
3. USDC ≥ ~0.60 from [faucet.circle.com](https://faucet.circle.com/) (Solana / Devnet / USDC)
4. Confirm trust strip mint matches `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
5. If claiming Streams bounty: webhook secret set + one LIVE `stream` event visible ([STREAMS.md](./STREAMS.md))

## Companion docs

- Compact status table (legacy): [RESOURCES.md](./RESOURCES.md)
- Streams setup: [STREAMS.md](./STREAMS.md)
