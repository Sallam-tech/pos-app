import "server-only";

import { createHash } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, openSync, opendirSync, realpathSync } from "node:fs";
import path from "node:path";
import { adminMaintenanceSourceEvidence, type AdminMaintenanceSource } from "../auth/gateway";
import { fingerprint, openProofDatabase } from "../backup/snapshot";
import { storage, testDirectory } from "../backup/storage";
import { resolveDatabaseLocation } from "../db/location";
import { validateReviewedSchema } from "../db/validate-schema";
import { authenticationBackup8Evidence, type VerifiedAuthenticationBackup8 } from "./authentication-backup";
import { candidateLedgerContext, candidateRecordBytes, candidateRecordDigest, classifyCandidateLedger, readProtectedCandidateLedger, type CandidateRecord } from "./candidate-records";
import { enrollmentDigest } from "./database";
import { inspectLocalVault, type LocalKeyConfiguration } from "./keys";
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
interface CopyState { signal?: AbortSignal; source: AdminMaintenanceSource; lease: BootstrapLease; config: LocalKeyConfiguration; backup: VerifiedAuthenticationBackup8; filename: string; identity: string; sourceFingerprint: string; intent: Extract<CandidateRecord, { kind: "INTENT" }>; vault: Awaited<ReturnType<typeof inspectLocalVault>> }
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
  if (!c) return rejectBootstrap(); guard(c);
  const archive = await authenticationBackup8Evidence(c.backup, c.config, c.lease); guard(c);
  if (archive.sourceStateDigest !== c.intent.sourceStateDigest || archive.ciphertextSha256 !== c.intent.backupCiphertextSha256 || fileIdentity(c.filename) !== c.identity) return rejectBootstrap();
  await storage(path.dirname(c.filename), "check", { filename: path.basename(c.filename) }); guard(c);
  const ledger = await readProtectedCandidateLedger(c.vault, c.intent.originalAnchorDigest), own = ledger.records.filter(r => r.operationId === c.intent.operationId);
  if (ledger.pending.length || own.length !== 1 || own[0].kind !== "INTENT" || candidateRecordDigest(own[0]) !== candidateRecordDigest(c.intent) ||
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
    if (ledger.pending.length || !["ABSENT", "QUARANTINED_ONLY"].includes(state.status) || ledger.records.some(r => r.operationId === initial.operationId)) return rejectBootstrap();
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
    try { await unadmittedCandidateCopy8Evidence(copy); const result = await work(copy); await unadmittedCandidateCopy8Evidence(copy); return result; }
    finally { copies.delete(copy); }
  } catch { return rejectBootstrap(); } // Never claim rollback, completion or quarantine after uncertain I/O.
}
