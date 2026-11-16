import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public live-agent readiness — never returns the API key.
 * Without OPENAI_API_KEY, live_turn reports LIVE UNVERIFIED.
 */
export async function GET() {
  const configured = Boolean(process.env.OPENAI_API_KEY?.trim());
  return NextResponse.json({
    liveConfigured: configured,
    model: configured
      ? (process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini")
      : null,
    label: configured ? "LIVE ready" : "LIVE UNVERIFIED without OPENAI_API_KEY",
  });
}
