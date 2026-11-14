import "server-only";

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { SqlTransaction, SqlValue } from "../db/connection";
import { reviewedMigrations } from "../db/reviewed-schema";
import { assertSalesSchemaSnapshot } from "../db/sales-migrate";
import { salesSteps } from "../db/sales-program";
import { returnsSteps } from "../db/returns-program";
import { expensesSteps } from "../db/expenses-program";
import { invoicesSteps } from "../db/invoices-program";
import { cashSteps } from "../db/cash-program";
import { settingsSteps } from "../db/settings-program";
import { invoiceMigrationTransaction } from "../db/invoices-migrate";
import { cashMigrationTransaction } from "../db/cash-migrate";
import { settingsMigrationTransaction } from "../db/settings-migrate";
import { fingerprintTable, type ProofDatabase, verifySchema41 } from "../backup/snapshot";
import { rowHasher } from "../backup/row-hash";
import { closeSync, fsyncSync, lstatSync, openSync, opendirSync, realpathSync } from "node:fs";
import path from "node:path";
import { adminMaintenanceSourceEvidence, type AdminMaintenanceSource } from "../auth/gateway";
import { fingerprint, openProofDatabase } from "../backup/snapshot";
import { storage, testDirectory } from "../backup/storage";
import { resolveDatabaseLocation } from "../db/location";
import { validateReviewedSchema } from "../db/validate-schema";
import { authenticationBackup8Evidence, type VerifiedAuthenticationBackup8 } from "./authentication-backup";
import { candidateLedgerContext, candidateRecordBytes, candidateRecordDigest, classifyCandidateLedger, candidatePendingCompatible, readProtectedCandidateLedger, type CandidateRecord } from "./candidate-records";
import { enrollmentDigest } from "./database";
import { inspectLocalVault, withProtectedLocalKeys, type LocalKeyConfiguration } from "./keys";
import { protectedManifestDigest } from "./maintenance-journal";
import { hasActiveBootstrapLease, type BootstrapLease } from "./ownership";
import { rejectBootstrap, windowsProtection } from "./windows";

