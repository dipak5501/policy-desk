import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE_WALLET = "pd_wallet_session";
const COOKIE_OPERATOR = "pd_operator_session";
const COOKIE_CSRF = "pd_csrf";

type SessionStore = {
  walletChallenges: Map<
    string,
    { nonce: string; message: string; expiresAt: number }
  >;
  walletSessions: Map<
    string,
    { wallet: string; expiresAt: number; csrf: string }
  >;
  operatorSessions: Map<string, { expiresAt: number; csrf: string }>;
};

declare global {
  var __policyDeskSessions: SessionStore | undefined;
}

function store(): SessionStore {
  if (!globalThis.__policyDeskSessions) {
    globalThis.__policyDeskSessions = {
      walletChallenges: new Map(),
      walletSessions: new Map(),
      operatorSessions: new Map(),
    };
  }
  return globalThis.__policyDeskSessions;
}

function secret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.OPERATOR_TOKEN ||
    ""
  );
}

function sign(value: string): string {
  const s = secret();
  if (!s) throw new Error("SESSION_SECRET or OPERATOR_TOKEN required");
  return createHmac("sha256", s).update(value).digest("hex");
}

function cookie(name: string, value: string, maxAgeSec: number): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSec}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = rest.join("=");
  }
  return out;
}

export function createWalletChallenge(wallet: string): {
  nonce: string;
  message: string;
  expiresAt: string;
} {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const message = `Policy Desk wallet login\nWallet: ${wallet}\nNonce: ${nonce}\nExpires: ${new Date(expiresAt).toISOString()}`;
  // Persist the exact challenge message server-side — verify must use this, not client text.
  store().walletChallenges.set(wallet, { nonce, message, expiresAt });
  return { nonce, message, expiresAt: new Date(expiresAt).toISOString() };
}

/** Peek at an outstanding challenge without consuming it. */
export function getWalletChallenge(
  wallet: string,
): { nonce: string; message: string; expiresAt: number } | null {
  const row = store().walletChallenges.get(wallet);
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    store().walletChallenges.delete(wallet);
    return null;
  }
  return row;
}

/**
 * Delete a challenge after successful signature verification.
 * Call only once the signature over the stored message has been checked.
 */
export function consumeWalletChallenge(
  wallet: string,
  nonce: string,
): boolean {
  const row = store().walletChallenges.get(wallet);
  if (!row) return false;
  if (row.expiresAt < Date.now()) {
    store().walletChallenges.delete(wallet);
    return false;
  }
  if (row.nonce !== nonce) return false;
  store().walletChallenges.delete(wallet);
  return true;
}

export function issueWalletSession(wallet: string): {
  setCookies: string[];
  csrf: string;
} {
  const sid = randomBytes(24).toString("hex");
  const csrf = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  store().walletSessions.set(sid, { wallet, expiresAt, csrf });
  const signed = `${sid}.${sign(sid)}`;
  return {
    csrf,
    setCookies: [
      cookie(COOKIE_WALLET, signed, 12 * 60 * 60),
      // HttpOnly double-submit cookie — clients must use JSON csrf, not document.cookie
      cookie(COOKIE_CSRF, csrf, 12 * 60 * 60),
    ],
  };
}

function readWalletSessionRow(
  request: Request,
): { wallet: string; csrf: string } | null {
  if (!secret()) return null;
  const cookies = parseCookies(request);
  const raw = cookies[COOKIE_WALLET];
  if (!raw) return null;
  const [sid, sig] = raw.split(".");
  if (!sid || !sig) return null;
  const expected = sign(sid);
  try {
    if (
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) &&
      sig !== expected
    ) {
      return null;
    }
  } catch {
    if (sig !== expected) return null;
  }
  const row = store().walletSessions.get(sid);
  if (!row || row.expiresAt < Date.now()) return null;
  return { wallet: row.wallet, csrf: row.csrf };
}

export function readWalletSession(request: Request): string | null {
  return readWalletSessionRow(request)?.wallet ?? null;
}

/** Authenticated wallet session details including CSRF for client restore after reload. */
export function readWalletSessionDetails(
  request: Request,
): { wallet: string; csrf: string } | null {
  return readWalletSessionRow(request);
}

export function requireWalletSession(request: Request): string {
  const wallet = readWalletSession(request);
  if (!wallet) throw new Error("Wallet session required");
  return wallet;
}

export function assertCsrf(request: Request): boolean {
  const header = request.headers.get("x-csrf-token") ?? "";
  if (!header) return false;

  // Prefer session-bound CSRF (wallet or operator) over cookie-only compare.
  const walletRow = readWalletSessionRow(request);
  if (walletRow?.csrf) {
    try {
      if (timingSafeEqual(Buffer.from(walletRow.csrf), Buffer.from(header))) {
        return true;
      }
    } catch {
      if (walletRow.csrf === header) return true;
    }
  }
  const opRow = readOperatorSessionRow(request);
  if (opRow?.csrf) {
    try {
      if (timingSafeEqual(Buffer.from(opRow.csrf), Buffer.from(header))) {
        return true;
      }
    } catch {
      if (opRow.csrf === header) return true;
    }
  }

  // Fallback: classic double-submit against HttpOnly CSRF cookie
  const cookies = parseCookies(request);
  const cookieToken = cookies[COOKIE_CSRF];
  if (!cookieToken) return false;
  try {
    return timingSafeEqual(Buffer.from(cookieToken), Buffer.from(header));
  } catch {
    return cookieToken === header;
  }
}

export function operatorConfigured(): boolean {
  return Boolean(process.env.OPERATOR_TOKEN);
}

export function verifyOperatorPassword(password: string): boolean {
  const expected = process.env.OPERATOR_TOKEN ?? "";
  if (!expected) return false;
  try {
    return timingSafeEqual(Buffer.from(password), Buffer.from(expected));
  } catch {
    return password === expected;
  }
}

export function issueOperatorSession(): {
  setCookies: string[];
  csrf: string;
} {
  const sid = randomBytes(24).toString("hex");
  const csrf = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  store().operatorSessions.set(sid, { expiresAt, csrf });
  const signed = `${sid}.${sign(sid)}`;
  return {
    csrf,
    setCookies: [
      cookie(COOKIE_OPERATOR, signed, 8 * 60 * 60),
      cookie(COOKIE_CSRF, csrf, 8 * 60 * 60),
    ],
  };
}

function readOperatorSessionRow(
  request: Request,
): { csrf: string } | null {
  if (!secret()) return null;
  const cookies = parseCookies(request);
  const raw = cookies[COOKIE_OPERATOR];
  if (!raw) return null;
  const [sid, sig] = raw.split(".");
  if (!sid || !sig) return null;
  const expected = sign(sid);
  if (sig !== expected) return null;
  const row = store().operatorSessions.get(sid);
  if (!row || row.expiresAt < Date.now()) return null;
  return { csrf: row.csrf };
}

export function readOperatorSession(request: Request): boolean {
  return readOperatorSessionRow(request) !== null;
}

export function readOperatorSessionDetails(
  request: Request,
): { csrf: string } | null {
  return readOperatorSessionRow(request);
}

export function clearSessions(): string[] {
  return [
    clearCookie(COOKIE_WALLET),
    clearCookie(COOKIE_OPERATOR),
    clearCookie(COOKIE_CSRF),
  ];
}

export function resetSessionsForTests(): void {
  globalThis.__policyDeskSessions = {
    walletChallenges: new Map(),
    walletSessions: new Map(),
    operatorSessions: new Map(),
  };
}

export function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export { COOKIE_CSRF, COOKIE_OPERATOR, COOKIE_WALLET };
