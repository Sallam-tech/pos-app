import "server-only";
import { confirmNeverAdmittedQuarantine, type TrustedCandidateRecoveryInteraction } from "./candidate-recovery8";
import { confirmKnownCandidateSelection, type TrustedCandidateSelectionInteraction } from "./candidate-selection";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { adminMaintenanceSourceEvidence, type AdminMaintenanceSource } from "../auth/gateway";
import { resolveDatabaseLocation } from "../db/location";
import { decryptSnapshot, hashFile, type BackupCustody } from "../backup/crypto";
import { fingerprint, type ProofDatabase } from "../backup/snapshot";
import { validateHistoricalSettings, verifyProtectedSnapshotContents, testSourceNamespace, type HistoricalSettings } from "../backup/service";
import { storage, testDirectory } from "../backup/storage";
import { enrollmentDigest, readEnrollmentSnapshot } from "./database";
import { classifyEnrollment, readEnrollmentJournal } from "./journal";
import { candidateLedgerContext, candidateRecordBytes, candidateRecordDigest, classifyCandidateLedger, candidatePendingCompatible, readProtectedCandidateLedger, type CandidateRecord } from "./candidate-records";
import { inspectHistoricalLocalVault, inspectLocalVault, type LocalKeyConfiguration } from "./keys";
import { hasActiveBootstrapLease, type BootstrapLease } from "./ownership";
import { protectedManifestDigest } from "./maintenance-journal";
import { rejectBootstrap, windowsProtection } from "./windows";

const Driver = createRequire(import.meta.url)("better-sqlite3") as new (filename: string, options: { readonly: true; fileMustExist: true }) => ProofDatabase;
const dbOpen = (filename: string) => { const db = new Driver(filename, { readonly: true, fileMustExist: true }); db.defaultSafeIntegers(true); return db; };
const reader = (db: ProofDatabase) => ({ get: async (sql: string, values: readonly import("../db/connection").SqlValue[] = []) => db.prepare(sql).get(...values), all: async (sql: string, values: readonly import("../db/connection").SqlValue[] = []) => db.prepare(sql).all(...values) });
function configuration(input: LocalKeyConfiguration) {
  if (!input || input.database?.mode !== "test" || input.database.create === true || Object.keys(input).sort().join(",") !== "database,directory,migrationsDirectory") return rejectBootstrap();
  return Object.freeze({ directory: input.directory, migrationsDirectory: input.migrationsDirectory, database: Object.freeze({ ...input.database, create: false }) });
}
function sourceState(db: ProofDatabase) { const f = fingerprint(db); return enrollmentDigest({ ...f, tables: f.tables.filter(t => t.name !== "auth_login_attempts") }); }
function identity(filename: string) { const s = lstatSync(filename, { bigint: true }); if (!s.isFile() || s.isSymbolicLink() || s.nlink !== BigInt(1)) return rejectBootstrap(); return createHash("sha256").update(JSON.stringify({ filename: path.resolve(filename).toLowerCase(), device: String(s.dev), inode: String(s.ino) })).digest("hex"); }
interface Request { readonly action: "RESTORE_SEPARATE_PROTECTED41"; readonly operationId: string; readonly archiveSha256: string; readonly sourceFileIdentity: string; readonly productionActivation: false }
interface Adapter { confirm(request: Readonly<Request>): Promise<"CONFIRM_SEPARATE_TEST_RESTORE41" | "CANCELLED"> }
declare const interactionBrand: unique symbol;
export interface TrustedProtectedRestoreInteraction { readonly [interactionBrand]: true }
const interactions = new WeakMap<object, Adapter>();
export function bindTrustedProtectedRestoreInteraction(adapter: Adapter): TrustedProtectedRestoreInteraction {
  if (!adapter || Object.keys(adapter).join(",") !== "confirm" || typeof adapter.confirm !== "function") return rejectBootstrap();
  const token = Object.freeze({}) as TrustedProtectedRestoreInteraction; interactions.set(token, Object.freeze({ confirm: adapter.confirm.bind(adapter) })); return token;
}
interface Receipt { format: "POS_PROTECTED_RESTORE41_V2"; operationId: string; rootVaultDigest: string; originalAnchorDigest: string; sourceFileIdentity: string; destinationFileIdentity: string;
  archive: string; archiveSha256: string; sourceTlsPublicKeyDigests: readonly string[]; manifest: Awaited<ReturnType<typeof decryptSnapshot>>; history: readonly HistoricalSettings[] }
