import { NextResponse } from "next/server";
import { clearSessions } from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const res = NextResponse.json({ ok: true });
  for (const c of clearSessions(request)) {
    res.headers.append("Set-Cookie", c);
  }
  return res;
}
