import "server-only";

import { lstatSync, opendirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveDatabaseLocation } from "../db/location";
import { validateReviewedSchema } from "../db/validate-schema";
import { decryptSnapshot, encryptSnapshot, hashFile, type BackupCustody } from "../backup/crypto";
import { fingerprint, openProofDatabase, type ProofDatabase } from "../backup/snapshot";
import { fail, storage, testDirectory } from "../backup/storage";
import { readEnrollmentSnapshot, enrollmentDigest } from "./database";
import { inspectLocalVault, type LocalKeyConfiguration } from "./keys";
import { classifyEnrollment, readEnrollmentJournal, type EnrollmentRecord } from "./journal";
import { hasActiveBootstrapLease, type BootstrapLease } from "./ownership";
import { protectedManifestDigest } from "./maintenance-journal";

declare const backupBrand: unique symbol;
export interface VerifiedAuthenticationBackup8 { readonly [backupBrand]: true }
interface Evidence {
  readonly archiveId: string;
  readonly ciphertextSha256: string;
  readonly sourceStateDigest: string;
  readonly originalAnchorDigest: string;
  readonly sourceNamespace: string;
}
const verified = new WeakMap<object, { lease: BootstrapLease; filename: string; archive: string; evidence: Evidence }>();
const MAX_BYTES = BigInt(1024 * 1024 * 1024);
function emptyDirectory(directory: string): boolean {
  const opened = opendirSync(directory);
  try { return opened.readSync() === null; } finally { opened.closeSync(); }
}
const reader = (db: ProofDatabase) => ({ get: async (sql: string, values: readonly import("../db/connection").SqlValue[] = []) => db.prepare(sql).get(...values), all: async (sql: string, values: readonly import("../db/connection").SqlValue[] = []) => db.prepare(sql).all(...values) });
const same = (a: unknown, b: unknown) => enrollmentDigest(a) === enrollmentDigest(b);
function guard(config: LocalKeyConfiguration, lease: BootstrapLease) {
  if (!config || config.database?.mode !== "test" || !hasActiveBootstrapLease(lease, config.database)) return fail();
}
function sourceNamespace(filename: string) {
  const stat = lstatSync(filename, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== BigInt(1)) return fail();
  return createHash("sha256").update(JSON.stringify(["pos-auth8-pre-maintenance-v1", path.resolve(filename).toLowerCase(), String(stat.dev), String(stat.ino)])).digest("hex");
}
async function inspect8(db: ProofDatabase, records: readonly EnrollmentRecord[]) {
  if (JSON.stringify(db.prepare("PRAGMA integrity_check").all()) !== '[{"integrity_check":"ok"}]' || db.prepare("PRAGMA foreign_key_check").all().length) return fail();
  const scope = reader(db), schema = await validateReviewedSchema(scope, 8);
  if (!schema.ok) return fail();
  const enrollment = await readEnrollmentSnapshot(scope, protectedManifestDigest(8));
  if (enrollment.kind !== "ENROLLED" || classifyEnrollment(records, enrollment).status !== "ENROLLED") return fail();
  return { database: fingerprint(db), enrollmentRecords: records, purpose: "AUTHENTICATION8_PRE_MAINTENANCE" as const };
}
async function inspectSource(config: LocalKeyConfiguration, lease: BootstrapLease) {
  guard(config, lease);
  const filename = resolveDatabaseLocation({ ...config.database, create: false }).filename;
  const namespace = sourceNamespace(filename), vault = await inspectLocalVault(config); guard(config, lease);
  const records = await readEnrollmentJournal(vault, protectedManifestDigest(8)); guard(config, lease);
  const anchor = records.find(r => r.kind === "ENROLLED"); if (!anchor) return fail();
  const db = openProofDatabase(filename);
  let facts: Awaited<ReturnType<typeof inspect8>>, databaseBytes = BigInt(0);
  try { db.exec("BEGIN"); facts = await inspect8(db, records);
    const pages = db.prepare("PRAGMA page_count").get()?.page_count, pageSize = db.prepare("PRAGMA page_size").get()?.page_size;
    if (typeof pages !== "bigint" || typeof pageSize !== "bigint" || pages <= BigInt(0) || pageSize <= BigInt(0)) return fail();
    databaseBytes = pages * pageSize; if (databaseBytes > MAX_BYTES) return fail();
    db.exec("ROLLBACK"); } finally { db.close(); }
  guard(config, lease); if (sourceNamespace(filename) !== namespace) return fail();
  return { filename, namespace, records, facts, databaseBytes, anchorDigest: enrollmentDigest(anchor), stateDigest: enrollmentDigest(facts) };
}
function mint(config: LocalKeyConfiguration, lease: BootstrapLease, source: Awaited<ReturnType<typeof inspectSource>>, archiveId: string, ciphertextSha256: string, archive: string) {
  guard(config, lease);
  const result = Object.freeze({ toJSON: fail }) as unknown as VerifiedAuthenticationBackup8;
  verified.set(result, { lease, filename: source.filename, archive, evidence: Object.freeze({ archiveId, ciphertextSha256, sourceStateDigest: source.stateDigest, originalAnchorDigest: source.anchorDigest, sourceNamespace: source.namespace }) });
  return result;
}
async function cleanup(directory: string, files: readonly string[]) {
  // Only fixed plaintext files created in this operation's initially empty TEST
  // directory; never a recursive deletion or an archive/source/journal removal.
  for (const name of files) {
    const file = path.join(directory, name);
    try { const st = lstatSync(file); if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1) return fail(); await unlink(file); }
    catch (error) { if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error; }
  }
}

