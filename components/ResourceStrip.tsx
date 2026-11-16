"use client";

/**
 * Official organizer / sponsor resources from UBC Hackathon Guide UBC 26
 * + Office Hours schedule. Links only — no invented APIs.
 * https://docs.google.com/document/d/1QaySCo7u3VxMVNdk3C5Ab3ewc2E46AuLntti-Uzx5EY/
 */
const RESOURCES = [
  {
    label: "Hackathon guide",
    href: "https://docs.google.com/document/d/1QaySCo7u3VxMVNdk3C5Ab3ewc2E46AuLntti-Uzx5EY/edit?usp=sharing",
    note: "Official UBC 26 Google Doc",
  },
  {
    label: "Workshops / OH",
    href: "https://docs.google.com/document/d/1eI8S0gBu6xI36DFqgqGZlO1qX6YYzFTEXBx9L5ve_zA/edit?usp=sharing",
    note: "Nov 16–19 CST · Solana / Circle / QN",
  },
  {
    label: "Telegram",
    href: "https://t.me/+Q0hy2P7nbIk2YWIx",
    note: "Organizer chat",
  },
  {
    label: "SOL faucet",
    href: "https://faucet.solana.com",
    note: "Devnet SOL for fees",
  },
  {
    label: "USDC faucet",
    href: "https://faucet.circle.com/",
    note: "Circle · Solana Devnet",
  },
  {
    label: "Phantom",
    href: "https://phantom.app/download",
    note: "Switch to Devnet",
  },
  {
    label: "Solana docs",
    href: "https://docs.solana.com/",
    note: "Developer docs",
  },
  {
    label: "Solana Cookbook",
    href: "https://solanacookbook.com/",
    note: "Recipes & patterns",
  },
  {
    label: "x402 on Solana",
    href: "https://solana.com/docs/payments/agentic-payments/x402",
    note: "Agentic payments",
  },
  {
    label: "USDC mint",
    href: "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    note: "4zMMC9…ncDU",
  },
  {
    label: "Circle docs",
    href: "https://developers.circle.com/",
    note: "Stablecoins & tooling",
  },
  {
    label: "QuickNode Streams",
    href: "https://www.quicknode.com/docs/streams/quickstart",
    note: "Ticker only — bounty not claimed",
  },
  {
    label: "QN credits",
    href: "https://quicknode.notion.site/quicknode-credits-for-college-xyz",
    note: "Hackathon RPC / optional Streams",
  },
  {
    label: "Devpost",
    href: "https://ubc-hackathon-2026.devpost.com/",
    note: "Submit by Nov 20 noon CST",
  },
] as const;

export function ResourceStrip() {
  return (
    <section className="resource-strip" aria-label="Organizer resources">
      <p className="resource-label">Official organizer resources</p>
      <ul className="resource-list">
        {RESOURCES.map((r) => (
          <li key={r.href}>
            <a href={r.href} target="_blank" rel="noreferrer">
              {r.label}
            </a>
            <span>{r.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
