import { NextResponse } from "next/server";
import {
  operatorConfigured,
  parseCookies,
  readOperatorSession,
  COOKIE_CSRF,
} from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!operatorConfigured()) {
    return NextResponse.json({
      authenticated: false,
      configured: false,
    });
  }
  const cookies = parseCookies(request);
  return NextResponse.json({
    authenticated: readOperatorSession(request),
    configured: true,
    csrf: cookies[COOKIE_CSRF] ?? null,
  });
}
