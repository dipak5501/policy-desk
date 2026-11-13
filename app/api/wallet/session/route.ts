import { NextResponse } from "next/server";
import { readWalletSessionDetails } from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Restore wallet auth + CSRF after page reload.
 * CSRF is returned in JSON (auth cookies remain HttpOnly).
 */
export async function GET(request: Request) {
  const session = readWalletSessionDetails(request);
  if (!session) {
    return NextResponse.json({ authenticated: false, wallet: null, csrf: null });
  }
  return NextResponse.json({
    authenticated: true,
    wallet: session.wallet,
    csrf: session.csrf,
  });
}
