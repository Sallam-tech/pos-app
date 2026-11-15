import "server-only";
import { createHash, verify, createPublicKey, randomUUID } from "node:crypto";
import { canonical } from "../inventory/validation";
import path from "node:path";
import { open } from "node:fs/promises";
import { readdirSync, readFileSync, lstatSync, existsSync } from "node:fs";
import { custodyMetadata, decryptSnapshot, hashFile, signProtectedEvidence, type BackupCustody, type SnapshotFacts } from "../backup/crypto";
import { fingerprint, openProofDatabase, verifySchema41, type ProofDatabase } from "../backup/snapshot";
import { protectedArchiveCreationEvidence, validateHistoricalSettings, verifyProtectedSnapshotContents, testSourceNamespace, type HistoricalSettings } from "../backup/service";
import { storage, testDirectory } from "../backup/storage";
import { protectedWriterRootConfiguration, assertProtectedWriterAdmission, type ProtectedWriterAdmission } from "./writer-admission";
import { readProtectedRootAuthority } from "./root-authority";
import { classifyCandidateLedger, readProtectedCandidateLedger, candidatePendingCompatible } from "./candidate-records";
import { readProtectedRestoreProvenance } from "./restore41";
import { inspectLocalVault, type LocalKeyConfiguration } from "./keys";
import { enrollmentDigest, readEnrollmentSnapshot } from "./database";
import { classifyEnrollment, type EnrollmentRecord } from "./journal";
import { protectedManifestDigest } from "./maintenance-journal";
import { rejectBootstrap } from "./windows";
import { resolveDatabaseLocation } from "../db/location";
export interface PortableOrigin41 {
 readonly format:"POS_PORTABLE_ORIGIN41_V1";readonly keyId:string;readonly archiveSha256:string;readonly manifest:Readonly<SnapshotFacts>;
 readonly rootKind:"ORIGINAL"|"IMPORTED_ROOT";readonly issuerProofDigest:string;readonly rootVaultDigest:string;readonly rootDatabaseFingerprint:string;
 readonly originalAnchorDigest:string;readonly anchorVersion:8|41;readonly enrollmentRecords:readonly EnrollmentRecord[];readonly selectedGeneration:string;
 readonly sourceFileIdentity:string;readonly sourceInstallationId:string;readonly sourceDeviceId:string;readonly sourceCertificateFingerprint:string;
 readonly sourceTlsPublicKeyDigests:readonly string[];readonly originalBindingDigest:string;readonly createdAtMs:string;
}
export interface PortableOriginPacket41 { readonly origin:PortableOrigin41;readonly signature:string }
const hex=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const fields="anchorVersion,archiveSha256,createdAtMs,enrollmentRecords,format,issuerProofDigest,keyId,manifest,originalAnchorDigest,originalBindingDigest,rootDatabaseFingerprint,rootKind,rootVaultDigest,selectedGeneration,sourceCertificateFingerprint,sourceDeviceId,sourceFileIdentity,sourceInstallationId,sourceTlsPublicKeyDigests";
export const portableOriginDigest=(packet:PortableOriginPacket41)=>enrollmentDigest(packet);
export function validatePortableOriginPacket(custody:BackupCustody,value:unknown):PortableOriginPacket41{return validatePortableOriginTrust(custodyMetadata(custody),value);}
export function validatePortableOriginTrust(trust:Readonly<{id:string;signingPublic:string}>,value:unknown):PortableOriginPacket41{
 try{
  if(!value||typeof value!=="object"||Object.keys(value).sort().join(",")!=="origin,signature"||Buffer.byteLength(JSON.stringify(value))>131072)return rejectBootstrap();
  const packet=JSON.parse(JSON.stringify(value)) as PortableOriginPacket41,o=packet.origin;
  if(!o||Object.keys(o).sort().join(",")!==fields||o.format!=="POS_PORTABLE_ORIGIN41_V1"||o.keyId!==trust.id||createPublicKey(trust.signingPublic).asymmetricKeyType!=="ed25519"||typeof packet.signature!=="string"||!verify(null,Buffer.from(canonical(o)),trust.signingPublic,Buffer.from(packet.signature,"base64"))||
   !["ORIGINAL","IMPORTED_ROOT"].includes(o.rootKind)||![8,41].includes(o.anchorVersion)||![o.archiveSha256,o.issuerProofDigest,o.rootVaultDigest,o.rootDatabaseFingerprint,o.originalAnchorDigest,o.sourceFileIdentity,o.originalBindingDigest].every(hex)||
   !Array.isArray(o.enrollmentRecords)||!o.enrollmentRecords.length||o.enrollmentRecords.length>128||!Array.isArray(o.sourceTlsPublicKeyDigests)||!o.sourceTlsPublicKeyDigests.length||o.sourceTlsPublicKeyDigests.length>64||new Set(o.sourceTlsPublicKeyDigests).size!==o.sourceTlsPublicKeyDigests.length||!o.sourceTlsPublicKeyDigests.every(hex)||
   typeof o.createdAtMs!=="string"||!/^[1-9][0-9]{0,15}$/.test(o.createdAtMs)||typeof o.selectedGeneration!=="string"||! /^(ROOT|[1-9][0-9]?)$/.test(o.selectedGeneration)||o.manifest?.schema!==41||o.manifest.format!=="POS_SQLITE_SNAPSHOT_V1"||o.manifest.keyId!==o.keyId||
   ![o.sourceInstallationId,o.sourceDeviceId].every(v=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v))||typeof o.sourceCertificateFingerprint!=="string")return rejectBootstrap();
  const anchors=o.enrollmentRecords.filter(r=>r.kind==="ENROLLED");if(anchors.length!==1||enrollmentDigest(anchors[0])!==o.originalAnchorDigest)return rejectBootstrap();
  // Deep copy prevents a signed nested object being changed after verification.
  return JSON.parse(JSON.stringify(packet)) as PortableOriginPacket41;
 }catch{return rejectBootstrap();}
}
export async function verifyPortableOriginDatabase(db:ProofDatabase,origin:PortableOrigin41,allowAttempts=false){
 const reader={get:async(sql:string,values:readonly import("../db/connection").SqlValue[]=[])=>db.prepare(sql).get(...values),all:async(sql:string,values:readonly import("../db/connection").SqlValue[]=[])=>db.prepare(sql).all(...values)};
 const snapshot=await readEnrollmentSnapshot(reader,protectedManifestDigest(origin.anchorVersion),41);
 if(classifyEnrollment(origin.enrollmentRecords,snapshot).status!=="ENROLLED"||enrollmentDigest(db.prepare("SELECT rowid AS __proof_rowid,* FROM auth_enrollment_binding ORDER BY rowid").all())!==origin.originalBindingDigest)return rejectBootstrap();
 const result=await verifyProtectedSnapshotContents(db,origin.manifest.sourceNamespace,origin.manifest.history.map(validateHistoricalSettings));
 const trim=(v:unknown)=>{const f=v as ReturnType<typeof fingerprint>;return {...f,tables:f.tables.filter(t=>!allowAttempts||t.name!=="auth_login_attempts")};};
 if(enrollmentDigest(trim(result.fingerprint))!==enrollmentDigest(trim(origin.manifest.fingerprint)))return rejectBootstrap();
 return Object.freeze([...origin.manifest.history.map(validateHistoricalSettings),result.origin] as readonly HistoricalSettings[]);
}
// Additive packet for an independently reopened archive whose current source
// binding and all typed rows still match. Legacy archive bytes are unchanged.
export async function preparePortableOrigin41(custody:BackupCustody,source:LocalKeyConfiguration,admission:ProtectedWriterAdmission,archive:string,verificationDirectory:string,creationProof?:unknown):Promise<PortableOriginPacket41>{
 const facts=assertProtectedWriterAdmission(admission,source.database,undefined,true);if(facts.schema!==41||facts.maintenanceOnly)return rejectBootstrap();
 testDirectory(verificationDirectory);if(readdirSync(verificationDirectory).length)return rejectBootstrap();await storage(verificationDirectory,"initialize");
 const root=await readProtectedRootAuthority(protectedWriterRootConfiguration(admission,source.database)),vault=await inspectLocalVault(source),ledger=await readProtectedCandidateLedger(root.vault,root.originalAnchorDigest),selected=classifyCandidateLedger(ledger);
 if(!candidatePendingCompatible(ledger)||!["ABSENT","QUARANTINED_ONLY","RECORDED_CURRENT"].includes(selected.status)||vault.databaseFingerprint!==(selected.recordedCurrent?.destinationFileIdentity??root.vault.databaseFingerprint))return rejectBootstrap();
 const cipher=await hashFile(archive),decoded=path.join(verificationDirectory,"origin-verification.sqlite3"),manifest=await decryptSnapshot(custody,archive,decoded,undefined,undefined,cipher.sha256);
 if(manifest.sourceNamespace!==testSourceNamespace(resolveDatabaseLocation(source.database).filename))return rejectBootstrap();
 const inherited=selected.recordedCurrent?.purpose==="RESTORE41"&&vault.databaseFingerprint!==root.vault.databaseFingerprint?(await readProtectedRestoreProvenance(source,selected.recordedCurrent)).sourceTlsPublicKeyDigests:[];
 const current=openProofDatabase(resolveDatabaseLocation(source.database).filename),check=openProofDatabase(decoded);let origin:PortableOrigin41;
 try{current.exec("BEGIN");check.exec("BEGIN");
  origin={format:"POS_PORTABLE_ORIGIN41_V1",keyId:custodyMetadata(custody).id,archiveSha256:cipher.sha256,manifest,rootKind:root.kind,issuerProofDigest:root.issuerProofDigest,rootVaultDigest:root.vault.vaultDigest,rootDatabaseFingerprint:root.vault.databaseFingerprint,
   originalAnchorDigest:root.originalAnchorDigest,anchorVersion:root.anchorVersion,enrollmentRecords:root.records,selectedGeneration:selected.recordedCurrent?.generation??"ROOT",sourceFileIdentity:vault.databaseFingerprint,
   sourceInstallationId:vault.metadata.installationId,sourceDeviceId:vault.metadata.deviceId,sourceCertificateFingerprint:vault.metadata.certificateFingerprint,
   sourceTlsPublicKeyDigests:Object.freeze([...new Set([...root.sourceTlsPublicKeyDigests,root.vault.tlsPublicKeyDigest,vault.tlsPublicKeyDigest,...inherited])]),originalBindingDigest:enrollmentDigest(check.prepare("SELECT rowid AS __proof_rowid,* FROM auth_enrollment_binding ORDER BY rowid").all()),createdAtMs:String(Date.now())};
  await verifyPortableOriginDatabase(check,origin);
  if(creationProof!==undefined){
   protectedArchiveCreationEvidence(creationProof,admission,source.database,archive,manifest,cipher.sha256);await verifySchema41(current);
   const r={get:async(sql:string,values:readonly import("../db/connection").SqlValue[]=[])=>current.prepare(sql).get(...values),all:async(sql:string,values:readonly import("../db/connection").SqlValue[]=[])=>current.prepare(sql).all(...values)};
   if(classifyEnrollment(root.records,await readEnrollmentSnapshot(r,protectedManifestDigest(root.anchorVersion),41)).status!=="ENROLLED"||enrollmentDigest(current.prepare("SELECT rowid AS __proof_rowid,* FROM auth_enrollment_binding ORDER BY rowid").all())!==origin.originalBindingDigest)return rejectBootstrap();
  }else await verifyPortableOriginDatabase(current,origin,true);
  current.exec("ROLLBACK");check.exec("ROLLBACK");
 }finally{check.close();current.close();}
 assertProtectedWriterAdmission(admission,source.database,undefined,true);if((await hashFile(archive)).sha256!==origin.archiveSha256)return rejectBootstrap();
 return validatePortableOriginPacket(custody,{origin,signature:signProtectedEvidence(custody,origin)});
}
export async function publishPortableOrigin41(directory:string,packet:PortableOriginPacket41){
 const pending=path.join(directory,"origin-"+randomUUID()+".pending"),name=packet.origin.manifest.archiveId+"-origin.json",file=await open(pending,"wx");
 try{await file.writeFile(JSON.stringify(packet));await file.sync();}finally{await file.close();}
 await storage(directory,"publish",{source:path.basename(pending),target:name});return path.join(directory,name);
}
export const portablePublicKeyDigest=(key:string)=>createHash("sha256").update(key).digest("hex");

