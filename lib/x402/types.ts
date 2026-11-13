import { X402_DEVNET_NETWORK, DEVNET_USDC_MINT } from "@/lib/solana/config";

export type ResourceInfo = {
  url: string;
  description: string;
  mimeType: string;
};

export type PaymentRequirement = {
  scheme: "exact";
  network: typeof X402_DEVNET_NETWORK | string;
  amount: string;
  maxAmountRequired?: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  extra?: {
    decimals?: number;
    recentBlockhash?: string;
    feePayer?: string;
  };
};

export type PaymentRequiredBody = {
  x402Version: 2;
  resource: ResourceInfo;
  accepts: PaymentRequirement[];
  error?: string;
};

export type PaymentPayload = {
  x402Version: 2;
  accepted: PaymentRequirement;
  payload: {
    transaction: string;
  };
  resource?: ResourceInfo | string;
};

export type PaymentResponseBody = {
  x402Version: 2;
  success: boolean;
  transaction?: string;
  network: string;
  payer?: string;
  errorReason?: string;
};

export const DEFAULT_X402_PRICE_BASE_UNITS = "100000"; // $0.10
export const DEMO_APPROVAL_AMOUNT_BASE_UNITS = "600000"; // $0.60

export function requirementAmount(req: PaymentRequirement): string {
  return req.amount ?? req.maxAmountRequired ?? "0";
}

export function defaultWeatherRequirement(payTo: string): PaymentRequirement {
  return {
    scheme: "exact",
    network: X402_DEVNET_NETWORK,
    amount: DEFAULT_X402_PRICE_BASE_UNITS,
    payTo,
    asset: DEVNET_USDC_MINT,
    maxTimeoutSeconds: 120,
    extra: { decimals: 6 },
  };
}

export function defaultWeatherResource(): ResourceInfo {
  return {
    url: "/api/x402/weather",
    description: "Devnet weather snippet (x402)",
    mimeType: "application/json",
  };
}
