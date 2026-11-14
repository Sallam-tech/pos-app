import "server-only";

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, lstatSync, opendirSync, readFileSync } from "node:fs";
import path from "node:path";
import { assertRuntimeOwnership } from "../hosting/ownership";
import { rejectRedirectedPath, resolveDatabaseLocation, type DatabaseOptions } from "../db/location";
import type { ProofDatabase } from "../backup/snapshot";
import { readEnrollmentSnapshot, enrollmentDigest } from "./database";
import { classifyEnrollment, readEnrollmentJournal } from "./journal";
import { readProtectedCandidateLedger, classifyCandidateLedger } from "./candidate-records";
import { inspectLocalVault, withProtectedLocalKeys, type LocalKeyConfiguration } from "./keys";
import { protectedManifestDigest, readProtectedMaintenance } from "./maintenance-journal";
import { assertSchema41Bootstrap } from "./schema41";
import { rejectBootstrap } from "./windows";

declare const writerBrand: unique symbol;
export interface ProtectedWriterAdmission { readonly [writerBrand]: true }
interface State { runtime: unknown; filename: string; device: bigint; inode: bigint; directory: string; checkpoint: string; secretDigests: Readonly<Record<"ADMIN" | "SALESPERSON", string>> }
const admitted = new WeakMap<object, State>();
const hash = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
function checkpoint(root: string): string {
  const values: unknown[] = [];
  for (const directory of [root, ...["enrollment", "maintenance", "candidate-authority"].map(d => path.join(root, d))]) {
    if (!existsSync(directory)) { values.push([directory, "ABSENT"]); continue; }
    rejectRedirectedPath(directory); const stat = lstatSync(directory, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) return rejectBootstrap();
    const handle = opendirSync(directory), names: string[] = [];
    try { for (let e = handle.readSync(); e; e = handle.readSync()) {
      if (names.length >= 128 || (directory === root ? !["identity.dpapi", "enrollment", "maintenance", "candidate-authority"].includes(e.name) : !e.isFile())) return rejectBootstrap();
      names.push(e.name);
    } } finally { handle.closeSync(); }
    names.sort(); values.push([directory, String(stat.dev), String(stat.ino), String(stat.ctimeNs), names]);
    for (const name of names) {
      const file = path.join(directory, name), s = lstatSync(file, { bigint: true });
      if (s.isDirectory() && directory === root && name !== "identity.dpapi") continue;
      if (!s.isFile() || s.isSymbolicLink() || s.nlink !== BigInt(1) || s.size < BigInt(9) || s.size > BigInt(directory === root ? 131072 : 16384)) return rejectBootstrap();
      const bytes = readFileSync(file), after = lstatSync(file, { bigint: true });
      try {
        if (["dev", "ino", "size", "mtimeNs", "ctimeNs"].some(k => s[k as keyof typeof s] !== after[k as keyof typeof s]) || BigInt(bytes.length) !== s.size) return rejectBootstrap();
        values.push([file, String(s.dev), String(s.ino), String(s.size), String(s.mtimeNs), String(s.ctimeNs), hash(bytes)]);
      } finally { bytes.fill(0); }
    }
  }
  return enrollmentDigest(values);
}
// Actual protected root validator, exercised only on disposable TEST identities.
// It admits an original exact41 enrollment ONLY. Candidates, pending operations,
// maintenance records and selected/retired roots require their separate consumer.
// No TEST flag, SQL version or caller tuple can mint this opaque live lease token.
export async function createProtectedRootWriterAdmission(input: LocalKeyConfiguration, runtime: unknown): Promise<ProtectedWriterAdmission> {
  try {
    assertRuntimeOwnership(runtime);
    if (!input || !input.database || input.database.mode !== "test" || input.database.create === true || Object.keys(input).sort().join(",") !== "database,directory,migrationsDirectory") return rejectBootstrap();
    const config = Object.freeze({ directory: input.directory, migrationsDirectory: input.migrationsDirectory, database: Object.freeze({ ...input.database, create: false }) });
    const filename = resolveDatabaseLocation(config.database).filename, stat = lstatSync(filename, { bigint: true });
    const root = path.join(config.directory, "protected-identity"), before = checkpoint(root), vault = await inspectLocalVault(config);
    const records = await readEnrollmentJournal(vault, protectedManifestDigest(41));
    if ((await readProtectedMaintenance(vault)).length) return rejectBootstrap();
    const Driver = createRequire(import.meta.url)("better-sqlite3") as new (filename: string, options: { readonly: true; fileMustExist: true }) => ProofDatabase;
    const db = new Driver(filename, { readonly: true, fileMustExist: true }); db.defaultSafeIntegers(true);
    let anchorDigest: string;
    try {
      db.exec("BEGIN");
      const reader = { get: (sql: string, values: readonly import("../db/connection").SqlValue[] = []) => db.prepare(sql).get(...values), all: (sql: string, values: readonly import("../db/connection").SqlValue[] = []) => db.prepare(sql).all(...values) };
      assertSchema41Bootstrap(reader, false);
      const state = classifyEnrollment(records, await readEnrollmentSnapshot({ get: async (...a) => reader.get(...a), all: async (...a) => reader.all(...a) }, protectedManifestDigest(41), 41));
      if (state.status !== "ENROLLED" || !state.anchor) return rejectBootstrap();
      anchorDigest = enrollmentDigest(state.anchor); db.exec("ROLLBACK");
    } finally { db.close(); }
    if (classifyCandidateLedger(await readProtectedCandidateLedger(vault, anchorDigest)).status !== "ABSENT") return rejectBootstrap();
    let secretDigests: State["secretDigests"] | undefined;
    await withProtectedLocalKeys(config, async keys => { secretDigests = Object.freeze({ ADMIN: hash(keys.signingSecrets.ADMIN), SALESPERSON: hash(keys.signingSecrets.SALESPERSON) }); });
    assertRuntimeOwnership(runtime);
    if (!secretDigests || checkpoint(root) !== before) return rejectBootstrap();
    const token = Object.freeze({ toJSON: rejectBootstrap }) as unknown as ProtectedWriterAdmission;
    admitted.set(token, { runtime, filename: filename.toLowerCase(), device: stat.dev, inode: stat.ino, directory: root, checkpoint: before, secretDigests });
    assertProtectedWriterAdmission(token, config.database, undefined, true); return token;
  } catch { return rejectBootstrap(); }
}
export function assertProtectedWriterAdmission(proof: unknown, database: DatabaseOptions, secrets?: Readonly<Record<"ADMIN" | "SALESPERSON", string>>, full = false) {
  const s = proof && typeof proof === "object" ? admitted.get(proof) : undefined;
  if (!s) return rejectBootstrap(); assertRuntimeOwnership(s.runtime);
  const filename = resolveDatabaseLocation({ ...database, create: false }).filename, stat = lstatSync(filename, { bigint: true });
  if (filename.toLowerCase() !== s.filename || stat.dev !== s.device || stat.ino !== s.inode ||
      (secrets && (["ADMIN", "SALESPERSON"] as const).some(r => typeof secrets[r] !== "string" || hash(secrets[r]) !== s.secretDigests[r])) ||
      (full && checkpoint(s.directory) !== s.checkpoint)) return rejectBootstrap();
}