interface State { root: LocalKeyConfiguration; sourceConfig: LocalKeyConfiguration; target: LocalKeyConfiguration; source: AdminMaintenanceSource; lease: BootstrapLease;
  operationId: string; original: Awaited<ReturnType<typeof inspectLocalVault>>; sourceVault: Awaited<ReturnType<typeof inspectLocalVault>>;
  anchorVersion: 8 | 41; records: Awaited<ReturnType<typeof readEnrollmentJournal>>; sourceDigest: string; intent: Extract<CandidateRecord, { kind: "INTENT" }>; receipt: Receipt;
  targetDigest: string; stage: "VERIFIED" | "FAILED" | "COMMITTED"; completed?: Extract<CandidateRecord, { kind: "COMMITTED" }> }
declare const restoreCandidateBrand: unique symbol;
export interface ProtectedRestoreCandidate41 { readonly [restoreCandidateBrand]: true }
const candidates = new WeakMap<object, State>(), sourceClaims = new WeakSet<object>(), completionClaims = new WeakSet<object>(), selectionClaims = new WeakSet<object>();
function guard(s: State) {
  if (!hasActiveBootstrapLease(s.lease, s.sourceConfig.database)) return rejectBootstrap();
  if (adminMaintenanceSourceEvidence(s.source, s.sourceConfig.database, s.lease, { operationId: s.operationId, purpose: "RESTORE41" }).schema !== 41 ||
      identity(resolveDatabaseLocation(s.sourceConfig.database).filename) !== s.intent.sourceFileIdentity || identity(resolveDatabaseLocation(s.target.database).filename) !== s.intent.destinationFileIdentity) return rejectBootstrap();
}
async function checkEnrollment(db: ProofDatabase, records: State["records"], version: 8 | 41) {
  if (classifyEnrollment(records, await readEnrollmentSnapshot(reader(db), protectedManifestDigest(version), 41)).status !== "ENROLLED") return rejectBootstrap();
}
async function verifyTarget(s: State) {
  guard(s); if (s.stage === "FAILED") return rejectBootstrap();
  const original = dbOpen(resolveDatabaseLocation(s.sourceConfig.database).filename), target = dbOpen(resolveDatabaseLocation(s.target.database).filename);
  try {
    original.exec("BEGIN"); target.exec("BEGIN");
    if (sourceState(original) !== s.sourceDigest || enrollmentDigest(fingerprint(target)) !== s.targetDigest) return rejectBootstrap();
    await checkEnrollment(target, s.records, s.anchorVersion);
    const result = await verifyProtectedSnapshotContents(target, s.receipt.manifest.sourceNamespace, s.receipt.manifest.history.map(validateHistoricalSettings));
    if (enrollmentDigest(result.fingerprint) !== enrollmentDigest(s.receipt.manifest.fingerprint)) return rejectBootstrap();
    target.exec("ROLLBACK"); original.exec("ROLLBACK");
  } finally { target.close(); original.close(); }
  guard(s); if ((await hashFile(s.receipt.archive)).sha256 !== s.receipt.archiveSha256) return rejectBootstrap(); guard(s);
}
async function append(s: State, record: CandidateRecord) {
  guard(s); if (await windowsProtection({ ...candidateLedgerContext(s.original, s.intent.originalAnchorDigest), operation: "candidate-append", payload: candidateRecordBytes(record).toString("base64") }) !== true) return rejectBootstrap();
  guard(s); const ledger = await readProtectedCandidateLedger(s.original, s.intent.originalAnchorDigest); guard(s);
  if (!candidatePendingCompatible(ledger, record.kind === "COMMITTED" ? record.operationId : undefined) || candidateRecordDigest(ledger.records.at(-1)!) !== candidateRecordDigest(record)) return rejectBootstrap();
}
// Read-only source transfer, deliberately separate from TEST restore flags.
// All writes are to a new UUID directory; UNKNOWN backup completion has no
// capability, no COMMITTED record, no admission and no automatic retry.
export async function withProtectedRestore41<T>(rootInput: LocalKeyConfiguration, sourceInput: LocalKeyConfiguration, source: AdminMaintenanceSource, lease: BootstrapLease,
  custody: BackupCustody, archive: string, directory: string, operationId: string, interaction: TrustedProtectedRestoreInteraction, work: (candidate: ProtectedRestoreCandidate41, destination: LocalKeyConfiguration) => Promise<T>) {
  try {
    const root = configuration(rootInput), sourceConfig = configuration(sourceInput), adapter = interactions.get(interaction);
    testDirectory(directory); if (!adapter || sourceClaims.has(source) || readdirSync(directory).length || path.basename(directory) !== operationId || typeof work !== "function") return rejectBootstrap();
    const sourceFacts = adminMaintenanceSourceEvidence(source, sourceConfig.database, lease, { operationId, purpose: "RESTORE41" });
    if (sourceFacts.schema !== 41 || !hasActiveBootstrapLease(lease, sourceConfig.database)) return rejectBootstrap();
    const original = await inspectHistoricalLocalVault(root), sourceVault = await inspectLocalVault(sourceConfig);
    const rootDb = dbOpen(resolveDatabaseLocation(root.database).filename); let anchorVersion: 8 | 41;
    try { const version = rootDb.prepare("PRAGMA user_version").get()?.user_version; if (version !== BigInt(8) && version !== BigInt(41)) return rejectBootstrap(); anchorVersion = Number(version) as 8 | 41; } finally { rootDb.close(); }
    const records = await readEnrollmentJournal(original, protectedManifestDigest(anchorVersion)), anchor = records.find(r => r.kind === "ENROLLED"); if (!anchor) return rejectBootstrap();
    const ledger = await readProtectedCandidateLedger(original, enrollmentDigest(anchor)), state = classifyCandidateLedger(ledger);
    if (!candidatePendingCompatible(ledger) || !["ABSENT", "QUARANTINED_ONLY", "RECORDED_CURRENT"].includes(state.status) ||
        sourceVault.databaseFingerprint !== (state.recordedCurrent?.destinationFileIdentity ?? original.databaseFingerprint) || (!state.recordedCurrent && anchorVersion !== 41)) return rejectBootstrap();
    const sourceDb = dbOpen(resolveDatabaseLocation(sourceConfig.database).filename); let sourceDigest: string;
    try { sourceDb.exec("BEGIN"); await checkEnrollment(sourceDb, records, anchorVersion); sourceDigest = sourceState(sourceDb); sourceDb.exec("ROLLBACK"); } finally { sourceDb.close(); }
    const cipher = await hashFile(archive); sourceClaims.add(source);
    if (await adapter.confirm(Object.freeze({ action: "RESTORE_SEPARATE_PROTECTED41", operationId, archiveSha256: cipher.sha256, sourceFileIdentity: sourceVault.databaseFingerprint, productionActivation: false })) !== "CONFIRM_SEPARATE_TEST_RESTORE41") return rejectBootstrap();
    await storage(directory, "initialize");
    const available = await storage(directory, "space"); if (typeof available !== "string" || BigInt(available) < BigInt(cipher.bytes) * BigInt(4) + BigInt(32 * 1024 * 1024)) return rejectBootstrap();
    const decoded = path.join(directory, "decoded.pending"), manifest = await decryptSnapshot(custody, archive, decoded, undefined, undefined, cipher.sha256);
    const expandedSpace=await storage(directory,"space");if(typeof expandedSpace!=="string"||BigInt(expandedSpace)<BigInt(manifest.databaseBytes)*BigInt(3)+BigInt(16*1024*1024))return rejectBootstrap();
    if (manifest.schema !== 41 || manifest.sourceNamespace !== testSourceNamespace(resolveDatabaseLocation(sourceConfig.database).filename)) return rejectBootstrap();
    const db = dbOpen(decoded); let histories: readonly HistoricalSettings[];
    try { db.exec("BEGIN"); await checkEnrollment(db, records, anchorVersion); const result = await verifyProtectedSnapshotContents(db, manifest.sourceNamespace, manifest.history.map(validateHistoricalSettings));
      if (enrollmentDigest(result.fingerprint) !== enrollmentDigest(manifest.fingerprint)) return rejectBootstrap(); histories = Object.freeze([...manifest.history.map(validateHistoricalSettings), result.origin]); if (histories.length > 16) return rejectBootstrap(); db.exec("ROLLBACK");
    } finally { db.close(); }
    const file = await open(path.join(directory, "restored41.sqlite3"), "wx"); try { await file.sync(); } finally { await file.close(); }
    const target = configuration({ directory, database: { directory, filename: "restored41.sqlite3", mode: "test", create: false }, migrationsDirectory: sourceConfig.migrationsDirectory });
    const inheritedTls=state.recordedCurrent?.purpose==="RESTORE41"?(await readProtectedRestoreProvenance(sourceConfig,state.recordedCurrent)).sourceTlsPublicKeyDigests:[];
    const sourceTlsPublicKeyDigests=Object.freeze([...new Set([original.tlsPublicKeyDigest,sourceVault.tlsPublicKeyDigest,...inheritedTls])]);
    const receipt: Receipt = { format: "POS_PROTECTED_RESTORE41_V2", operationId, rootVaultDigest: original.vaultDigest, originalAnchorDigest: enrollmentDigest(anchor), sourceFileIdentity: sourceVault.databaseFingerprint,
      destinationFileIdentity: identity(resolveDatabaseLocation(target.database).filename), archive: path.resolve(archive), archiveSha256: cipher.sha256, sourceTlsPublicKeyDigests, manifest, history: histories };
    const previous = ledger.records.at(-1), intent: Extract<CandidateRecord, { kind: "INTENT" }> = { format: "POS_CANDIDATE_LEDGER_V1", kind: "INTENT", sequence: String(previous ? Number(previous.sequence) + 1 : 1), previousDigest: previous ? candidateRecordDigest(previous) : null,
      operationId, purpose: "RESTORE41", installationId: original.metadata.installationId, deviceId: original.metadata.deviceId, vaultDigest: original.vaultDigest, originalAnchorDigest: receipt.originalAnchorDigest,
      rootDatabaseFingerprint: original.databaseFingerprint, sourceFileIdentity: sourceVault.databaseFingerprint, destinationFileIdentity: receipt.destinationFileIdentity, sourceSchema: "41", sourceStateDigest: sourceDigest,
      targetSpecificationDigest: enrollmentDigest(receipt), backupArchiveId: manifest.archiveId, backupCiphertextSha256: cipher.sha256, createdAtMs: String(Date.now()), intentDigest: null, targetStateDigest: null, targetVaultDigest: null, generation: null };
    const s: State = { root, sourceConfig, target, source, lease, operationId, original, sourceVault, anchorVersion, records, sourceDigest, intent, receipt, targetDigest: enrollmentDigest(manifest.fingerprint), stage: "VERIFIED" };
    await append(s, intent);
    const copied = dbOpen(decoded); try { await copied.backup(resolveDatabaseLocation(target.database).filename, { progress: () => { guard(s); return 128; } }); } finally { copied.close(); }
    await verifyTarget(s);
    const candidate = Object.freeze({ toJSON: rejectBootstrap }) as unknown as ProtectedRestoreCandidate41; candidates.set(candidate, s);
    try { const result = await work(candidate, target); await verifyTarget(s); return result; }
    catch { s.stage = "FAILED"; return rejectBootstrap(); }
    finally { candidates.delete(candidate); }
  } catch { return rejectBootstrap(); }
}
export async function restoredCandidate41KeyEvidence(candidate: unknown, input: LocalKeyConfiguration) {
  const s = candidate && typeof candidate === "object" ? candidates.get(candidate) : undefined;
  if (!s || enrollmentDigest(configuration(input)) !== enrollmentDigest(s.target)) return rejectBootstrap(); await verifyTarget(s);
  return Object.freeze({ forbiddenTlsPublicKeyDigests: s.receipt.sourceTlsPublicKeyDigests, originalCertificateFingerprint: s.sourceVault.metadata.certificateFingerprint, originalInstallationId: s.sourceVault.metadata.installationId, originalDeviceId: s.sourceVault.metadata.deviceId });
}
export async function completeProtectedRestore41(candidate: ProtectedRestoreCandidate41) {
  const s = candidates.get(candidate); if (!s || completionClaims.has(candidate) || s.stage !== "VERIFIED") return rejectBootstrap(); completionClaims.add(candidate);
  await verifyTarget(s); const vault = await inspectLocalVault(s.target); guard(s);
  if (vault.metadata.installationId === s.sourceVault.metadata.installationId || vault.metadata.deviceId === s.sourceVault.metadata.deviceId || vault.metadata.certificateFingerprint === s.sourceVault.metadata.certificateFingerprint || s.receipt.sourceTlsPublicKeyDigests.includes(vault.tlsPublicKeyDigest)) return rejectBootstrap();
  const directory = path.join(s.target.directory, "protected-identity", "restore41"); mkdirSync(directory); await storage(directory, "initialize");
  const bytes = Buffer.from(JSON.stringify(s.receipt)); try { await storage(directory, "seal-record", { value: bytes.toString("base64") }); } finally { bytes.fill(0); }
  const record: Extract<CandidateRecord, { kind: "COMMITTED" }> = { ...s.intent, kind: "COMMITTED", sequence: String(Number(s.intent.sequence) + 1), previousDigest: candidateRecordDigest(s.intent), intentDigest: candidateRecordDigest(s.intent),
    targetStateDigest: s.targetDigest, targetVaultDigest: vault.vaultDigest, generation: null, createdAtMs: String(Math.max(Date.now(), Number(s.intent.createdAtMs))) };
  await readProtectedRestoreReceipt(s.target, record); await verifyTarget(s); await append(s, record); s.completed = record; s.stage = "COMMITTED";
  return Object.freeze({ status: "COMMITTED_UNADMITTED" as const, productionActivation: false as const });
}
export async function selectProtectedRestore41(candidate: ProtectedRestoreCandidate41, interaction: TrustedCandidateSelectionInteraction) {
  const s = candidates.get(candidate); if (!s || selectionClaims.has(candidate) || s.stage !== "COMMITTED" || !s.completed) return rejectBootstrap(); selectionClaims.add(candidate);
  await verifyTarget(s); await confirmKnownCandidateSelection(interaction, { action: "SELECT_KNOWN_COMPLETED_WRITER", operationId: s.operationId, destinationFileIdentity: s.intent.destinationFileIdentity, targetStateDigest: s.targetDigest, targetVaultDigest: s.completed.targetVaultDigest, productionActivation: false });
  await verifyTarget(s); const ledger = await readProtectedCandidateLedger(s.original, s.intent.originalAnchorDigest), previous = ledger.records.at(-1);
  if (!previous || candidateRecordDigest(previous) !== candidateRecordDigest(s.completed)) return rejectBootstrap();
  const old = classifyCandidateLedger(ledger).recordedCurrent, current: CandidateRecord = { ...s.completed, kind: "CURRENT", sequence: String(Number(previous.sequence) + 1), previousDigest: candidateRecordDigest(previous), generation: String(old ? Number(old.generation) + 1 : 1), createdAtMs: String(Math.max(Date.now(), Number(previous.createdAtMs))) };
  await readProtectedRestoreReceipt(s.target, current); await append(s, current); await verifyTarget(s);
  return Object.freeze({ status: "RECORDED_CURRENT" as const, generation: current.generation, sourceRetired: true as const, productionActivation: false as const });
}
// Native receipt + exact selected-chain specification authenticate historical
// prefixes after restart. This never mints writer authority by itself.
export async function readProtectedRestoreProvenance(target: LocalKeyConfiguration, selected: CandidateRecord) {
  if (selected.purpose !== "RESTORE41" || (selected.kind !== "CURRENT" && selected.kind !== "COMMITTED")) return rejectBootstrap();
  const directory = path.join(target.directory, "protected-identity", "restore41"), file = path.join(directory, "restore.dpapi"), before = readFileSync(file);
  const encoded = await storage(directory, "unseal-record"); if (typeof encoded !== "string") return rejectBootstrap(); const bytes = Buffer.from(encoded, "base64");
  try {
    const r = JSON.parse(bytes.toString("utf8")) as Receipt;
    if (r.format !== "POS_PROTECTED_RESTORE41_V2" || r.operationId !== selected.operationId || r.rootVaultDigest !== selected.vaultDigest || r.originalAnchorDigest !== selected.originalAnchorDigest || r.sourceFileIdentity !== selected.sourceFileIdentity || r.destinationFileIdentity !== selected.destinationFileIdentity ||
        r.destinationFileIdentity !== identity(resolveDatabaseLocation(target.database).filename) || r.archiveSha256 !== selected.backupCiphertextSha256 || r.manifest.archiveId !== selected.backupArchiveId || r.manifest.schema !== 41 || !Array.isArray(r.sourceTlsPublicKeyDigests) || !r.sourceTlsPublicKeyDigests.length || r.sourceTlsPublicKeyDigests.length>64 || new Set(r.sourceTlsPublicKeyDigests).size!==r.sourceTlsPublicKeyDigests.length || r.sourceTlsPublicKeyDigests.some(d=>typeof d!=="string"||! /^[a-f0-9]{64}$/.test(d)) ||
        enrollmentDigest(r) !== selected.targetSpecificationDigest || !Array.isArray(r.history) || r.history.length > 16 || !before.equals(readFileSync(file)) || (await hashFile(r.archive)).sha256 !== r.archiveSha256) return rejectBootstrap();
    const vault=await inspectLocalVault(target);if(vault.vaultDigest!==selected.targetVaultDigest||r.sourceTlsPublicKeyDigests.includes(vault.tlsPublicKeyDigest))return rejectBootstrap();
    return Object.freeze({history:Object.freeze(r.history.map(validateHistoricalSettings)),sourceTlsPublicKeyDigests:Object.freeze([...r.sourceTlsPublicKeyDigests])});
  } finally { bytes.fill(0); before.fill(0); }
}

