import "server-only";
// TEST-only oracle: no production backup, crypto, retention or recovery authority.
import { createHash } from "node:crypto";
import {rowHasher} from "./row-hash";
import { createRequire } from "node:module";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import type { SqlValue } from "../db/connection";
import { validateReviewedSchema } from "../db/validate-schema";
type Row = Record<string, SqlValue>;
interface Statement {
  get(...values: unknown[]): Row | undefined;
  all(...values: unknown[]): Row[];
  iterate(...values: unknown[]): Iterable<Row>;
  run(...values: unknown[]): unknown;
}
export interface ProofDatabase {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  defaultSafeIntegers(enabled: boolean): void;
  backup(filename: string, options?: { progress: (p: { remainingPages: number; totalPages: number }) => number }): Promise<unknown>;
  close(): void;
}
const Driver = createRequire(import.meta.url)("better-sqlite3") as new (
  filename: string, options: { readonly: boolean; fileMustExist: boolean },
) => ProofDatabase;
// Repeat existing TEST confinement; never open a persistent/original database.
export function openProofDatabase(filename: string, readonly = true): ProofDatabase {
  const root = path.resolve("test-results/sqlite-b1b-part1");
  const absolute = path.resolve(filename), relative = path.relative(root, absolute);
  if (process.env.NODE_ENV !== "test" || !relative || relative.startsWith("..") || path.isAbsolute(relative)) throw Error("TEST proof path rejected.");
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || realpathSync.native(absolute).toLowerCase() !== absolute.toLowerCase()) throw Error("TEST proof path rejected.");
  const db = new Driver(absolute, { readonly, fileMustExist: true });
  db.defaultSafeIntegers(true);
  return db;
}
const identifier = (name: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw Error("TEST proof identifier rejected.");
  return '"' + name + '"';
};
// Caller holds a consistent read transaction. Include every auth/audit table,
// hidden rowid, exact signed integer and typed scalar, with bounded row memory.
// Only counts/digests leave this oracle; these are not authenticated manifests.
export function fingerprintTable(db:ProofDatabase,name:string){const hash=rowHasher();for(const row of db.prepare("SELECT rowid AS __proof_rowid,* FROM "+identifier(name)+" ORDER BY rowid").iterate())hash.add(row);return hash.result(name);}
export function fingerprint(db: ProofDatabase) {
  const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").all();
  const schemaDigest = createHash("sha256").update(JSON.stringify(schema)).digest("hex");
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all();
  const contents = tables.map(row=>fingerprintTable(db,String(row.name)));
  return { schemaDigest, userVersion: String(db.prepare("PRAGMA user_version").get()?.user_version), tables: contents };
}
export async function verifySchema41(db: ProofDatabase) {
  if (JSON.stringify(db.prepare("PRAGMA integrity_check").all()) !== '[{"integrity_check":"ok"}]') throw Error("Snapshot integrity rejected.");
  if (db.prepare("PRAGMA foreign_key_check").all().length) throw Error("Snapshot foreign keys rejected.");
  const schema = await validateReviewedSchema({
    get: async (sql, values) => db.prepare(sql).get(...(values ?? [])),
    all: async (sql, values) => db.prepare(sql).all(...(values ?? [])),
  }, 41);
  if (!schema.ok) throw Error("Snapshot schema41 rejected.");
}