declare const interactionBrand: unique symbol;
export interface TrustedCandidateCopyInteraction { readonly [interactionBrand]: true }
interface CopyRequest { readonly operationId: string; readonly purpose: "UPGRADE8"; readonly sourceFileIdentity: string; readonly originalAnchorDigest: string; readonly archiveId: string; readonly ciphertextSha256: string; readonly destinationDirectory: string; readonly productionActivation: false }
interface CopyAdapter { confirm(request: Readonly<CopyRequest>): Promise<"CONFIRM_NEW_UNADMITTED_COPY8" | "CANCELLED"> }
const interactions = new WeakMap<object, CopyAdapter>();
// Privileged desktop construction boundary ONLY. Actual Admin verification and
// authenticated source/archive evidence remain separate required capabilities.
export function bindTrustedCandidateCopyInteraction(adapter: CopyAdapter): TrustedCandidateCopyInteraction {
  if (!adapter || Object.keys(adapter).join(",") !== "confirm" || typeof adapter.confirm !== "function") return rejectBootstrap();
  const value = Object.freeze({}) as TrustedCandidateCopyInteraction;
  interactions.set(value, Object.freeze({ confirm: adapter.confirm.bind(adapter) })); return value;
}
declare const copyBrand: unique symbol;
export interface UnadmittedCandidateCopy8 { readonly [copyBrand]: true }
interface CopyState { stage?: "MIGRATING" | "VERIFIED41" | "COMMITTED41" | "FAILED"; committed?: Extract<CandidateRecord, { kind: "COMMITTED" }>; targetDigest?: string; startedAt?: number; finishedAt?: number; signal?: AbortSignal; source: AdminMaintenanceSource; lease: BootstrapLease; config: LocalKeyConfiguration; backup: VerifiedAuthenticationBackup8; filename: string; identity: string; sourceFingerprint: string; intent: Extract<CandidateRecord, { kind: "INTENT" }>; vault: Awaited<ReturnType<typeof inspectLocalVault>> }
const copies = new WeakMap<object, CopyState>();
const claimedSources = new WeakSet<object>();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fileIdentity(filename: string): string {
  const s = lstatSync(filename, { bigint: true });
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== BigInt(1) || realpathSync.native(filename).toLowerCase() !== path.resolve(filename).toLowerCase()) return rejectBootstrap();
  return hash({ filename: path.resolve(filename).toLowerCase(), device: String(s.dev), inode: String(s.ino) });
}
function empty(directory: string) {
  const handle = opendirSync(directory); try { return handle.readSync() === null; } finally { handle.closeSync(); }
}
function guard(c: Pick<CopyState, "source" | "lease" | "config" | "intent" | "signal">) {
  if (c.signal?.aborted || !hasActiveBootstrapLease(c.lease, c.config.database)) return rejectBootstrap();
  const facts = adminMaintenanceSourceEvidence(c.source, c.config.database, c.lease, { operationId: c.intent.operationId, purpose: "UPGRADE8" });
  if (facts.schema !== 8 || hash({ filename: facts.filename, device: facts.device, inode: facts.inode }) !== c.intent.sourceFileIdentity) return rejectBootstrap();
}
async function append(c: CopyState, record: CandidateRecord) {
  guard(c);
  if (await windowsProtection({ ...candidateLedgerContext(c.vault, c.intent.originalAnchorDigest), operation: "candidate-append", payload: candidateRecordBytes(record).toString("base64") }) !== true) return rejectBootstrap();
  guard(c);
  const facts = await readProtectedCandidateLedger(c.vault, c.intent.originalAnchorDigest);
  if (!facts.records.some(r => candidateRecordDigest(r) === candidateRecordDigest(record))) return rejectBootstrap();
}
async function snapshot(filename: string): Promise<string> {
  resolveDatabaseLocation({ directory: path.dirname(filename), filename: path.basename(filename), mode: "test", create: false }); // Main AND every SQLite sidecar.
  const db = openProofDatabase(filename);
  try {
    db.exec("BEGIN");
    if (JSON.stringify(db.prepare("PRAGMA integrity_check").all()) !== '[{"integrity_check":"ok"}]' || db.prepare("PRAGMA foreign_key_check").all().length ||
        !(await validateReviewedSchema({ get: async (sql, values) => db.prepare(sql).get(...(values ?? [])), all: async (sql, values) => db.prepare(sql).all(...(values ?? [])) }, 8)).ok) return rejectBootstrap();
    const result = enrollmentDigest(fingerprint(db)); db.exec("ROLLBACK"); return result;
  } finally { db.close(); }
}
// READ-ONLY evidence, not a DDL/completion/key/selection/admission issuer. This
// capability exists only during this function's callback and is bound to its
// original genuine Admin scope, source/archive, protected intent and exact file.
export async function unadmittedCandidateCopy8Evidence(copy: unknown) {
  const c = copy && typeof copy === "object" ? copies.get(copy) : undefined;
  if (!c || c.stage === "FAILED" || c.stage === "VERIFIED41" || c.stage === "COMMITTED41") return rejectBootstrap(); guard(c);
  const archive = await authenticationBackup8Evidence(c.backup, c.config, c.lease); guard(c);
  if (archive.sourceStateDigest !== c.intent.sourceStateDigest || archive.ciphertextSha256 !== c.intent.backupCiphertextSha256 || fileIdentity(c.filename) !== c.identity) return rejectBootstrap();
  await storage(path.dirname(c.filename), "check", { filename: path.basename(c.filename) }); guard(c);
  const ledger = await readProtectedCandidateLedger(c.vault, c.intent.originalAnchorDigest), own = ledger.records.filter(r => r.operationId === c.intent.operationId);
  if (!candidatePendingCompatible(ledger) || own.length !== 1 || own[0].kind !== "INTENT" || candidateRecordDigest(own[0]) !== candidateRecordDigest(c.intent) ||
      classifyCandidateLedger(ledger).status !== "RECOVERY_REVIEW_REQUIRED" || await snapshot(c.filename) !== c.sourceFingerprint) return rejectBootstrap();
  guard(c);
  return Object.freeze({ operationId: c.intent.operationId, sourceFileIdentity: c.intent.sourceFileIdentity, destinationFileIdentity: c.identity,
    sourceStateDigest: c.intent.sourceStateDigest, targetSpecificationDigest: c.intent.targetSpecificationDigest, copyFingerprint: c.sourceFingerprint, schema: 8 as const, admission: false as const, productionActivation: false as const });
}
// Confined disposable TEST copy stage only. No existing file/operation is reused,
// no SQL schema migration is executed, and every artifact is retained. Even a
// successful copy remains INTENT/unadmitted until the separate verified DDL,
// fresh-key, known-completion and selected-generation authorities are implemented.
export async function withUnadmittedCandidateCopy8<T>(input: LocalKeyConfiguration, source: AdminMaintenanceSource, lease: BootstrapLease, backup: VerifiedAuthenticationBackup8,
  directory: string, interaction: TrustedCandidateCopyInteraction, work: (copy: UnadmittedCandidateCopy8) => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    if (!input || !input.database || input.database.create === true || Object.keys(input).sort().join(",") !== "database,directory,migrationsDirectory") return rejectBootstrap();
    const config = Object.freeze({ directory: input.directory, migrationsDirectory: input.migrationsDirectory, database: Object.freeze({ ...input.database, create: false }) });
    if (config.database.mode !== "test" || (signal !== undefined && !(signal instanceof AbortSignal)) || signal?.aborted || typeof work !== "function") return rejectBootstrap();
    const adapter = interaction && typeof interaction === "object" ? interactions.get(interaction) : undefined;
    if (!adapter) return rejectBootstrap();
    const initial = adminMaintenanceSourceEvidence(source, config.database, lease, { operationId: path.basename(directory), purpose: "UPGRADE8" });
    if (initial.schema !== 8 || claimedSources.has(source) || !hasActiveBootstrapLease(lease, config.database)) return rejectBootstrap();
    testDirectory(directory); if (!empty(directory)) return rejectBootstrap();
    const vault = await inspectLocalVault(config), archive = await authenticationBackup8Evidence(backup, config, lease);
    if (vault.databaseFingerprint !== hash({ filename: initial.filename, device: initial.device, inode: initial.inode })) return rejectBootstrap();
    const ledger = await readProtectedCandidateLedger(vault, archive.originalAnchorDigest), state = classifyCandidateLedger(ledger);
    if (!candidatePendingCompatible(ledger) || !["ABSENT", "QUARANTINED_ONLY"].includes(state.status) || ledger.records.some(r => r.operationId === initial.operationId)) return rejectBootstrap();
    const request = Object.freeze({ operationId: initial.operationId, purpose: "UPGRADE8" as const, sourceFileIdentity: vault.databaseFingerprint, originalAnchorDigest: archive.originalAnchorDigest,
      archiveId: archive.archiveId, ciphertextSha256: archive.ciphertextSha256, destinationDirectory: path.resolve(directory), productionActivation: false as const });
    if (claimedSources.has(source)) return rejectBootstrap();
    claimedSources.add(source); // One deliberate attempt; never replay after uncertain I/O or cancellation.
    if (await adapter.confirm(request) !== "CONFIRM_NEW_UNADMITTED_COPY8" || signal?.aborted) return rejectBootstrap();
    adminMaintenanceSourceEvidence(source, config.database, lease, { operationId: initial.operationId, purpose: "UPGRADE8" });
    const checked = await authenticationBackup8Evidence(backup, config, lease);
    if (enrollmentDigest(checked) !== enrollmentDigest(archive) || !empty(directory)) return rejectBootstrap();
    await storage(directory, "initialize");
    if (!empty(directory) || signal?.aborted) return rejectBootstrap();
    const sourceFile = resolveDatabaseLocation({ ...config.database, create: false }).filename, sourceBytes = lstatSync(sourceFile, { bigint: true }).size;
    const freeBytes = await storage(directory, "space");
    if (typeof freeBytes !== "string" || BigInt(freeBytes) < sourceBytes * BigInt(4) + BigInt(16 * 1024 * 1024)) return rejectBootstrap();
    const filename = path.join(directory, "candidate8.sqlite3"), fd = openSync(filename, "wx");
    try { fsyncSync(fd); } finally { closeSync(fd); }
    const identity = fileIdentity(filename), previous = ledger.records.at(-1);
    const intent: Extract<CandidateRecord, { kind: "INTENT" }> = { format: "POS_CANDIDATE_LEDGER_V1", kind: "INTENT", sequence: String(previous ? Number(previous.sequence) + 1 : 1), previousDigest: previous ? candidateRecordDigest(previous) : null,
      operationId: initial.operationId, purpose: "UPGRADE8", installationId: vault.metadata.installationId, deviceId: vault.metadata.deviceId, vaultDigest: vault.vaultDigest,
      originalAnchorDigest: archive.originalAnchorDigest, rootDatabaseFingerprint: vault.databaseFingerprint, sourceFileIdentity: vault.databaseFingerprint, destinationFileIdentity: identity,
      sourceSchema: "8", sourceStateDigest: archive.sourceStateDigest, targetSpecificationDigest: enrollmentDigest({ format: "POS_UNADMITTED_UPGRADE8_SPEC_V1", manifest: protectedManifestDigest(41), sourceState: archive.sourceStateDigest, destinationFileIdentity: identity, initialization: "PRESERVE_ALL8_ROWS_ROWIDS_EMPTY_BUSINESS" }),
      backupArchiveId: archive.archiveId, backupCiphertextSha256: archive.ciphertextSha256, createdAtMs: String(Math.max(Date.now(), previous ? Number(previous.createdAtMs) : 0)), intentDigest: null, targetStateDigest: null, targetVaultDigest: null, generation: null };
    const original = resolveDatabaseLocation({ ...config.database, create: false }).filename;
    const c: CopyState = { source, lease, config, backup, filename, identity, sourceFingerprint: await snapshot(original), intent, vault, ...(signal ? { signal } : {}) };
    await append(c, intent); // Flushed/native readback BEFORE any backup write.
    // The driver removes its OWN newly-created failed destination. Exclusive
    // precreation above makes its isNewFile=false, retaining failure evidence.
    const db = openProofDatabase(original);
    try { await db.backup(filename, { progress: () => { guard(c); if (signal?.aborted || fileIdentity(filename) !== identity) return rejectBootstrap(); return 128; } }); }
    finally { db.close(); }
    guard(c); if (signal?.aborted || fileIdentity(filename) !== identity || await snapshot(original) !== c.sourceFingerprint || await snapshot(filename) !== c.sourceFingerprint) return rejectBootstrap();
    const copy = Object.freeze({ toJSON: rejectBootstrap }) as unknown as UnadmittedCandidateCopy8;
    copies.set(copy, c);
    try { await unadmittedCandidateCopy8Evidence(copy); const result = await work(copy); if (c.stage === "VERIFIED41" || c.stage === "COMMITTED41") await verifiedCandidate41Evidence(copy); else if (c.stage === undefined) await unadmittedCandidateCopy8Evidence(copy); else return rejectBootstrap(); return result; }
    finally { copies.delete(copy); }
  } catch { return rejectBootstrap(); } // Never claim rollback, completion or quarantine after uncertain I/O.
}


