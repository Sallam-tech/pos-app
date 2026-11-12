import {invoicesSteps} from "./invoices-program";
import {invoiceMigrationTransaction} from "./invoices-migrate";
import "server-only";
import {expensesSteps} from "./expenses-program";
import { returnsSteps } from "./returns-program";
import { salesSteps } from "./sales-program";

import { createRequire } from "node:module";
import { types } from "node:util";
import { DatabaseFoundationError } from "./errors";
import { int64 } from "./integers";
import { resolveDatabaseLocation, type DatabaseOptions } from "./location";

export type SqlValue = string | bigint | Uint8Array | null;
export type SqlRow = Readonly<Record<string, SqlValue>>;
export interface SqlReader {
  get(sql: string, bindings?: readonly SqlValue[]): SqlRow | undefined;
  all(sql: string, bindings?: readonly SqlValue[]): SqlRow[];
}
export interface SqlTransaction extends SqlReader {
  run(sql: string, bindings?: readonly SqlValue[]): { changes: bigint; lastInsertRowid: bigint };
  setSchemaVersion(version: bigint): void;
}
const invoiceExecutors=new WeakMap<object,()=>{applied:number;version:bigint}>();
export function executeReviewedInvoiceMigration39(connection:SqliteConnection){assertDisposableMigrationConnection(connection);const execute=invoiceExecutors.get(connection);if(!execute)throw Error("TEST maintenance unavailable.");return execute();}
const maintenanceExecutors=new WeakMap<object,(tx:SqlTransaction,version:36|37|38)=>void>();
export function executeReviewedSalesProgram(connection:SqliteConnection,tx:SqlTransaction){assertDisposableMigrationConnection(connection);const execute=maintenanceExecutors.get(connection);if(!execute)throw Error("Maintenance unavailable.");execute(tx,36);}
export function executeReviewedReturnsProgram(connection:SqliteConnection,tx:SqlTransaction){assertDisposableMigrationConnection(connection);const execute=maintenanceExecutors.get(connection);if(!execute)throw Error("Maintenance unavailable.");execute(tx,37);}
export function executeReviewedExpensesProgram(connection:SqliteConnection,tx:SqlTransaction){assertDisposableMigrationConnection(connection);const execute=maintenanceExecutors.get(connection);if(!execute)throw Error();execute(tx,38);}
const disposableConnections = new WeakMap<object, () => void>();
// Private migration admission, not a database/SQL capability. Structural clones
// and persistent connections cannot opt themselves into TEST schema35 writes.
export function assertDisposableMigrationConnection(connection: SqliteConnection): void {
 const guard = disposableConnections.get(connection);
 if (!guard) throw new DatabaseFoundationError("MIGRATION_INVALID", "Reviewed inventory upgrade requires a genuine isolated TEST connection.");
 guard();
}
export interface SqliteConnection extends SqlReader {
  readonly settings: Readonly<{ sqliteVersion: string; journalMode: "wal"; foreignKeys: true; synchronous: "FULL"; busyTimeoutMs: number }>;
  transaction<T>(work: (transaction: SqlTransaction) => T): T;
  close(): void;
}

// Narrow boundary for the pinned CJS driver; no additional typing dependency.
interface NativeStatement {
  readonly readonly: boolean;
  get(...bindings: unknown[]): unknown;
  all(...bindings: unknown[]): unknown[];
  run(...bindings: unknown[]): { changes: number; lastInsertRowid: unknown };
}
interface NativeDatabase {
  readonly inTransaction: boolean;
  prepare(sql: string): NativeStatement;
  exec(sql: string): void;
  pragma(sql: string, options?: { simple: boolean }): unknown;
  defaultSafeIntegers(enabled: boolean): void;
  close(): void;
}
type NativeConstructor = new (filename: string, options: { timeout: number; fileMustExist: boolean }) => NativeDatabase;

function fail(code: string, message: string): never { throw new DatabaseFoundationError(code, message); }
function keyword(sql: string): string {
  if (typeof sql !== "string" || sql.length > 1024 * 1024) return "";
  return sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "").match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? "";
}
function parameters(values: readonly SqlValue[]): unknown[] {
  if (!Array.isArray(values)) fail("SQL_REJECTED", "Positional SQL bindings must be an array.");
  return values.map((value) => {
    if (typeof value === "bigint") return int64(value);
    if (typeof value === "string" || value === null) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    return fail("UNSAFE_INTEGER", "SQL bindings accept BigInt integers, text, bytes or null only.");
  });
}
function row(value: unknown): SqlRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("STATEMENT_FAILED", "Unexpected SQL row.");
  for (const field of Object.values(value)) {
    if (typeof field === "bigint") int64(field);
    else if (field !== null && typeof field !== "string" && !(field instanceof Uint8Array)) {
      fail("UNSAFE_INTEGER", "SQL numeric results must be signed 64-bit integers; REAL results are unsupported.");
    }
  }
  return value as SqlRow;
}
function statementError(cause: unknown): never {
  if (cause instanceof DatabaseFoundationError) throw cause;
  throw new DatabaseFoundationError("STATEMENT_FAILED", "SQLite statement failed.", cause);
}

