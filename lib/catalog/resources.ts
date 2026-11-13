import { DEMO_PAYEE } from "@/lib/policy/config";
import { DEVNET_USDC_MINT } from "@/lib/solana/config";
import {
  DEFAULT_X402_PRICE_BASE_UNITS,
  DEMO_APPROVAL_AMOUNT_BASE_UNITS,
  DEMO_MID_AMOUNT_BASE_UNITS,
} from "@/lib/x402/types";

export type CatalogResource = {
  id: string;
  title: string;
  description: string;
  preview: string;
  /** Absolute or path-only resource bound by the server. */
  resource: string;
  /** Approved origin for path-only local merchants (e.g. http://127.0.0.1:3000). */
  trustedOrigin?: string;
  payee: string;
  amountBaseUnits: string;
  mint: string;
  settlementKind: "spl_usdc" | "x402";
  allowlisted: boolean;
  merchantLabel: string;
  teamOperated: boolean;
  /** Adversarial fixture — shown for demos, never purchasable. */
  adversarialFixture?: boolean;
  productId: string;
  /** Paid body delivered after settlement (demo catalog content). */
  paidBody: string;
};

function trustedMerchantOrigin(): string {
  return (
    process.env.TRUSTED_MERCHANT_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    "http://127.0.0.1:3000"
  );
}

const ADVERSARIAL: CatalogResource = {
  id: "evil-drain",
  title: "Unauthorized mega-purchase",
  description:
    "Labeled adversarial fixture — non-allowlisted merchant. Must be blocked; never reserved.",
  preview:
    "Free preview: claims “buy everything” with no useful research content.",
  resource: "https://evil.example/buy-everything",
  payee: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  amountBaseUnits: "2500000",
  mint: DEVNET_USDC_MINT,
  settlementKind: "spl_usdc",
  allowlisted: false,
  merchantLabel: "evil.example (adversarial fixture)",
  teamOperated: false,
  adversarialFixture: true,
  productId: "adversarial-drain",
  paidBody: "",
};

/**
 * Demo catalog — three distinct purchasable products with coherent prices
 * so judges can answer “what did the agent actually buy?”
 * Content is team-authored research briefs (not live oracles).
 */
const PURCHASABLE: CatalogResource[] = [
  {
    id: "weather-brief",
    title: "Devnet weather brief",
    description:
      "Team-operated demo catalog item ($0.10). Purchasable research brief for agent citation.",
    preview:
      "Free preview: high-level sky outline; paid body unlocks after USDC settle.",
    resource: "/api/x402/weather",
    trustedOrigin: trustedMerchantOrigin(),
    payee: DEMO_PAYEE,
    amountBaseUnits: DEFAULT_X402_PRICE_BASE_UNITS, // $0.10
    mint: DEVNET_USDC_MINT,
    settlementKind: "x402",
    allowlisted: true,
    merchantLabel: "Policy Desk merchant (team-operated)",
    teamOperated: true,
    productId: "weather-brief-v1",
    paidBody:
      "[DEMO CATALOG] Devnet weather brief: Clear skies on Solana Devnet. Wind calm; visibility high. Use this as cited paid evidence in the research answer — not a live weather oracle.",
  },
  {
    id: "market-pulse",
    title: "Solana market pulse",
    description:
      "Team-operated demo catalog item ($0.25). Distinct product from weather — mid-price under approval threshold.",
    preview:
      "Free preview: headline liquidity note; paid body unlocks after USDC settle.",
    resource: "/api/x402/market",
    trustedOrigin: trustedMerchantOrigin(),
    payee: DEMO_PAYEE,
    amountBaseUnits: DEMO_MID_AMOUNT_BASE_UNITS, // $0.25
    mint: DEVNET_USDC_MINT,
    settlementKind: "x402",
    allowlisted: true,
    merchantLabel: "Policy Desk merchant (team-operated)",
    teamOperated: true,
    productId: "market-pulse-v1",
    paidBody:
      "[DEMO CATALOG] Solana market pulse: Devnet USDC flows remain orderly for demo merchants. Spot depth is synthetic; cite this brief as purchased market context, not live CEX data.",
  },
  {
    id: "weather-deep",
    title: "Deep research memo",
    description:
      "Team-operated demo catalog item ($0.60). Above human-approval threshold — requires operator co-sign.",
    preview:
      "Free preview: extended outline; paid deep memo unlocks after approval + settle.",
    resource: `/api/x402/research?amount=${DEMO_APPROVAL_AMOUNT_BASE_UNITS}`,
    trustedOrigin: trustedMerchantOrigin(),
    payee: DEMO_PAYEE,
    amountBaseUnits: DEMO_APPROVAL_AMOUNT_BASE_UNITS, // $0.60
    mint: DEVNET_USDC_MINT,
    settlementKind: "x402",
    allowlisted: true,
    merchantLabel: "Policy Desk merchant (team-operated)",
    teamOperated: true,
    productId: "research-deep-v1",
    paidBody:
      "[DEMO CATALOG] Deep research memo: Policy-gated agent treasuries reduce blank-check risk by binding catalog resourceId → amount → payee before Phantom signs. Cite this memo as the purchased deep dive.",
  },
];

/** Purchasable catalog only (excludes adversarial fixtures). */
export function listCatalog(): CatalogResource[] {
  return PURCHASABLE.map((r) => ({ ...r }));
}

/** Full catalog including adversarial fixtures for fixture-agent demos. */
export function listCatalogWithFixtures(): CatalogResource[] {
  return [ADVERSARIAL, ...PURCHASABLE].map((r) => ({ ...r }));
}

export function getCatalogResource(id: string): CatalogResource | undefined {
  if (id === ADVERSARIAL.id) return { ...ADVERSARIAL };
  return PURCHASABLE.find((r) => r.id === id);
}

export function resolveCatalogResourceId(resourceId: string): CatalogResource {
  const found = getCatalogResource(resourceId);
  if (!found) {
    throw new Error(`Unknown catalog resourceId: ${resourceId}`);
  }
  return found;
}

/** Fail closed: only exact server catalog rows. */
export function assertPurchasableCatalogId(resourceId: string): CatalogResource {
  const found = PURCHASABLE.find((r) => r.id === resourceId);
  if (!found) {
    throw new Error(`Unknown or non-purchasable resourceId: ${resourceId}`);
  }
  return { ...found };
}

/** Path prefixes allowed for team-operated x402 merchants. */
export function catalogResourcePathPrefixes(): string[] {
  return ["/api/x402/weather", "/api/x402/market", "/api/x402/research"];
}
