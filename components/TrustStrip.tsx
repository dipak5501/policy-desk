"use client";

import { shortKey } from "@/lib/format";

type TrustProps = {
  cluster: string;
  mint: string;
  wallet: string | null;
  allowlistCount: number;
  blockBeforeSign: boolean;
};

export function TrustStrip({
  cluster,
  mint,
  wallet,
  allowlistCount,
  blockBeforeSign,
}: TrustProps) {
  return (
    <section className="trust-strip" aria-label="Trust controls">
      <div>
        <span className="trust-k">Network</span>
        <strong>{cluster}</strong>
      </div>
      <div>
        <span className="trust-k">USDC mint</span>
        <strong className="mono">{shortKey(mint, 6)}</strong>
      </div>
      <div>
        <span className="trust-k">Wallet</span>
        <strong className="mono">
          {wallet ? shortKey(wallet, 4) : "not connected"}
        </strong>
      </div>
      <div>
        <span className="trust-k">Allowlist</span>
        <strong>{allowlistCount} payees</strong>
      </div>
      <div>
        <span className="trust-k">Safety</span>
        <strong>
          {blockBeforeSign ? "block before sign" : "unchecked"}
        </strong>
      </div>
    </section>
  );
}
