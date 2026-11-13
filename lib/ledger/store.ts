import { createHash, randomUUID } from "node:crypto";
import { appendAudit } from "@/lib/security/audit";
import { POLICY_VERSION } from "@/lib/policy/version";
import { X402_DEVNET_NETWORK } from "@/lib/solana/config";
import type {
  BudgetSnapshot,
  CreateLedgerInput,
  LedgerEntry,
  PaymentStatus,
  ResearchTask,
  StreamEvent,
  TimelineEvent,
} from "./types";
import {
  CONFIRMED_STATUSES,
  IMMUTABLE_INTENT_FIELDS,
  RESERVED_STATUSES,
} from "./types";
import {
  closeLedgerDb,
  loadAllFromDb,
  openLedgerDb,
  upsertEntry,
  upsertStreamEvent,
  upsertTask,
  withDbTransaction,
} from "./db";

type LedgerState = {
  entries: Map<string, LedgerEntry>;
  tasks: Map<string, ResearchTask>;
  streamEvents: StreamEvent[];
  loaded: boolean;
};

declare global {
  var __policyDeskLedger: LedgerState | undefined;
  var __policyDeskLedgerChain: Promise<unknown> | undefined;
  var __policyDeskLedgerTestMode: boolean | undefined;
}

function state(): LedgerState {
  if (!globalThis.__policyDeskLedger) {
    globalThis.__policyDeskLedger = {
      entries: new Map(),
      tasks: new Map(),
      streamEvents: [],
      loaded: false,
    };
  }
  const s = globalThis.__policyDeskLedger;
  if (!Array.isArray(s.streamEvents)) s.streamEvents = [];
  if (!(s.tasks instanceof Map)) s.tasks = new Map();
  return s;
}

/**
 * Serialize async mutations in-process.
 * Durable mutual exclusion across processes uses SQLite BEGIN IMMEDIATE
 * in persist helpers — do not claim the in-process chain alone is enough
 * for multi-worker deployments.
 */
export async function withLedgerLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const prev = globalThis.__policyDeskLedgerChain ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  globalThis.__policyDeskLedgerChain = prev.then(() => gate);
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
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
    taskId: input.taskId ?? null,
    resourceId: input.resourceId ?? null,
    network: input.network ?? X402_DEVNET_NETWORK,
    policyVersion: input.policyVersion ?? POLICY_VERSION,
    quoteId: input.quoteId ?? null,
    fromOwner: input.fromOwner ?? null,
  });
  return createHash("sha256").update(payload).digest("hex");
}

function persistEntry(entry: LedgerEntry): void {
  const db = openLedgerDb();
  withDbTransaction(db, () => {
    upsertEntry(db, entry);
  });
}

function persistTask(task: ResearchTask): void {
  const db = openLedgerDb();
  withDbTransaction(db, () => {
    upsertTask(db, task);
  });
}

function persistStream(event: StreamEvent, trim = true): void {
  const db = openLedgerDb();
  withDbTransaction(db, () => {
    upsertStreamEvent(db, event);
    if (trim) {
      db.prepare(
        `DELETE FROM stream_events WHERE id NOT IN (
          SELECT id FROM stream_events ORDER BY received_at DESC LIMIT 200
        )`,
      ).run();
    }
  });
}

