"use client";

/**
 * Official organizer / sponsor resources from UBC Hackathon 2026 guides.
 * Links only — no invented APIs.
 */
const RESOURCES = [
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
    label: "QuickNode Streams",
    href: "https://www.quicknode.com/docs/streams/quickstart",
    note: "Optional bounty",
  },
] as const;

export function ResourceStrip() {
  return (
    <section className="resource-strip" aria-label="Organizer resources">
      <p className="resource-label">Official resources</p>
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
