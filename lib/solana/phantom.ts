/**
 * Phantom detection — same pattern as Guarded Agent Treasury
 * (`guarded-agent-treasury/lib/solana/phantom.ts`): prefer window.phantom.solana,
 * fall back to window.solana when isPhantom.
 */

export type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect: (opts?: {
    onlyIfTrusted?: boolean;
  }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  signTransaction: <T>(tx: T) => Promise<T>;
  signMessage?: (
    message: Uint8Array,
    display?: string,
  ) => Promise<{ signature: Uint8Array } | Uint8Array>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const anyWin = window as unknown as {
    solana?: PhantomProvider & { providers?: PhantomProvider[] };
    phantom?: { solana?: PhantomProvider };
  };
  const provider =
    anyWin.phantom?.solana ??
    (anyWin.solana?.isPhantom ? anyWin.solana : undefined) ??
    anyWin.solana?.providers?.find((p) => p?.isPhantom);
  if (!provider || typeof provider.connect !== "function") return null;
  // Treasury requires isPhantom; also accept phantom.solana namespace without it.
  if (provider.isPhantom === false) return null;
  return provider;
}