export function openDatabase(options: DatabaseOptions): SqliteConnection {
  const location = resolveDatabaseLocation(options);
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (typeof window !== "undefined" || process.platform !== "win32" || process.arch !== "x64" || major !== 24 || minor < 11) {
    fail("RUNTIME_UNSUPPORTED", "This foundation requires the reviewed Windows x64 / Node 24.11+ runtime.");
  }
  let native: NativeDatabase;
  try {
    const require = createRequire(import.meta.url);
    const metadata = require("better-sqlite3/package.json") as { version?: unknown };
    if (metadata.version !== "13.0.3") fail("RUNTIME_UNSUPPORTED", "SQLite driver version requires review.");
    const Driver = require("better-sqlite3") as NativeConstructor;
    native = new Driver(location.filename, { timeout: location.busyTimeoutMs, fileMustExist: !options.create });
  } catch (cause) {
    if (cause instanceof DatabaseFoundationError) throw cause;
    throw new DatabaseFoundationError("OPEN_FAILED", "Could not open the configured SQLite database.", cause);
  }
  try {
    native.defaultSafeIntegers(true);
    const runtime = row(native.prepare("SELECT sqlite_version() AS version, sqlite_source_id() AS source").get());
    if (runtime.version !== "3.53.4" || runtime.source !== "2026-07-24 19:02:57 bf7c7f30031888f4e796e429ab3978879485813aaca6f641c7b33e4e09459bcc") {
      fail("RUNTIME_UNSUPPORTED", "Embedded SQLite runtime requires compatibility review.");
    }
    if (native.pragma("quick_check", { simple: true }) !== "ok") fail("OPEN_FAILED", "Database integrity preflight failed.");
    native.pragma("foreign_keys = ON");
    native.pragma("synchronous = FULL");
    native.pragma(`busy_timeout = ${location.busyTimeoutMs}`);
    native.pragma("trusted_schema = OFF");
    if (
      native.pragma("journal_mode = WAL", { simple: true }) !== "wal" ||
      native.pragma("foreign_keys", { simple: true }) !== BigInt(1) ||
      native.pragma("synchronous", { simple: true }) !== BigInt(2) ||
      native.pragma("busy_timeout", { simple: true }) !== BigInt(location.busyTimeoutMs) ||
      native.prepare("SELECT * FROM pragma_foreign_key_check").all().length !== 0
    ) fail("OPEN_FAILED", "SQLite connection safety checks failed.");
  } catch (cause) {
    try { native.close(); } catch { /* Original preflight failure is authoritative. No file is replaced. */ }
    if (cause instanceof DatabaseFoundationError) throw cause;
    throw new DatabaseFoundationError("OPEN_FAILED", "SQLite connection preflight failed.", cause);
  }

  let closed = false;
  let active = false;
  let currentScope:SqlTransaction|undefined;
  let maintenanceFailed = false;
  const assertOpen = () => { if (closed) fail("CONNECTION_CLOSED", "Database connection is closed."); };
  const read = (sql: string, bindings: readonly SqlValue[], many: boolean): SqlRow | SqlRow[] | undefined => {
    try {
      if (!["SELECT", "WITH"].includes(keyword(sql))) fail("SQL_REJECTED", "Only read-only SELECT queries are accepted here.");
      const values = parameters(bindings);
      const statement = native.prepare(sql);
      if (!statement.readonly) fail("SQL_REJECTED", "This query is not read-only.");
      if (many) return statement.all(...values).map(row);
      const value = statement.get(...values);
      return value === undefined ? undefined : row(value);
    } catch (cause) { return statementError(cause); }
  };
  const reader = (guard: () => void): SqlReader => ({
    get: (sql, bindings = []) => { guard(); return read(sql, bindings, false) as SqlRow | undefined; },
    all: (sql, bindings = []) => { guard(); return read(sql, bindings, true) as SqlRow[]; },
  });
  const outside = () => { assertOpen(); if (active) fail("CONNECTION_BUSY", "Use the current transaction scope."); };

  const connection: SqliteConnection = Object.freeze({
    settings: Object.freeze({ sqliteVersion: "3.53.4", journalMode: "wal" as const, foreignKeys: true as const, synchronous: "FULL" as const, busyTimeoutMs: location.busyTimeoutMs }),
    ...reader(outside),
    transaction<T>(work: (transaction: SqlTransaction) => T): T {
      outside();
      if (typeof work !== "function" || types.isAsyncFunction(work) || types.isGeneratorFunction(work)) {
        return fail("SQL_REJECTED", "Transaction callbacks must be ordinary synchronous functions.");
      }
      let live = false;
      try {
        native.exec("BEGIN IMMEDIATE");
        active = live = true;
        const guard = () => {
          assertOpen();
          if (maintenanceFailed) fail("TRANSACTION_FAILED", "Maintenance transaction is unusable.");
          if (!live || !native.inTransaction) fail("SCOPE_CLOSED", "Transaction scope is no longer active.");
        };
        const scope: SqlTransaction = Object.freeze({
          ...reader(guard),
          run(sql: string, bindings: readonly SqlValue[] = []) {
            guard();
            try {
              if (!["INSERT", "UPDATE", "DELETE", "CREATE"].includes(keyword(sql))) {
                fail("SQL_REJECTED", "Transaction control and connection configuration SQL are forbidden.");
              }
              const values = parameters(bindings);
              const result = native.prepare(sql).run(...values);
              if (!Number.isSafeInteger(result.changes) || result.changes < 0) fail("UNSAFE_INTEGER", "Invalid affected-row count.");
              return { changes: BigInt(result.changes), lastInsertRowid: int64(result.lastInsertRowid) };
            } catch (cause) { return statementError(cause); }
          },
          setSchemaVersion(version: bigint) {
            guard(); int64(version);
            if (version < BigInt(0) || version > BigInt("2147483647")) fail("SQL_REJECTED", "Invalid schema version.");
            native.pragma(`user_version = ${version.toString()}`);
          },
        });
        currentScope=scope;
        const result = work(scope);
        live = false;
        if (result && (typeof result === "object" || typeof result === "function")) {
          const promise = types.isPromise(result);
          if (
            promise || types.isGeneratorObject(result) ||
            ("then" in result && typeof result.then === "function") ||
            ("next" in result && typeof result.next === "function")
          ) {
            if (promise) void Promise.prototype.then.call(result, undefined, () => undefined);
            fail("SQL_REJECTED", "Transactions cannot return deferred work or iterators.");
          }
        }
        if (maintenanceFailed) fail("TRANSACTION_FAILED", "Maintenance transaction is unusable.");
        if (!native.inTransaction) fail("TRANSACTION_FAILED", "Transaction ended before controlled commit.");
        native.exec("COMMIT");
        return result;
      } catch (cause) {
        try { if (native.inTransaction) native.exec("ROLLBACK"); } catch (rollbackCause) {
          closed = true;
          try { native.close(); } catch { /* Connection is quarantined regardless. */ }
          throw new DatabaseFoundationError("TRANSACTION_FAILED", "Rollback failed; connection is unusable.", new AggregateError([cause, rollbackCause]));
        }
        if (cause instanceof DatabaseFoundationError) throw cause;
        throw new DatabaseFoundationError("TRANSACTION_FAILED", "Transaction failed; no success was acknowledged.", cause);
      } finally { live = active = false; currentScope=undefined; maintenanceFailed=false; }
    },
    close() {
      if (closed) return;
      if (active) fail("CONNECTION_BUSY", "Cannot close an active transaction.");
      try { native.close(); closed = true; } catch (cause) {
        closed = true;
        throw new DatabaseFoundationError("CLOSE_FAILED", "Database connection could not close safely.", cause);
      }
    },
  });
  if (options.mode === "test") disposableConnections.set(connection, () => { assertOpen(); resolveDatabaseLocation({ ...options, create: false }); });
  if (options.mode === "test") maintenanceExecutors.set(connection, (tx,target) => {
    assertOpen();
    if (!active || !native.inTransaction || tx !== currentScope || maintenanceFailed) fail("SCOPE_CLOSED", "Maintenance scope unavailable.");
    // Poison the entire transaction until every pinned step succeeds. Catching
    // a native statement failure must never permit a partial DDL COMMIT.
    maintenanceFailed = true;
    const version = row(native.prepare("SELECT user_version FROM pragma_user_version").get()).user_version;
    if (version !== BigInt(target-1) || native.prepare("SELECT id FROM auth_enrollment_binding LIMIT 1").get() !== undefined) fail("MIGRATION_INVALID", "Only unenrolled disposable TEST schema35 is admitted.");
    for (const sql of (target===36?salesSteps():target===37?returnsSteps():expensesSteps())) native.prepare(sql).run();
    maintenanceFailed = false;
  });
  if(options.mode==="test")invoiceExecutors.set(connection,()=>{
    outside();assertDisposableMigrationConnection(connection);
    const marker=native.pragma("user_version",{simple:true});
    if((marker!==BigInt(38)&&marker!==BigInt(39))||native.prepare("SELECT id FROM auth_enrollment_binding LIMIT 1").get()!==undefined)fail("MIGRATION_INVALID","Only unenrolled TEST38/39 maintenance is admitted.");
    // SQLite's documented rebuild procedure: enforcement is disabled only on
    // this confined maintenance handle, outside BEGIN. Source/target FK checks
    // and full preservation execute in the same atomic writer transaction.
    native.pragma("foreign_keys=OFF");
    try{return connection.transaction(tx=>invoiceMigrationTransaction(tx,()=>{
      if(!active||tx!==currentScope||!native.inTransaction)throw Error();
      maintenanceFailed=true;for(const sql of invoicesSteps())native.prepare(sql).run();maintenanceFailed=false;
    }));}finally{
      native.pragma("foreign_keys=ON");
      if(native.pragma("foreign_keys",{simple:true})!==BigInt(1)){closed=true;try{native.close();}catch{}throw Error("Maintenance handle quarantined.");}
    }
  });
  return connection;
}
