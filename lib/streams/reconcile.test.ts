import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { DEVNET_USDC_MINT } from "../solana/config";
import {
  createLedgerEntry,
  listStreamEvents,
  resetLedgerForTests,
  streamReconcileStats,
  updateLedgerEntry,
} from "../ledger/store";
import { reconcileStreamPayload } from "./reconcile";

describe("streams reconcile", () => {
  beforeEach(() => {
    resetLedgerForTests();
  });

  it("marks matched when signature exists on a ledger settle", () => {
    const entry = createLedgerEntry({
      label: "weather brief",
      resource: "/api/x402/weather",
      payee: "AxYkHSSywB5pxa4GCwnmwp8ArnR8z8EoqQu2RsbAFpMr",
      amountBaseUnits: "100000",
      mint: DEVNET_USDC_MINT,
    });
    updateLedgerEntry(entry.id, {
      status: "settled",
      signature: "SettleSig1111111111111111111111111111111111111",
    });

    const result = reconcileStreamPayload({
      signature: "SettleSig1111111111111111111111111111111111111",
      raw: { signature: "SettleSig1111111111111111111111111111111111111" },
    });

    assert.equal(result.matchStatus, "matched");
    assert.equal(result.matchedEntryId, entry.id);
    assert.equal(result.event.matchStatus, "matched");
    assert.equal(streamReconcileStats().matched, 1);
  });

  it("marks unmatched when signature is unknown", () => {
    const result = reconcileStreamPayload({
      signature: "UnknownSig222222222222222222222222222222222222",
    });
    assert.equal(result.matchStatus, "unmatched");
    assert.equal(result.matchedEntryId, undefined);
    assert.equal(streamReconcileStats().unmatched, 1);
    assert.equal(listStreamEvents(1)[0]?.matchStatus, "unmatched");
  });

  it("marks no_signature when payload lacks a signature", () => {
    const result = reconcileStreamPayload({ raw: { note: "noise" } });
    assert.equal(result.matchStatus, "no_signature");
    assert.equal(streamReconcileStats().noSignature, 1);
  });
});
