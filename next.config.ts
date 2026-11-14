import type { NextConfig } from "next";

// Match Guarded Agent Treasury: no page CSP. A restrictive CSP (and stamping
 // it onto /_next chunks) blocked Next client hydration so the desk stayed on
 // SSR "Recheck Phantom inject" even when window.phantom.solana was present.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
