import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { appendAudit } from "@/lib/security/audit";
import type {
  CreateLedgerInput,
  LedgerEntry,
  PaymentStatus,
  StreamEvent,
} from "./types";
import { IMMUTABLE_INTENT_FIELDS } from "./types";

type LedgerState = {
  entries: Map<string, LedgerEntry>;
  streamEvents: StreamEvent[];
  loaded: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __policyDeskLedger: LedgerState | undefined;
}

function state(): LedgerState {
  if (!globalThis.__policyDeskLedger) {
    globalThis.__policyDeskLedger = {
      entries: new Map(),
      streamEvents: [],
      loaded: false,
    };
  }
  const s = globalThis.__policyDeskLedger;
  // Hot-reload / older process state may lack streamEvents.
  if (!Array.isArray(s.streamEvents)) s.streamEvents = [];
  return s;
}

function dataPath(): string {
  return path.join(process.cwd(), ".data", "ledger.json");
}

function nowIso(): string {
  return new Date().toISOString();
}

function intentHash(input: CreateLedgerInput): string {
  const payload = JSON.stringify({
    label: input.label,
    resource: input.resource,
    payee: input.payee,
    amountBaseUnits: input.amountBaseUnits,
    mint: input.mint,
    settlementKind: input.settlementKind ?? "spl_usdc",
    scenario: input.scenario ?? null,
  });
  return createHash("sha256").update(payload).digest("hex");
}

function persist(): void {
  try {
    const dir = path.dirname(dataPath());
    mkdirSync(dir, { recursive: true });
    const s = state();
    const list = [...s.entries.values()];
    writeFileSync(
      dataPath(),
      JSON.stringify(
        { entries: list, streamEvents: s.streamEvents.slice(0, 200) },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    /* best-effort */
  }
}

function ensureLoaded(): void {
  const s = state();
  if (s.loaded) return;
  s.loaded = true;
  try {
    if (!existsSync(dataPath())) return;
    const raw = readFileSync(dataPath(), "utf8");
    const parsed = JSON.parse(raw) as {
      entries?: LedgerEntry[];
      streamEvents?: StreamEvent[];
    };
    for (const entry of parsed.entries ?? []) {
      s.entries.set(entry.id, entry);
    }
    if (Array.isArray(parsed.streamEvents)) {
      s.streamEvents.push(...parsed.streamEvents);
    }
  } catch {
    /* start empty */
  }
}

export function listLedger(): LedgerEntry[] {
  ensureLoaded();
  return [...state().entries.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export function getLedgerEntry(id: string): LedgerEntry | undefined {
  ensureLoaded();
  return state().entries.get(id);
}

export function createLedgerEntry(input: CreateLedgerInput): LedgerEntry {
  ensureLoaded();
  const ts = nowIso();
  const entry: LedgerEntry = {
    id: randomUUID(),
    createdAt: ts,
    updatedAt: ts,
    label: input.label,
    resource: input.resource,
    payee: input.payee,
    amountBaseUnits: input.amountBaseUnits,
    mint: input.mint,
    status: "proposed",
    settlementKind: input.settlementKind ?? "spl_usdc",
    intentHash: intentHash(input),
    scenario: input.scenario,
  };
  state().entries.set(entry.id, entry);
  persist();
  appendAudit("ledger.create", {
    entryId: entry.id,
    label: entry.label,
    amountBaseUnits: entry.amountBaseUnits,
  });
  return entry;
}

export function updateLedgerEntry(
  id: string,
  patch: Partial<LedgerEntry>,
): LedgerEntry {
  ensureLoaded();
  const existing = state().entries.get(id);
  if (!existing) throw new Error(`Ledger entry ${id} not found`);

  for (const field of IMMUTABLE_INTENT_FIELDS) {
    if (
      field in patch &&
      patch[field] !== undefined &&
      patch[field] !== existing[field]
    ) {
      throw new Error(`Cannot mutate immutable intent field: ${field}`);
    }
  }

  const next: LedgerEntry = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
    intentHash: existing.intentHash,
  };
  state().entries.set(id, next);
  persist();
  return next;
}

export function setLedgerStatus(
  id: string,
  status: PaymentStatus,
  patch: Partial<LedgerEntry> = {},
): LedgerEntry {
  const next = updateLedgerEntry(id, { ...patch, status });
  appendAudit("ledger.status", {
    entryId: id,
    status,
    policyStatus: next.policyStatus,
    policyCode: next.policyCode,
  });
  return next;
}

/** Pending + settled count against daily cap (honest reservation). */
export function dailySpentBaseUnits(): bigint {
  ensureLoaded();
  let total = 0n;
  for (const e of state().entries.values()) {
    if (
      ["pending", "awaiting_approval", "approved", "ready_to_sign", "confirming", "settled"].includes(
        e.status,
      )
    ) {
      total += BigInt(e.amountBaseUnits);
    }
  }
  return total;
}

export function appendStreamEvent(input: {
  signature?: string;
  summary: string;
  raw?: unknown;
}): StreamEvent {
  ensureLoaded();
  const event: StreamEvent = {
    id: randomUUID(),
    receivedAt: nowIso(),
    source: "quicknode_streams",
    signature: input.signature,
    summary: input.summary,
    raw: input.raw,
  };
  const s = state();
  s.streamEvents.unshift(event);
  if (s.streamEvents.length > 200) s.streamEvents.length = 200;
  persist();
  appendAudit("streams.event", {
    eventId: event.id,
    signature: event.signature,
  });
  return event;
}

export function listStreamEvents(limit = 40): StreamEvent[] {
  ensureLoaded();
  return state().streamEvents.slice(0, limit);
}

export function resetLedgerForTests(): void {
  globalThis.__policyDeskLedger = {
    entries: new Map(),
    streamEvents: [],
    loaded: true,
  };
}
