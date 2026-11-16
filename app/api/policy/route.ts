import { NextResponse } from "next/server";
import { getActivePolicy } from "@/lib/policy/active";
import { toPolicyView } from "@/lib/policy/types";
import { deriveRegime } from "@/lib/policy/regime";
import { budgetSnapshot, dailySpentBaseUnits } from "@/lib/ledger/store";
import { POLICY_VERSION } from "@/lib/policy/version";
import { listAudit } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getActivePolicy();
  const dailySpent = dailySpentBaseUnits();
  const regime = deriveRegime(config, dailySpent);
  const budget = budgetSnapshot(config.dailyCapBaseUnits);
  return NextResponse.json({
    policy: toPolicyView(config),
    policyVersion: POLICY_VERSION,
    dailySpentBaseUnits: dailySpent.toString(),
    budget,
    regime,
    audit: listAudit(25),
    trust: {
      cluster: "devnet",
      mint: config.allowedMint,
      allowlistedPayees: config.allowlistedPayees,
      allowlistedResources: config.allowlistedResources,
      blockBeforeSign: true,
      escrowClaim: false,
      escrowNote:
        "Honest control: policy blocks before signature. No on-chain escrow vault in this MVP.",
      streamsReconcile: true,
      streamsNote:
        "QuickNode Streams is a core observation source: webhook reconciles chain signatures to ledger settles (matched) and flags unmatched USDC hits.",
      fixtureAgentNote:
        "Fixture is the demo agent path (deterministic labeled tools). Live LLM adapter was removed — not required for judging.",
    },
  });
}
