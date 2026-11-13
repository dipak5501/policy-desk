import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import { getConnection } from "./connection";
import { usdcMint } from "./config";

export type WalletBalances = {
  address: string;
  sol: number;
  solLamports: string;
  usdc: number;
  usdcBaseUnits: string;
  mint: string;
  hasUsdcAta: boolean;
  feeHintSol: number;
  canCoverFee: boolean;
};

export async function fetchBalances(address: string): Promise<WalletBalances> {
  const connection = getConnection();
  const owner = new PublicKey(address);
  const mint = usdcMint();
  const mintKey = new PublicKey(mint);

  const lamports = await connection.getBalance(owner, "confirmed");
  const sol = lamports / LAMPORTS_PER_SOL;
  const feeHintSol = 0.00001;
  const canCoverFee = sol >= 0.02;

  const ata = getAssociatedTokenAddressSync(mintKey, owner);
  let usdcBaseUnits = 0n;
  let hasUsdcAta = false;
  try {
    const account = await getAccount(connection, ata);
    usdcBaseUnits = account.amount;
    hasUsdcAta = true;
  } catch (err) {
    if (!(err instanceof TokenAccountNotFoundError)) {
      /* treat missing ATA as zero */
    }
  }

  return {
    address,
    sol,
    solLamports: lamports.toString(),
    usdc: Number(usdcBaseUnits) / 1_000_000,
    usdcBaseUnits: usdcBaseUnits.toString(),
    mint,
    hasUsdcAta,
    feeHintSol,
    canCoverFee,
  };
}
