import { NextResponse } from "next/server";
import {
  operatorConfigured,
  readOperatorSessionDetails,
} from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!operatorConfigured()) {
    return NextResponse.json({
      authenticated: false,
      configured: false,
      csrf: null,
    });
  }
  const session = readOperatorSessionDetails(request);
  return NextResponse.json({
    authenticated: Boolean(session),
    configured: true,
    csrf: session?.csrf ?? null,
  });
}
