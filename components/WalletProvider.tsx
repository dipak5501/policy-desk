"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import bs58 from "bs58";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  signTransaction: <T>(tx: T) => Promise<T>;
  signMessage?: (
    message: Uint8Array,
    display?: string,
  ) => Promise<{ signature: Uint8Array } | Uint8Array>;
  on?: (event: string, handler: () => void) => void;
  off?: (event: string, handler: () => void) => void;
};

type WalletContextValue = {
  ready: boolean;
  installed: boolean;
  connecting: boolean;
  address: string | null;
  provider: PhantomProvider | null;
  sessionReady: boolean;
  csrf: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  ensureSession: () => Promise<string>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const anyWin = window as unknown as {
    solana?: PhantomProvider;
    phantom?: { solana?: PhantomProvider };
  };
  const p = anyWin.phantom?.solana ?? anyWin.solana;
  return p?.isPhantom ? p : null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<PhantomProvider | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [csrf, setCsrf] = useState<string | null>(null);

  useEffect(() => {
    const p = getPhantom();
    setProvider(p);
    setInstalled(Boolean(p));
    setReady(true);
    if (p?.publicKey) setAddress(p.publicKey.toString());
  }, []);

  const ensureSession = useCallback(async () => {
    const p = getPhantom();
    if (!p?.publicKey && !address) throw new Error("Connect Phantom first");
    const wallet = p?.publicKey?.toString() ?? address!;
    if (!p?.signMessage) {
      throw new Error("Phantom signMessage unavailable");
    }
    const challenge = await fetch("/api/wallet/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    }).then((r) => r.json());
    if (!challenge.message) throw new Error(challenge.error ?? "Challenge failed");

    const encoded = new TextEncoder().encode(challenge.message as string);
    const signed = await p.signMessage(encoded, "utf8");
    const sigBytes = signed instanceof Uint8Array ? signed : signed.signature;
    const verify = await fetch("/api/wallet/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        wallet,
        nonce: challenge.nonce,
        message: challenge.message,
        signatureBase58: bs58.encode(sigBytes),
      }),
    }).then((r) => r.json());
    if (!verify.ok) throw new Error(verify.error ?? "Wallet auth failed");
    setSessionReady(true);
    setCsrf(verify.csrf ?? null);
    return verify.csrf as string;
  }, [address]);

  const connect = useCallback(async () => {
    const p = getPhantom();
    if (!p) throw new Error("Phantom not installed");
    setConnecting(true);
    try {
      const res = await p.connect();
      setProvider(p);
      setAddress(res.publicKey.toString());
      await ensureSession();
    } finally {
      setConnecting(false);
    }
  }, [ensureSession]);

  const disconnect = useCallback(async () => {
    const p = getPhantom();
    if (p) await p.disconnect();
    setAddress(null);
    setSessionReady(false);
    setCsrf(null);
    await fetch("/api/operator/logout", { method: "POST", credentials: "include" });
  }, []);

  const value = useMemo(
    () => ({
      ready,
      installed,
      connecting,
      address,
      provider,
      sessionReady,
      csrf,
      connect,
      disconnect,
      ensureSession,
    }),
    [
      ready,
      installed,
      connecting,
      address,
      provider,
      sessionReady,
      csrf,
      connect,
      disconnect,
      ensureSession,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet requires WalletProvider");
  return ctx;
}
