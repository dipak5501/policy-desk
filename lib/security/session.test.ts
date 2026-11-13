import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import {
  assertCsrf,
  consumeWalletChallenge,
  createWalletChallenge,
  getWalletChallenge,
  issueOperatorSession,
  issueWalletSession,
  readOperatorSessionDetails,
  readWalletSessionDetails,
  resetSessionsForTests,
} from "./session";

describe("wallet challenge binding", () => {
  const prevSecret = process.env.SESSION_SECRET;
  const prevOp = process.env.OPERATOR_TOKEN;

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret-for-unit-tests";
    process.env.OPERATOR_TOKEN = "test-operator";
    resetSessionsForTests();
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
    if (prevOp === undefined) delete process.env.OPERATOR_TOKEN;
    else process.env.OPERATOR_TOKEN = prevOp;
    resetSessionsForTests();
  });

  it("stores the exact challenge message server-side", () => {
    const wallet = Keypair.generate().publicKey.toBase58();
    const issued = createWalletChallenge(wallet);
    const stored = getWalletChallenge(wallet);
    assert.ok(stored);
    assert.equal(stored!.message, issued.message);
    assert.equal(stored!.nonce, issued.nonce);
    assert.match(stored!.message, new RegExp(issued.nonce));
  });

  it("verifies signature against stored message and consumes only after success", () => {
    const kp = Keypair.generate();
    const wallet = kp.publicKey.toBase58();
    const issued = createWalletChallenge(wallet);
    const stored = getWalletChallenge(wallet)!;

    // Client-supplied alternate message must not match stored
    const evilMsg = "Policy Desk wallet login\nWallet: attacker\nNonce: deadbeef";
    assert.notEqual(evilMsg, stored.message);

    const badSig = nacl.sign.detached(
      new TextEncoder().encode(evilMsg),
      kp.secretKey,
    );
    const badOk = nacl.sign.detached.verify(
      new TextEncoder().encode(stored.message),
      badSig,
      kp.publicKey.toBytes(),
    );
    assert.equal(badOk, false);
    // Challenge still present after failed verification path
    assert.ok(getWalletChallenge(wallet));

    const goodSig = nacl.sign.detached(
      new TextEncoder().encode(stored.message),
      kp.secretKey,
    );
    const goodOk = nacl.sign.detached.verify(
      new TextEncoder().encode(stored.message),
      goodSig,
      kp.publicKey.toBytes(),
    );
    assert.equal(goodOk, true);
    assert.equal(consumeWalletChallenge(wallet, issued.nonce), true);
    assert.equal(getWalletChallenge(wallet), null);
    // Second consume fails
    assert.equal(consumeWalletChallenge(wallet, issued.nonce), false);
  });

  it("issues CSRF in session JSON path and assertCsrf checks header vs session", () => {
    const wallet = Keypair.generate().publicKey.toBase58();
    const session = issueWalletSession(wallet);
    const cookieHeader = session.setCookies
      .map((c) => c.split(";")[0])
      .join("; ");
    const req = new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": session.csrf,
      },
    });
    const details = readWalletSessionDetails(req);
    assert.ok(details);
    assert.equal(details!.wallet, wallet);
    assert.equal(details!.csrf, session.csrf);
    assert.equal(assertCsrf(req), true);

    const noHeader = new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
    assert.equal(assertCsrf(noHeader), false);
  });

  it("operator session returns CSRF for client restore without readable cookie access", () => {
    const session = issueOperatorSession();
    const cookieHeader = session.setCookies
      .map((c) => c.split(";")[0])
      .join("; ");
    const req = new Request("http://localhost/api/operator/session", {
      headers: { cookie: cookieHeader },
    });
    const details = readOperatorSessionDetails(req);
    assert.ok(details);
    assert.equal(details!.csrf, session.csrf);
    // Cookie is HttpOnly in Set-Cookie attribute — clients must use JSON csrf
    assert.match(session.setCookies[1]!, /HttpOnly/);
  });
});
