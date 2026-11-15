import "server-only";

import { createRequire } from "node:module";
import { lstatSync } from "node:fs";
import path from "node:path";
import { resolveDatabaseLocation } from "../db/location";
import { verifiedDecryptedSnapshotEvidence, type BackupCustody } from "../backup/crypto";
import { testSourceNamespace } from "../backup/service";
import { fingerprint, type ProofDatabase } from "../backup/snapshot";
import { validateReviewedSchema } from "../db/validate-schema";
import { readEnrollmentSnapshot, enrollmentDigest } from "./database";
import { classifyEnrollment } from "./journal";
import { protectedManifestDigest } from "./maintenance-journal";
import { storage } from "../backup/storage";
import { readProtectedRootAuthority } from "./root-authority";
import { createHash } from "node:crypto";
import { adminMaintenanceSourceEvidence, type AdminMaintenanceSource } from "../auth/gateway";
import { authentication8RecoveryEvidence, type VerifiedAuthenticationRecovery8, protectedAuthenticationSource8Evidence } from "./authentication-backup";
import { candidateLedgerContext, candidateRecordBytes, candidateRecordDigest, classifyCandidateLedger, readProtectedCandidateLedger, type CandidateRecord } from "./candidate-records";
import { inspectLocalVault, type LocalKeyConfiguration } from "./keys";
import { hasActiveBootstrapLease, type BootstrapLease } from "./ownership";
import { rejectBootstrap, windowsProtection } from "./windows";

