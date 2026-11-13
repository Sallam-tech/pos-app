import {CASH40_NAME,CASH40_HASH} from "./cash-program";
import {INVOICES39_NAME,INVOICES39_HASH} from "./invoices-program";
import "server-only";
import {EXPENSES38_NAME,EXPENSES38_HASH} from "./expenses-program";
import { RETURNS37_NAME, RETURNS37_HASH } from "./returns-program";
import { SALES36_NAME, SALES36_HASH } from "./sales-program";

import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { immutableInventoryTables, reviewedInventoryTrigger, storedTriggerSql } from "./inventory-trigger-policy";
import { assertDisposableMigrationConnection, type SqliteConnection, type SqlTransaction } from "./connection";
import { schemaTokens } from "./schema-sql";
import { PINNED_SCHEMA_MIGRATIONS } from "./schema-pins";
import { DatabaseFoundationError } from "./errors";
import { rejectRedirectedPath } from "./location";

export interface Migration {
  readonly version: bigint;
  readonly name: string;
  readonly checksum: string;
  readonly sql: string;
  readonly objectType: "table" | "index" | "trigger" | "program";
  readonly objectTable: string;
  readonly objectName: string;
}
const HISTORY_SQL = `CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY CHECK(version BETWEEN 1 AND 9999),
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL CHECK(length(checksum) = 64 AND checksum NOT GLOB '*[^0-9a-f]*'),
  applied_at INTEGER NOT NULL CHECK(applied_at > 0)
) STRICT`;
const hash = (content: Uint8Array) => createHash("sha256").update(content).digest("hex");
const normalized = (sql: string) => sql.replace(/\s+/g, " ").trim().replace(/;$/, "");