// Confined TEST implementation of the approved exact8 prerequisite. The opaque
// result proves an authenticated pre-copy, never owner/migration/login authority.
// Persistent storage and actual production custody remain separate consumers.
export async function createAuthenticationBackup8(config: LocalKeyConfiguration, lease: BootstrapLease, custody: BackupCustody, directory: string, archiveId: string, signal?: AbortSignal): Promise<VerifiedAuthenticationBackup8> {
  guard(config, lease); testDirectory(directory);
  if (signal !== undefined && !(signal instanceof AbortSignal)) return fail();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(archiveId) || !emptyDirectory(directory) || signal?.aborted) return fail();
  await storage(directory, "initialize"); guard(config, lease);
  const source = await inspectSource(config, lease), snapshot = path.join(directory, "authentication8.sqlite3"), pending = path.join(directory, "archive.pending"), restored = path.join(directory, "verification.sqlite3");
  try {
    const available = await storage(directory, "space");
    if (typeof available !== "string" || BigInt(available) < source.databaseBytes * BigInt(4) + BigInt(16 * 1024 * 1024)) return fail();
    const db = openProofDatabase(source.filename);
    try { await db.backup(snapshot, { progress: () => { guard(config, lease); if (signal?.aborted) return fail(); return 128; } }); } finally { db.close(); }
    guard(config, lease); if (signal?.aborted || lstatSync(snapshot, { bigint: true }).size > MAX_BYTES) return fail();
    const copied = openProofDatabase(snapshot);
    try { copied.exec("BEGIN"); const facts = await inspect8(copied, source.records); if (!same(facts, source.facts)) return fail(); copied.exec("ROLLBACK"); } finally { copied.close(); }
    const manifest = await encryptSnapshot(custody, snapshot, pending, source.namespace, source.facts, signal, [], archiveId, 8);
    const ciphertext = await hashFile(pending);
    const restoredManifest = await decryptSnapshot(custody, pending, restored, signal, undefined, ciphertext.sha256, 8);
    if (!same(manifest, restoredManifest)) return fail();
    const check = openProofDatabase(restored);
    try { check.exec("BEGIN"); const facts = await inspect8(check, source.records); if (!same(facts, manifest.fingerprint)) return fail(); check.exec("ROLLBACK"); } finally { check.close(); }
    const after = await inspectSource(config, lease); if (!same(after.facts, source.facts) || after.namespace !== source.namespace || signal?.aborted) return fail();
    await storage(directory, "publish", { source: "archive.pending", target: archiveId + ".age" }); guard(config, lease);
    return mint(config, lease, source, archiveId, ciphertext.sha256, path.join(directory, archiveId + ".age"));
  } catch { return fail(); }
  finally { await cleanup(directory, ["authentication8.sqlite3", "authentication8.sqlite3-wal", "authentication8.sqlite3-shm", "verification.sqlite3", "verification.sqlite3-wal", "verification.sqlite3-shm"]); }
}

export async function authenticationBackup8Evidence(proof: unknown, config: LocalKeyConfiguration, lease: BootstrapLease): Promise<Evidence> {
  try {
    guard(config, lease);
    const saved = proof && typeof proof === "object" ? verified.get(proof) : undefined;
    if (!saved || saved.lease !== lease) return fail();
    await storage(path.dirname(saved.archive), "check", { filename: saved.evidence.archiveId + ".age" }); guard(config, lease);
    if ((await hashFile(saved.archive)).sha256 !== saved.evidence.ciphertextSha256) return fail(); guard(config, lease);
    const current = await inspectSource(config, lease);
    if (saved.filename !== current.filename || current.namespace !== saved.evidence.sourceNamespace || current.anchorDigest !== saved.evidence.originalAnchorDigest || current.stateDigest !== saved.evidence.sourceStateDigest) return fail();
    return saved.evidence;
  } catch { return fail(); }
}


// Read-only restart comparison. It grants no archive, replay, DDL or admission
// authority; a genuine live lease and original enrolled8 anchor are mandatory.
export async function protectedAuthenticationSource8Evidence(config: LocalKeyConfiguration, lease: BootstrapLease) {
  const source = await inspectSource(config, lease);
  return Object.freeze({ sourceStateDigest: source.stateDigest, originalAnchorDigest: source.anchorDigest,
    copyFingerprint: enrollmentDigest(source.facts.database), sourceNamespace: source.namespace });
}


