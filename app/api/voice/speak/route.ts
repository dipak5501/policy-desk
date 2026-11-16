import { NextResponse } from "next/server";
import {
  allowRate,
  clientKey,
  rateLimitResponse,
  readJsonBody,
} from "@/lib/security/httpLimits";
import { assertCsrf, readWalletSession } from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHARS = 2_500;

type Body = {
  text?: string;
  voiceId?: string;
};

/**
 * ElevenLabs TTS for the Policy Desk voice layer (research answer + settle briefs).
 * Server-side key only. Missing config → 503 (audio unverified).
 * Requires wallet session + CSRF — same gate as other mutating routes.
 */
export async function POST(request: Request) {
  if (!allowRate(`voice:${clientKey(request)}`, 8, 60_000)) {
    return rateLimitResponse();
  }

  const wallet = readWalletSession(request);
  if (!wallet) {
    return NextResponse.json(
      { error: "Wallet session required" },
      { status: 401 },
    );
  }
  if (!assertCsrf(request)) {
    return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ELEVENLABS_API_KEY not configured — create a key at elevenlabs.io → Developers / API Keys, add ELEVENLABS_API_KEY to .env.local, restart Next. Core Solana demo works without audio.",
        configured: false,
      },
      { status: 503 },
    );
  }

  const parsed = await readJsonBody<Body>(request, 16_384);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status },
    );
  }
  const body = parsed.body;

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `text too long (max ${MAX_CHARS} chars)` },
      { status: 400 },
    );
  }

  const voiceId =
    (typeof body.voiceId === "string" && body.voiceId.trim()) ||
    process.env.ELEVENLABS_VOICE_ID?.trim() ||
    "21m00Tcm4TlvDq8ikWAM"; // Rachel — public default

  const modelId =
    process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2";

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
        },
      }),
    },
  );

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      {
        error: "ElevenLabs TTS failed",
        status: upstream.status,
        detail: detail.slice(0, 400),
      },
      { status: 502 },
    );
  }

  const audio = await upstream.arrayBuffer();
  return new NextResponse(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
