import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  createLedgerEntry,
  resetLedgerForTests,
  setLedgerStatus,
  updateLedgerEntry,
  getLedgerEntry,
  dailySpentBaseUnits,
} from "../ledger/store";
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
  allowlistedDomains: ["localhost"],
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
      },
      config,
      dailySpentBaseUnits(),
    );
    assert.equal(decision.status, "block");
    if (decision.status === "block") {
      assert.equal(decision.code, "over_daily_cap");
    }
  });
});
