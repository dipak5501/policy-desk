import { NextResponse } from "next/server";
import { appendStreamEvent, listStreamEvents } from "@/lib/ledger/store";

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

function summarize(payload: unknown, signature?: string): string {
  if (signature) return `Stream hit · ${signature.slice(0, 8)}…`;
  if (payload && typeof payload === "object") {
    const keys = Object.keys(payload as object);
    return `Stream event · keys: ${keys.slice(0, 4).join(", ") || "empty"}`;
  }
  return "Stream event received";
}

/**
 * QuickNode Streams webhook (UBC $500 bounty).
 * Verifies QUICKNODE_STREAM_WEBHOOK_SECRET when set.
 * @see docs/STREAMS.md
 */
export async function POST(request: Request) {
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

  const payload = await request.json().catch(() => null);
  const signature = extractSignature(payload);
  const event = appendStreamEvent({
    signature,
    summary: summarize(payload, signature),
    raw: payload,
  });

  return NextResponse.json({
    ok: true,
    event,
    note: "Streams event appended to Policy Desk feed",
  });
}

export async function GET() {
  return NextResponse.json({
    events: listStreamEvents(40),
    docs: "See docs/STREAMS.md — Solana Devnet USDC mint + treasury/payee filter",
  });
}
