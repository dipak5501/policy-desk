import { NextResponse } from "next/server";
import {
  demoScenarios,
  getScenario,
  type AgentScenarioId,
} from "@/lib/agent/scenarios";
import { getActivePolicy } from "@/lib/policy/active";
import {
  buildPaymentQuote,
  proposalRiskScore,
} from "@/lib/policy/regime";
import {
  reviewSpend,
  withSessionPayee,
  isAllowlisted,
  SPL_TRANSFER_RESOURCE,
} from "@/lib/policy/review";
import {
  createLedgerEntry,
  dailySpentBaseUnits,
  setLedgerStatus,
} from "@/lib/ledger/store";
import { DEVNET_USDC_MINT } from "@/lib/solana/config";
import { appendAudit } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  scenario?: AgentScenarioId;
  label?: string;
  resource?: string;
  payee?: string;
  amountBaseUnits?: string;
  mint?: string;
  settlementKind?: "spl_usdc" | "x402";
  selfPay?: boolean;
  dryRun?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const scenario = body.scenario ? getScenario(body.scenario) : undefined;

    const label = body.label ?? scenario?.label ?? "Custom agent spend";
    let resource = body.resource ?? scenario?.resource;
    const payee = body.payee ?? scenario?.payee;
    const amountBaseUnits =
      body.amountBaseUnits ?? scenario?.amountBaseUnits ?? "0";
    const mint = body.mint ?? scenario?.mint ?? DEVNET_USDC_MINT;
    let settlementKind =
      body.settlementKind ?? scenario?.settlementKind ?? "spl_usdc";

    if (body.selfPay) {
      resource = SPL_TRANSFER_RESOURCE;
      settlementKind = "spl_usdc";
      if (!payee) {
        return NextResponse.json(
          { error: "selfPay requires payee (connected wallet)" },
          { status: 400 },
        );
      }
    }

    if (!resource || !payee) {
      return NextResponse.json(
        { error: "resource and payee are required" },
        { status: 400 },
      );
    }

    const scenarioTag =
      body.scenario ?? scenario?.scenario ?? ("custom" as const);

    const entry = createLedgerEntry({
      label: body.dryRun ? `[dry-run] ${label}` : label,
      resource,
      payee,
      amountBaseUnits,
      mint,
      settlementKind,
      scenario: scenarioTag,
    });

    const base = getActivePolicy();
    const config =
      body.selfPay || resource === SPL_TRANSFER_RESOURCE
        ? withSessionPayee(base, payee)
        : base;

    const amount = BigInt(amountBaseUnits);
    const spendReq = {
      id: entry.id,
      label,
      resource,
      payee,
      amountBaseUnits: amount,
      mint,
    };
    const decision = reviewSpend(spendReq, config, dailySpentBaseUnits());
    const quote = buildPaymentQuote({
      amountBaseUnits: amount,
      resource,
      payee,
      settlementKind,
      mint,
    });
    const risk = proposalRiskScore({
      amountBaseUnits: amount,
      config,
      decision,
      resource,
      allowlisted: isAllowlisted(spendReq, config),
    });

    setLedgerStatus(entry.id, "policy_evaluated", {
      policyStatus: decision.status,
      policyReason: decision.reason,
      policyCode: decision.status === "block" ? decision.code : undefined,
    });

    appendAudit("policy.decision", {
      entryId: entry.id,
      status: decision.status,
      reason: decision.reason,
      dryRun: Boolean(body.dryRun),
      risk,
    });

    if (decision.status === "block") {
      const blocked = setLedgerStatus(entry.id, "blocked", {
        policyStatus: decision.status,
        policyReason: decision.reason,
        policyCode: decision.code,
        settlementKind: "none",
      });
      return NextResponse.json({
        entry: blocked,
        decision,
        quote,
        risk,
        next: "none",
        dryRun: Boolean(body.dryRun),
      });
    }

    if (decision.status === "needs_approval") {
      const pending = setLedgerStatus(entry.id, "awaiting_approval", {
        policyStatus: decision.status,
        policyReason: decision.reason,
      });
      return NextResponse.json({
        entry: pending,
        decision,
        quote,
        risk,
        next: "await_human_approval",
        dryRun: Boolean(body.dryRun),
      });
    }

    const approved = setLedgerStatus(entry.id, "approved", {
      policyStatus: decision.status,
      policyReason: decision.reason,
    });
    return NextResponse.json({
      entry: approved,
      decision,
      quote,
      risk,
      next: body.dryRun ? "dry_run_complete" : "settle",
      dryRun: Boolean(body.dryRun),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ scenarios: demoScenarios() });
}
