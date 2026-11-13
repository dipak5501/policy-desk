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
  resource: string;
  payee: string;
  amountBaseUnits: string;
  mint: string;
  settlementKind: "spl_usdc" | "x402";
  allowlisted: boolean;
  merchantLabel: string;
  teamOperated: boolean;
};

const CATALOG: CatalogResource[] = [
  {
    id: "evil-drain",
    title: "Unauthorized mega-purchase",
    description: "Non-allowlisted merchant — must be blocked by policy.",
    preview:
      "Free preview: claims “buy everything” with no useful research content.",
    resource: "https://evil.example/buy-everything",
    payee: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    amountBaseUnits: "2500000",
    mint: DEVNET_USDC_MINT,
    settlementKind: "spl_usdc",
    allowlisted: false,
    merchantLabel: "evil.example (blocked)",
    teamOperated: false,
  },
  {
    id: "weather-brief",
    title: "Devnet weather brief",
    description:
      "Team-operated x402 merchant: paid Devnet weather snapshot used in the research answer.",
    preview:
      "Free preview: high-level sky summary available; full forecast requires payment.",
    resource: DEMO_X402_RESOURCE,
    payee: DEMO_PAYEE,
    amountBaseUnits: DEFAULT_X402_PRICE_BASE_UNITS,
    mint: DEVNET_USDC_MINT,
    settlementKind: "x402",
    allowlisted: true,
    merchantLabel: "Policy Desk weather (team-operated)",
    teamOperated: true,
  },
  {
    id: "weather-deep",
    title: "Devnet weather deep dive",
    description:
      "Same merchant, above human-approval threshold — pauses for operator approval.",
    preview:
      "Free preview: extended outlook outline; paid body includes structured brief.",
    resource: `${DEMO_X402_RESOURCE}?amount=${DEMO_APPROVAL_AMOUNT_BASE_UNITS}`,
    payee: DEMO_PAYEE,
    amountBaseUnits: DEMO_APPROVAL_AMOUNT_BASE_UNITS,
    mint: DEVNET_USDC_MINT,
    settlementKind: "x402",
    allowlisted: true,
    merchantLabel: "Policy Desk weather (team-operated)",
    teamOperated: true,
  },
];

export function listCatalog(): CatalogResource[] {
  return CATALOG.map((r) => ({ ...r }));
}

export function getCatalogResource(id: string): CatalogResource | undefined {
  return CATALOG.find((r) => r.id === id);
}

export function resolveCatalogResourceId(
  resourceId: string,
): CatalogResource {
  const found = getCatalogResource(resourceId);
  if (!found) {
    throw new Error(`Unknown catalog resourceId: ${resourceId}`);
  }
  return found;
}
