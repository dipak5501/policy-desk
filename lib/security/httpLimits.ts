/**
 * Lightweight in-process rate + body limits for public endpoints.
 * Not a substitute for edge WAF; enough to blunt demo abuse.
 */

type Bucket = { count: number; resetAt: number };

declare global {
  var __policyDeskRateBuckets: Map<string, Bucket> | undefined;
}

function buckets(): Map<string, Bucket> {
  if (!globalThis.__policyDeskRateBuckets) {
    globalThis.__policyDeskRateBuckets = new Map();
  }
  return globalThis.__policyDeskRateBuckets;
}

export function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

/** Returns true if the request is allowed; false if rate-limited. */
export function allowRate(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const map = buckets();
  const row = map.get(key);
  if (!row || row.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}

export function rateLimitResponse(): Response {
  return Response.json(
    { error: "Rate limit exceeded — retry shortly" },
    { status: 429 },
  );
}

const DEFAULT_MAX_BODY = 32_768; // 32 KiB

/** Read JSON body with a hard size cap. */
export async function readJsonBody<T>(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY,
): Promise<{ ok: true; body: T } | { ok: false; error: string; status: number }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false, error: "Request body too large", status: 413 };
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    return { ok: false, error: "Request body too large", status: 413 };
  }
  if (!text) {
    return { ok: true, body: {} as T };
  }
  try {
    return { ok: true, body: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }
}

export function resetRateLimitsForTests(): void {
  globalThis.__policyDeskRateBuckets = new Map();
}
