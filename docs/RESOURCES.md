# Organizer resources wired into Policy Desk

From the UBC Hackathon 2026 guide, Devpost, and sponsor docs. **No invented APIs.**

| Resource | Status in app | Source |
|---|---|---|
| Solana Devnet RPC | `SOLANA_RPC_URL` / public `api.devnet.solana.com` | Solana docs |
| Circle Devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | Policy allowlist + balances + settle | [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses) |
| Phantom wallet | Connect + sign | [phantom.app](https://phantom.app/download) |
| x402 V2 (`PAYMENT-*`, CAIP-2 `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`) | `/api/x402/weather` quote → pay → resume | [x402 on Solana](https://solana.com/docs/payments/agentic-payments/x402) |
| SOL faucet | UI ResourceStrip + README | [faucet.solana.com](https://faucet.solana.com) |
| Circle USDC faucet | UI ResourceStrip + README | [faucet.circle.com](https://faucet.circle.com/) |
| QuickNode Streams | `/api/streams/webhook` + LIVE ticker | [Streams quickstart](https://www.quicknode.com/docs/streams/quickstart) — see `STREAMS.md` |

**SKIP (per track):** Arc, Circle Agent Wallets (no Solana), CCTP, Gemini, ElevenLabs, Grok as core, full Agent Kit plugin surface.