// Deliberate restart completion uses durable COMMITTED and independent source,
// target, archive and key validation. INTENT-only copies are never adopted.
export async function finalizeProtectedRestore41(rootInput: LocalKeyConfiguration, sourceInput: LocalKeyConfiguration, targetInput: LocalKeyConfiguration,
  source: AdminMaintenanceSource, lease: BootstrapLease, operationId: string, interaction: TrustedCandidateSelectionInteraction) {
  try {
    const root = configuration(rootInput), sourceConfig = configuration(sourceInput), target = configuration(targetInput);
    const guard = () => { if (!hasActiveBootstrapLease(lease, sourceConfig.database) || adminMaintenanceSourceEvidence(source, sourceConfig.database, lease, { operationId, purpose: "RESTORE41" }).schema !== 41) return rejectBootstrap(); };
    guard(); const original = await inspectHistoricalLocalVault(root), rootDb = dbOpen(resolveDatabaseLocation(root.database).filename); let version: 8 | 41;
    try { const v = rootDb.prepare("PRAGMA user_version").get()?.user_version; if (v !== BigInt(8) && v !== BigInt(41)) return rejectBootstrap(); version = Number(v) as 8 | 41; } finally { rootDb.close(); }
    const records = await readEnrollmentJournal(original, protectedManifestDigest(version)), anchor = records.find(r => r.kind === "ENROLLED"); if (!anchor) return rejectBootstrap();
    const ledger = await readProtectedCandidateLedger(original, enrollmentDigest(anchor)), own = ledger.records.filter(r => r.operationId === operationId), completed = own[1];
    if (!candidatePendingCompatible(ledger, operationId) || own.length !== 2 || own[0].kind !== "INTENT" || !completed || completed.kind !== "COMMITTED" || completed.purpose !== "RESTORE41" || ledger.records.at(-1) !== completed || completed.sourceFileIdentity !== identity(resolveDatabaseLocation(sourceConfig.database).filename)) return rejectBootstrap();
    const verify = async () => {
      guard(); const vault = await inspectLocalVault(target); guard();
      if (vault.databaseFingerprint !== completed.destinationFileIdentity || vault.vaultDigest !== completed.targetVaultDigest) return rejectBootstrap();
      const histories = await readProtectedRestoreReceipt(target, completed), db = dbOpen(resolveDatabaseLocation(target.database).filename), old = dbOpen(resolveDatabaseLocation(sourceConfig.database).filename);
      try { db.exec("BEGIN"); old.exec("BEGIN");
        if (sourceState(old) !== completed.sourceStateDigest || enrollmentDigest(fingerprint(db)) !== completed.targetStateDigest) return rejectBootstrap();
        await checkEnrollment(db, records, version); await verifyProtectedSnapshotContents(db, testSourceNamespace(resolveDatabaseLocation(target.database).filename), histories);
        old.exec("ROLLBACK"); db.exec("ROLLBACK");
      } finally { db.close(); old.close(); } guard();
    };
    await verify(); await confirmKnownCandidateSelection(interaction, { action: "SELECT_KNOWN_COMPLETED_WRITER", operationId, destinationFileIdentity: completed.destinationFileIdentity, targetStateDigest: completed.targetStateDigest, targetVaultDigest: completed.targetVaultDigest, productionActivation: false }); await verify();
    const observed = await readProtectedCandidateLedger(original, enrollmentDigest(anchor)); if (enrollmentDigest(observed) !== enrollmentDigest(ledger)) return rejectBootstrap();
    const prior = classifyCandidateLedger(ledger).recordedCurrent, current: CandidateRecord = { ...completed, kind: "CURRENT", sequence: String(Number(completed.sequence) + 1), previousDigest: candidateRecordDigest(completed), generation: String(prior ? Number(prior.generation) + 1 : 1), createdAtMs: String(Math.max(Date.now(), Number(completed.createdAtMs))) };
    guard(); if (await windowsProtection({ ...candidateLedgerContext(original, enrollmentDigest(anchor)), operation: "candidate-append", payload: candidateRecordBytes(current).toString("base64") }) !== true) return rejectBootstrap(); guard();
    const readback = await readProtectedCandidateLedger(original, enrollmentDigest(anchor)); if (!candidatePendingCompatible(readback) || candidateRecordDigest(readback.records.at(-1)!) !== candidateRecordDigest(current)) return rejectBootstrap(); await verify();
    return Object.freeze({ status: "RECORDED_CURRENT" as const, generation: current.generation, sourceRetired: true as const, productionActivation: false as const });
  } catch { return rejectBootstrap(); }
}

