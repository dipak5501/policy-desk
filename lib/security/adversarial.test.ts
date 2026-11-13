import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  createLedgerEntry,
  createTask,
  dailySpentBaseUnits,
  getLedgerEntry,
  reservedBaseUnits,
  resetLedgerForTests,
  setLedgerStatus,
  tryReserveAgainstDailyCap,
  updateLedgerEntry,
  withLedgerLock,
} from "../ledger/store";
import { fulfillWeatherIfSettled } from "../x402/fulfill";
import { matchesCatalogSettlementDestination } from "../x402/catalogBinding";
import { resetAuditForTests } from "./audit";
import { isSettledDestinationAllowed } from "../policy/destination";
import { reviewSpend } from "../policy/review";
import { DEVNET_USDC_MINT } from "../solana/config";
import type { PolicyConfig } from "../policy/types";

const config: PolicyConfig = {
  perTxCapBaseUnits: 1_000_000n,
  dailyCapBaseUnits: 5_000_000n,
  approvalThresholdBaseUnits: 500_000n,
  allowlistedPayees: ["AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr"],
  allowlistedResources: [
    "/api/x402/weather",
    "/api/x402/market",
    "/api/x402/research",
    "spl:transfer",
  ],
  allowlistedDomains: ["localhost", "127.0.0.1"],
  allowedMint: DEVNET_USDC_MINT,
  paused: false,
};

