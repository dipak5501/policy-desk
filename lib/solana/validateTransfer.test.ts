import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { DEVNET_USDC_MINT } from "./config";
import {
  assertSignedMatchesPrepared,
  validateSignedUsdcTransfer,
} from "./validateTransfer";

function buildOkTx(from: Keypair, to: PublicKey, amount: bigint): Transaction {
  const mint = new PublicKey(DEVNET_USDC_MINT);
  const fromAta = getAssociatedTokenAddressSync(mint, from.publicKey);
  const toAta = getAssociatedTokenAddressSync(mint, to);
  // PublicKey bytes are valid base58 blockhash stand-ins for unit tests
  const blockhash = Keypair.generate().publicKey.toBase58();
  const tx = new Transaction({
    feePayer: from.publicKey,
    blockhash,
    lastValidBlockHeight: 100,
  }).add(
    createAssociatedTokenAccountIdempotentInstruction(
      from.publicKey,
      toAta,
      to,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      from.publicKey,
      amount,
      6,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );
  return tx;
}

describe("validateSignedUsdcTransfer", () => {
  const from = Keypair.generate();
  const to = Keypair.generate().publicKey;
  const amount = 100_000n;

  it("accepts ATA create + TransferChecked matching intent", () => {
    const tx = buildOkTx(from, to, amount);
    const result = validateSignedUsdcTransfer(tx, {
      fromOwner: from.publicKey.toBase58(),
      toOwner: to.toBase58(),
      mint: DEVNET_USDC_MINT,
      amountBaseUnits: amount.toString(),
    });
    assert.equal(result.ok, true);
  });

  it("rejects wrong amount", () => {
    const tx = buildOkTx(from, to, amount);
    const result = validateSignedUsdcTransfer(tx, {
      fromOwner: from.publicKey.toBase58(),
      toOwner: to.toBase58(),
      mint: DEVNET_USDC_MINT,
      amountBaseUnits: "1",
    });
    assert.equal(result.ok, false);
  });

  it("rejects extra malicious system transfer", () => {
    const tx = buildOkTx(from, to, amount);
    tx.add(
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: to,
        lamports: 1,
      }),
    );
    const result = validateSignedUsdcTransfer(tx, {
      fromOwner: from.publicKey.toBase58(),
      toOwner: to.toBase58(),
      mint: DEVNET_USDC_MINT,
      amountBaseUnits: amount.toString(),
    });
    assert.equal(result.ok, false);
  });

  it("rejects wrong recipient", () => {
    const other = Keypair.generate().publicKey;
    const tx = buildOkTx(from, to, amount);
    const result = validateSignedUsdcTransfer(tx, {
      fromOwner: from.publicKey.toBase58(),
      toOwner: other.toBase58(),
      mint: DEVNET_USDC_MINT,
      amountBaseUnits: amount.toString(),
    });
    assert.equal(result.ok, false);
  });

  it("binds signed message to preparedTxBase64", () => {
    const prepared = buildOkTx(from, to, amount);
    const preparedB64 = prepared
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64");
    const signed = Transaction.from(Buffer.from(preparedB64, "base64"));
    signed.partialSign(from);
    const match = assertSignedMatchesPrepared(signed, preparedB64);
    assert.equal(match.ok, true);

    const other = buildOkTx(from, Keypair.generate().publicKey, amount);
    const mismatch = assertSignedMatchesPrepared(
      signed,
      other
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64"),
    );
    assert.equal(mismatch.ok, false);
  });
});

