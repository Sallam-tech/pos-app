import "server-only";

import { createRequire } from "node:module";
import { adminMaintenanceSourceEvidence, type AdminMaintenanceSource } from "../auth/gateway";
import { resolveDatabaseLocation } from "../db/location";
import { validateReviewedSchema } from "../db/validate-schema";
import { fingerprint, type ProofDatabase } from "../backup/snapshot";
import { authentication8RecoveryEvidence, protectedAuthenticationSource8Evidence, type VerifiedAuthenticationRecovery8 } from "./authentication-backup";
import { enrollmentDigest } from "./database";
import { candidateLedgerContext, candidateRecordBytes, candidateRecordDigest, classifyCandidateLedger, candidatePendingCompatible, readProtectedCandidateLedger, type CandidateRecord } from "./candidate-records";
import { inspectLocalVault, type LocalKeyConfiguration } from "./keys";
import { hasActiveBootstrapLease, type BootstrapLease } from "./ownership";
import { protectedManifestDigest } from "./maintenance-journal";
import { rejectBootstrap, windowsProtection } from "./windows";

interface SelectionRequest { readonly action: "SELECT_KNOWN_COMPLETED_WRITER"; readonly operationId: string; readonly destinationFileIdentity: string; readonly targetStateDigest: string; readonly targetVaultDigest: string; readonly productionActivation: false }
interface Adapter { confirm(request: Readonly<SelectionRequest>): Promise<"CONFIRM_TEST_WRITER_SELECTION" | "CANCELLED"> }
declare const selectionBrand: unique symbol;
export interface TrustedCandidateSelectionInteraction { readonly [selectionBrand]: true }
const interactions = new WeakMap<object, Adapter>(), claimed = new WeakSet<object>();
export function bindTrustedCandidateSelectionInteraction(adapter: Adapter): TrustedCandidateSelectionInteraction {
  if (!adapter || Object.keys(adapter).join(",") !== "confirm" || typeof adapter.confirm !== "function") return rejectBootstrap();
  const token = Object.freeze({}) as TrustedCandidateSelectionInteraction;
  interactions.set(token, Object.freeze({ confirm: adapter.confirm.bind(adapter) })); return token;
}
export async function confirmKnownCandidateSelection(interaction: TrustedCandidateSelectionInteraction, request: Readonly<SelectionRequest>): Promise<void> {
  const adapter = interactions.get(interaction); if (!adapter || await adapter.confirm(Object.freeze({ ...request })) !== "CONFIRM_TEST_WRITER_SELECTION") return rejectBootstrap();
}
const Driver = createRequire(import.meta.url)("better-sqlite3") as new (filename: string, options: { readonly: true; fileMustExist: true }) => ProofDatabase;
function config(input: LocalKeyConfiguration): LocalKeyConfiguration {
  if (!input || input.database?.mode !== "test" || input.database.create === true || Object.keys(input).sort().join(",") !== "database,directory,migrationsDirectory") return rejectBootstrap();
  return Object.freeze({ directory: input.directory, migrationsDirectory: input.migrationsDirectory, database: Object.freeze({ ...input.database, create: false }) });
}
// CURRENT is published only after genuine known-COMMITTED provenance, a fresh
// independent reopen, unchanged source evidence and explicit TEST selection.
// A lost publication reply is resolved by reading the chain; never republish.
export async function selectKnownCompletedCandidate8(input: LocalKeyConfiguration, source: AdminMaintenanceSource, lease: BootstrapLease,
  operationId: string, targetInput: LocalKeyConfiguration, interaction: TrustedCandidateSelectionInteraction, recovery?: VerifiedAuthenticationRecovery8) {
  try {
    const root = config(input), target = config(targetInput), adapter = interactions.get(interaction);
    if (!adapter || claimed.has(source)) return rejectBootstrap();
    const guard = () => {
      if (!hasActiveBootstrapLease(lease, root.database)) return rejectBootstrap();
      const f = adminMaintenanceSourceEvidence(source, root.database, lease, { operationId, purpose: "UPGRADE8" });
      if (f.schema !== 8) return rejectBootstrap();
    };
    guard(); const vault = await inspectLocalVault(root), before = await protectedAuthenticationSource8Evidence(root, lease); guard();
    const ledger = await readProtectedCandidateLedger(vault, before.originalAnchorDigest); guard();
    const own = ledger.records.filter(r => r.operationId === operationId), intent = own[0], completed = own[1];
    if (!candidatePendingCompatible(ledger, operationId) || !intent || intent.kind !== "INTENT" || intent.purpose !== "UPGRADE8" || intent.sourceFileIdentity !== vault.databaseFingerprint ||
        !completed || completed.kind !== "COMMITTED" || own.length !== 2 || ledger.records.at(-1) !== completed || classifyCandidateLedger(ledger).recordedCurrent) return rejectBootstrap();
    if (intent.sourceStateDigest !== before.sourceStateDigest) {
      const evidence = await authentication8RecoveryEvidence(recovery, root, lease); guard();
      if (evidence.archiveId !== intent.backupArchiveId || evidence.ciphertextSha256 !== intent.backupCiphertextSha256 || evidence.sourceStateDigest !== intent.sourceStateDigest ||
          evidence.currentSourceStateDigest !== before.sourceStateDigest || evidence.originalAnchorDigest !== intent.originalAnchorDigest) return rejectBootstrap();
    }
    const verify = async () => {
      guard(); const destination = await inspectLocalVault(target); guard();
      if (destination.databaseFingerprint !== completed.destinationFileIdentity || destination.vaultDigest !== completed.targetVaultDigest ||
          destination.metadata.installationId === vault.metadata.installationId || destination.metadata.deviceId === vault.metadata.deviceId || destination.metadata.certificateFingerprint === vault.metadata.certificateFingerprint || destination.tlsPublicKeyDigest === vault.tlsPublicKeyDigest ||
          completed.targetSpecificationDigest !== enrollmentDigest({ format: "POS_UNADMITTED_UPGRADE8_SPEC_V1", manifest: protectedManifestDigest(41), sourceState: intent.sourceStateDigest,
            destinationFileIdentity: destination.databaseFingerprint, initialization: "PRESERVE_ALL8_ROWS_ROWIDS_EMPTY_BUSINESS" })) return rejectBootstrap();
      const db = new Driver(resolveDatabaseLocation(target.database).filename, { readonly: true, fileMustExist: true }); db.defaultSafeIntegers(true);
      try {
        db.exec("BEGIN");
        if (JSON.stringify(db.prepare("PRAGMA integrity_check").all()) !== '[{"integrity_check":"ok"}]' || db.prepare("PRAGMA foreign_key_check").all().length ||
            !(await validateReviewedSchema({ get: async (sql, values) => db.prepare(sql).get(...(values ?? [])), all: async (sql, values) => db.prepare(sql).all(...(values ?? [])) }, 41)).ok ||
            enrollmentDigest(fingerprint(db)) !== completed.targetStateDigest) return rejectBootstrap();
        db.exec("ROLLBACK");
      } finally { db.close(); }
      guard(); if (enrollmentDigest(await protectedAuthenticationSource8Evidence(root, lease)) !== enrollmentDigest(before)) return rejectBootstrap();
    };
    await verify(); claimed.add(source);
    if (await adapter.confirm(Object.freeze({ action: "SELECT_KNOWN_COMPLETED_WRITER", operationId, destinationFileIdentity: completed.destinationFileIdentity,
      targetStateDigest: completed.targetStateDigest, targetVaultDigest: completed.targetVaultDigest, productionActivation: false })) !== "CONFIRM_TEST_WRITER_SELECTION") return rejectBootstrap();
    await verify(); const observed = await readProtectedCandidateLedger(vault, before.originalAnchorDigest); guard();
    if (enrollmentDigest(observed) !== enrollmentDigest(ledger)) return rejectBootstrap();
    const current: CandidateRecord = { ...completed, kind: "CURRENT", sequence: String(Number(completed.sequence) + 1), previousDigest: candidateRecordDigest(completed),
      generation: "1", createdAtMs: String(Math.max(Date.now(), Number(completed.createdAtMs))) };
    if (await windowsProtection({ ...candidateLedgerContext(vault, before.originalAnchorDigest), operation: "candidate-append", payload: candidateRecordBytes(current).toString("base64") }) !== true) return rejectBootstrap();
    guard(); const readback = await readProtectedCandidateLedger(vault, before.originalAnchorDigest); guard();
    if (!candidatePendingCompatible(readback) || candidateRecordDigest(readback.records.at(-1)!) !== candidateRecordDigest(current) || classifyCandidateLedger(readback).status !== "RECORDED_CURRENT") return rejectBootstrap();
    await verify();
    return Object.freeze({ operationId, status: "RECORDED_CURRENT" as const, generation: current.generation, sourceRetired: true as const, productionActivation: false as const });
  } catch { return rejectBootstrap(); }
}
