"use client";

import { shortKey } from "@/lib/format";

type TrustProps = {
  cluster: string;
  mint: string;
  wallet: string | null;
  allowlistCount: number;
  blockBeforeSign: boolean;
  streamsReconcile?: boolean;
  voiceReady?: boolean;
};

export function TrustStrip({
  cluster,
  mint,
  wallet,
  allowlistCount,
  blockBeforeSign,
  streamsReconcile = false,
  voiceReady = false,
}: TrustProps) {
  return (
    <ul className="trust-strip" aria-label="Trust controls">
      <li>
        <span className="trust-k">Network</span>
        <strong>{cluster}</strong>
      </li>
      <li>
        <span className="trust-k">USDC mint</span>
        <strong className="mono">{shortKey(mint, 6)}</strong>
      </li>
      <li>
        <span className="trust-k">Wallet</span>
        <strong className="mono">
          {wallet ? shortKey(wallet, 4) : "not connected"}
        </strong>
      </li>
      <li>
        <span className="trust-k">Allowlist</span>
        <strong>{allowlistCount} payees</strong>
      </li>
      <li>
        <span className="trust-k">Safety</span>
        <strong>
          {blockBeforeSign ? "block before sign" : "unchecked"}
        </strong>
      </li>
      <li>
        <span className="trust-k">Streams</span>
        <strong>{streamsReconcile ? "reconcile on" : "off"}</strong>
      </li>
      <li>
        <span className="trust-k">Voice</span>
        <strong>{voiceReady ? "ElevenLabs" : "unconfigured"}</strong>
      </li>
    </ul>
  );
}
