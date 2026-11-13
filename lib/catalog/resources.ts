import { DEMO_PAYEE, DEMO_X402_RESOURCE } from "@/lib/policy/config";
import { DEVNET_USDC_MINT } from "@/lib/solana/config";
import {
  DEFAULT_X402_PRICE_BASE_UNITS,
  DEMO_APPROVAL_AMOUNT_BASE_UNITS,
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
};

const PURCHASABLE: CatalogResource[] = [
  {
    id: "weather-brief",
    title: "Devnet weather brief (sample)",
    description:
      "Team-operated local merchant. Content is labeled sample text — not live weather.",
    preview:
      "Free preview: high-level sky outline; paid body is sample research content.",
    resource: DEMO_X402_RESOURCE,
    trustedOrigin: trustedMerchantOrigin(),
    payee: DEMO_PAYEE,
    amountBaseUnits: DEFAULT_X402_PRICE_BASE_UNITS, // $0.10
    mint: DEVNET_USDC_MINT,
    settlementKind: "x402",
    allowlisted: true,
    merchantLabel: "Policy Desk weather (team-operated)",
    teamOperated: true,
    productId: "weather-sample-brief",
  },
  {
    id: "weather-deep",
    title: "Devnet weather deep dive (sample)",
    description:
      "Above human-approval threshold. Same team-operated merchant; sample content.",
    preview: "Free preview: extended outline; paid body is sample research content.",
    resource: `${DEMO_X402_RESOURCE}?amount=${DEMO_APPROVAL_AMOUNT_BASE_UNITS}`,
    trustedOrigin: trustedMerchantOrigin(),
    payee: DEMO_PAYEE,
    amountBaseUnits: DEMO_APPROVAL_AMOUNT_BASE_UNITS, // $0.60
    mint: DEVNET_USDC_MINT,
    settlementKind: "x402",
    allowlisted: true,
    merchantLabel: "Policy Desk weather (team-operated)",
    teamOperated: true,
    productId: "weather-sample-deep",
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
