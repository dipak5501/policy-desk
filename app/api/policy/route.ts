import { NextResponse } from "next/server";
import { getActivePolicy } from "@/lib/policy/active";
import { toPolicyView } from "@/lib/policy/types";
import { deriveRegime } from "@/lib/policy/regime";
import { dailySpentBaseUnits } from "@/lib/ledger/store";
import { listAudit } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getActivePolicy();
  const dailySpent = dailySpentBaseUnits();
  const regime = deriveRegime(config, dailySpent);
  return NextResponse.json({
    policy: toPolicyView(config),
    dailySpentBaseUnits: dailySpent.toString(),
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
    },
  });
}
