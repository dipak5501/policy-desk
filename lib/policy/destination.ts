import type { PolicyConfig } from "./types";
import { SPL_TRANSFER_RESOURCE } from "./review";

/**
 * Final settle destination check — blocks before sign even if ledger drifted.
 * Self-pay (spl:transfer to connected wallet) is allowed when fromOwner matches.
 */
export function isSettledDestinationAllowed(args: {
  payee: string;
  fromOwner: string;
  resource: string;
  config: PolicyConfig;
}): boolean {
  if (args.config.allowlistedPayees.includes(args.payee)) return true;
  if (
    args.resource === SPL_TRANSFER_RESOURCE &&
    args.payee === args.fromOwner
  ) {
    return true;
  }
  return false;
}
