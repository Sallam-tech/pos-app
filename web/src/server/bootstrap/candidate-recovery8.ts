import "server-only";

import { createHash } from "node:crypto";
import { adminMaintenanceSourceEvidence, type AdminMaintenanceSource } from "../auth/gateway";
import { authentication8RecoveryEvidence, type VerifiedAuthenticationRecovery8, protectedAuthenticationSource8Evidence } from "./authentication-backup";
import { candidateLedgerContext, candidateRecordBytes, candidateRecordDigest, classifyCandidateLedger, readProtectedCandidateLedger, type CandidateRecord } from "./candidate-records";
import { inspectLocalVault, type LocalKeyConfiguration } from "./keys";
import { hasActiveBootstrapLease, type BootstrapLease } from "./ownership";
import { rejectBootstrap, windowsProtection } from "./windows";

interface RecoveryRequest { readonly action: "QUARANTINE_NEVER_ADMITTED"; readonly operationId: string; readonly destinationFileIdentity: string; readonly sourceStateDigest: string; readonly intentDigest: string; readonly sqlOutcome: "UNKNOWN"; readonly productionActivation: false }
interface RecoveryAdapter { confirm(request: Readonly<RecoveryRequest>): Promise<"CONFIRM_PERMANENT_NO_ADMISSION" | "CANCELLED"> }
declare const recoveryBrand: unique symbol;
export interface TrustedCandidateRecoveryInteraction { readonly [recoveryBrand]: true }
const interactions = new WeakMap<object, RecoveryAdapter>(), claimed = new WeakSet<object>();
export function bindTrustedCandidateRecoveryInteraction(adapter: RecoveryAdapter): TrustedCandidateRecoveryInteraction {
  if (!adapter || Object.keys(adapter).join(",") !== "confirm" || typeof adapter.confirm !== "function") return rejectBootstrap();
  const token = Object.freeze({}) as TrustedCandidateRecoveryInteraction;
  interactions.set(token, Object.freeze({ confirm: adapter.confirm.bind(adapter) })); return token;
}
// Permanent NO-ADMISSION only. Never SQL rollback, adoption, replay or deletion.
// Deliberate fresh source authority can fence an old never-completed operation
// after restart, even when its candidate SQL result cannot be determined.
export async function quarantineNeverAdmittedCandidate8(input: LocalKeyConfiguration, source: AdminMaintenanceSource, lease: BootstrapLease,
  operationId: string, interaction: TrustedCandidateRecoveryInteraction, recovery?: VerifiedAuthenticationRecovery8) {
  try {
    if (!input || !input.database || input.database.create === true || input.database.mode !== "test" || Object.keys(input).sort().join(",") !== "database,directory,migrationsDirectory") return rejectBootstrap();
    const config = Object.freeze({ directory: input.directory, migrationsDirectory: input.migrationsDirectory, database: Object.freeze({ ...input.database, create: false }) });
    const adapter = interaction && typeof interaction === "object" ? interactions.get(interaction) : undefined;
    if (!adapter || claimed.has(source)) return rejectBootstrap();
    const guard = () => {
      if (!hasActiveBootstrapLease(lease, config.database)) return rejectBootstrap();
      const f = adminMaintenanceSourceEvidence(source, config.database, lease, { operationId, purpose: "UPGRADE8" });
      if (f.schema !== 8) return rejectBootstrap(); return f;
    };
    const original = guard(), vault = await inspectLocalVault(config); guard();
    const identity = createHash("sha256").update(JSON.stringify({ filename: original.filename, device: original.device, inode: original.inode })).digest("hex");
    if (vault.databaseFingerprint !== identity) return rejectBootstrap();
    const before = await protectedAuthenticationSource8Evidence(config, lease); guard();
    const ledger = await readProtectedCandidateLedger(vault, before.originalAnchorDigest); guard();
    const own = ledger.records.filter(r => r.operationId === operationId), intent = own[0];
    if (own.length !== 1 || !intent || intent.kind !== "INTENT" || intent.purpose !== "UPGRADE8" || intent.sourceFileIdentity !== identity ||
        classifyCandidateLedger(ledger).recordedCurrent !== null || ledger.records.at(-1) !== intent) return rejectBootstrap();
    if (intent.sourceStateDigest !== before.sourceStateDigest) {
      const archive = await authentication8RecoveryEvidence(recovery, config, lease); guard();
      if (archive.archiveId !== intent.backupArchiveId || archive.ciphertextSha256 !== intent.backupCiphertextSha256 || archive.sourceStateDigest !== intent.sourceStateDigest ||
          archive.originalAnchorDigest !== intent.originalAnchorDigest || archive.currentSourceStateDigest !== before.sourceStateDigest) return rejectBootstrap();
    }
    claimed.add(source);
    if (await adapter.confirm(Object.freeze({ action: "QUARANTINE_NEVER_ADMITTED", operationId, destinationFileIdentity: intent.destinationFileIdentity,
      sourceStateDigest: intent.sourceStateDigest, intentDigest: candidateRecordDigest(intent), sqlOutcome: "UNKNOWN", productionActivation: false })) !== "CONFIRM_PERMANENT_NO_ADMISSION") return rejectBootstrap();
    guard(); const after = await protectedAuthenticationSource8Evidence(config, lease); guard();
    if (JSON.stringify(after) !== JSON.stringify(before)) return rejectBootstrap();
    const current = await readProtectedCandidateLedger(vault, before.originalAnchorDigest); guard();
    if (current.records.length !== ledger.records.length || current.records.some((r, i) => candidateRecordDigest(r) !== candidateRecordDigest(ledger.records[i]))) return rejectBootstrap();
    const record: CandidateRecord = { ...intent, kind: "QUARANTINED_NO_ADMISSION", sequence: String(Number(intent.sequence) + 1), previousDigest: candidateRecordDigest(intent),
      intentDigest: candidateRecordDigest(intent), targetStateDigest: null, targetVaultDigest: null, generation: null,
      createdAtMs: String(Math.max(Date.now(), Number(intent.createdAtMs))) };
    if (await windowsProtection({ ...candidateLedgerContext(vault, before.originalAnchorDigest), operation: "candidate-append", payload: candidateRecordBytes(record).toString("base64") }) !== true) return rejectBootstrap();
    guard(); const readback = await readProtectedCandidateLedger(vault, before.originalAnchorDigest); guard();
    if (candidateRecordDigest(readback.records.at(-1)!) !== candidateRecordDigest(record) || classifyCandidateLedger(readback).status !== "QUARANTINED_ONLY" ||
        JSON.stringify(await protectedAuthenticationSource8Evidence(config, lease)) !== JSON.stringify(before)) return rejectBootstrap();
    guard(); return Object.freeze({ operationId, status: "QUARANTINED_NO_ADMISSION" as const, sqlOutcome: "UNKNOWN" as const, sourcePreserved: true as const, productionActivation: false as const });
  } catch { return rejectBootstrap(); }
}
