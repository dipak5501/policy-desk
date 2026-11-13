import {
  Connection,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { usdcMint } from "./config";
import { getConnection } from "./connection";

const USDC_DECIMALS = 6;

export type BuildTransferArgs = {
  fromOwner: string;
  toOwner: string;
  amountBaseUnits: bigint;
  mint?: string;
  connection?: Connection;
};

export type BuiltTransfer = {
  transaction: Transaction;
  instructions: TransactionInstruction[];
  fromAta: string;
  toAta: string;
  mint: string;
  amountBaseUnits: string;
};

export async function buildUsdcTransfer(
  args: BuildTransferArgs,
): Promise<BuiltTransfer> {
  const connection = args.connection ?? getConnection();
  const mint = new PublicKey(args.mint ?? usdcMint());
  const fromOwner = new PublicKey(args.fromOwner);
  const toOwner = new PublicKey(args.toOwner);

  const fromAta = getAssociatedTokenAddressSync(mint, fromOwner);
  const toAta = getAssociatedTokenAddressSync(mint, toOwner);

  const instructions: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(
      fromOwner,
      toAta,
      toOwner,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      fromOwner,
      args.amountBaseUnits,
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID,
    ),
  ];

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const transaction = new Transaction({
    feePayer: fromOwner,
    blockhash,
    lastValidBlockHeight,
  }).add(...instructions);

  return {
    transaction,
    instructions,
    fromAta: fromAta.toBase58(),
    toAta: toAta.toBase58(),
    mint: mint.toBase58(),
    amountBaseUnits: args.amountBaseUnits.toString(),
  };
}

export function serializeTransactionBase64(tx: Transaction): string {
  return Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");
}

export type SimulateResult = {
  ok: boolean;
  unitsConsumed?: number;
  logs?: string[];
  error?: string;
  feeLamportsEstimate: number;
};

/** Dry-run before Phantom: simulate the unsigned transfer. */
export async function simulateTransfer(
  tx: Transaction,
  connection?: Connection,
): Promise<SimulateResult> {
  const conn = connection ?? getConnection();
  try {
    const result = await conn.simulateTransaction(tx);
    if (result.value.err) {
      return {
        ok: false,
        unitsConsumed: result.value.unitsConsumed ?? undefined,
        logs: result.value.logs ?? undefined,
        error: JSON.stringify(result.value.err),
        feeLamportsEstimate: 5000,
      };
    }
    return {
      ok: true,
      unitsConsumed: result.value.unitsConsumed ?? undefined,
      logs: result.value.logs ?? undefined,
      feeLamportsEstimate: 5000,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      feeLamportsEstimate: 5000,
    };
  }
}
