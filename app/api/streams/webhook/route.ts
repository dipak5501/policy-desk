import { NextResponse } from "next/server";
import { listStreamEvents, streamReconcileStats } from "@/lib/ledger/store";
import { reconcileStreamPayload } from "@/lib/streams/reconcile";
import {
  allowRate,
  clientKey,
  rateLimitResponse,
  readJsonBody,
} from "@/lib/security/httpLimits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractSignature(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.signature === "string") return obj.signature;
  if (typeof obj.txHash === "string") return obj.txHash;
  if (Array.isArray(obj.data) && obj.data[0] && typeof obj.data[0] === "object") {
    const first = obj.data[0] as Record<string, unknown>;
    if (typeof first.signature === "string") return first.signature;
  }
  if (obj.matchingReceipts && typeof obj.matchingReceipts === "object") {
    const receipts = obj.matchingReceipts as Record<string, unknown>;
    const keys = Object.keys(receipts);
    if (keys[0]) return keys[0];
  }
  return undefined;
}

/**
 * QuickNode Streams webhook — core chain observation for Policy Desk.
 * Verifies QUICKNODE_STREAM_WEBHOOK_SECRET when set.
 * Reconciles signatures against the ledger (matched / unmatched).
 * @see docs/STREAMS.md
 */
export async function POST(request: Request) {
  if (!allowRate(`streams:${clientKey(request)}`, 120, 60_000)) {
    return rateLimitResponse();
  }
  const secret = process.env.QUICKNODE_STREAM_WEBHOOK_SECRET;
  if (secret) {
    const header =
      request.headers.get("x-qn-signature") ??
      request.headers.get("x-webhook-secret") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const parsed = await readJsonBody<unknown>(request, 65_536);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }
  const payload = parsed.body;
  const signature = extractSignature(payload);
  const result = reconcileStreamPayload({ signature, raw: payload });

  return NextResponse.json({
    ok: true,
    event: result.event,
    matchStatus: result.matchStatus,
    matchedEntryId: result.matchedEntryId ?? null,
    stats: streamReconcileStats(),
  });
}

export async function GET() {
  return NextResponse.json({
    events: listStreamEvents(40),
    stats: streamReconcileStats(),
    reconcile: true,
    docs: "See docs/STREAMS.md — Solana Devnet USDC mint + treasury/payee filter; Streams is a core observation source",
  });
}