export async function quarantineNeverAdmittedRestore41(rootInput: LocalKeyConfiguration, sourceInput: LocalKeyConfiguration, source: AdminMaintenanceSource, lease: BootstrapLease,
  operationId: string, interaction: TrustedCandidateRecoveryInteraction) {
  try {
    const root = configuration(rootInput), sourceConfig = configuration(sourceInput);
    const guard = () => { if (!hasActiveBootstrapLease(lease, sourceConfig.database) || adminMaintenanceSourceEvidence(source, sourceConfig.database, lease, { operationId, purpose: "RESTORE41" }).schema !== 41) return rejectBootstrap(); };
    guard(); const vault = await inspectHistoricalLocalVault(root), db = dbOpen(resolveDatabaseLocation(root.database).filename); let version: 8 | 41;
    try { const n = db.prepare("PRAGMA user_version").get()?.user_version; if (n !== BigInt(8) && n !== BigInt(41)) return rejectBootstrap(); version = Number(n) as 8 | 41; } finally { db.close(); }
    const records = await readEnrollmentJournal(vault, protectedManifestDigest(version)), anchor = records.find(r => r.kind === "ENROLLED"); if (!anchor) return rejectBootstrap();
    const ledger = await readProtectedCandidateLedger(vault, enrollmentDigest(anchor)), own = ledger.records.filter(r => r.operationId === operationId), intent = own[0];
    if (own.length !== 1 || !intent || intent.kind !== "INTENT" || intent.purpose !== "RESTORE41" || ledger.records.at(-1) !== intent || intent.sourceFileIdentity !== identity(resolveDatabaseLocation(sourceConfig.database).filename)) return rejectBootstrap();
    const check = () => { guard(); const sourceDb = dbOpen(resolveDatabaseLocation(sourceConfig.database).filename); try { if (sourceState(sourceDb) !== intent.sourceStateDigest) return rejectBootstrap(); } finally { sourceDb.close(); } guard(); };
    check(); await confirmNeverAdmittedQuarantine(interaction, { action: "QUARANTINE_NEVER_ADMITTED", operationId, destinationFileIdentity: intent.destinationFileIdentity, sourceStateDigest: intent.sourceStateDigest, intentDigest: candidateRecordDigest(intent), sqlOutcome: "UNKNOWN", productionActivation: false }); check();
    const observed = await readProtectedCandidateLedger(vault, enrollmentDigest(anchor)); if (enrollmentDigest(observed) !== enrollmentDigest(ledger)) return rejectBootstrap();
    const record: CandidateRecord = { ...intent, kind: "QUARANTINED_NO_ADMISSION", sequence: String(Number(intent.sequence) + 1), previousDigest: candidateRecordDigest(intent), intentDigest: candidateRecordDigest(intent), targetStateDigest: null, targetVaultDigest: null, generation: null, createdAtMs: String(Math.max(Date.now(), Number(intent.createdAtMs))) };
    if (await windowsProtection({ ...candidateLedgerContext(vault, enrollmentDigest(anchor)), operation: "candidate-append", payload: candidateRecordBytes(record).toString("base64") }) !== true) return rejectBootstrap(); guard();
    const readback = await readProtectedCandidateLedger(vault, enrollmentDigest(anchor)); if (candidateRecordDigest(readback.records.at(-1)!) !== candidateRecordDigest(record)) return rejectBootstrap(); check();
    return Object.freeze({ status: "QUARANTINED_NO_ADMISSION" as const, sqlOutcome: "UNKNOWN" as const, productionActivation: false as const });
  } catch { return rejectBootstrap(); }
}

export async function readProtectedRestoreReceipt(target:LocalKeyConfiguration,selected:CandidateRecord):Promise<readonly HistoricalSettings[]>{return (await readProtectedRestoreProvenance(target,selected)).history;}
