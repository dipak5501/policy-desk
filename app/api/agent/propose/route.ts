import { NextResponse } from "next/server";
import { listCatalog } from "@/lib/catalog/resources";
import { getTask, withLedgerLock } from "@/lib/ledger/store";
import { evaluateCatalogPropose } from "@/lib/propose/evaluate";
import { POLICY_VERSION } from "@/lib/policy/version";
import { appendAudit } from "@/lib/security/audit";
import {
  allowRate,
  clientKey,
  rateLimitResponse,
  readJsonBody,
} from "@/lib/security/httpLimits";
import { assertCsrf, readWalletSession } from "@/lib/security/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  resourceId?: string;
  taskId?: string;
  label?: string;
  /** @deprecated Client overrides are rejected. */
  payee?: string;
  amountBaseUnits?: string;
  mint?: string;
  resource?: string;
  settlementKind?: string;
  scenario?: string;
  selfPay?: boolean;
  fromOwner?: string;
  dryRun?: boolean;
};

/**
 * Authenticated, catalog-bound propose.
 * Client/model may only supply resourceId (+ optional taskId/label).
 * Recipient, mint, price, origin, path, and settlement kind come from the server catalog.
 */
export async function POST(request: Request) {
  try {
    if (!allowRate(`agent-propose:${clientKey(request)}`, 60, 60_000)) {
      return rateLimitResponse();
    }
    const wallet = readWalletSession(request);
    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet session required" },
        { status: 401 },
      );
    }
    if (!assertCsrf(request)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }

    const parsed = await readJsonBody<Body>(request, 16_384);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status },
      );
    }
    const body = parsed.body;

    // Fail closed on client economic overrides
    const forbiddenOverrides = [
      "payee",
      "amountBaseUnits",
      "mint",
      "resource",
      "settlementKind",
      "scenario",
      "selfPay",
      "fromOwner",
    ] as const;
    for (const key of forbiddenOverrides) {
      if (body[key] !== undefined) {
        return NextResponse.json(
          {
            error: `Client override of ${key} is not allowed — catalog binding only`,
            code: "client_override_rejected",
          },
          { status: 400 },
        );
      }
    }

    if (!body.resourceId || typeof body.resourceId !== "string") {
      return NextResponse.json(
        { error: "resourceId is required" },
        { status: 400 },
      );
    }

    if (body.taskId) {
      const task = getTask(body.taskId);
      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
      if (task.ownerWallet !== wallet) {
        return NextResponse.json(
          { error: "Forbidden — task owned by another wallet" },
          { status: 403 },
        );
      }
    }

    return await withLedgerLock(async () => {
      const result = evaluateCatalogPropose({
        resourceId: body.resourceId!,
        taskId: body.taskId,
        fromOwner: wallet,
        label: body.label,
        allowAdversarialFixture: false,
      });

      appendAudit("agent.propose", {
        entryId: result.entry.id,
        resourceId: body.resourceId,
        taskId: body.taskId,
        decision: result.decision.status,
        reserved: result.reserved,
        dryRun: Boolean(body.dryRun),
        policyVersion: POLICY_VERSION,
      });

      return NextResponse.json({
        entry: result.entry,
        decision: result.decision,
        reserved: result.reserved,
        next: body.dryRun && result.next === "settle" ? "dry_run_complete" : result.next,
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
  return NextResponse.json({
    catalog: listCatalog().map(({ paidBody: _p, ...row }) => row),
    note: "POST /api/agent/propose is catalog-bound: supply resourceId (+ taskId). Client payee/amount/mint overrides are rejected.",
  });
}
