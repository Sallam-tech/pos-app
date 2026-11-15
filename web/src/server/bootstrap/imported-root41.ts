import "server-only";
import path from "node:path";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { custodyMetadata, decryptSnapshot, hashFile, type BackupCustody } from "../backup/crypto";
import { openProofDatabase, fingerprint, type ProofDatabase } from "../backup/snapshot";
import { storage, testDirectory } from "../backup/storage";
import { validateHistoricalSettings, verifyProtectedSnapshotContents, testSourceNamespace, type HistoricalSettings } from "../backup/service";
import { adminMaintenanceSourceEvidence, type AdminMaintenanceSource } from "../auth/gateway";
import { resolveDatabaseLocation } from "../db/location";
import { acquireRuntimeOwnership, assertRuntimeOwnership, pinRuntimeOwnership } from "../hosting/ownership";
import type { LocalTlsMaterial } from "../hosting/https";
import { assertNoAuthorizationOwner, hasActiveBootstrapLease, withHeldBootstrapOwnership, type BootstrapLease } from "./ownership";
import { createImportedCandidateProtectedLocalKeys, inspectLocalVault, inspectHistoricalLocalVault, type LocalKeyConfiguration } from "./keys";
import { classifyEnrollment, type EnrollmentRecord } from "./journal";
import { enrollmentDigest, readEnrollmentSnapshot } from "./database";
import { protectedManifestDigest, readProtectedMaintenance } from "./maintenance-journal";
import { candidateLedgerContext, candidateRecordBytes, candidateRecordDigest, classifyCandidateLedger, candidatePendingCompatible, readProtectedCandidateLedger, type CandidateRecord } from "./candidate-records";
import { portableOriginDigest, validatePortableOriginPacket, validatePortableOriginTrust, verifyPortableOriginDatabase, type PortableOriginPacket41 } from "./portable-origin41";
import { rejectBootstrap, windowsProtection } from "./windows";

