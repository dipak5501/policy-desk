import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE_WALLET = "pd_wallet_session";
const COOKIE_OPERATOR = "pd_operator_session";
const COOKIE_CSRF = "pd_csrf";

type SessionStore = {
  walletChallenges: Map<string, { nonce: string; expiresAt: number }>;
  walletSessions: Map<string, { wallet: string; expiresAt: number }>;
  operatorSessions: Map<string, { expiresAt: number }>;
};

declare global {
  // eslint-disable-next-line no-var
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
  store().walletChallenges.set(wallet, { nonce, expiresAt });
  const message = `Policy Desk wallet login\nWallet: ${wallet}\nNonce: ${nonce}\nExpires: ${new Date(expiresAt).toISOString()}`;
  return { nonce, message, expiresAt: new Date(expiresAt).toISOString() };
}

export function consumeWalletChallenge(
  wallet: string,
  nonce: string,
): boolean {
  const row = store().walletChallenges.get(wallet);
  store().walletChallenges.delete(wallet);
  if (!row) return false;
  if (row.expiresAt < Date.now()) return false;
  return row.nonce === nonce;
}

export function issueWalletSession(wallet: string): {
  setCookies: string[];
  csrf: string;
} {
  const sid = randomBytes(24).toString("hex");
  const csrf = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  store().walletSessions.set(sid, { wallet, expiresAt });
  const signed = `${sid}.${sign(sid)}`;
  return {
    csrf,
    setCookies: [
      cookie(COOKIE_WALLET, signed, 12 * 60 * 60),
      cookie(COOKIE_CSRF, csrf, 12 * 60 * 60),
    ],
  };
}

export function readWalletSession(request: Request): string | null {
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
      // length mismatch throws — treat as invalid
      return null;
    }
  } catch {
    if (sig !== expected) return null;
  }
  const row = store().walletSessions.get(sid);
  if (!row || row.expiresAt < Date.now()) return null;
  return row.wallet;
}

export function requireWalletSession(request: Request): string {
  const wallet = readWalletSession(request);
  if (!wallet) throw new Error("Wallet session required");
  return wallet;
}

export function assertCsrf(request: Request): boolean {
  const cookies = parseCookies(request);
  const cookieToken = cookies[COOKIE_CSRF];
  const header = request.headers.get("x-csrf-token") ?? "";
  if (!cookieToken || !header) return false;
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
  store().operatorSessions.set(sid, { expiresAt });
  const signed = `${sid}.${sign(sid)}`;
  return {
    csrf,
    setCookies: [
      cookie(COOKIE_OPERATOR, signed, 8 * 60 * 60),
      cookie(COOKIE_CSRF, csrf, 8 * 60 * 60),
    ],
  };
}

export function readOperatorSession(request: Request): boolean {
  if (!secret()) return false;
  const cookies = parseCookies(request);
  const raw = cookies[COOKIE_OPERATOR];
  if (!raw) return false;
  const [sid, sig] = raw.split(".");
  if (!sid || !sig) return false;
  const expected = sign(sid);
  if (sig !== expected) return false;
  const row = store().operatorSessions.get(sid);
  if (!row || row.expiresAt < Date.now()) return false;
  return true;
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
