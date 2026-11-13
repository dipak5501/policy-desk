import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Policy Desk — UBC Hackathon 2026",
  description:
    "Policy-gated agent treasury: propose → policy → human approve → sign → Solana Devnet USDC / x402.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/*
          Wallet extensions (Phantom) inject into the page MAIN world.
          Ad blockers / enterprise CSPs sometimes enable Trusted Types without
          a default policy, which throws "This document requires TrustedScript"
          and leaves window.solana undefined. A permissive default policy keeps
          Phantom injection working for local demos.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{try{if(window.trustedTypes&&trustedTypes.createPolicy){try{trustedTypes.createPolicy('default',{createHTML:s=>s,createScript:s=>s,createScriptURL:s=>s});}catch(_){}}}catch(_){}})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* App Router's root layout applies these fonts across the whole app. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