interface Request { readonly action:"IMPORT_TEST_ROOT"|"FINALIZE_TEST_IMPORTED_ROOT"|"QUARANTINE_TEST_IMPORTED_ROOT";readonly operationId:string;readonly originDigest:string;readonly destinationFileIdentity:string;readonly productionActivation:false }
interface Adapter {confirm(request:Readonly<Request>):Promise<"CONFIRM_TEST_OLD_DEVICE_FENCED"|"CONFIRM_PERMANENT_NO_ADMISSION"|"CANCEL">}
declare const interactionBrand:unique symbol;
export interface TrustedImportedRootInteraction {readonly [interactionBrand]:true}
const interactions=new WeakMap<object,Adapter>();
export function bindTrustedImportedRootInteraction(adapter:Adapter):TrustedImportedRootInteraction{
 if(!adapter||Object.keys(adapter).join(",")!=="confirm"||typeof adapter.confirm!=="function")return rejectBootstrap();
 const token=Object.freeze({}) as TrustedImportedRootInteraction;interactions.set(token,Object.freeze({confirm:adapter.confirm.bind(adapter)}));return token;
}
interface Fence {format:"POS_TEST_REPLACEMENT_FENCE_V1";operationId:string;originDigest:string;destinationFileIdentity:string;confirmedAtMs:string;physicalAcceptance:"NOT_WITNESSED";productionActivation:false}
const fences=new WeakMap<object,Fence>();
interface Receipt {format:"POS_IMPORTED_ROOT41_V1";operationId:string;packet:PortableOriginPacket41;trust:{id:string;signingPublic:string};destinationFileIdentity:string;vaultDigest:string;installationId:string;deviceId:string;fence:Fence;history:readonly HistoricalSettings[];expectedAdmin:{credentialVersion:string;authEpoch:string}}
declare const candidateBrand:unique symbol;
export interface ImportedRootCandidate41 {readonly [candidateBrand]:true}
interface State {config:LocalKeyConfiguration;runtime:Awaited<ReturnType<typeof acquireRuntimeOwnership>>;packet:PortableOriginPacket41;decoded:string;destinationIdentity:string;fence:object;history:readonly HistoricalSettings[];phase:"STAGING"|"VERIFIED"|"FAILED"|"CURRENT";lease?:BootstrapLease;receipt?:Receipt;intent?:Extract<CandidateRecord,{kind:"INTENT"}>}
const candidates=new WeakMap<object,State>(),completionClaims=new WeakSet<object>(),sourceClaims=new WeakSet<object>();
const identity=(filename:string)=>{const s=lstatSync(filename,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||s.nlink!==BigInt(1)||s.ino<=BigInt(0))return rejectBootstrap();return createHash("sha256").update(JSON.stringify({filename:path.resolve(filename).toLowerCase(),device:String(s.dev),inode:String(s.ino)})).digest("hex");};
function configuration(input:LocalKeyConfiguration):LocalKeyConfiguration{
 if(!input||Object.keys(input).sort().join(",")!=="database,directory,migrationsDirectory"||input.database?.mode!=="test"||input.database.create===true)return rejectBootstrap();
 return Object.freeze({directory:path.resolve(input.directory),database:Object.freeze({...input.database,create:false}),migrationsDirectory:input.migrationsDirectory});
}
const reader=(db:ProofDatabase)=>({get:async(sql:string,values:readonly import("../db/connection").SqlValue[]=[])=>db.prepare(sql).get(...values),all:async(sql:string,values:readonly import("../db/connection").SqlValue[]=[])=>db.prepare(sql).all(...values)});
function guard(s:State){assertRuntimeOwnership(s.runtime);if(s.phase==="FAILED"||identity(resolveDatabaseLocation(s.config.database).filename)!==s.destinationIdentity)return rejectBootstrap();}
async function verifyCopy(s:State,allowAttempts=false){guard(s);const db=openProofDatabase(resolveDatabaseLocation(s.config.database).filename);try{db.exec("BEGIN");await verifyPortableOriginDatabase(db,s.packet.origin,allowAttempts);db.exec("ROLLBACK");}finally{db.close();}guard(s);}
function intentFor(r:Receipt):Extract<CandidateRecord,{kind:"INTENT"}>{const o=r.packet.origin;return {format:"POS_IMPORTED_ROOT_LEDGER_V1",kind:"INTENT",sequence:"1",previousDigest:null,operationId:r.operationId,purpose:"RESTORE41",installationId:r.installationId,deviceId:r.deviceId,vaultDigest:r.vaultDigest,originalAnchorDigest:o.originalAnchorDigest,rootDatabaseFingerprint:r.destinationFileIdentity,sourceFileIdentity:o.sourceFileIdentity,destinationFileIdentity:r.destinationFileIdentity,sourceSchema:"41",sourceStateDigest:enrollmentDigest(o.manifest.fingerprint),targetSpecificationDigest:enrollmentDigest(r),backupArchiveId:o.manifest.archiveId,backupCiphertextSha256:o.archiveSha256,createdAtMs:r.fence.confirmedAtMs,intentDigest:null,targetStateDigest:null,targetVaultDigest:null,generation:null};}
async function append(vault:Awaited<ReturnType<typeof inspectLocalVault>>,anchor:string,r:CandidateRecord){if(await windowsProtection({...candidateLedgerContext(vault,anchor),operation:"candidate-append",payload:candidateRecordBytes(r).toString("base64")})!==true)return rejectBootstrap();const facts=await readProtectedCandidateLedger(vault,anchor);if(candidateRecordDigest(facts.records.at(-1)!)!==candidateRecordDigest(r))return rejectBootstrap();}
async function sealReceipt(config:LocalKeyConfiguration,r:Receipt){const directory=path.join(config.directory,"protected-identity","imported-root");mkdirSync(directory);await storage(directory,"initialize");const b=Buffer.from(JSON.stringify(r));try{await storage(directory,"seal-record",{value:b.toString("base64")});}finally{b.fill(0);}return readReceipt(config);}
async function readReceipt(input:LocalKeyConfiguration){
 const config=configuration(input),vault=await inspectHistoricalLocalVault(config),directory=path.join(config.directory,"protected-identity","imported-root"),file=path.join(directory,"restore.dpapi");
 if(existsSync(path.join(vault.directory,"enrollment"))||(await readProtectedMaintenance(vault)).length||readdirSync(directory).join(",")!=="restore.dpapi")return rejectBootstrap();
 const before=lstatSync(file,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==BigInt(1)||before.size<BigInt(9)||before.size>BigInt(196608))return rejectBootstrap();
 const cipher=readFileSync(file),encoded=await storage(directory,"unseal-record");if(typeof encoded!=="string")return rejectBootstrap();const b=Buffer.from(encoded,"base64");
 try{
  const r=JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(b)) as Receipt;
  if(!r||Object.keys(r).sort().join(",")!=="destinationFileIdentity,deviceId,expectedAdmin,fence,format,history,installationId,operationId,packet,trust,vaultDigest"||r.format!=="POS_IMPORTED_ROOT41_V1"||r.vaultDigest!==vault.vaultDigest||r.destinationFileIdentity!==vault.databaseFingerprint||r.installationId!==vault.metadata.installationId||r.deviceId!==vault.metadata.deviceId||r.operationId!==path.basename(config.directory)||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(r.operationId))return rejectBootstrap();
  const packet=validatePortableOriginTrust(r.trust,r.packet),o=packet.origin,f=r.fence;
  if(!f||Object.keys(f).sort().join(",")!=="confirmedAtMs,destinationFileIdentity,format,operationId,originDigest,physicalAcceptance,productionActivation"||f.format!=="POS_TEST_REPLACEMENT_FENCE_V1"||f.operationId!==r.operationId||f.originDigest!==portableOriginDigest(packet)||f.destinationFileIdentity!==vault.databaseFingerprint||f.physicalAcceptance!=="NOT_WITNESSED"||f.productionActivation!==false||! /^[1-9][0-9]{0,15}$/.test(f.confirmedAtMs)||
   vault.metadata.installationId===o.sourceInstallationId||vault.metadata.deviceId===o.sourceDeviceId||vault.metadata.certificateFingerprint===o.sourceCertificateFingerprint||o.sourceTlsPublicKeyDigests.includes(vault.tlsPublicKeyDigest)||!r.expectedAdmin||Object.keys(r.expectedAdmin).sort().join(",")!=="authEpoch,credentialVersion"||Object.values(r.expectedAdmin).some(v=>! /^[1-9][0-9]{0,18}$/.test(v))||!Array.isArray(r.history)||r.history.length!==o.manifest.history.length+1||r.history.length>16)return rejectBootstrap();
  const history=Object.freeze(r.history.map(validateHistoricalSettings)),after=lstatSync(file,{bigint:true});if(["dev","ino","size","mtimeNs","ctimeNs"].some(k=>before[k as keyof typeof before]!==after[k as keyof typeof after])||!cipher.equals(readFileSync(file)))return rejectBootstrap();
  return {config,vault,receipt:r,packet,history};
 }finally{b.fill(0);cipher.fill(0);}
}
// Preparation creates a new provisional vault and publishes INTENT BEFORE SQL
// backup. Only a positively acknowledged copy can mint the restricted Admin
// capability. The original root/configuration/DPAPI is never an input.
export async function withImportedRootPreparation41<T>(custody:BackupCustody,archive:string,packetInput:unknown,directory:string,migrationsDirectory:string,tls:LocalTlsMaterial,interaction:TrustedImportedRootInteraction,
 work:(candidate:ImportedRootCandidate41,config:LocalKeyConfiguration,runtime:Awaited<ReturnType<typeof acquireRuntimeOwnership>>)=>Promise<T>):Promise<T>{
 const packet=validatePortableOriginPacket(custody,packetInput),adapter=interactions.get(interaction);testDirectory(directory);
 if(!adapter||typeof work!=="function"||readdirSync(directory).length||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(path.basename(directory)))return rejectBootstrap();
 await storage(directory,"initialize");if((await hashFile(archive)).sha256!==packet.origin.archiveSha256)return rejectBootstrap();
 const free=await storage(directory,"space");if(typeof free!=="string"||BigInt(free)<BigInt(packet.origin.manifest.databaseBytes)*BigInt(4)+BigInt(32*1024*1024))return rejectBootstrap();
 const decoded=path.join(directory,"decoded.pending"),manifest=await decryptSnapshot(custody,archive,decoded,undefined,undefined,packet.origin.archiveSha256);
 if(enrollmentDigest(manifest)!==enrollmentDigest(packet.origin.manifest))return rejectBootstrap();
 const check=openProofDatabase(decoded);let history:readonly HistoricalSettings[],expectedAdmin:Receipt["expectedAdmin"];
 try{check.exec("BEGIN");history=await verifyPortableOriginDatabase(check,packet.origin);const admin=check.prepare("SELECT credential_version,auth_epoch FROM auth_principals WHERE id='ADMIN'").get();if(!admin)return rejectBootstrap();expectedAdmin={credentialVersion:String(admin.credential_version),authEpoch:String(admin.auth_epoch)};check.exec("ROLLBACK");}finally{check.close();}
 const filename=path.join(directory,"imported41.sqlite3"),file=await open(filename,"wx");try{await file.sync();}finally{await file.close();}
 const config=configuration({directory,database:{directory,filename:"imported41.sqlite3",mode:"test",create:false},migrationsDirectory}),runtime=await acquireRuntimeOwnership(filename),unpin=pinRuntimeOwnership(runtime);
 const candidate=Object.freeze({toJSON:rejectBootstrap}) as unknown as ImportedRootCandidate41,s:State={config,runtime,packet,decoded,destinationIdentity:identity(filename),fence:Object.freeze({}),history,phase:"STAGING"};candidates.set(candidate,s);
 try{
  if(await adapter.confirm(Object.freeze({action:"IMPORT_TEST_ROOT",operationId:path.basename(directory),originDigest:portableOriginDigest(packet),destinationFileIdentity:s.destinationIdentity,productionActivation:false}))!=="CONFIRM_TEST_OLD_DEVICE_FENCED")return rejectBootstrap();
  const fence:Fence={format:"POS_TEST_REPLACEMENT_FENCE_V1",operationId:path.basename(directory),originDigest:portableOriginDigest(packet),destinationFileIdentity:s.destinationIdentity,confirmedAtMs:String(Date.now()),physicalAcceptance:"NOT_WITNESSED",productionActivation:false};fences.set(s.fence,fence);
  await withHeldBootstrapOwnership(config.database,runtime,async(_retain,lease)=>{
   s.lease=lease;await createImportedCandidateProtectedLocalKeys(config,tls,candidate);const vault=await inspectLocalVault(config);guard(s);
   const receipt:Receipt={format:"POS_IMPORTED_ROOT41_V1",operationId:path.basename(directory),packet,trust:{id:custodyMetadata(custody).id,signingPublic:custodyMetadata(custody).signingPublic},destinationFileIdentity:s.destinationIdentity,vaultDigest:vault.vaultDigest,installationId:vault.metadata.installationId,deviceId:vault.metadata.deviceId,fence,history,expectedAdmin};
   s.receipt=receipt;s.intent=intentFor(receipt);await sealReceipt(config,receipt);await append(vault,packet.origin.originalAnchorDigest,s.intent);
   const copy=openProofDatabase(decoded);try{await copy.backup(filename,{progress:()=>{guard(s);if(!hasActiveBootstrapLease(lease,config.database))return rejectBootstrap();return 128;}});}finally{copy.close();}
   await verifyCopy(s);
  });s.lease=undefined;s.phase="VERIFIED";
  return await work(candidate,config,runtime);
 }catch{s.phase="FAILED";return rejectBootstrap();}
 finally{candidates.delete(candidate);fences.delete(s.fence);assertNoAuthorizationOwner();unpin();await runtime.close();}
}
export async function importedCandidateKeyEvidence(candidate:ImportedRootCandidate41,input:LocalKeyConfiguration){const s=candidates.get(candidate);if(!s||s.phase!=="STAGING"||!s.lease||!hasActiveBootstrapLease(s.lease,s.config.database)||enrollmentDigest(configuration(input))!==enrollmentDigest(s.config)||!fences.has(s.fence))return rejectBootstrap();guard(s);const db=openProofDatabase(s.decoded);try{await verifyPortableOriginDatabase(db,s.packet.origin);}finally{db.close();}const o=s.packet.origin;return Object.freeze({originalCertificateFingerprint:o.sourceCertificateFingerprint,originalInstallationId:o.sourceInstallationId,originalDeviceId:o.sourceDeviceId,forbiddenTlsPublicKeyDigests:o.sourceTlsPublicKeyDigests});}
export async function importedPreparationEvidence(candidate:ImportedRootCandidate41,runtime:unknown){const s=candidates.get(candidate);if(!s||s.phase!=="VERIFIED"||s.runtime!==runtime||!fences.has(s.fence))return rejectBootstrap();await verifyCopy(s,true);return Object.freeze({config:s.config,history:s.history});}
function adminGuard(source:AdminMaintenanceSource,config:LocalKeyConfiguration,lease:BootstrapLease,r:Receipt){const facts=adminMaintenanceSourceEvidence(source,config.database,lease,{operationId:r.operationId,purpose:"RESTORE41"});if(facts.schema!==41||facts.credentialVersion!==r.expectedAdmin.credentialVersion||facts.authEpoch!==r.expectedAdmin.authEpoch)return rejectBootstrap();}
export async function completeImportedRoot41(candidate:ImportedRootCandidate41,source:AdminMaintenanceSource,lease:BootstrapLease){
 const s=candidates.get(candidate);if(!s||s.phase!=="VERIFIED"||!s.receipt||!s.intent||completionClaims.has(candidate)||!fences.has(s.fence)||sourceClaims.has(source))return rejectBootstrap();completionClaims.add(candidate);sourceClaims.add(source);
 try{
  adminGuard(source,s.config,lease,s.receipt);await verifyCopy(s,true);const r=await readReceipt(s.config);adminGuard(source,s.config,lease,s.receipt);
  const ledger=await readProtectedCandidateLedger(r.vault,s.packet.origin.originalAnchorDigest);if(ledger.records.length!==1||ledger.pending.length||candidateRecordDigest(ledger.records[0])!==candidateRecordDigest(s.intent))return rejectBootstrap();
  const db=openProofDatabase(resolveDatabaseLocation(s.config.database).filename);let targetDigest:string;try{db.exec("BEGIN");await verifyPortableOriginDatabase(db,s.packet.origin,true);targetDigest=enrollmentDigest(fingerprint(db));db.exec("ROLLBACK");}finally{db.close();}
  const committed:Extract<CandidateRecord,{kind:"COMMITTED"}>={...s.intent,kind:"COMMITTED",sequence:"2",previousDigest:candidateRecordDigest(s.intent),intentDigest:candidateRecordDigest(s.intent),targetStateDigest:targetDigest,targetVaultDigest:r.vault.vaultDigest,generation:null,createdAtMs:String(Math.max(Date.now(),Number(s.intent.createdAtMs)))};
  adminGuard(source,s.config,lease,s.receipt);await append(r.vault,s.packet.origin.originalAnchorDigest,committed);await verifyCopy(s,true);adminGuard(source,s.config,lease,s.receipt);
  const current:CandidateRecord={...committed,kind:"CURRENT",sequence:"3",previousDigest:candidateRecordDigest(committed),generation:"1",createdAtMs:String(Math.max(Date.now(),Number(committed.createdAtMs)))};fences.delete(s.fence);await append(r.vault,s.packet.origin.originalAnchorDigest,current);s.phase="CURRENT";
  return Object.freeze({status:"IMPORTED_ROOT_CURRENT" as const,generation:"1",productionActivation:false as const,physicalAcceptance:"NOT_WITNESSED" as const});
 }catch{s.phase="FAILED";return rejectBootstrap();}
}
export async function readImportedRootProvenance(input:LocalKeyConfiguration){
 const r=await readReceipt(input),o=r.packet.origin,ledger=await readProtectedCandidateLedger(r.vault,o.originalAnchorDigest),intent=ledger.records[0];
 if(!intent||intent.kind!=="INTENT"||candidateRecordDigest(intent)!==candidateRecordDigest(intentFor(r.receipt)))return rejectBootstrap();
 const anchors=o.enrollmentRecords.filter(record=>record.kind==="ENROLLED");if(anchors.length!==1)return rejectBootstrap();
 return Object.freeze({kind:"IMPORTED_ROOT" as const,vault:r.vault,records:o.enrollmentRecords as readonly EnrollmentRecord[],anchorVersion:o.anchorVersion,anchor:anchors[0],originalAnchorDigest:o.originalAnchorDigest,sourceTlsPublicKeyDigests:Object.freeze([...new Set([...o.sourceTlsPublicKeyDigests,r.vault.tlsPublicKeyDigest])]),issuerProofDigest:enrollmentDigest(r.receipt),history:r.history,receipt:r.receipt,ledger});
}
export async function importedRootAdmissionEvidence(input:LocalKeyConfiguration,recovery:boolean){
 const config=configuration(input),root=await readImportedRootProvenance(config),state=classifyCandidateLedger(root.ledger),current=state.recordedCurrent;
 if(recovery?state.status!=="RECOVERY_REVIEW_REQUIRED"||!root.ledger.records.some(r=>r.kind==="COMMITTED"):state.status!=="RECORDED_CURRENT"||!candidatePendingCompatible(root.ledger)||!current)return rejectBootstrap();
 if(current&&(current.destinationFileIdentity!==root.vault.databaseFingerprint||current.targetVaultDigest!==root.vault.vaultDigest))return rejectBootstrap();
 const db=openProofDatabase(resolveDatabaseLocation(config.database).filename);try{db.exec("BEGIN");
  if(classifyEnrollment(root.records,await readEnrollmentSnapshot(reader(db),protectedManifestDigest(root.anchorVersion),41)).status!=="ENROLLED"||enrollmentDigest(db.prepare("SELECT rowid AS __proof_rowid,* FROM auth_enrollment_binding ORDER BY rowid").all())!==root.receipt.packet.origin.originalBindingDigest)return rejectBootstrap();
  await verifyProtectedSnapshotContents(db,testSourceNamespace(resolveDatabaseLocation(config.database).filename),root.history);db.exec("ROLLBACK");
 }finally{db.close();}
 return Object.freeze({generation:current?.generation??"IMPORTED_RECOVERY",history:root.history});
}
export async function finalizeImportedRoot41(input:LocalKeyConfiguration,source:AdminMaintenanceSource,lease:BootstrapLease,interaction:TrustedImportedRootInteraction){
 const config=configuration(input),root=await readImportedRootProvenance(config),adapter=interactions.get(interaction),records=root.ledger.records,committed=records[1];
 if(!adapter||sourceClaims.has(source)||records.length!==2||records[0].kind!=="INTENT"||committed?.kind!=="COMMITTED"||!candidatePendingCompatible(root.ledger,committed.operationId))return rejectBootstrap();sourceClaims.add(source);adminGuard(source,config,lease,root.receipt);
 if(await adapter.confirm(Object.freeze({action:"FINALIZE_TEST_IMPORTED_ROOT",operationId:root.receipt.operationId,originDigest:portableOriginDigest(root.receipt.packet),destinationFileIdentity:root.vault.databaseFingerprint,productionActivation:false}))!=="CONFIRM_TEST_OLD_DEVICE_FENCED")return rejectBootstrap();
 const db=openProofDatabase(resolveDatabaseLocation(config.database).filename);try{db.exec("BEGIN");await verifyPortableOriginDatabase(db,root.receipt.packet.origin,true);db.exec("ROLLBACK");}finally{db.close();}
 adminGuard(source,config,lease,root.receipt);const current:CandidateRecord={...committed,kind:"CURRENT",sequence:"3",previousDigest:candidateRecordDigest(committed),generation:"1",createdAtMs:String(Math.max(Date.now(),Number(committed.createdAtMs)))};
 await append(root.vault,root.originalAnchorDigest,current);return Object.freeze({status:"IMPORTED_ROOT_CURRENT" as const,generation:"1",productionActivation:false as const});
}
export async function quarantineImportedRoot41(input:LocalKeyConfiguration,runtime:unknown,interaction:TrustedImportedRootInteraction){
 assertRuntimeOwnership(runtime);const r=await readReceipt(input),adapter=interactions.get(interaction),o=r.packet.origin;const ledger=await readProtectedCandidateLedger(r.vault,o.originalAnchorDigest);
 if(!adapter||ledger.records.some(row=>row.kind!=="INTENT"||row.operationId!==r.receipt.operationId)||ledger.records.length>1)return rejectBootstrap();
 if(await adapter.confirm(Object.freeze({action:"QUARANTINE_TEST_IMPORTED_ROOT",operationId:r.receipt.operationId,originDigest:portableOriginDigest(r.packet),destinationFileIdentity:r.vault.databaseFingerprint,productionActivation:false}))!=="CONFIRM_PERMANENT_NO_ADMISSION")return rejectBootstrap();
 return withHeldBootstrapOwnership(r.config.database,runtime,async()=>{const intent=ledger.records[0],base=intentFor(r.receipt),record:CandidateRecord={...base,kind:"QUARANTINED_NO_ADMISSION",sequence:intent?"2":"1",previousDigest:intent?candidateRecordDigest(intent):null,intentDigest:intent?candidateRecordDigest(intent):null,createdAtMs:String(Math.max(Date.now(),Number(base.createdAtMs)))};await append(r.vault,o.originalAnchorDigest,record);return Object.freeze({status:"QUARANTINED_NO_ADMISSION" as const,sqlOutcome:"UNKNOWN" as const,productionActivation:false as const});});
}
