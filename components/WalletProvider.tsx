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

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  signTransaction: <T>(tx: T) => Promise<T>;
  on?: (event: string, handler: () => void) => void;
  off?: (event: string, handler: () => void) => void;
};

type WalletContextValue = {
  ready: boolean;
  installed: boolean;
  connecting: boolean;
  address: string | null;
  provider: PhantomProvider | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
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

  useEffect(() => {
    const p = getPhantom();
    setProvider(p);
    setInstalled(Boolean(p));
    setReady(true);
    if (p?.publicKey) setAddress(p.publicKey.toString());
  }, []);

  const connect = useCallback(async () => {
    const p = getPhantom();
    if (!p) throw new Error("Phantom not installed");
    setConnecting(true);
    try {
      const res = await p.connect();
      setProvider(p);
      setAddress(res.publicKey.toString());
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const p = getPhantom();
    if (p) await p.disconnect();
    setAddress(null);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      installed,
      connecting,
      address,
      provider,
      connect,
      disconnect,
    }),
    [ready, installed, connecting, address, provider, connect, disconnect],
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
