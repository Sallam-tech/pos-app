import "server-only";

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, lstatSync, opendirSync, readFileSync } from "node:fs";
import path from "node:path";
import { assertRuntimeOwnership } from "../hosting/ownership";
import { rejectRedirectedPath, resolveDatabaseLocation, type DatabaseOptions } from "../db/location";
import { validateReviewedSchema } from "../db/validate-schema";
import { verifiedDecryptedSnapshotEvidence, type BackupCustody } from "../backup/crypto";
import { readProtectedRestoreReceipt } from "./restore41";
import { verifyProtectedSnapshotContents, testSourceNamespace, type HistoricalSettings } from "../backup/service";
import { storage } from "../backup/storage";
import { fingerprint } from "../backup/snapshot";
import { readProtectedRootAuthority } from "./root-authority";
import type { ProofDatabase } from "../backup/snapshot";
import { readEnrollmentSnapshot, enrollmentDigest } from "./database";
import { classifyEnrollment, readEnrollmentJournal } from "./journal";
import { candidatePendingCompatible, readProtectedCandidateLedger, classifyCandidateLedger } from "./candidate-records";
import { inspectLocalVault, withProtectedLocalKeys, type LocalKeyConfiguration } from "./keys";
import { protectedManifestDigest, readProtectedMaintenance } from "./maintenance-journal";
import { rejectBootstrap } from "./windows";

declare const writerBrand: unique symbol;
export interface ProtectedWriterAdmission { readonly [writerBrand]: true }
interface State { runtime: unknown; filename: string; device: bigint; inode: bigint; schema: 8 | 41; generation: string; maintenanceOnly: boolean; history: readonly HistoricalSettings[]; restored: boolean; directories: readonly string[]; checkpoint: string; secretDigests: Readonly<Record<"ADMIN" | "SALESPERSON", string>>; root: LocalKeyConfiguration; configuration: LocalKeyConfiguration }
const admitted = new WeakMap<object, State>();
const hash = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
function checkpoint(root: string): string {
  const values: unknown[] = [];
  for (const directory of [root, ...["enrollment", "maintenance", "candidate-authority", "restore41", "imported-root"].map(d => path.join(root, d))]) {
    if (!existsSync(directory)) { values.push([directory, "ABSENT"]); continue; }
    rejectRedirectedPath(directory); const stat = lstatSync(directory, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) return rejectBootstrap();
    const handle = opendirSync(directory), names: string[] = [];
    try { for (let e = handle.readSync(); e; e = handle.readSync()) {
      if (names.length >= 128 || (directory === root ? !["identity.dpapi", "enrollment", "maintenance", "candidate-authority", "restore41", "imported-root"].includes(e.name) : !e.isFile())) return rejectBootstrap();
      names.push(e.name);
    } } finally { handle.closeSync(); }
    names.sort(); values.push([directory, String(stat.dev), String(stat.ino), String(stat.ctimeNs), names]);
    for (const name of names) {
      const file = path.join(directory, name), s = lstatSync(file, { bigint: true });
      if (s.isDirectory() && directory === root && name !== "identity.dpapi") continue;
      const partialCandidate = path.basename(directory) === "candidate-authority" && /^[0-9]{6}\.[a-f0-9-]{36}\.(?:intent|committed|current|quarantined)\.dpapi\.[a-f0-9-]{36}\.pending$/.test(name);
      if (!s.isFile() || s.isSymbolicLink() || s.nlink !== BigInt(1) || s.size < BigInt(partialCandidate ? 0 : 9) || s.size > BigInt(directory === root || ["restore41", "imported-root"].includes(path.basename(directory)) ? 196608 : 16384)) return rejectBootstrap();
      const bytes = readFileSync(file), after = lstatSync(file, { bigint: true });
      try {
        if (["dev", "ino", "size", "mtimeNs", "ctimeNs"].some(k => s[k as keyof typeof s] !== after[k as keyof typeof s]) || BigInt(bytes.length) !== s.size) return rejectBootstrap();
        values.push([file, String(s.dev), String(s.ino), String(s.size), String(s.mtimeNs), String(s.ctimeNs), hash(bytes)]);
      } finally { bytes.fill(0); }
    }
  }
  return enrollmentDigest(values);
}

