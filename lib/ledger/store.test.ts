import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { DEVNET_USDC_MINT } from "../solana/config";
import {
  createLedgerEntry,
  getLedgerEntry,
  resetLedgerForTests,
  setLedgerStatus,
  updateLedgerEntry,
  dailySpentBaseUnits,
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
});
