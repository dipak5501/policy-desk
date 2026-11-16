import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public status for ElevenLabs voice desk — never returns the API key.
 * Auto-speak defaults ON when a key is configured; set ELEVENLABS_AUTO_SPEAK=0 to mute.
 */
export async function GET() {
  const configured = Boolean(process.env.ELEVENLABS_API_KEY?.trim());
  const flag = process.env.ELEVENLABS_AUTO_SPEAK?.trim();
  const autoSpeak =
    configured && flag !== "0" && flag?.toLowerCase() !== "false";
  return NextResponse.json({
    configured,
    autoSpeak,
    product: "eleven_multilingual_v2",
    role: "core_voice_desk",
  });
}