const Driver = createRequire(import.meta.url)("better-sqlite3") as new (filename: string, options: { readonly: true; fileMustExist: true }) => ProofDatabase;
function configuration(input: LocalKeyConfiguration) {
  if (!input || !input.database || input.database.mode !== "test" || input.database.create === true || Object.keys(input).sort().join(",") !== "database,directory,migrationsDirectory") return rejectBootstrap();
  return Object.freeze({ directory: input.directory, migrationsDirectory: input.migrationsDirectory, database: Object.freeze({ ...input.database, create: false }) });
}
const reader = (db: ProofDatabase) => ({ get: async (sql: string, values: readonly import("../db/connection").SqlValue[] = []) => db.prepare(sql).get(...values), all: async (sql: string, values: readonly import("../db/connection").SqlValue[] = []) => db.prepare(sql).all(...values) });
async function enrollment(config: LocalKeyConfiguration, version: 8 | 41, records: Awaited<ReturnType<typeof readEnrollmentJournal>>, anchorVersion: 8 | 41 = version) {
  const filename = resolveDatabaseLocation(config.database).filename, db = new Driver(filename, { readonly: true, fileMustExist: true }); db.defaultSafeIntegers(true);
  try {
    db.exec("BEGIN");
    if (!(await validateReviewedSchema(reader(db), version)).ok) return rejectBootstrap();
    const state = classifyEnrollment(records, await readEnrollmentSnapshot(reader(db), protectedManifestDigest(anchorVersion), version));
    if (state.status !== "ENROLLED" || !state.anchor) return rejectBootstrap();
    db.exec("ROLLBACK"); return state.anchor;
  } finally { db.close(); }
}
async function secretDigests(config: LocalKeyConfiguration) {
  let digests: State["secretDigests"] | undefined;
  await withProtectedLocalKeys(config, async keys => { digests = Object.freeze({ ADMIN: hash(keys.signingSecrets.ADMIN), SALESPERSON: hash(keys.signingSecrets.SALESPERSON) }); });
  return digests ?? rejectBootstrap();
}
const checkpoints = (directories: readonly string[]) => enrollmentDigest(directories.map(checkpoint));
function mint(runtime: unknown, config: LocalKeyConfiguration, schema: 8 | 41, generation: string, directories: readonly string[], captured: string, digests: State["secretDigests"], maintenanceOnly = false, history: readonly HistoricalSettings[] = [], restored = false, root: LocalKeyConfiguration = config) {
  assertRuntimeOwnership(runtime); const filename = resolveDatabaseLocation(config.database).filename, st = lstatSync(filename, { bigint: true });
  if (checkpoints(directories) !== captured) return rejectBootstrap();
  const token = Object.freeze({ toJSON: rejectBootstrap }) as unknown as ProtectedWriterAdmission;
  admitted.set(token, { runtime, filename: filename.toLowerCase(), device: st.dev, inode: st.ino, schema, generation, maintenanceOnly, history, restored, directories, checkpoint: captured, secretDigests: digests, root, configuration: config });
  assertProtectedWriterAdmission(token, config.database, undefined, true); return token;
}
// Original root admissions reject every selected/retired or uncertain operation.
// The private TEST adapter exercises real DPAPI/schema/lease/key validators; it
// does not grant production activation or reconstruct authority from mode=test.
export async function createProtectedRootWriterAdmission(input: LocalKeyConfiguration, runtime: unknown, version: 8 | 41 = 41): Promise<ProtectedWriterAdmission> {
  try {
    assertRuntimeOwnership(runtime); if (version !== 8 && version !== 41) return rejectBootstrap();
    const config = configuration(input), directories = Object.freeze([path.join(config.directory, "protected-identity")]), before = checkpoints(directories);
    const vault = await inspectLocalVault(config), records = await readEnrollmentJournal(vault, protectedManifestDigest(version));
    if ((await readProtectedMaintenance(vault)).length) return rejectBootstrap();
    const anchor = await enrollment(config, version, records), facts = await readProtectedCandidateLedger(vault, enrollmentDigest(anchor));
    if (!candidatePendingCompatible(facts) || !["ABSENT", "QUARANTINED_ONLY"].includes(classifyCandidateLedger(facts).status)) return rejectBootstrap();
    return mint(runtime, config, version, "ROOT", directories, before, await secretDigests(config));
  } catch { return rejectBootstrap(); }
}
// Recovery can verify the existing Admin and surrender the sole owner only.
// It cannot issue sessions, execute business transactions or repair journals.
export async function createProtectedRootRecoveryAdmission(input: LocalKeyConfiguration, runtime: unknown, version: 8 | 41 = 8): Promise<ProtectedWriterAdmission> {
  try {
    assertRuntimeOwnership(runtime); const config = configuration(input);
    const directories = Object.freeze([path.join(config.directory, "protected-identity")]), before = checkpoints(directories);
    const vault = await inspectLocalVault(config), records = await readEnrollmentJournal(vault, protectedManifestDigest(version));
    if ((await readProtectedMaintenance(vault)).length) return rejectBootstrap();
    const anchor = await enrollment(config, version, records), ledger = await readProtectedCandidateLedger(vault, enrollmentDigest(anchor)), state = classifyCandidateLedger(ledger);
    if (state.status !== "RECOVERY_REVIEW_REQUIRED" || state.recordedCurrent || (!ledger.records.length && !ledger.pending.length)) return rejectBootstrap();
    return mint(runtime, config, version, "ROOT_RECOVERY", directories, before, await secretDigests(config), true);
  } catch { return rejectBootstrap(); }
}
// Latest native CURRENT is both the selected generation and durable retirement
// of every earlier source in that chain. No mtime choice, fallback or SQL replay.
async function selectedAdmission(rootInput: LocalKeyConfiguration, targetInput: LocalKeyConfiguration, runtime: unknown, recovery: boolean): Promise<ProtectedWriterAdmission> {
  try {
    assertRuntimeOwnership(runtime); const root = configuration(rootInput), target = configuration(targetInput);
    const directories = Object.freeze([path.join(root.directory, "protected-identity"), path.join(target.directory, "protected-identity")]);
    if (directories[0].toLowerCase() === directories[1].toLowerCase()) return rejectBootstrap();
    const before = checkpoints(directories), authority=await readProtectedRootAuthority(root),original=authority.vault,destination=await inspectLocalVault(target),anchorVersion=authority.anchorVersion,records=authority.records,anchor=authority.anchor;
    const ledger=await readProtectedCandidateLedger(original,enrollmentDigest(anchor)),state=classifyCandidateLedger(ledger),selected=state.recordedCurrent;
    if ((!recovery && (!candidatePendingCompatible(ledger) || state.status !== "RECORDED_CURRENT")) || (recovery && state.status !== "RECOVERY_REVIEW_REQUIRED") || !selected || selected.destinationFileIdentity !== destination.databaseFingerprint || selected.targetVaultDigest !== destination.vaultDigest ||
        destination.metadata.installationId === original.metadata.installationId || destination.metadata.deviceId === original.metadata.deviceId || destination.metadata.certificateFingerprint === original.metadata.certificateFingerprint || destination.tlsPublicKeyDigest === original.tlsPublicKeyDigest) return rejectBootstrap();
    if (selected.purpose === "UPGRADE8" && selected.targetSpecificationDigest !== enrollmentDigest({ format: "POS_UNADMITTED_UPGRADE8_SPEC_V1", manifest: protectedManifestDigest(41), sourceState: selected.sourceStateDigest, destinationFileIdentity: destination.databaseFingerprint, initialization: "PRESERVE_ALL8_ROWS_ROWIDS_EMPTY_BUSINESS" })) return rejectBootstrap();
    await enrollment(target, 41, records, anchorVersion);
    const histories = selected.purpose === "RESTORE41" ? await readProtectedRestoreReceipt(target, selected) : [];
    const check = new Driver(resolveDatabaseLocation(target.database).filename, { readonly: true, fileMustExist: true }); check.defaultSafeIntegers(true);
    try { check.exec("BEGIN"); await verifyProtectedSnapshotContents(check, testSourceNamespace(resolveDatabaseLocation(target.database).filename), histories); check.exec("ROLLBACK"); } finally { check.close(); }
    return mint(runtime, target, 41, selected.generation, directories, before, await secretDigests(target), recovery, histories, selected.purpose === "RESTORE41", root);
  } catch { return rejectBootstrap(); }
}
// Archive-only auth8 readback is a separate confined, lease-bound capability.
// Its genuine decoder proof and exact target bytes never grant business41 access.
export async function createAuthentication8ReadbackAdmission(input: LocalKeyConfiguration, runtime: unknown, manifest: unknown, custody: BackupCustody, archive: string,
  secrets: Readonly<Record<"ADMIN" | "SALESPERSON", string>>): Promise<ProtectedWriterAdmission> {
  try {
    assertRuntimeOwnership(runtime); const config = configuration(input), filename = resolveDatabaseLocation(config.database).filename;
    await storage(config.database.directory, "check", { filename: config.database.filename });
    const verified = await verifiedDecryptedSnapshotEvidence(manifest, custody, archive, filename), m = verified.manifest;
    if (m.schema !== 8 || m.format !== "POS_AUTH8_SNAPSHOT_V1" || !m.fingerprint || typeof m.fingerprint !== "object") return rejectBootstrap();
    const facts = m.fingerprint as { database: unknown; enrollmentRecords: Awaited<ReturnType<typeof readEnrollmentJournal>> };
    if (!Array.isArray(facts.enrollmentRecords)) return rejectBootstrap();
    const db = new Driver(filename, { readonly: true, fileMustExist: true }); db.defaultSafeIntegers(true);
    try { db.exec("BEGIN"); if (enrollmentDigest(fingerprint(db)) !== enrollmentDigest(facts.database)) return rejectBootstrap(); db.exec("ROLLBACK"); } finally { db.close(); }
    await enrollment(config, 8, facts.enrollmentRecords);
    if (!secrets || secrets.ADMIN === secrets.SALESPERSON || [secrets.ADMIN, secrets.SALESPERSON].some(s => typeof s !== "string" || !/^[A-Za-z0-9_-]{64}$/.test(s))) return rejectBootstrap();
    return mint(runtime, config, 8, "READBACK_ONLY", Object.freeze([]), checkpoints([]), Object.freeze({ ADMIN: hash(secrets.ADMIN), SALESPERSON: hash(secrets.SALESPERSON) }));
  } catch { return rejectBootstrap(); }
}
export function assertProtectedWriterAdmission(proof: unknown, database: DatabaseOptions, secrets?: Readonly<Record<"ADMIN" | "SALESPERSON", string>>, full = false) {
  const s = proof && typeof proof === "object" ? admitted.get(proof) : undefined;
  if (!s) return rejectBootstrap(); assertRuntimeOwnership(s.runtime);
  const filename = resolveDatabaseLocation({ ...database, create: false }).filename, stat = lstatSync(filename, { bigint: true });
  if (filename.toLowerCase() !== s.filename || stat.dev !== s.device || stat.ino !== s.inode ||
      (secrets && (["ADMIN", "SALESPERSON"] as const).some(r => typeof secrets[r] !== "string" || hash(secrets[r]) !== s.secretDigests[r])) ||
      (full && checkpoints(s.directories) !== s.checkpoint)) return rejectBootstrap();
  return Object.freeze({ schema: s.schema, generation: s.generation, maintenanceOnly: s.maintenanceOnly, restored: s.restored, productionActivation: false as const });
}

