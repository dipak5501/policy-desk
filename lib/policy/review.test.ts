import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEVNET_USDC_MINT } from "../solana/config";
import { DEMO_PAYEE, DEMO_X402_RESOURCE } from "./config";
import { reviewSpend, withSessionPayee, SPL_TRANSFER_RESOURCE } from "./review";
import type { PolicyConfig } from "./types";

const config: PolicyConfig = {
  perTxCapBaseUnits: 1_000_000n,
  dailyCapBaseUnits: 5_000_000n,
  approvalThresholdBaseUnits: 500_000n,
  allowlistedPayees: [DEMO_PAYEE],
  allowlistedResources: [
    DEMO_X402_RESOURCE,
    "/api/x402/market",
    "/api/x402/research",
    "spl:transfer",
  ],
  allowlistedDomains: ["localhost", "127.0.0.1"],
  allowedMint: DEVNET_USDC_MINT,
  paused: false,
};

const trusted = { trustedOrigin: "http://127.0.0.1:3000" };

describe("reviewSpend", () => {
  it("blocks non-allowlisted merchant before any signature", () => {
    const d = reviewSpend(
      {
        resource: "https://evil.example/drain",
        payee: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        amountBaseUnits: 100_000n,
        mint: DEVNET_USDC_MINT,
      },
      config,
    );
    assert.equal(d.status, "block");
  });

  it("requires human approval above threshold", () => {
    const d = reviewSpend(
      {
        resource: DEMO_X402_RESOURCE,
        payee: DEMO_PAYEE,
        amountBaseUnits: 600_000n,
        mint: DEVNET_USDC_MINT,
        ...trusted,
      },
      config,
    );
    assert.equal(d.status, "needs_approval");
  });

  it("allows under-threshold allowlisted spend", () => {
    const d = reviewSpend(
      {
        resource: DEMO_X402_RESOURCE,
        payee: DEMO_PAYEE,
        amountBaseUnits: 100_000n,
        mint: DEVNET_USDC_MINT,
        ...trusted,
      },
      config,
    );
    assert.equal(d.status, "allow");
  });

  it("blocks over per-tx cap", () => {
    const d = reviewSpend(
      {
        resource: DEMO_X402_RESOURCE,
        payee: DEMO_PAYEE,
        amountBaseUnits: 2_000_000n,
        mint: DEVNET_USDC_MINT,
        ...trusted,
      },
      config,
    );
    assert.equal(d.status, "block");
    if (d.status === "block") assert.equal(d.code, "over_per_tx_cap");
  });

  it("allows session self-pay payee on spl:transfer", () => {
    const wallet = "So11111111111111111111111111111111111111112";
    const cfg = withSessionPayee(config, wallet);
    const d = reviewSpend(
      {
        resource: SPL_TRANSFER_RESOURCE,
        payee: wallet,
        amountBaseUnits: 100_000n,
        mint: DEVNET_USDC_MINT,
      },
      cfg,
    );
    assert.equal(d.status, "allow");
  });

  it("allows relative catalog paths with query strings", () => {
    const d = reviewSpend(
      {
        resource: "/api/x402/research?amount=600000",
        payee: DEMO_PAYEE,
        amountBaseUnits: 600_000n,
        mint: DEVNET_USDC_MINT,
        ...trusted,
      },
      config,
    );
    assert.equal(d.status, "needs_approval");
  });
});
