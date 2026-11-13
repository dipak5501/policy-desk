import { Connection } from "@solana/web3.js";
import { solanaCluster, solanaRpcUrl } from "./config";

let cached: Connection | undefined;

export function assertDevnetOnly(): void {
  solanaCluster();
}

export function getConnection(): Connection {
  assertDevnetOnly();
  if (!cached) {
    cached = new Connection(solanaRpcUrl(), "confirmed");
  }
  return cached;
}
