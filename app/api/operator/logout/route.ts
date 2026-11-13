import { NextResponse } from "next/server";
import { clearSessions } from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (const c of clearSessions()) {
    res.headers.append("Set-Cookie", c);
  }
  return res;
}
