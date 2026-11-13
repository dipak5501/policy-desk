import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  demoScenarios,
  getScenario,
  type AgentScenarioId,
} from "@/lib/agent/scenarios";
import { getCatalogResource } from "@/lib/catalog/resources";
import {
  createLedgerEntry,
  dailySpentBaseUnits,
  setLedgerStatus,
  syncTaskBudgetFromLedger,
  taskRemainingBaseUnits,
  tryReserveAgainstDailyCap,
  withLedgerLock,
} from "@/lib/ledger/store";
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
import { POLICY_VERSION } from "@/lib/policy/version";
import { DEVNET_USDC_MINT, X402_DEVNET_NETWORK } from "@/lib/solana/config";
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
  taskId?: string;
  resourceId?: string;
  fromOwner?: string;
};

export async function POST(request: Request) {
  try {
    return await withLedgerLock(async () => {
      const body = (await request.json()) as Body;
      const scenario = body.scenario ? getScenario(body.scenario) : undefined;
      const catalog = body.resourceId
        ? getCatalogResource(body.resourceId)
        : undefined;

      const label =
        body.label ?? catalog?.title ?? scenario?.label ?? "Custom agent spend";
      let resource =
        body.resource ?? catalog?.resource ?? scenario?.resource;
      const payee = body.payee ?? catalog?.payee ?? scenario?.payee;
      const amountBaseUnits =
        body.amountBaseUnits ??
        catalog?.amountBaseUnits ??
        scenario?.amountBaseUnits ??
        "0";
      const mint =
        body.mint ?? catalog?.mint ?? scenario?.mint ?? DEVNET_USDC_MINT;
      let settlementKind =
        body.settlementKind ??
        catalog?.settlementKind ??
        scenario?.settlementKind ??
        "spl_usdc";

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

      const amount = BigInt(amountBaseUnits);
      const base = getActivePolicy();

      if (!tryReserveAgainstDailyCap(amount, base.dailyCapBaseUnits)) {
        return NextResponse.json(
          {
            error: "Insufficient remaining daily budget for this reservation",
            code: "over_daily_cap",
          },
          { status: 403 },
        );
      }

      if (body.taskId) {
        const remaining = taskRemainingBaseUnits(body.taskId);
        if (amount > remaining) {
          return NextResponse.json(
            {
              error: "Insufficient remaining task budget",
              code: "over_task_budget",
              remainingBaseUnits: remaining.toString(),
            },
            { status: 403 },
          );
        }
      }

      const scenarioTag =
        body.scenario ?? scenario?.scenario ?? ("custom" as const);
      const quoteId = randomUUID();
      const quoteExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const entry = createLedgerEntry({
        label: body.dryRun ? `[dry-run] ${label}` : label,
        resource,
        payee,
        amountBaseUnits,
        mint,
        settlementKind,
        scenario: scenarioTag,
        taskId: body.taskId,
        resourceId: body.resourceId ?? catalog?.id,
        network: X402_DEVNET_NETWORK,
        policyVersion: POLICY_VERSION,
        quoteId,
        quoteExpiresAt,
        fromOwner: body.fromOwner,
      });

      const config =
        body.selfPay || resource === SPL_TRANSFER_RESOURCE
          ? withSessionPayee(base, payee)
          : base;

      const spendReq = {
        id: entry.id,
        label,
        resource,
        payee,
        amountBaseUnits: amount,
        mint,
      };
      // Include this entry's reservation in spent by evaluating after create
      // but before marking reserved statuses — review against prior + this amount via dailySpent
      // which already counts reserved statuses; entry is still "proposed" so subtract nothing extra.
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
        quoteExpiresAt,
        quoteId,
      });

      appendAudit("policy.decision", {
        entryId: entry.id,
        status: decision.status,
        reason: decision.reason,
        dryRun: Boolean(body.dryRun),
        risk,
        policyVersion: POLICY_VERSION,
      });

      if (decision.status === "block") {
        const blocked = setLedgerStatus(entry.id, "blocked", {
          policyStatus: decision.status,
          policyReason: decision.reason,
          policyCode: decision.code,
          settlementKind: "none",
        });
        if (body.taskId) syncTaskBudgetFromLedger(body.taskId);
        return NextResponse.json({
          entry: blocked,
          decision,
          quote,
          risk,
          next: "none",
          dryRun: Boolean(body.dryRun),
          policyVersion: POLICY_VERSION,
        });
      }

      if (decision.status === "needs_approval") {
        const pending = setLedgerStatus(entry.id, "awaiting_approval", {
          policyStatus: decision.status,
          policyReason: decision.reason,
          approvalExpiresAt: quoteExpiresAt,
        });
        if (body.taskId) syncTaskBudgetFromLedger(body.taskId);
        return NextResponse.json({
          entry: pending,
          decision,
          quote,
          risk,
          next: "await_human_approval",
          dryRun: Boolean(body.dryRun),
          policyVersion: POLICY_VERSION,
        });
      }

      const approved = setLedgerStatus(entry.id, "approved", {
        policyStatus: decision.status,
        policyReason: decision.reason,
      });
      if (body.taskId) syncTaskBudgetFromLedger(body.taskId);
      return NextResponse.json({
        entry: approved,
        decision,
        quote,
        risk,
        next: body.dryRun ? "dry_run_complete" : "settle",
        dryRun: Boolean(body.dryRun),
        policyVersion: POLICY_VERSION,
      });
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
