import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public status for optional ElevenLabs TTS — never returns the API key. */
export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
    autoSpeak: process.env.ELEVENLABS_AUTO_SPEAK === "1",
  });
}
