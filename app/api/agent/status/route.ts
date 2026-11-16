import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Agent readiness — fixture is the sole demo path.
 * Live OpenAI adapter was removed (no organizer-provided LLM credits).
 */
export async function GET() {
  return NextResponse.json({
    mode: "fixture",
    liveConfigured: false,
    liveRemoved: true,
    label: "FIXTURE — deterministic demo agent",
  });
}
