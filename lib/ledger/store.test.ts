import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it, beforeEach } from "node:test";
import { DEVNET_USDC_MINT } from "../solana/config";
import { closeLedgerDb } from "./db";
import {
  createLedgerEntry,
  createTask,
  dailySpentBaseUnits,
  getLedgerEntry,
  reopenLedgerFromDisk,
  reservedBaseUnits,
  resetLedgerForTests,
  setLedgerStatus,
  updateLedgerEntry,
  withLedgerLock,
} from "./store";

describe("ledger store", () => {
  beforeEach(() => {
    resetLedgerForTests();
  });

  it("rejects mutating immutable intent fields", () => {
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

  it("reserves pending spends against daily cap", () => {
    const a = createLedgerEntry({
      label: "a",
      resource: "/api/x402/weather",
      payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      amountBaseUnits: "4500000",
      mint: DEVNET_USDC_MINT,
    });
    setLedgerStatus(a.id, "awaiting_approval");
    assert.equal(dailySpentBaseUnits(), 4_500_000n);
  });

  it("counts concurrent reservations once under withLedgerLock", async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        withLedgerLock(async () => {
          const entry = createLedgerEntry({
            label: `concurrent-${i}`,
            resource: "/api/x402/weather",
            payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
            amountBaseUnits: "100000",
            mint: DEVNET_USDC_MINT,
            taskId: "task-concurrent",
          });
          setLedgerStatus(entry.id, "awaiting_approval");
          return entry.id;
        }),
      ),
    );
    assert.equal(results.length, 5);
    assert.equal(reservedBaseUnits("task-concurrent"), 500_000n);
    assert.equal(dailySpentBaseUnits(), 500_000n);
  });
});

describe("ledger SQLite restart persistence", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "policy-desk-ledger-"));
  const dbPath = path.join(dir, "ledger.sqlite");

  after(() => {
    closeLedgerDb();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    delete process.env.LEDGER_DB_PATH;
  });

  it("survives process restart without double-counting reservation", () => {
    resetLedgerForTests(dbPath);

    const entry = createLedgerEntry({
      label: "persist-me",
      resource: "/api/x402/market",
      payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      amountBaseUnits: "250000",
      mint: DEVNET_USDC_MINT,
      taskId: "task-persist",
      resourceId: "market-pulse",
    });
    setLedgerStatus(entry.id, "awaiting_approval");
    assert.equal(reservedBaseUnits("task-persist"), 250_000n);
    const entryId = entry.id;

    // Simulate process kill: close DB + drop in-memory cache
    closeLedgerDb();
    process.env.LEDGER_DB_PATH = dbPath;
    reopenLedgerFromDisk();

    const restored = getLedgerEntry(entryId);
    assert.ok(restored);
    assert.equal(restored.status, "awaiting_approval");
    assert.equal(restored.amountBaseUnits, "250000");
    assert.equal(reservedBaseUnits("task-persist"), 250_000n);
    assert.equal(dailySpentBaseUnits(), 250_000n);
  });
});

describe("task ownership helpers", () => {
  beforeEach(() => {
    resetLedgerForTests();
  });

  it("binds ownerWallet on createTask", () => {
    const task = createTask({
      prompt: "test",
      budgetBaseUnits: "1000000",
      ownerWallet: "WalletA111111111111111111111111111111111",
    });
    assert.equal(task.ownerWallet, "WalletA111111111111111111111111111111111");
  });
});
