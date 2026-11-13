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
  allowlistedResources: ["/api/x402/weather", "spl:transfer"],
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
    setLedgerStatus(entry.id, "settled", { signature: "fakeSigForTest" });
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
    setLedgerStatus(entry.id, "settled", { signature: "fakeSigForTest" });
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
});