export function protectedWriterHistory(proof: ProtectedWriterAdmission, database: DatabaseOptions): readonly HistoricalSettings[] {
  assertProtectedWriterAdmission(proof, database, undefined, true);
  const state = admitted.get(proof); if (!state || !state.restored) return rejectBootstrap(); return state.history;
}

export function createSelectedWriterAdmission(root: LocalKeyConfiguration, target: LocalKeyConfiguration, runtime: unknown): Promise<ProtectedWriterAdmission> {
  return selectedAdmission(root, target, runtime, false);
}
export function createSelectedRecoveryAdmission(root: LocalKeyConfiguration, source: LocalKeyConfiguration, runtime: unknown): Promise<ProtectedWriterAdmission> {
  return selectedAdmission(root, source, runtime, true);
}

// Genuine current source only; paths returned here are provenance inputs, never authority.
export function protectedWriterRootConfiguration(proof: ProtectedWriterAdmission, database: DatabaseOptions): LocalKeyConfiguration {
 const facts=assertProtectedWriterAdmission(proof,database,undefined,true),s=admitted.get(proof);
 if(!s||facts.schema!==41||facts.maintenanceOnly||facts.generation==="READBACK_ONLY")return rejectBootstrap();return s.root;
}
export async function createImportedPreparationAdmission(candidate: import("./imported-root41").ImportedRootCandidate41, runtime: unknown): Promise<ProtectedWriterAdmission> {
 const { importedPreparationEvidence }=await import("./imported-root41"),e=await importedPreparationEvidence(candidate,runtime);
 const directories=Object.freeze([path.join(e.config.directory,"protected-identity")]),before=checkpoints(directories);
 return mint(runtime,e.config,41,"IMPORTED_PREPARATION",directories,before,await secretDigests(e.config),true,e.history,true);
}
export async function createImportedRootWriterAdmission(config: LocalKeyConfiguration, runtime: unknown, recovery=false): Promise<ProtectedWriterAdmission> {
 assertRuntimeOwnership(runtime);const input=configuration(config),directories=Object.freeze([path.join(input.directory,"protected-identity")]),before=checkpoints(directories);
 const { importedRootAdmissionEvidence }=await import("./imported-root41"),e=await importedRootAdmissionEvidence(input,recovery);
 return mint(runtime,input,41,e.generation,directories,before,await secretDigests(input),recovery,e.history,true);
}

export function protectedWriterSourceConfiguration(proof: ProtectedWriterAdmission, database: DatabaseOptions): LocalKeyConfiguration {
 protectedWriterRootConfiguration(proof,database);return admitted.get(proof)?.configuration??rejectBootstrap();
}