function ensureLoaded(): void {
  const s = state();
  if (s.loaded) return;
  s.loaded = true;
  try {
    const db = openLedgerDb();
    const loaded = loadAllFromDb(db);
    for (const entry of loaded.entries) s.entries.set(entry.id, entry);
    for (const task of loaded.tasks) s.tasks.set(task.id, task);
    s.streamEvents.push(...loaded.streamEvents);
  } catch {
    /* start empty if DB cannot open */
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

export function findLedgerBySignature(
  signature: string,
): LedgerEntry | undefined {
  ensureLoaded();
  for (const e of state().entries.values()) {
    if (e.signature === signature) return e;
  }
  return undefined;
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
    taskId: input.taskId,
    resourceId: input.resourceId,
    network: input.network ?? X402_DEVNET_NETWORK,
    policyVersion: input.policyVersion ?? POLICY_VERSION,
    quoteExpiresAt: input.quoteExpiresAt,
    quoteId: input.quoteId,
    fromOwner: input.fromOwner,
    productId: input.productId,
    reservationReleased: false,
    deliveryStatus: "pending",
  };
  state().entries.set(entry.id, entry);
  persistEntry(entry);
  appendAudit("ledger.create", {
    entryId: entry.id,
    label: entry.label,
    amountBaseUnits: entry.amountBaseUnits,
    taskId: entry.taskId,
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

  if (
    patch.fromOwner !== undefined &&
    existing.fromOwner &&
    patch.fromOwner !== existing.fromOwner
  ) {
    throw new Error("Cannot rebind fromOwner on payment intent");
  }

  const next: LedgerEntry = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
    intentHash: existing.intentHash,
    fromOwner: existing.fromOwner ?? patch.fromOwner,
  };
  state().entries.set(id, next);
  persistEntry(next);
  return next;
}

export function setLedgerStatus(
  id: string,
  status: PaymentStatus,
  patch: Partial<LedgerEntry> = {},
): LedgerEntry {
  const next = updateLedgerEntry(id, { ...patch, status });
  if (
    ["rejected", "cancelled", "blocked", "failed"].includes(status) &&
    !next.reservationReleased
  ) {
    const released = updateLedgerEntry(id, { reservationReleased: true });
    appendAudit("ledger.release", { entryId: id, status });
    appendAudit("ledger.status", {
      entryId: id,
      status,
      policyStatus: released.policyStatus,
      policyCode: released.policyCode,
    });
    return released;
  }
  appendAudit("ledger.status", {
    entryId: id,
    status,
    policyStatus: next.policyStatus,
    policyCode: next.policyCode,
  });
  return next;
}

/** Amounts held against daily/task caps (not released). */
export function reservedBaseUnits(
  taskId?: string,
  excludeEntryId?: string,
): bigint {
  ensureLoaded();
  let total = 0n;
  for (const e of state().entries.values()) {
    if (excludeEntryId && e.id === excludeEntryId) continue;
    if (taskId && e.taskId !== taskId) continue;
    if (e.reservationReleased) continue;
    if (RESERVED_STATUSES.includes(e.status)) {
      total += BigInt(e.amountBaseUnits);
    }
  }
  return total;
}

export function confirmedBaseUnits(
  taskId?: string,
  excludeEntryId?: string,
): bigint {
  ensureLoaded();
  let total = 0n;
  for (const e of state().entries.values()) {
    if (excludeEntryId && e.id === excludeEntryId) continue;
    if (taskId && e.taskId !== taskId) continue;
    if (CONFIRMED_STATUSES.includes(e.status)) {
      total += BigInt(e.amountBaseUnits);
    }
  }
  return total;
}

/**
 * Pending + settled against daily cap.
 * When rechecking an existing intent, pass excludeEntryId so its reservation
 * is not double-counted.
 *
 * Durability: SQLite file (`.data/ledger.sqlite`) with BEGIN IMMEDIATE writes.
 * In-process `withLedgerLock` covers async interleaving in one Node process.
 * Multi-worker: rely on SQLite locking + prefer a single writer; do not claim
 * the in-process mutex alone protects cross-process budgets.
 *
 * Daily boundary: rolling 24h is NOT implemented; “daily” = ledger lifetime
 * until DB reset. Unresolved (confirming) stays reserved.
 */
export function dailySpentBaseUnits(excludeEntryId?: string): bigint {
  return (
    reservedBaseUnits(undefined, excludeEntryId) +
    confirmedBaseUnits(undefined, excludeEntryId)
  );
}

export function budgetSnapshot(dailyCapBaseUnits: bigint): BudgetSnapshot {
  const reserved = reservedBaseUnits();
  const confirmed = confirmedBaseUnits();
  const used = reserved + confirmed;
  const remaining =
    dailyCapBaseUnits > used ? dailyCapBaseUnits - used : 0n;
  return {
    availableBaseUnits: remaining.toString(),
    reservedBaseUnits: reserved.toString(),
    confirmedBaseUnits: confirmed.toString(),
    remainingBaseUnits: remaining.toString(),
    dailyCapBaseUnits: dailyCapBaseUnits.toString(),
  };
}

/**
 * Atomically reserve against daily cap. Returns null if insufficient.
 * Call inside withLedgerLock for concurrent safety.
 */
export function tryReserveAgainstDailyCap(
  amountBaseUnits: bigint,
  dailyCapBaseUnits: bigint,
): boolean {
  const used = dailySpentBaseUnits();
  return used + amountBaseUnits <= dailyCapBaseUnits;
}

export function createTask(input: {
  prompt: string;
  budgetBaseUnits: string;
  ownerWallet?: string;
  mode?: "fixture" | "live";
}): ResearchTask {
  ensureLoaded();
  const ts = nowIso();
  const mode = input.mode ?? "fixture";
  const task: ResearchTask = {
    id: randomUUID(),
    createdAt: ts,
    updatedAt: ts,
    prompt: input.prompt,
    budgetBaseUnits: input.budgetBaseUnits,
    reservedBaseUnits: "0",
    spentBaseUnits: "0",
    status: "running",
    mode,
    ownerWallet: input.ownerWallet,
    timeline: [
      {
        id: randomUUID(),
        ts,
        kind: "task.started",
        message: `Task started with budget ${input.budgetBaseUnits} base units (${mode} mode).`,
      },
    ],
  };
  state().tasks.set(task.id, task);
  persistTask(task);
  appendAudit("task.create", {
    taskId: task.id,
    budgetBaseUnits: task.budgetBaseUnits,
  });
  return task;
}

export function getTask(id: string): ResearchTask | undefined {
  ensureLoaded();
  return state().tasks.get(id);
}

export function listTasks(): ResearchTask[] {
  ensureLoaded();
  return [...state().tasks.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export function appendTaskEvent(
  taskId: string,
  event: Omit<TimelineEvent, "id" | "ts"> & { id?: string; ts?: string },
): ResearchTask {
  ensureLoaded();
  const task = state().tasks.get(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const nextEvent: TimelineEvent = {
    id: event.id ?? randomUUID(),
    ts: event.ts ?? nowIso(),
    kind: event.kind,
    message: event.message,
    entryId: event.entryId,
    meta: event.meta,
  };
  const next: ResearchTask = {
    ...task,
    updatedAt: nowIso(),
    timeline: [...task.timeline, nextEvent],
  };
  state().tasks.set(taskId, next);
  persistTask(next);
  return next;
}

export function updateTask(
  taskId: string,
  patch: Partial<ResearchTask>,
): ResearchTask {
  ensureLoaded();
  const task = state().tasks.get(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const next: ResearchTask = {
    ...task,
    ...patch,
    id: task.id,
    createdAt: task.createdAt,
    updatedAt: nowIso(),
    timeline: patch.timeline ?? task.timeline,
  };
  state().tasks.set(taskId, next);
  persistTask(next);
  return next;
}

export function syncTaskBudgetFromLedger(taskId: string): ResearchTask {
  const reserved = reservedBaseUnits(taskId);
  const spent = confirmedBaseUnits(taskId);
  return updateTask(taskId, {
    reservedBaseUnits: reserved.toString(),
    spentBaseUnits: spent.toString(),
  });
}

export function taskRemainingBaseUnits(taskId: string): bigint {
  const task = getTask(taskId);
  if (!task) return 0n;
  const budget = BigInt(task.budgetBaseUnits);
  const used = reservedBaseUnits(taskId) + confirmedBaseUnits(taskId);
  return budget > used ? budget - used : 0n;
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
  persistStream(event);
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

export function resetLedgerForTests(dbPath = ":memory:"): void {
  closeLedgerDb();
  process.env.LEDGER_DB_PATH = dbPath;
  globalThis.__policyDeskLedgerTestMode = true;
  const db = openLedgerDb(dbPath);
  withDbTransaction(db, () => {
    db.exec("DELETE FROM entries");
    db.exec("DELETE FROM tasks");
    db.exec("DELETE FROM stream_events");
  });
  globalThis.__policyDeskLedger = {
    entries: new Map(),
    tasks: new Map(),
    streamEvents: [],
    loaded: true,
  };
  globalThis.__policyDeskLedgerChain = Promise.resolve();
}

/** Drop in-memory cache and reopen SQLite from disk (restart simulation). */
export function reopenLedgerFromDisk(): void {
  closeLedgerDb();
  globalThis.__policyDeskLedger = {
    entries: new Map(),
    tasks: new Map(),
    streamEvents: [],
    loaded: false,
  };
  globalThis.__policyDeskLedgerChain = Promise.resolve();
  ensureLoaded();
}
