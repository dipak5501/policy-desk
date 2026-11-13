/** Map common Solana RPC failures into operator-readable copy. */

export function explainSolanaError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes("insufficient funds") ||
    lower.includes("insufficient lamports") ||
    lower.includes("attempt to debit an account but found no record of a prior credit")
  ) {
    return "Insufficient SOL for fees. Fund Devnet SOL at faucet.solana.com (≥0.02 SOL).";
  }
  if (
    lower.includes("insufficient") &&
    (lower.includes("token") || lower.includes("usdc") || lower.includes("custom program error: 0x1"))
  ) {
    return "Insufficient Devnet USDC. Fund at faucet.circle.com (Solana / Devnet / USDC).";
  }
  if (lower.includes("blockhash not found") || lower.includes("block height exceeded")) {
    return "Transaction expired (stale blockhash). Re-run Prepare to get a fresh simulation.";
  }
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many requests")) {
    return "RPC rate-limited. Retry in a few seconds or use a private Devnet endpoint.";
  }
  return msg;
}
