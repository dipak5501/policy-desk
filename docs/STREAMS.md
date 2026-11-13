# QuickNode Streams (incomplete for bounty)

**Status: incomplete for the QuickNode Streams bounty.** The webhook can animate the LIVE ticker. It does **not** yet reconcile known payments, flag unmatched outgoing transfers, or prove provider-authenticated delivery delay. A manually posted webhook payload does **not** prove QuickNode integration. Do not claim the bounty until reconcile ships.

## What shipped (ticker only)

1. `POST /api/streams/webhook` — verifies `QUICKNODE_STREAM_WEBHOOK_SECRET` when set; appends events to the durable feed.
2. `GET /api/streams/webhook` — returns recent stream events for the LIVE ticker.
3. Desk **LIVE** ticker shows `stream` hits alongside ledger rows (display only).

## Configure

1. Create a QuickNode account + **Solana Devnet** endpoint (also set `SOLANA_RPC_URL` to that HTTP URL).
2. Create a Stream filtered to Token Program transfers involving:
   - Devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
   - Your treasury wallet and/or demo payee
3. Destination: HTTPS webhook → `https://<your-tunnel-or-deploy>/api/streams/webhook`
4. Set a shared secret:

```bash
QUICKNODE_STREAM_WEBHOOK_SECRET=replace-me
# Accepted headers: x-qn-signature | x-webhook-secret | Authorization: Bearer …
```

| Field | Value |
|---|---|
| Stream id | _(fill after create)_ |
| Network | Solana Devnet |
| Filter | USDC mint + treasury/payee ATAs |
| Webhook | `/api/streams/webhook` |

## Local test without QuickNode

```bash
curl -X POST http://localhost:3000/api/streams/webhook \
  -H 'Content-Type: application/json' \
  -H 'x-webhook-secret: replace-me' \
  -d '{"signature":"DemoSig111111111111111111111111111111111111111","note":"manual"}'
```

Refresh the desk — the LIVE ticker should show a `stream` item.

## Links (organizer / sponsor)

- [Streams quickstart](https://www.quicknode.com/docs/streams/quickstart)
- [Stream Solana program data](https://www.quicknode.com/guides/quicknode-products/streams/how-to-stream-solana-program-data)
