/** Solana / USDC constants for Policy Desk (Devnet-only hackathon build). */

export const DEVNET_USDC_MINT =
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/** x402 V2 CAIP-2 id for Solana Devnet. */
export const X402_DEVNET_NETWORK =
  "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

export function solanaRpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    "https://api.devnet.solana.com"
  );
}

export function usdcMint(): string {
  return process.env.NEXT_PUBLIC_USDC_MINT ?? DEVNET_USDC_MINT;
}

export function solanaCluster(): "devnet" {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (cluster !== "devnet") {
    throw new Error("Policy Desk is Devnet-only for UBC Hackathon 2026");
  }
  return "devnet";
}

export function explorerTx(signature: string, cluster = "devnet"): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

export function explorerAddress(address: string, cluster = "devnet"): string {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}
