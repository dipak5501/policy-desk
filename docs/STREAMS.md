# QuickNode Streams (core observation + reconcile)

**Status: bounty-ready when a Stream is configured** with filter + HTTPS destination pointing at this webhook. Policy Desk uses Streams as a **core chain observation source**: every webhook hit is reconciled against the SQLite ledger.

| Match | Meaning |
|---|---|
| `matched` | Signature equals a known desk settle — independent chain confirmation |
| `unmatched` | Signature not in ledger — unexpected USDC movement alert |
| `no_signature` | Malformed / non-tx payload |

## What ships

1. `POST /api/streams/webhook` — verifies `QUICKNODE_STREAM_WEBHOOK_SECRET` when set; **reconciles** signature → ledger; returns `matchStatus` + stats.
2. `GET /api/streams/webhook` — recent events + reconcile counters for the LIVE ticker / desk stats.
3. Desk ticker shows `stream·matched` / `stream·alert` alongside ledger rows.
4. Trust strip: **Streams · reconcile on**.

## Configure (required for Devpost bounty)

1. QuickNode account + **Solana Devnet** endpoint — also set `SOLANA_RPC_URL` to that HTTP URL.
2. Create a **Stream**:
   - **Network:** Solana Devnet
   - **Dataset:** program / token transfers (Token Program)
   - **Filter:** USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` and desk treasury / demo payee ATAs
   - **Destination:** HTTPS webhook → `https://<deploy-or-tunnel>/api/streams/webhook`
3. Shared secret in `.env.local`:

```bash
QUICKNODE_STREAM_WEBHOOK_SECRET=replace-me
# Accepted headers: x-qn-signature | x-webhook-secret | Authorization: Bearer …
```

| Field | Value |
|---|---|
| Stream id | _(fill after create in QuickNode UI)_ |
| Network | Solana Devnet |
| Filter | USDC mint `4zMMC9…` + treasury/payee ATAs |
| Destination | `POST /api/streams/webhook` |
| Secret | `QUICKNODE_STREAM_WEBHOOK_SECRET` |

## Local test without QuickNode

```bash
# After a real settle, reuse that signature — expect matchStatus=matched
curl -X POST http://127.0.0.1:3000/api/streams/webhook \
  -H 'Content-Type: application/json' \
  -H "x-webhook-secret: $QUICKNODE_STREAM_WEBHOOK_SECRET" \
  -d '{"signature":"<settled-signature-from-ledger>"}'

# Unknown sig — expect matchStatus=unmatched (alert)
curl -X POST http://127.0.0.1:3000/api/streams/webhook \
  -H 'Content-Type: application/json' \
  -H "x-webhook-secret: $QUICKNODE_STREAM_WEBHOOK_SECRET" \
  -d '{"signature":"UnknownSig222222222222222222222222222222222222"}'
```

## Links (organizer / sponsor)

- [Streams quickstart](https://www.quicknode.com/docs/streams/quickstart)
- [Stream Solana program data](https://www.quicknode.com/guides/quicknode-products/streams/how-to-stream-solana-program-data)
- [Filters](https://www.quicknode.com/guides/quicknode-products/streams/how-to-use-filters-with-streams)
- [Credits](https://quicknode.notion.site/quicknode-credits-for-college-xyz)