// The only enrolled-candidate DDL issuer. The genuine copy is callback-scoped,
// one-use and bound to the SAME original runtime/bootstrap fence and intent.
// No generic TEST connection, arbitrary SQL or persistent file can opt in.
interface CandidateNative extends ProofDatabase { readonly inTransaction: boolean; }
const CandidateDriver = createRequire(import.meta.url)("better-sqlite3") as new (filename: string, options: { fileMustExist: true; timeout: number }) => CandidateNative;
const candidateCopies = new WeakSet<object>();
function originalTableProofs(db: ProofDatabase) {
  return fingerprint(db).tables;
}
function originalHistoryProof(db: ProofDatabase) {
  const h = rowHasher();
  for (const r of db.prepare("SELECT rowid AS __proof_rowid,* FROM schema_migrations WHERE version<=8 ORDER BY rowid").iterate()) h.add(r);
  return h.result("schema_migrations");
}
async function verifyMigrated(c: CopyState) {
  guard(c);
  if (fileIdentity(c.filename) !== c.identity || (c.stage !== "VERIFIED41" && c.stage !== "COMMITTED41") || !c.targetDigest || !c.startedAt || !c.finishedAt) return rejectBootstrap();
  resolveDatabaseLocation({ directory: path.dirname(c.filename), filename: path.basename(c.filename), mode: "test", create: false });
  const original = resolveDatabaseLocation({ ...c.config.database, create: false }).filename;
  const source = openProofDatabase(original), target = openProofDatabase(c.filename);
  try {
    source.exec("BEGIN"); target.exec("BEGIN");
    if (enrollmentDigest(fingerprint(source)) !== c.sourceFingerprint) return rejectBootstrap();
    await verifySchema41(target);
    const old = originalTableProofs(source), now = originalTableProofs(target);
    for (const table of old) {
      const actual = table.name === "schema_migrations" ? originalHistoryProof(target) : now.find(t => t.name === table.name);
      if (enrollmentDigest(actual) !== enrollmentDigest(table)) return rejectBootstrap();
    }
    for (const table of now) if (!old.some(t => t.name === table.name) && table.count !== "0") return rejectBootstrap();
    const dates = target.prepare("SELECT applied_at FROM schema_migrations WHERE version>8 ORDER BY version").all();
    if (dates.length !== 33 || dates.some(r => typeof r.applied_at !== "bigint" || r.applied_at < BigInt(c.startedAt!) || r.applied_at > BigInt(c.finishedAt!))) return rejectBootstrap();
    if (enrollmentDigest(fingerprint(target)) !== c.targetDigest) return rejectBootstrap();
    target.exec("ROLLBACK"); source.exec("ROLLBACK");
  } finally { target.close(); source.close(); }
  guard(c);
}
export async function verifiedCandidate41Evidence(copy: unknown) {
  const c = copy && typeof copy === "object" ? copies.get(copy) : undefined;
  if (!c || !candidateCopies.has(copy as object)) return rejectBootstrap();
  await verifyMigrated(c);
  const archive = await authenticationBackup8Evidence(c.backup, c.config, c.lease); guard(c);
  if (archive.sourceStateDigest !== c.intent.sourceStateDigest || archive.ciphertextSha256 !== c.intent.backupCiphertextSha256) return rejectBootstrap();
  await storage(path.dirname(c.filename), "check", { filename: path.basename(c.filename) });
  const ledger = await readProtectedCandidateLedger(c.vault, c.intent.originalAnchorDigest);
  const expected = c.stage === "COMMITTED41" ? c.committed : c.intent;
  const own = ledger.records.filter(r => r.operationId === c.intent.operationId), last = ledger.records.at(-1);
  const selected = c.stage === "COMMITTED41" && own.length === 3 && last?.kind === "CURRENT" && last.operationId === c.intent.operationId &&
    last.intentDigest === candidateRecordDigest(c.intent) && last.targetStateDigest === c.committed?.targetStateDigest && last.targetVaultDigest === c.committed?.targetVaultDigest;
  if (!expected || !candidatePendingCompatible(ledger, c.stage === "COMMITTED41" ? c.intent.operationId : undefined) || (!selected && (candidateRecordDigest(last!) !== candidateRecordDigest(expected) || own.length !== (c.stage === "COMMITTED41" ? 2 : 1)))) return rejectBootstrap();
  guard(c);
  return Object.freeze({ operationId: c.intent.operationId, filename: c.filename, sourceFileIdentity: c.intent.sourceFileIdentity, destinationFileIdentity: c.identity,
    sourceStateDigest: c.intent.sourceStateDigest, targetStateDigest: c.targetDigest!, targetSpecificationDigest: c.intent.targetSpecificationDigest,
    knownSqlCompletion: true as const, schema: 41 as const, admission: false as const, productionActivation: false as const });
}
export async function migrateUnadmittedCandidate8(copy: UnadmittedCandidateCopy8): Promise<void> {
  const c = copy && typeof copy === "object" ? copies.get(copy) : undefined;
  if (!c || c.stage || candidateCopies.has(copy)) return rejectBootstrap();
  // Burn before the first await. Failure/unknown COMMIT can NEVER be replayed.
  c.stage = "MIGRATING";
  let db: CandidateNative | undefined;
  try {
    // The read-only copy evidence deliberately does not accept a migrated file.
    await unadmittedCandidateCopy8Evidence(copy); guard(c);
    const manifest = reviewedMigrations();
    if (manifest.length !== 41) return rejectBootstrap();
    c.startedAt = Date.now();
    db = new CandidateDriver(c.filename, { fileMustExist: true, timeout: 5000 });
    const native = db;
    native.defaultSafeIntegers(true);
    native.exec("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000;");
    if (native.prepare("PRAGMA journal_mode").get()?.journal_mode !== "wal" || native.prepare("PRAGMA synchronous").get()?.synchronous !== BigInt(2) || native.prepare("PRAGMA foreign_keys").get()?.foreign_keys !== BigInt(1)) return rejectBootstrap();
    const unchanged = originalTableProofs(native);
    let active = false;
    const tx: SqlTransaction = Object.freeze({
      get(sql: string, values: readonly SqlValue[] = []) { if (!active || !native.inTransaction) return rejectBootstrap(); return native.prepare(sql).get(...values); },
      all(sql: string, values: readonly SqlValue[] = []) { if (!active || !native.inTransaction) return rejectBootstrap(); return native.prepare(sql).all(...values); },
      run(sql: string, values: readonly SqlValue[] = []) { if (!active || !native.inTransaction) return rejectBootstrap(); const r = native.prepare(sql).run(...values) as { changes: number; lastInsertRowid: bigint }; return { changes: BigInt(r.changes), lastInsertRowid: r.lastInsertRowid }; },
      setSchemaVersion(version: bigint) { if (!active || !native.inTransaction || version < BigInt(8) || version > BigInt(41)) return rejectBootstrap(); native.exec("PRAGMA user_version=" + version); },
    });
    const transaction = (work: () => void, foreignKeysOff = false) => {
      guard(c); if (fileIdentity(c.filename) !== c.identity || native.inTransaction) return rejectBootstrap();
      if (foreignKeysOff) native.exec("PRAGMA foreign_keys=OFF");
      try {
        native.exec("BEGIN IMMEDIATE"); active = true; work(); guard(c);
        if (!native.inTransaction || native.prepare("PRAGMA foreign_key_check").all().length) return rejectBootstrap();
        native.exec("COMMIT"); // Only normal acknowledgement establishes this step.
        if (native.inTransaction) return rejectBootstrap();
      } catch (error) { if (native.inTransaction) native.exec("ROLLBACK"); throw error; }
      finally { active = false; if (foreignKeysOff) { native.exec("PRAGMA foreign_keys=ON"); if (native.prepare("PRAGMA foreign_keys").get()?.foreign_keys !== BigInt(1)) return rejectBootstrap(); } }
    };
    const steps = (sql: readonly string[]) => { for (const statement of sql) { guard(c); native.prepare(statement).run(); } };
    transaction(() => {
      for (const m of manifest.slice(8, 35)) {
        if (m.objectType === "program") return rejectBootstrap();
        native.exec(m.sql);
        tx.run("INSERT INTO schema_migrations VALUES(?,?,?,?)", [m.version, m.name, m.checksum, BigInt(Date.now())]);
        tx.setSchemaVersion(m.version);
      }
      assertSalesSchemaSnapshot(tx, 35);
    });
    for (const version of [36, 37, 38] as const) transaction(() => {
      assertSalesSchemaSnapshot(tx, (version - 1) as 35 | 36 | 37);
      steps(version === 36 ? salesSteps() : version === 37 ? returnsSteps() : expensesSteps());
      const m = manifest[version - 1];
      tx.run("INSERT INTO schema_migrations VALUES(?,?,?,?)", [m.version, m.name, m.checksum, BigInt(Date.now())]);
      tx.setSchemaVersion(m.version); assertSalesSchemaSnapshot(tx, version);
    });
    transaction(() => { invoiceMigrationTransaction(tx, () => steps(invoicesSteps())); }, true);
    transaction(() => { cashMigrationTransaction(tx, () => steps(cashSteps())); }, true);
    transaction(() => { settingsMigrationTransaction(tx, () => steps(settingsSteps())); });
    // Validate every original typed row/hidden rowid before closing this handle.
    for (const old of unchanged) if (enrollmentDigest(old.name === "schema_migrations" ? originalHistoryProof(native) : fingerprintTable(native, old.name)) !== enrollmentDigest(old)) return rejectBootstrap();
    c.finishedAt = Date.now(); c.targetDigest = enrollmentDigest(fingerprint(native));
    native.close(); db = undefined;
    c.stage = "VERIFIED41"; candidateCopies.add(copy);
    await verifiedCandidate41Evidence(copy); // Independent NEW native handle.
  } catch { c.stage = "FAILED"; candidateCopies.delete(copy); return rejectBootstrap(); }
  finally { if (db) { try { db.close(); } catch { c.stage = "FAILED"; } } }
}


