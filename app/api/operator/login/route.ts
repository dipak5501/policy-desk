import { NextResponse } from "next/server";
import {
  issueOperatorSession,
  operatorConfigured,
  verifyOperatorPassword,
} from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-authenticated operator login.
 * Password is OPERATOR_TOKEN (server-only). Issues HttpOnly session cookie.
 * Prototype limitation: shared password, not SSO / WebAuthn.
 */
export async function POST(request: Request) {
  if (!operatorConfigured()) {
    return NextResponse.json(
      { error: "OPERATOR_TOKEN not configured — fail closed" },
      { status: 503 },
    );
  }
  try {
    const body = (await request.json()) as { password?: string };
    if (!body.password || !verifyOperatorPassword(body.password)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const session = issueOperatorSession();
    const res = NextResponse.json({
      ok: true,
      csrf: session.csrf,
      note: "HttpOnly operator session. CSRF required on mutating approval routes.",
    });
    for (const c of session.setCookies) {
      res.headers.append("Set-Cookie", c);
    }
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
