import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import type { LedgerEntry, ResearchTask, StreamEvent } from "./types";

export type LedgerDb = DatabaseSync;

type JsonFileShape = {
  entries?: LedgerEntry[];
  tasks?: ResearchTask[];
  streamEvents?: StreamEvent[];
};

declare global {
  var __policyDeskSqlite: {
    db: DatabaseSync;
    path: string;
  } | undefined;
}

function defaultDbPath(): string {
  if (process.env.LEDGER_DB_PATH) return process.env.LEDGER_DB_PATH;
  return path.join(process.cwd(), ".data", "ledger.sqlite");
}

function migrateFromJsonIfNeeded(db: DatabaseSync, sqlitePath: string): void {
  const jsonPath = path.join(path.dirname(sqlitePath), "ledger.json");
  if (!existsSync(jsonPath)) return;
  const row = db.prepare("SELECT COUNT(*) AS c FROM entries").get() as
    | { c: number }
    | undefined;
  if (row && row.c > 0) return;
  try {
    const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as JsonFileShape;
    const insertEntry = db.prepare(
      "INSERT OR REPLACE INTO entries (id, data) VALUES (?, ?)",
    );
    const insertTask = db.prepare(
      "INSERT OR REPLACE INTO tasks (id, data) VALUES (?, ?)",
    );
    const insertStream = db.prepare(
      "INSERT OR REPLACE INTO stream_events (id, received_at, data) VALUES (?, ?, ?)",
    );
    db.exec("BEGIN IMMEDIATE");
    for (const e of parsed.entries ?? []) {
      insertEntry.run(e.id, JSON.stringify(e));
    }
    for (const t of parsed.tasks ?? []) {
      insertTask.run(t.id, JSON.stringify(t));
    }
    for (const s of parsed.streamEvents ?? []) {
      insertStream.run(s.id, s.receivedAt, JSON.stringify(s));
    }
    db.exec("COMMIT");
    try {
      renameSync(jsonPath, `${jsonPath}.migrated`);
    } catch {
      /* keep json if rename fails */
    }
  } catch {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
  }
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stream_events (
      id TEXT PRIMARY KEY NOT NULL,
      received_at TEXT NOT NULL,
      data TEXT NOT NULL
    );
  `);
}

/**
 * Open the durable SQLite ledger.
 * Uses BEGIN IMMEDIATE on write transactions for cross-process mutual exclusion
 * on the DB file (not an in-process mutex alone).
 */
export function openLedgerDb(dbPath = defaultDbPath()): DatabaseSync {
  if (
    globalThis.__policyDeskSqlite &&
    globalThis.__policyDeskSqlite.path === dbPath
  ) {
    return globalThis.__policyDeskSqlite.db;
  }
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  initSchema(db);
  if (dbPath !== ":memory:") {
    migrateFromJsonIfNeeded(db, dbPath);
  }
  globalThis.__policyDeskSqlite = { db, path: dbPath };
  return db;
}

export function closeLedgerDb(): void {
  const slot = globalThis.__policyDeskSqlite;
  if (!slot) return;
  try {
    slot.db.close();
  } catch {
    /* ignore */
  }
  globalThis.__policyDeskSqlite = undefined;
}

export function loadAllFromDb(db: DatabaseSync): {
  entries: LedgerEntry[];
  tasks: ResearchTask[];
  streamEvents: StreamEvent[];
} {
  const entries = (
    db.prepare("SELECT data FROM entries").all() as Array<{ data: string }>
  ).map((r) => JSON.parse(r.data) as LedgerEntry);
  const tasks = (
    db.prepare("SELECT data FROM tasks").all() as Array<{ data: string }>
  ).map((r) => JSON.parse(r.data) as ResearchTask);
  const streamEvents = (
    db
      .prepare("SELECT data FROM stream_events ORDER BY received_at DESC")
      .all() as Array<{ data: string }>
  ).map((r) => JSON.parse(r.data) as StreamEvent);
  return { entries, tasks, streamEvents };
}

export function persistAllToDb(
  db: DatabaseSync,
  entries: LedgerEntry[],
  tasks: ResearchTask[],
  streamEvents: StreamEvent[],
): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM entries");
    db.exec("DELETE FROM tasks");
    db.exec("DELETE FROM stream_events");
    const insertEntry = db.prepare(
      "INSERT INTO entries (id, data) VALUES (?, ?)",
    );
    const insertTask = db.prepare("INSERT INTO tasks (id, data) VALUES (?, ?)");
    const insertStream = db.prepare(
      "INSERT INTO stream_events (id, received_at, data) VALUES (?, ?, ?)",
    );
    for (const e of entries) insertEntry.run(e.id, JSON.stringify(e));
    for (const t of tasks) insertTask.run(t.id, JSON.stringify(t));
    for (const s of streamEvents.slice(0, 200)) {
      insertStream.run(s.id, s.receivedAt, JSON.stringify(s));
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function upsertEntry(db: DatabaseSync, entry: LedgerEntry): void {
  db.prepare("INSERT OR REPLACE INTO entries (id, data) VALUES (?, ?)").run(
    entry.id,
    JSON.stringify(entry),
  );
}

export function upsertTask(db: DatabaseSync, task: ResearchTask): void {
  db.prepare("INSERT OR REPLACE INTO tasks (id, data) VALUES (?, ?)").run(
    task.id,
    JSON.stringify(task),
  );
}

export function upsertStreamEvent(db: DatabaseSync, event: StreamEvent): void {
  db.prepare(
    "INSERT OR REPLACE INTO stream_events (id, received_at, data) VALUES (?, ?, ?)",
  ).run(event.id, event.receivedAt, JSON.stringify(event));
}

export function withDbTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export { defaultDbPath };