// Narrow key-creation validation, not enrollment or a change to auth SQL. The
// destination must be this independently validated, never-admitted candidate.
export async function candidate41KeyEvidence(copy: unknown, config: LocalKeyConfiguration) {
  const c = copy && typeof copy === "object" ? copies.get(copy) : undefined;
  if (!c || !config || config.database.create === true || config.database.mode !== "test" ||
      path.resolve(config.directory).toLowerCase() !== path.dirname(c.filename).toLowerCase() ||
      resolveDatabaseLocation(config.database).filename.toLowerCase() !== c.filename.toLowerCase()) return rejectBootstrap();
  const { loadMigrations } = await import("../db/migrate");
  const actual = loadMigrations(config.migrationsDirectory), expected = reviewedMigrations();
  if (actual.length !== 41 || actual.some((m, i) => m.name !== expected[i].name || m.version !== expected[i].version || m.checksum !== expected[i].checksum)) return rejectBootstrap();
  const facts = await verifiedCandidate41Evidence(copy);
  return Object.freeze({ ...facts, forbiddenTlsPublicKeyDigests: Object.freeze([c.vault.tlsPublicKeyDigest]), originalCertificateFingerprint: c.vault.metadata.certificateFingerprint,
    originalInstallationId: c.vault.metadata.installationId, originalDeviceId: c.vault.metadata.deviceId });
}


