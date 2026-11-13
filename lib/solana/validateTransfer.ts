import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  decodeTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";

export type ExpectedUsdcTransfer = {
  fromOwner: string;
  toOwner: string;
  mint: string;
  amountBaseUnits: string;
  /** When true, fee payer must equal fromOwner. */
  requireFeePayerIsAuthority?: boolean;
};

export type ValidateTransferResult =
  | { ok: true; fromAta: string; toAta: string }
  | { ok: false; error: string };

const TRANSFER_CHECKED = 12;

/**
 * Validate a signed tx against the permitted template:
 * optional create-ATA (idempotent) for destination + exactly one TransferChecked.
 * Rejects unexpected programs, extra transfers, delegates, or wrong accounts/amounts.
 */
export function validateSignedUsdcTransfer(
  tx: Transaction,
  expected: ExpectedUsdcTransfer,
): ValidateTransferResult {
  try {
    const mint = new PublicKey(expected.mint);
    const fromOwner = new PublicKey(expected.fromOwner);
    const toOwner = new PublicKey(expected.toOwner);
    const amount = BigInt(expected.amountBaseUnits);
    const fromAta = getAssociatedTokenAddressSync(mint, fromOwner);
    const toAta = getAssociatedTokenAddressSync(mint, toOwner);

    if (expected.requireFeePayerIsAuthority !== false) {
      if (!tx.feePayer || !tx.feePayer.equals(fromOwner)) {
        return {
          ok: false,
          error: "Fee payer must be the transfer authority (fromOwner)",
        };
      }
    }

    const ixs = tx.instructions;
    if (ixs.length < 1 || ixs.length > 2) {
      return {
        ok: false,
        error: `Unexpected instruction count ${ixs.length} (allow 1–2)`,
      };
    }

    let transferIx = ixs[ixs.length - 1];
    if (ixs.length === 2) {
      const setup = ixs[0];
      if (!setup.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
        return {
          ok: false,
          error: "Only associated-token create is permitted as setup",
        };
      }
      // Idempotent ATA create: accounts [payer, ata, owner, mint, system, token, …]
      if (setup.keys.length < 4) {
        return { ok: false, error: "Malformed ATA create instruction" };
      }
      const ataKey = setup.keys[1]?.pubkey;
      const ownerKey = setup.keys[2]?.pubkey;
      const mintKey = setup.keys[3]?.pubkey;
      if (!ataKey?.equals(toAta) || !ownerKey?.equals(toOwner) || !mintKey?.equals(mint)) {
        return {
          ok: false,
          error: "ATA create does not match expected destination mint/owner",
        };
      }
      if (!setup.keys[0]?.pubkey.equals(fromOwner)) {
        return { ok: false, error: "ATA create payer must be fromOwner" };
      }
      transferIx = ixs[1];
    }

    if (!transferIx.programId.equals(TOKEN_PROGRAM_ID)) {
      return { ok: false, error: "Transfer instruction must use SPL Token program" };
    }
    const opcode = transferIx.data[0];
    if (opcode !== TRANSFER_CHECKED) {
      return {
        ok: false,
        error: `Expected TransferChecked (12), got opcode ${opcode}`,
      };
    }

    const decoded = decodeTransferCheckedInstruction(transferIx, TOKEN_PROGRAM_ID);
    const keys = decoded.keys;
    if (!keys.source.pubkey.equals(fromAta)) {
      return { ok: false, error: "Transfer source ATA mismatch" };
    }
    if (!keys.mint.pubkey.equals(mint)) {
      return { ok: false, error: "Transfer mint mismatch" };
    }
    if (!keys.destination.pubkey.equals(toAta)) {
      return { ok: false, error: "Transfer destination ATA mismatch" };
    }
    if (!keys.owner.pubkey.equals(fromOwner)) {
      return { ok: false, error: "Transfer authority mismatch" };
    }
    if (decoded.data.amount !== amount) {
      return {
        ok: false,
        error: `Transfer amount mismatch: got ${decoded.data.amount}, expected ${amount}`,
      };
    }
    if (decoded.data.decimals !== 6) {
      return { ok: false, error: "USDC decimals must be 6" };
    }

    return { ok: true, fromAta: fromAta.toBase58(), toAta: toAta.toBase58() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Bind a signed transaction to the exact prepared message bytes.
 * Signatures may differ; the serializable message must match preparedTxBase64.
 */
export function assertSignedMatchesPrepared(
  signedTx: Transaction,
  preparedTxBase64: string,
): { ok: true } | { ok: false; error: string } {
  try {
    const prepared = Transaction.from(Buffer.from(preparedTxBase64, "base64"));
    const signedMsg = Buffer.from(signedTx.serializeMessage());
    const preparedMsg = Buffer.from(prepared.serializeMessage());
    if (signedMsg.length !== preparedMsg.length || !signedMsg.equals(preparedMsg)) {
      return {
        ok: false,
        error: "Signed transaction message does not match preparedTxBase64",
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