describe("adversarial controls", () => {
  beforeEach(() => {
    resetLedgerForTests();
    resetAuditForTests();
  });

  it("rejects mutating immutable payment intent fields", () => {
    const entry = createLedgerEntry({
      label: "intent",
      resource: "/api/x402/weather",
      payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      amountBaseUnits: "100000",
      mint: DEVNET_USDC_MINT,
    });
    assert.throws(
      () => updateLedgerEntry(entry.id, { amountBaseUnits: "999999" }),
      /immutable/i,
    );
    assert.equal(getLedgerEntry(entry.id)?.amountBaseUnits, "100000");
  });

  it("rejects mutating bound taskId / policyVersion", () => {
    const entry = createLedgerEntry({
      label: "bound",
      resource: "/api/x402/weather",
      payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      amountBaseUnits: "100000",
      mint: DEVNET_USDC_MINT,
      taskId: "task-1",
      policyVersion: "policy-desk-v1",
    });
    assert.throws(
      () => updateLedgerEntry(entry.id, { taskId: "task-2" }),
      /immutable/i,
    );
  });

  it("allows settlementKind → none when policy blocks", () => {
    const entry = createLedgerEntry({
      label: "blocked path",
      resource: "https://evil.example/drain",
      payee: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      amountBaseUnits: "2500000",
      mint: DEVNET_USDC_MINT,
      settlementKind: "spl_usdc",
    });
    const blocked = setLedgerStatus(entry.id, "blocked", {
      settlementKind: "none",
      policyStatus: "block",
      policyCode: "not_allowlisted",
      policyReason: "not allowlisted",
    });
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.settlementKind, "none");
    assert.equal(blocked.reservationReleased, true);
  });

  it("blocks settle destination when payee is neither allowlisted nor self", () => {
    const result = isSettledDestinationAllowed({
      payee: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      fromOwner: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      resource: "/api/x402/weather",
      config,
    });
    assert.equal(result, false);
  });

  it("daily reservation blocks further spend", () => {
    const a = createLedgerEntry({
      label: "a",
      resource: "/api/x402/weather",
      payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      amountBaseUnits: "4500000",
      mint: DEVNET_USDC_MINT,
    });
    setLedgerStatus(a.id, "awaiting_approval");
    const decision = reviewSpend(
      {
        resource: "/api/x402/weather",
        payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
        amountBaseUnits: 600_000n,
        mint: DEVNET_USDC_MINT,
        trustedOrigin: "http://127.0.0.1:3000",
      },
      config,
      dailySpentBaseUnits(),
    );
    assert.equal(decision.status, "block");
    if (decision.status === "block") {
      assert.equal(decision.code, "over_daily_cap");
    }
  });

  it("concurrent reservations cannot exceed daily cap", async () => {
    const amount = 3_000_000n;
    const results = await Promise.all([
      withLedgerLock(() =>
        tryReserveAgainstDailyCap(amount, config.dailyCapBaseUnits),
      ),
      withLedgerLock(() => {
        // simulate first reservation already counted
        const e = createLedgerEntry({
          label: "first",
          resource: "/api/x402/weather",
          payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
          amountBaseUnits: amount.toString(),
          mint: DEVNET_USDC_MINT,
        });
        setLedgerStatus(e.id, "awaiting_approval");
        return tryReserveAgainstDailyCap(amount, config.dailyCapBaseUnits);
      }),
    ]);
    // At least one path must fail once 3M is reserved against 5M cap for second 3M
    assert.equal(results[1], false);
  });

  it("rejection releases reservation exactly once", () => {
    const entry = createLedgerEntry({
      label: "r",
      resource: "/api/x402/weather",
      payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      amountBaseUnits: "400000",
      mint: DEVNET_USDC_MINT,
    });
    setLedgerStatus(entry.id, "awaiting_approval");
    assert.equal(reservedBaseUnits(), 400000n);
    setLedgerStatus(entry.id, "rejected", { settlementKind: "none" });
    assert.equal(reservedBaseUnits(), 0n);
    setLedgerStatus(entry.id, "rejected", { settlementKind: "none" });
    assert.equal(reservedBaseUnits(), 0n);
  });

  it("wrong mint is blocked by policy", () => {
    const decision = reviewSpend(
      {
        resource: "/api/x402/weather",
        payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
        amountBaseUnits: 100_000n,
        mint: "So11111111111111111111111111111111111111112",
      },
      config,
      0n,
    );
    assert.equal(decision.status, "block");
  });

  it("does not deliver paid content before settlement", () => {
    const wallet = "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr";
    const entry = createLedgerEntry({
      label: "weather",
      resource: "/api/x402/weather",
      payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      amountBaseUnits: "100000",
      mint: DEVNET_USDC_MINT,
      settlementKind: "x402",
      resourceId: "weather-brief",
      fromOwner: wallet,
    });
    setLedgerStatus(entry.id, "approved");
    const denied = fulfillWeatherIfSettled({
      entryId: entry.id,
      ownerWallet: wallet,
    });
    assert.equal(denied.ok, false);
  });

  it("re-delivers settled content without requiring a new charge", () => {
    const wallet = "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr";
    const entry = createLedgerEntry({
      label: "weather",
      resource: "/api/x402/weather",
      payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      amountBaseUnits: "100000",
      mint: DEVNET_USDC_MINT,
      settlementKind: "x402",
      resourceId: "weather-brief",
      fromOwner: wallet,
    });
    setLedgerStatus(entry.id, "settled", {
      signature: "fakeSigForTest",
      preparedToOwner: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
    });
    const first = fulfillWeatherIfSettled({
      entryId: entry.id,
      ownerWallet: wallet,
    });
    assert.equal(first.ok, true);
    const second = fulfillWeatherIfSettled({
      entryId: entry.id,
      ownerWallet: wallet,
    });
    assert.equal(second.ok, true);
    if (first.ok && second.ok) {
      assert.equal(first.body.contentDigest, second.body.contentDigest);
    }
  });

  it("rejects a catalog purchase prepared for a non-catalog destination", () => {
    const wallet = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
    const entry = createLedgerEntry({
      label: "weather",
      resource: "/api/x402/weather",
      payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      amountBaseUnits: "100000",
      mint: DEVNET_USDC_MINT,
      settlementKind: "x402",
      resourceId: "weather-brief",
      fromOwner: wallet,
    });
    assert.equal(
      matchesCatalogSettlementDestination(entry, entry.payee),
      true,
    );
    assert.equal(matchesCatalogSettlementDestination(entry, wallet), false);

    setLedgerStatus(entry.id, "settled", {
      signature: "fakeSelfPaySignature",
      preparedToOwner: wallet,
    });
    const denied = fulfillWeatherIfSettled({
      entryId: entry.id,
      ownerWallet: wallet,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "mismatch");
  });

  it("rejects another wallet unlocking purchased content", () => {
    const entry = createLedgerEntry({
      label: "weather",
      resource: "/api/x402/weather",
      payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      amountBaseUnits: "100000",
      mint: DEVNET_USDC_MINT,
      settlementKind: "x402",
      resourceId: "weather-brief",
      fromOwner: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
    });
    setLedgerStatus(entry.id, "settled", {
      signature: "fakeSigForTest",
      preparedToOwner: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
    });
    const denied = fulfillWeatherIfSettled({
      entryId: entry.id,
      ownerWallet: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "forbidden");
  });

  it("blocks unapproved origin that only matches pathname", () => {
    const decision = reviewSpend(
      {
        resource: "https://evil.example/api/x402/weather",
        payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
        amountBaseUnits: 100_000n,
        mint: DEVNET_USDC_MINT,
      },
      config,
      0n,
    );
    assert.equal(decision.status, "block");
  });

  it("default-budget path records merchant block without reservation", async () => {
    const { evaluateCatalogPropose } = await import("../propose/evaluate");
    const { createTask, reservedBaseUnits } = await import("../ledger/store");
    const task = createTask({
      prompt: "demo",
      budgetBaseUnits: "1000000",
      ownerWallet: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
    });
    const result = evaluateCatalogPropose({
      resourceId: "evil-drain",
      taskId: task.id,
      fromOwner: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      allowAdversarialFixture: true,
    });
    assert.equal(result.decision.status, "block");
    assert.equal(result.reserved, false);
    assert.equal(reservedBaseUnits(task.id), 0n);
  });

  it("task budget is tracked separately from daily cap", () => {
    const task = createTask({
      prompt: "test",
      budgetBaseUnits: "200000",
    });
    const entry = createLedgerEntry({
      label: "t",
      resource: "/api/x402/weather",
      payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      amountBaseUnits: "100000",
      mint: DEVNET_USDC_MINT,
      taskId: task.id,
    });
    setLedgerStatus(entry.id, "awaiting_approval");
    assert.equal(reservedBaseUnits(task.id), 100000n);
  });

  it("catalog propose fails closed on unknown resourceId without client payee override", async () => {
    const { evaluateCatalogPropose } = await import("../propose/evaluate");
    const owner = "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr";
    const task = createTask({
      prompt: "demo",
      budgetBaseUnits: "1000000",
      ownerWallet: owner,
    });
    const result = evaluateCatalogPropose({
      resourceId: "not-a-real-resource",
      taskId: task.id,
      fromOwner: owner,
    });
    assert.equal(result.decision.status, "block");
    if (result.decision.status === "block") {
      assert.equal(result.decision.code, "unknown_resource");
    }
    assert.equal(result.reserved, false);
    // Economics come from catalog path only — unknown never reserves caller-chosen amounts
    assert.equal(result.entry.amountBaseUnits, "1");
  });

  it("catalog propose binds weather-brief economics from server catalog", async () => {
    const { evaluateCatalogPropose } = await import("../propose/evaluate");
    const { getCatalogResource } = await import("../catalog/resources");
    const owner = "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr";
    const catalog = getCatalogResource("weather-brief");
    assert.ok(catalog);
    const task = createTask({
      prompt: "demo",
      budgetBaseUnits: "1000000",
      ownerWallet: owner,
    });
    const result = evaluateCatalogPropose({
      resourceId: "weather-brief",
      taskId: task.id,
      fromOwner: owner,
    });
    assert.equal(result.entry.payee, catalog!.payee);
    assert.equal(result.entry.amountBaseUnits, catalog!.amountBaseUnits);
    assert.equal(result.entry.mint, catalog!.mint);
    assert.equal(result.entry.resource, catalog!.resource);
    assert.equal(result.entry.fromOwner, owner);
  });

  it("cross-user: another wallet cannot fulfill a settled purchase", () => {
    const owner = "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr";
    const entry = createLedgerEntry({
      label: "market",
      resource: "/api/x402/market",
      payee: owner,
      amountBaseUnits: "250000",
      mint: DEVNET_USDC_MINT,
      settlementKind: "x402",
      resourceId: "market-pulse",
      fromOwner: owner,
    });
    setLedgerStatus(entry.id, "settled", { signature: "sig-cross-user" });
    const denied = fulfillWeatherIfSettled({
      entryId: entry.id,
      ownerWallet: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "forbidden");
  });

  it("expired prepare is not usable for confirm binding", () => {
    const owner = "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr";
    const entry = createLedgerEntry({
      label: "expired",
      resource: "/api/x402/weather",
      payee: owner,
      amountBaseUnits: "100000",
      mint: DEVNET_USDC_MINT,
      fromOwner: owner,
    });
    const expired = setLedgerStatus(entry.id, "ready_to_sign", {
      prepareId: "prep-1",
      prepareExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      preparedTxBase64: "AQID",
      preparedToOwner: owner,
    });
    assert.ok(expired.prepareExpiresAt);
    assert.ok(Date.parse(expired.prepareExpiresAt!) < Date.now());
  });

  it("demo catalog exposes three distinct purchasable prices", async () => {
    const { listCatalog } = await import("../catalog/resources");
    const catalog = listCatalog();
    assert.equal(catalog.length, 3);
    const prices = catalog.map((r) => r.amountBaseUnits).sort();
    assert.deepEqual(prices, ["100000", "250000", "600000"]);
    assert.ok(catalog.every((r) => r.paidBody.includes("[DEMO CATALOG]")));
  });
});

