import {
  DEMO_BLOCKED_RESOURCE,
  DEMO_PAYEE,
  DEMO_X402_RESOURCE,
} from "@/lib/policy/config";
import { DEVNET_USDC_MINT } from "@/lib/solana/config";
import {
  DEFAULT_X402_PRICE_BASE_UNITS,
  DEMO_APPROVAL_AMOUNT_BASE_UNITS,
} from "@/lib/x402/types";

export type AgentScenarioId =
  | "blocked_demo"
  | "approved_demo"
  | "approval_demo"
  | "custom";

export type AgentProposal = {
  scenario: AgentScenarioId;
  label: string;
  resource: string;
  payee: string;
  amountBaseUnits: string;
  mint: string;
  settlementKind: "spl_usdc" | "x402";
  rationale: string;
};

export function demoScenarios(): AgentProposal[] {
  return [
    {
      scenario: "blocked_demo",
      label: "Blocked — non-allowlisted merchant",
      resource: DEMO_BLOCKED_RESOURCE,
      payee: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      amountBaseUnits: "2500000",
      mint: DEVNET_USDC_MINT,
      settlementKind: "spl_usdc",
      rationale:
        "Agent proposes a large payment to an unknown merchant. Policy must block before any signature.",
    },
    {
      scenario: "approval_demo",
      label: "Needs approval — x402 above threshold",
      resource: `${DEMO_X402_RESOURCE}?amount=${DEMO_APPROVAL_AMOUNT_BASE_UNITS}`,
      payee: DEMO_PAYEE,
      amountBaseUnits: DEMO_APPROVAL_AMOUNT_BASE_UNITS,
      mint: DEVNET_USDC_MINT,
      settlementKind: "x402",
      rationale:
        "Allowlisted x402 weather above the human-approval threshold. Desk must co-sign before settle.",
    },
    {
      scenario: "approved_demo",
      label: "Approved — x402 weather under threshold",
      resource: DEMO_X402_RESOURCE,
      payee: DEMO_PAYEE,
      amountBaseUnits: DEFAULT_X402_PRICE_BASE_UNITS,
      mint: DEVNET_USDC_MINT,
      settlementKind: "x402",
      rationale:
        "Allowlisted local x402 resource under per-tx and approval thresholds.",
    },
  ];
}

export function getScenario(id: AgentScenarioId): AgentProposal | undefined {
  return demoScenarios().find((s) => s.scenario === id);
}
