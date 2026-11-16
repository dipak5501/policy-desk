import type { NextConfig } from "next";

// Match Guarded Agent Treasury: no page CSP. A restrictive CSP (and stamping
// it onto /_next chunks) blocked Next client hydration so the desk stayed on
// SSR "Recheck Phantom inject" even when window.phantom.solana was present.
//
// Cloudflare quick tunnels hit Next through cloudflared (Host: *.trycloudflare.com,
// origin 127.0.0.1). Without allowedDevOrigins, Next 16 blocks /_next/hmr and
// returns a bare "Unauthorized" that cloudflared logs as a malformed origin
// response — remote UI can fail to hydrate / look broken.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 defaults to Turbopack — keep empty so a webpack-only watch
  // config does not crash `next dev`. Blink fix: tunnel/next logs live in /tmp.
  turbopack: {},
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.trycloudflare.com",
    "*.cfargotunnel.com",
  ],
};

export default nextConfig;
