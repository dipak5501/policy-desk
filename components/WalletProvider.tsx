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
import { setCsrfToken } from "./csrfStore";

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
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type WalletContextValue = {
  ready: boolean;
  installed: boolean;
  connecting: boolean;
  signingIn: boolean;
  address: string | null;
  provider: PhantomProvider | null;
  sessionReady: boolean;
  csrf: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  ensureSession: () => Promise<string>;
  refreshProvider: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const anyWin = window as unknown as {
    solana?: PhantomProvider & { providers?: PhantomProvider[] };
    phantom?: { solana?: PhantomProvider };
  };
  // Prefer the dedicated Phantom namespace (works even when another wallet
  // owns window.solana, or when isPhantom is missing on first inject).
  const fromNamespace = anyWin.phantom?.solana;
  if (fromNamespace && typeof fromNamespace.connect === "function") {
    return fromNamespace;
  }
  const solana = anyWin.solana;
  if (solana?.isPhantom && typeof solana.connect === "function") {
    return solana;
  }
  const multi = solana?.providers?.find(
    (p) => p?.isPhantom && typeof p.connect === "function",
  );
  return multi ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<PhantomProvider | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [csrf, setCsrf] = useState<string | null>(null);

  const refreshProvider = useCallback(() => {
    const p = getPhantom();
    setProvider(p);
    setInstalled(Boolean(p));
    if (p?.publicKey) setAddress(p.publicKey.toString());
  }, []);

  useEffect(() => {
    refreshProvider();
    setReady(true);

    // Phantom may inject after first paint (extension race) — poll + official event.
    const timers = [100, 250, 500, 1000, 2000, 4000, 8000].map((ms) =>
      window.setTimeout(refreshProvider, ms),
    );
    const interval = window.setInterval(refreshProvider, 1500);
    const onFocus = () => refreshProvider();
    const onPhantomReady = () => refreshProvider();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("phantom#initialized", onPhantomReady);
    window.addEventListener("load", onPhantomReady);

    // Restore CSRF from HttpOnly session after reload (never via document.cookie)
    void fetch("/api/wallet/session", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { authenticated?: boolean; wallet?: string; csrf?: string }) => {
        if (data.authenticated && data.csrf) {
          setSessionReady(true);
          setCsrf(data.csrf);
          setCsrfToken(data.csrf);
          if (data.wallet) setAddress(data.wallet);
        }
      })
      .catch(() => {
        /* ignore */
      });

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("phantom#initialized", onPhantomReady);
      window.removeEventListener("load", onPhantomReady);
    };
  }, [refreshProvider]);

  useEffect(() => {
    const p = provider;
    if (!p?.on) return;
    const onConnect = () => {
      refreshProvider();
    };
    const onDisconnect = () => {
      setAddress(null);
      setSessionReady(false);
      setCsrf(null);
      setCsrfToken(null);
    };
    p.on("connect", onConnect);
    p.on("disconnect", onDisconnect);
    p.on("accountChanged", onConnect);
    return () => {
      p.off?.("connect", onConnect);
      p.off?.("disconnect", onDisconnect);
      p.off?.("accountChanged", onConnect);
    };
  }, [provider, refreshProvider]);

  const ensureSession = useCallback(async () => {
    const p = getPhantom();
    if (!p?.publicKey && !address) throw new Error("Connect Phantom first");
    const wallet = p?.publicKey?.toString() ?? address!;
    if (!p?.signMessage) {
      throw new Error("Phantom signMessage unavailable");
    }
    setSigningIn(true);
    try {
      const challenge = await fetch("/api/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      }).then((r) => r.json());
      if (!challenge.message)
        throw new Error(challenge.error ?? "Challenge failed");

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
      setCsrfToken(verify.csrf ?? null);
      return verify.csrf as string;
    } finally {
      setSigningIn(false);
    }
  }, [address]);

  const connect = useCallback(async () => {
    refreshProvider();
    const p = getPhantom();
    if (!p) throw new Error("Phantom not installed");
    setConnecting(true);
    try {
      const res = await p.connect();
      setProvider(p);
      setInstalled(true);
      setAddress(res.publicKey.toString());
      await ensureSession();
    } finally {
      setConnecting(false);
    }
  }, [ensureSession, refreshProvider]);

  const disconnect = useCallback(async () => {
    const p = getPhantom();
    if (p) await p.disconnect();
    setAddress(null);
    setSessionReady(false);
    setCsrf(null);
    setCsrfToken(null);
    await fetch("/api/operator/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {
      /* ignore */
    });
  }, []);

  const value = useMemo(
    () => ({
      ready,
      installed,
      connecting,
      signingIn,
      address,
      provider,
      sessionReady,
      csrf,
      connect,
      disconnect,
      ensureSession,
      refreshProvider,
    }),
    [
      ready,
      installed,
      connecting,
      signingIn,
      address,
      provider,
      sessionReady,
      csrf,
      connect,
      disconnect,
      ensureSession,
      refreshProvider,
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