const completionAttempts = new WeakSet<object>();
// Authenticated known-completion provenance ONLY. CURRENT/admission remain a
// separate consumer; a completed target is still forbidden as a business writer.
export async function recordKnownCandidateCompletion8(copy: UnadmittedCandidateCopy8, input: LocalKeyConfiguration) {
  const c = copy && typeof copy === "object" ? copies.get(copy) : undefined;
  if (!c || c.stage !== "VERIFIED41" || completionAttempts.has(copy)) return rejectBootstrap();
  completionAttempts.add(copy);
  try {
    if (!input || !input.database || input.database.create === true || Object.keys(input).sort().join(",") !== "database,directory,migrationsDirectory") return rejectBootstrap();
    const config = Object.freeze({ directory: input.directory, migrationsDirectory: input.migrationsDirectory, database: Object.freeze({ ...input.database, create: false }) });
    const facts = await candidate41KeyEvidence(copy, config), destination = await inspectLocalVault(config); guard(c);
    if (destination.databaseFingerprint !== c.identity || destination.metadata.installationId === facts.originalInstallationId ||
        destination.metadata.deviceId === facts.originalDeviceId || destination.metadata.certificateFingerprint === facts.originalCertificateFingerprint || facts.forbiddenTlsPublicKeyDigests.includes(destination.tlsPublicKeyDigest)) return rejectBootstrap();
    await withProtectedLocalKeys(c.config, async original => withProtectedLocalKeys(config, async target => {
      if (target.signingSecrets.ADMIN === original.signingSecrets.ADMIN || target.signingSecrets.SALESPERSON === original.signingSecrets.SALESPERSON) return rejectBootstrap();
    }).then(() => {})); guard(c);
    await verifyMigrated(c);
    const committed: Extract<CandidateRecord, { kind: "COMMITTED" }> = { ...c.intent, kind: "COMMITTED", sequence: String(Number(c.intent.sequence) + 1),
      previousDigest: candidateRecordDigest(c.intent), intentDigest: candidateRecordDigest(c.intent), targetStateDigest: facts.targetStateDigest,
      targetVaultDigest: destination.vaultDigest, generation: null, createdAtMs: String(Math.max(Date.now(), Number(c.intent.createdAtMs))) };
    await append(c, committed); // Verified native mutex, flushed no-overwrite + DPAPI readback.
    c.committed = committed; c.stage = "COMMITTED41";
    await verifiedCandidate41Evidence(copy);
    if ((await inspectLocalVault(config)).vaultDigest !== committed.targetVaultDigest) return rejectBootstrap();
    guard(c);
    return Object.freeze({ operationId: c.intent.operationId, status: "COMMITTED_UNADMITTED" as const, targetStateDigest: facts.targetStateDigest,
      targetVaultDigest: committed.targetVaultDigest, completionDigest: candidateRecordDigest(committed), productionActivation: false as const });
  } catch { return rejectBootstrap(); } // Never downgrade a possibly published completion to quarantine.
}