export function loadMigrations(directory: string): readonly Migration[] {
  try {
    if (!path.isAbsolute(directory)) throw new Error("Absolute reviewed migration directory required.");
    rejectRedirectedPath(directory);
    const migrations: Migration[] = [];
    for (const entry of readdirSync(directory).filter((name) => /\.sql$/i.test(name)).sort()) {
      const match = /^([0-9]{4})_([a-z][a-z0-9_]*)\.sql$/.exec(entry);
      const filename = path.join(directory, entry);
      const stat = lstatSync(filename);
      if (!match || stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || stat.size > 1024 * 1024) {
        throw new Error("Invalid migration file.");
      }
      const bytes = readFileSync(filename);
      const sql = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if(entry===SALES36_NAME){if(hash(bytes)!==SALES36_HASH)throw Error("Reviewed Sales program changed.");migrations.push(Object.freeze({version:BigInt(36),name:entry,checksum:hash(bytes),sql,objectType:"program",objectName:"sales36_program",objectTable:""}));continue;}
      if(entry===RETURNS37_NAME){if(hash(bytes)!==RETURNS37_HASH)throw Error("Reviewed Returns program changed.");migrations.push(Object.freeze({version:BigInt(37),name:entry,checksum:hash(bytes),sql,objectType:"program",objectName:"returns37_program",objectTable:""}));continue;}
      if(entry===EXPENSES38_NAME){if(hash(bytes)!==EXPENSES38_HASH)throw Error();migrations.push(Object.freeze({version:BigInt(38),name:entry,checksum:hash(bytes),sql,objectType:"program",objectName:"expenses38_program",objectTable:""}));continue;}
      if(entry===CASH40_NAME){if(hash(bytes)!==CASH40_HASH)throw Error();migrations.push(Object.freeze({version:BigInt(40),name:entry,checksum:hash(bytes),sql,objectType:"program",objectName:"cash40_program",objectTable:""}));continue;}
      if(entry===INVOICES39_NAME){if(hash(bytes)!==INVOICES39_HASH)throw Error();migrations.push(Object.freeze({version:BigInt(39),name:entry,checksum:hash(bytes),sql,objectType:"program",objectName:"invoices39_program",objectTable:""}));continue;}
      const source = sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "");
      // Classify only the supported additive grammar. Actual STRICT status is
      // verified from SQLite metadata after execution, never from SQL text.
      const table = /^CREATE\s+TABLE\s+([a-z][a-z0-9_]*)\s*\(/i.exec(source);
      const trigger = reviewedInventoryTrigger(entry, hash(bytes));
      const index = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+([a-z][a-z0-9_]*)\s+ON\s+([a-z][a-z0-9_]*)\s*\(/i.exec(source);
      if (
        (!table && !index && !trigger) ||
        [table?.[1], index?.[1], index?.[2]].some((name) => name?.toLowerCase() === "schema_migrations")
      ) throw new Error("Migrations require one additive STRICT table, index or exact reviewed trigger.");
      migrations.push(Object.freeze({
        version: BigInt(match[1]), name: entry, checksum: hash(bytes), sql,
        objectType: table ? "table" as const : index ? "index" as const : "trigger" as const,
        objectName: table?.[1] ?? index?.[1] ?? trigger!.name,
        objectTable: table?.[1] ?? index?.[2] ?? trigger!.table,
      }));
    }
    if (migrations.length === 0 || migrations.some((migration, index) => migration.version !== BigInt(index + 1))) {
      throw new Error("A contiguous reviewed sequence starting at 0001 is required.");
    }
    return Object.freeze(migrations);
  } catch (cause) {
    throw new DatabaseFoundationError("MIGRATION_INVALID", "Migration files failed validation; no migrations applied.", cause);
  }
}

// Conservative source/target object check INSIDE the atomic writer reservation.
// Full index metadata is independently required by exact35 runtime admission.
function inventoryMigrationObjects(tx: SqlTransaction, migrations: readonly Migration[]) {
 const expected = new Map<string, { type: string; table: string; sql: string }>([["schema_migrations", { type: "table", table: "schema_migrations", sql: HISTORY_SQL }]]);
 for (const m of migrations) expected.set(m.objectName, { type: m.objectType, table: m.objectTable, sql: m.sql });
 const rows = tx.all("SELECT type,name,tbl_name,sql FROM main.sqlite_schema LIMIT 129");
 if (rows.length > 128) throw new Error("Schema budget exceeded.");
 const seen = new Set<string>();
 for (const row of rows) {
  if (typeof row.name !== "string" || typeof row.tbl_name !== "string" || seen.has(row.name)) throw new Error("Ambiguous migration schema.");
  seen.add(row.name); const wanted = expected.get(row.name);
  if (!wanted) {
   if (row.type === "index" && row.sql === null && expected.get(row.tbl_name)?.type === "table" &&
       row.name.startsWith("sqlite_autoindex_" + row.tbl_name + "_") && /^[1-9][0-9]*$/.test(row.name.slice(("sqlite_autoindex_" + row.tbl_name + "_").length))) continue;
   const statistics: Record<string, string> = { sqlite_stat1: "CREATE TABLE sqlite_stat1(tbl,idx,stat)", sqlite_stat4: "CREATE TABLE sqlite_stat4(tbl,idx,neq,nlt,ndlt,sample)" };
   if (row.type === "table" && row.tbl_name === row.name && Object.hasOwn(statistics,row.name) && typeof row.sql === "string" && schemaTokens(row.sql) === schemaTokens(statistics[row.name])) continue;
   throw new Error("Unreviewed migration schema object.");
  }
  if (row.type !== wanted.type || row.tbl_name !== wanted.table || typeof row.sql !== "string" ||
      (wanted.type === "trigger" ? storedTriggerSql(row.sql) !== storedTriggerSql(wanted.sql) : schemaTokens(row.sql) !== schemaTokens(wanted.sql))) throw new Error("Migration source or target schema differs.");
  if (wanted.type === "table" && tx.get("SELECT strict FROM pragma_table_list WHERE schema='main' AND name=?", [row.name])?.strict !== BigInt(1)) throw new Error("Non-STRICT migration schema.");
 }
 for (const name of expected.keys()) if (!seen.has(name)) throw new Error("Missing migration schema object.");
 if (tx.all("SELECT 1 AS invalid FROM pragma_foreign_key_check LIMIT 1").length) throw new Error("Invalid migration source references.");
}

// Explicit maintenance operation; never called by a page, login or module import.
// Existing real data additionally requires the future verified-backup/maintenance supervisor.
export function applyMigrations(connection: SqliteConnection, directory: string): { applied: number; version: bigint } {
  const migrations = loadMigrations(directory).filter(m => m.objectType !== "program");
  const inventory35 = migrations.some(m => m.version >= BigInt(19));
  if (inventory35) {
    assertDisposableMigrationConnection(connection);
    if (migrations.length !== 35 || migrations.some((m,i) => m.name !== PINNED_SCHEMA_MIGRATIONS[i][0] || m.checksum !== PINNED_SCHEMA_MIGRATIONS[i][1])) {
      throw new DatabaseFoundationError("MIGRATION_INVALID", "Inventory migration manifest differs from reviewed authority.");
    }
  }
  try {
    return connection.transaction((tx) => {
      if (inventory35) {
        const databases = tx.all("SELECT name FROM pragma_database_list LIMIT 4");
        if (databases.length > 2 || databases.some(r => r.name !== "main" && r.name !== "temp") ||
            (databases.some(r => r.name === "temp") && tx.all("SELECT type FROM temp.sqlite_schema LIMIT 1").length)) throw new Error("Ambiguous migration database scope.");
      }
      const objects = tx.all("SELECT name, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'");
      const history = objects.find((object) => object.name === "schema_migrations");
      const marker = tx.get("SELECT user_version FROM pragma_user_version")?.user_version;
      if (!history) {
        if (objects.length !== 0 || marker !== BigInt(0)) {
          throw new DatabaseFoundationError("MIGRATION_HISTORY_INVALID", "Cannot adopt an untracked existing schema.");
        }
        tx.run(HISTORY_SQL);
      } else if (typeof history.sql !== "string" || normalized(history.sql) !== normalized(HISTORY_SQL)) {
        throw new DatabaseFoundationError("MIGRATION_HISTORY_INVALID", "Migration history schema is incompatible.");
      }
      const applied = tx.all("SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version");
      if (applied.length > migrations.length || marker !== BigInt(applied.length)) {
        throw new DatabaseFoundationError("MIGRATION_HISTORY_INVALID", "Unknown, newer or inconsistent schema history.");
      }
      for (const [index, previous] of applied.entries()) {
        const expected = migrations[index];
        if (previous.version !== expected.version || previous.name !== expected.name || previous.checksum !== expected.checksum) {
          throw new DatabaseFoundationError("MIGRATION_HISTORY_INVALID", "Applied migration history has changed or is incomplete.");
        }
      }
      if (inventory35) {
        if (![0,18,35].includes(applied.length)) throw new Error("Only EMPTY, exact18 or exact35 TEST migration states are admitted.");
        inventoryMigrationObjects(tx, migrations.slice(0,applied.length));
      }
      for (const migration of migrations.slice(applied.length)) {
        tx.run(migration.sql);
        if (migration.objectType === "table") {
          const created = tx.get(
            "SELECT type, strict FROM pragma_table_list WHERE schema = ? AND name = ?",
            ["main", migration.objectName],
          );
          if (created?.type !== "table" || created.strict !== BigInt(1)) {
            throw new DatabaseFoundationError("MIGRATION_SCHEMA_INVALID", "Migration did not create the intended STRICT table.");
          }
        }
        if (migration.objectType === "trigger") {
          const actual = tx.get("SELECT type,tbl_name,sql,rootpage FROM main.sqlite_schema WHERE name=?", [migration.objectName]);
          if (actual?.type !== "trigger" || actual.tbl_name !== migration.objectTable || actual.rootpage !== BigInt(0) ||
              typeof actual.sql !== "string" || storedTriggerSql(actual.sql) !== storedTriggerSql(migration.sql)) {
            throw new DatabaseFoundationError("MIGRATION_SCHEMA_INVALID", "Reviewed trigger metadata differs.");
          }
        }
        tx.run("INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)", [
          migration.version, migration.name, migration.checksum, BigInt(Date.now()),
        ]);
      }
      const version = migrations.at(-1)!.version;
      if (inventory35) {
        inventoryMigrationObjects(tx,migrations);
        // Same atomic writer transaction: never repair/renumber incompatible history.
        for (const table of immutableInventoryTables) if (tx.get("SELECT rowid FROM " + table + " WHERE rowid<=0 LIMIT 1")) {
          throw new DatabaseFoundationError("MIGRATION_SCHEMA_INVALID", "Incompatible physical history identity.");
        }
      }
      tx.setSchemaVersion(version);
      const integrity = tx.all("SELECT * FROM pragma_integrity_check");
      if (integrity.length !== 1 || integrity[0].integrity_check !== "ok" || tx.all("SELECT * FROM pragma_foreign_key_check").length !== 0) {
        throw new Error("Post-migration integrity checks failed.");
      }
      return { applied: migrations.length - applied.length, version };
    });
  } catch (cause) {
    if (cause instanceof DatabaseFoundationError && cause.code === "MIGRATION_HISTORY_INVALID") throw cause;
    throw new DatabaseFoundationError("MIGRATION_FAILED", "Migration batch failed; no success was acknowledged. Inspect preserved state before retry.", cause);
  }
}