export async function inspectPortableOrigin41(custody:BackupCustody,archive:string){
 const file=archive.replace(/\.age$/,"-origin.json");if(file===archive)return rejectBootstrap();await storage(path.dirname(file),"check",{filename:path.basename(file)});
 const stat=lstatSync(file,{bigint:true});if(stat.size<BigInt(1)||stat.size>BigInt(131072))return rejectBootstrap();const bytes=readFileSync(file);
 const packet=validatePortableOriginPacket(custody,JSON.parse(bytes.toString("utf8")));if(packet.origin.archiveSha256!==(await hashFile(archive)).sha256||packet.origin.manifest.archiveId!==path.basename(archive,".age"))return rejectBootstrap();
 const after=lstatSync(file,{bigint:true});if(["dev","ino","size","mtimeNs","ctimeNs"].some(k=>stat[k as keyof typeof stat]!==after[k as keyof typeof after])||!bytes.equals(readFileSync(file)))return rejectBootstrap();return packet;
}
export async function exportPortableOrigin41(custody:BackupCustody,sourceArchive:string,directory:string){
 const packet=await inspectPortableOrigin41(custody,sourceArchive),target=path.join(directory,packet.origin.manifest.archiveId+"-origin.json");
 if(existsSync(target)){await storage(directory,"check",{filename:path.basename(target)});if(enrollmentDigest(validatePortableOriginPacket(custody,JSON.parse(readFileSync(target,"utf8"))))!==enrollmentDigest(packet))return rejectBootstrap();return target;}
 return publishPortableOrigin41(directory,packet);
}