declare const recovery8Brand: unique symbol;
export interface VerifiedAuthenticationRecovery8 { readonly [recovery8Brand]: true }
const recoveries = new WeakMap<object, { lease: BootstrapLease; filename: string; archive: string; archiveId: string; ciphertextSha256: string; originalStateDigest: string; currentStateDigest: string; originalAnchorDigest: string }>();
// Reopen the ORIGINAL signed pre-copy after restart. Fresh Admin verification
// legitimately advances throttling counters; only that table may differ. Every
// other typed row/rowid, schema byte, anchor and binding must still be exact.
// This read-only proof grants quarantine comparison ONLY, never backup/replay.
export async function verifyAuthentication8Recovery(config: LocalKeyConfiguration, lease: BootstrapLease, custody: BackupCustody,
  archive: string, staging: string, expected: Readonly<{ archiveId: string; ciphertextSha256: string; sourceStateDigest: string; originalAnchorDigest: string }>): Promise<VerifiedAuthenticationRecovery8> {
  guard(config, lease); testDirectory(staging);
  if (!expected || Object.keys(expected).sort().join(",") !== "archiveId,ciphertextSha256,originalAnchorDigest,sourceStateDigest" ||
      !/^[0-9a-f-]{36}$/.test(expected.archiveId) || [expected.ciphertextSha256, expected.sourceStateDigest, expected.originalAnchorDigest].some(v => !/^[a-f0-9]{64}$/.test(v)) ||
      path.basename(archive) !== expected.archiveId + ".age" || !emptyDirectory(staging)) return fail();
  await storage(staging, "initialize"); await storage(path.dirname(archive), "check", { filename: path.basename(archive) }); guard(config, lease);
  const source = await inspectSource(config, lease), plaintext = path.join(staging, "recovery8.sqlite3");
  try {
    const free = await storage(staging, "space"); if (typeof free !== "string" || BigInt(free) < source.databaseBytes * BigInt(2) + BigInt(16 * 1024 * 1024)) return fail();
    const manifest = await decryptSnapshot(custody, archive, plaintext, undefined, undefined, expected.ciphertextSha256, 8); guard(config, lease);
    if (manifest.archiveId !== expected.archiveId || manifest.sourceNamespace !== source.namespace || source.anchorDigest !== expected.originalAnchorDigest || enrollmentDigest(manifest.fingerprint) !== expected.sourceStateDigest) return fail();
    const db = openProofDatabase(plaintext); let original: Awaited<ReturnType<typeof inspect8>>;
    try { db.exec("BEGIN"); original = await inspect8(db, source.records); db.exec("ROLLBACK"); } finally { db.close(); }
    if (!same(original, manifest.fingerprint)) return fail();
    const comparable = (facts: typeof original) => ({ ...facts, database: { ...facts.database, tables: facts.database.tables.filter(t => t.name !== "auth_login_attempts") } });
    if (!same(comparable(original), comparable(source.facts))) return fail();
    const after = await inspectSource(config, lease); if (!same(after.facts, source.facts)) return fail();
    const token = Object.freeze({ toJSON: fail }) as unknown as VerifiedAuthenticationRecovery8;
    recoveries.set(token, { lease, filename: source.filename, archive, archiveId: expected.archiveId, ciphertextSha256: expected.ciphertextSha256,
      originalStateDigest: expected.sourceStateDigest, currentStateDigest: source.stateDigest, originalAnchorDigest: source.anchorDigest });
    return token;
  } catch { return fail(); }
  finally { await cleanup(staging, ["recovery8.sqlite3", "recovery8.sqlite3-wal", "recovery8.sqlite3-shm"]); }
}
export async function authentication8RecoveryEvidence(proof: unknown, config: LocalKeyConfiguration, lease: BootstrapLease) {
  guard(config, lease); const saved = proof && typeof proof === "object" ? recoveries.get(proof) : undefined;
  if (!saved || saved.lease !== lease) return fail();
  await storage(path.dirname(saved.archive), "check", { filename: path.basename(saved.archive) });
  if ((await hashFile(saved.archive)).sha256 !== saved.ciphertextSha256) return fail();
  const current = await inspectSource(config, lease);
  if (current.filename !== saved.filename || current.stateDigest !== saved.currentStateDigest || current.anchorDigest !== saved.originalAnchorDigest) return fail();
  return Object.freeze({ archiveId: saved.archiveId, ciphertextSha256: saved.ciphertextSha256, sourceStateDigest: saved.originalStateDigest,
    currentSourceStateDigest: saved.currentStateDigest, originalAnchorDigest: saved.originalAnchorDigest });
}
