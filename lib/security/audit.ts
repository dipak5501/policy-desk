import { appendFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

export type AuditEvent = {
  ts: string;
  kind: string;
  entryId?: string;
  detail?: Record<string, unknown>;
};

declare global {
  var __policyDeskAudit: AuditEvent[] | undefined;
}

function mem(): AuditEvent[] {
  if (!globalThis.__policyDeskAudit) globalThis.__policyDeskAudit = [];
  return globalThis.__policyDeskAudit;
}

function auditPath(): string {
  return path.join(process.cwd(), ".data", "audit.jsonl");
}

export function appendAudit(
  kind: string,
  detail?: Record<string, unknown> & { entryId?: string },
): void {
  const event: AuditEvent = {
    ts: new Date().toISOString(),
    kind,
    entryId: detail?.entryId,
    detail,
  };
  mem().unshift(event);
  if (mem().length > 500) mem().length = 500;
  try {
    const dir = path.dirname(auditPath());
    mkdirSync(dir, { recursive: true });
    appendFileSync(auditPath(), JSON.stringify(event) + "\n", "utf8");
  } catch {
    /* best-effort */
  }
}

export function listAudit(limit = 50): AuditEvent[] {
  return mem().slice(0, limit);
}

export function resetAuditForTests(): void {
  globalThis.__policyDeskAudit = [];
  try {
    if (existsSync(auditPath())) writeFileSync(auditPath(), "", "utf8");
  } catch {
    /* ignore */
  }
}
