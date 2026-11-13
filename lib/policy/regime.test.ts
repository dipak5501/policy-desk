import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEVNET_USDC_MINT } from "../solana/config";
import { DEMO_PAYEE } from "./config";
import { deriveRegime, proposalRiskScore } from "./regime";
import type { PolicyConfig } from "./types";

const config: PolicyConfig = {
  perTxCapBaseUnits: 1_000_000n,
  dailyCapBaseUnits: 5_000_000n,
  approvalThresholdBaseUnits: 500_000n,
  allowlistedPayees: [DEMO_PAYEE],
  allowlistedResources: ["/api/x402/weather"],
  allowlistedDomains: ["localhost"],
  allowedMint: DEVNET_USDC_MINT,
  paused: false,
};

describe("regime", () => {
  it("labels ample capacity as aggressive", () => {
    const r = deriveRegime(config, 0n);
    assert.equal(r.regime, "aggressive");
  });

  it("labels tight headroom as defensive", () => {
    const r = deriveRegime(config, 4_000_000n);
    assert.equal(r.regime, "defensive");
  });

  it("scores blocked proposals higher", () => {
    const blocked = proposalRiskScore({
      amountBaseUnits: 2_500_000n,
      config,
      decision: { status: "block", code: "not_allowlisted", reason: "no" },
      resource: "https://evil.example/x",
      allowlisted: false,
    });
    const ok = proposalRiskScore({
      amountBaseUnits: 100_000n,
      config,
      decision: { status: "allow", reason: "ok" },
      resource: "/api/x402/weather",
      allowlisted: true,
    });
    assert.ok(blocked > ok);
  });
});
