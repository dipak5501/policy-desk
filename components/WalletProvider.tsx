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
import { getPhantom, type PhantomProvider } from "@/lib/solana/phantom";
import { setCsrfToken } from "./csrfStore";

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

/** Host where wallet inject commonly fails (ephemeral CF tunnel origins). */
export function isEphemeralTunnelHost(hostname = ""): boolean {
  const h =
    hostname ||
    (typeof window !== "undefined" ? window.location.hostname : "");
  return (
    h.endsWith(".trycloudflare.com") ||
    h.endsWith(".cfargotunnel.com") ||
    h.endsWith(".loca.lt") ||
    h.endsWith(".ngrok-free.app") ||
    h.endsWith(".ngrok.io")
  );
}

export function isLocalDemoHost(hostname = ""): boolean {
  const h =
    hostname ||
    (typeof window !== "undefined" ? window.location.hostname : "");
  return h === "127.0.0.1" || h === "localhost" || h === "[::1]";
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
    // Same mount flow as Guarded Agent Treasury WalletProvider.
    const phantom = getPhantom();
    setProvider(phantom);
    setInstalled(Boolean(phantom));
    setReady(true);

    // Restore CSRF from HttpOnly session after reload
    void fetch("/api/wallet/session", { credentials: "include" })
      .then((r) => r.json())
      .then(
        (data: {
          authenticated?: boolean;
          wallet?: string;
          csrf?: string;
        }) => {
          if (data.authenticated && data.csrf) {
            setSessionReady(true);
            setCsrf(data.csrf);
            setCsrfToken(data.csrf);
            if (data.wallet) setAddress(data.wallet);
          }
        },
      )
      .catch(() => {
        /* ignore */
      });

    if (!phantom) {
      // Late inject (extension unlock / site access) — light poll like before,
      // but UI still shows Connect / Install (Treasury pattern), not Recheck.
      const timers = [250, 500, 1000, 2000, 4000, 8000].map((ms) =>
        window.setTimeout(() => {
          const p = getPhantom();
          if (!p) return;
          setProvider(p);
          setInstalled(true);
          if (p.publicKey) setAddress(p.publicKey.toString());
        }, ms),
      );
      return () => timers.forEach(clearTimeout);
    }

    const onConnect = (...args: unknown[]) => {
      const pk = args[0] as { toString?: () => string } | undefined;
      if (pk?.toString) setAddress(pk.toString());
      else if (phantom.publicKey) setAddress(phantom.publicKey.toString());
    };
    const onDisconnect = () => {
      setAddress(null);
      setSessionReady(false);
      setCsrf(null);
      setCsrfToken(null);
    };
    const onAccountChanged = (...args: unknown[]) => {
      const pk = args[0] as { toString?: () => string } | null;
      setAddress(pk?.toString?.() ?? null);
      setSessionReady(false);
      setCsrf(null);
      setCsrfToken(null);
    };

    phantom.on?.("connect", onConnect);
    phantom.on?.("disconnect", onDisconnect);
    phantom.on?.("accountChanged", onAccountChanged);

    // Silent reconnect if previously trusted (Treasury Desk pattern).
    phantom
      .connect({ onlyIfTrusted: true })
      .then((res) => setAddress(res.publicKey.toString()))
      .catch(() => {
        /* not previously trusted — user clicks Connect */
      });

    return () => {
      phantom.off?.("connect", onConnect);
      phantom.off?.("disconnect", onDisconnect);
      phantom.off?.("accountChanged", onAccountChanged);
    };
  }, []);

  const ensureSession = useCallback(async () => {
    const p = getPhantom() ?? provider;
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
  }, [address, provider]);

  const connect = useCallback(async () => {
    const phantom = provider ?? getPhantom();
    if (!phantom) {
      // Treasury Desk: open install page instead of throwing / Recheck UX.
      window.open(
        "https://phantom.app/download",
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    setConnecting(true);
    try {
      const res = await phantom.connect();
      setProvider(phantom);
      setInstalled(true);
      setAddress(res.publicKey.toString());
      await ensureSession();
    } finally {
      setConnecting(false);
    }
  }, [ensureSession, provider]);

  const disconnect = useCallback(async () => {
    const p = provider ?? getPhantom();
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
  }, [provider]);

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