interface RecoveryRequest { readonly action: "QUARANTINE_NEVER_ADMITTED"; readonly operationId: string; readonly destinationFileIdentity: string; readonly sourceStateDigest: string; readonly intentDigest: string | null; readonly sqlOutcome: "UNKNOWN"; readonly productionActivation: false }
interface RecoveryAdapter { confirm(request: Readonly<RecoveryRequest>): Promise<"CONFIRM_PERMANENT_NO_ADMISSION" | "CANCELLED"> }
declare const recoveryBrand: unique symbol;
export interface TrustedCandidateRecoveryInteraction { readonly [recoveryBrand]: true }
const interactions = new WeakMap<object, RecoveryAdapter>(), claimed = new WeakSet<object>();
export function bindTrustedCandidateRecoveryInteraction(adapter: RecoveryAdapter): TrustedCandidateRecoveryInteraction {
  if (!adapter || Object.keys(adapter).join(",") !== "confirm" || typeof adapter.confirm !== "function") return rejectBootstrap();
  const token = Object.freeze({}) as TrustedCandidateRecoveryInteraction;
  interactions.set(token, Object.freeze({ confirm: adapter.confirm.bind(adapter) })); return token;
}
export async function confirmNeverAdmittedQuarantine(interaction: TrustedCandidateRecoveryInteraction, request: Readonly<RecoveryRequest>): Promise<void> {
  const adapter = interactions.get(interaction); if (!adapter || await adapter.confirm(Object.freeze({ ...request })) !== "CONFIRM_PERMANENT_NO_ADMISSION") return rejectBootstrap();
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

// A partial INTENT file grants no authority. This separate terminal path binds
// the actual orphan bytes, explicit never-selected target, current source and
// a genuine authenticated archive, without guessing the unpublished payload.
export async function quarantineUnpublishedCandidate(root: LocalKeyConfiguration, sourceConfig: LocalKeyConfiguration, target: LocalKeyConfiguration,
  source: AdminMaintenanceSource, lease: BootstrapLease, operationId: string, interaction: TrustedCandidateRecoveryInteraction,
  custody: BackupCustody, decodedManifest: unknown, archive: string, plaintext: string) {
  try {
    for (const c of [root,sourceConfig,target]) if (!c || c.database?.mode!=="test" || c.database.create===true || Object.keys(c).sort().join(",")!=="database,directory,migrationsDirectory") return rejectBootstrap();
    const frozen=(c:LocalKeyConfiguration):LocalKeyConfiguration=>Object.freeze({directory:c.directory,migrationsDirectory:c.migrationsDirectory,database:Object.freeze({...c.database,create:false})});root=frozen(root);sourceConfig=frozen(sourceConfig);target=frozen(target);
    if(path.basename(target.directory)!==operationId||path.resolve(target.database.directory)!==path.resolve(target.directory)||!["candidate8.sqlite3","restored41.sqlite3"].includes(target.database.filename))return rejectBootstrap();
    const Driver=createRequire(import.meta.url)("better-sqlite3") as new(f:string,o:{readonly:true;fileMustExist:true})=>ProofDatabase;
    const open=(filename:string)=>{const d=new Driver(filename,{readonly:true,fileMustExist:true});d.defaultSafeIntegers(true);return d;};
    const identity=(filename:string)=>{const st=lstatSync(filename,{bigint:true});if(!st.isFile()||st.isSymbolicLink()||st.nlink!==BigInt(1))return rejectBootstrap();return createHash("sha256").update(JSON.stringify({filename:path.resolve(filename).toLowerCase(),device:String(st.dev),inode:String(st.ino)})).digest("hex");};
    const filename=resolveDatabaseLocation(sourceConfig.database).filename,destination=resolveDatabaseLocation(target.database).filename;
    const sourceDb=open(filename);let schema:unknown;try{schema=sourceDb.prepare("PRAGMA user_version").get()?.user_version;}finally{sourceDb.close();}if(schema!==BigInt(8)&&schema!==BigInt(41))return rejectBootstrap();
    const purpose=schema===BigInt(8)?"UPGRADE8":"RESTORE41",sourceIdentity=identity(filename),targetIdentity=identity(destination);
    const guard=()=>{if(identity(filename)!==sourceIdentity||identity(destination)!==targetIdentity||!hasActiveBootstrapLease(lease,sourceConfig.database)||adminMaintenanceSourceEvidence(source,sourceConfig.database,lease,{operationId,purpose}).schema!==Number(schema))return rejectBootstrap();};
    guard();const authority=await readProtectedRootAuthority(root),vault=authority.vault,v=authority.anchorVersion,records=authority.records,anchor=authority.anchor;
    const anchorDigest=enrollmentDigest(anchor),ledger=await readProtectedCandidateLedger(vault,anchorDigest),selected=classifyCandidateLedger(ledger).recordedCurrent;
    const pending=ledger.pending.filter(p=>p.name.split(".")[1]===operationId);
    if(!pending.length||ledger.records.some(r=>r.operationId===operationId)||ledger.records.some(r=>(r.kind==="CURRENT"||r.kind==="COMMITTED")&&r.destinationFileIdentity===identity(destination))||identity(filename)!==(selected?.destinationFileIdentity??vault.databaseFingerprint)||identity(filename)===identity(destination)||claimed.has(source))return rejectBootstrap();
    await storage(target.directory,"check",{filename:target.database.filename});guard();
    const verified=await verifiedDecryptedSnapshotEvidence(decodedManifest,custody,archive,plaintext);if(verified.manifest.schema!==Number(schema)||verified.manifest.sourceNamespace!==(schema===BigInt(8)?(await protectedAuthenticationSource8Evidence(sourceConfig,lease)).sourceNamespace:testSourceNamespace(filename)))return rejectBootstrap();
    const state=async()=>{guard();const db=open(filename);try{db.exec("BEGIN");const r={get:async(sql:string,values:readonly import("../db/connection").SqlValue[]=[])=>db.prepare(sql).get(...values),all:async(sql:string,values:readonly import("../db/connection").SqlValue[]=[])=>db.prepare(sql).all(...values)};
      if(!(await validateReviewedSchema(r,Number(schema) as 8|41)).ok||classifyEnrollment(records,await readEnrollmentSnapshot(r,protectedManifestDigest(Number(v) as 8|41),Number(schema) as 8|41)).status!=="ENROLLED")return rejectBootstrap();
      const result=enrollmentDigest(fingerprint(db));db.exec("ROLLBACK");return result;}finally{db.close();}};
    const before=await state(),last=ledger.records.at(-1),spec=enrollmentDigest({format:"POS_UNPUBLISHED_QUARANTINE_V1",pending,destinationFileIdentity:identity(destination),sourceStateDigest:before,archiveId:verified.manifest.archiveId,ciphertextSha256:verified.ciphertextSha256});
    claimed.add(source);await confirmNeverAdmittedQuarantine(interaction,{action:"QUARANTINE_NEVER_ADMITTED",operationId,destinationFileIdentity:identity(destination),sourceStateDigest:before,intentDigest:null,sqlOutcome:"UNKNOWN",productionActivation:false});
    if(await state()!==before||enrollmentDigest(await readProtectedCandidateLedger(vault,anchorDigest))!==enrollmentDigest(ledger))return rejectBootstrap();
    await verifiedDecryptedSnapshotEvidence(decodedManifest,custody,archive,plaintext);guard();
    const record:CandidateRecord={format:"POS_CANDIDATE_LEDGER_V1",kind:"QUARANTINED_NO_ADMISSION",sequence:String(last?Number(last.sequence)+1:1),previousDigest:last?candidateRecordDigest(last):null,operationId,purpose,installationId:vault.metadata.installationId,deviceId:vault.metadata.deviceId,vaultDigest:vault.vaultDigest,originalAnchorDigest:anchorDigest,rootDatabaseFingerprint:vault.databaseFingerprint,sourceFileIdentity:identity(filename),destinationFileIdentity:identity(destination),sourceSchema:schema===BigInt(8)?"8":"41",sourceStateDigest:before,targetSpecificationDigest:spec,backupArchiveId:verified.manifest.archiveId,backupCiphertextSha256:verified.ciphertextSha256,createdAtMs:String(Math.max(Date.now(),last?Number(last.createdAtMs):0)),intentDigest:null,targetStateDigest:null,targetVaultDigest:null,generation:null};
    if(await windowsProtection({...candidateLedgerContext(vault,anchorDigest),operation:"candidate-append",payload:candidateRecordBytes(record).toString("base64")})!==true)return rejectBootstrap();guard();
    const after=await readProtectedCandidateLedger(vault,anchorDigest);if(candidateRecordDigest(after.records.at(-1)!)!==candidateRecordDigest(record)||await state()!==before)return rejectBootstrap();
    return Object.freeze({status:"QUARANTINED_NO_ADMISSION" as const,sqlOutcome:"UNKNOWN" as const,unpublishedIntent:true as const,productionActivation:false as const});
  }catch{return rejectBootstrap();}
}
