import "server-only";
import {existsSync,mkdirSync} from "node:fs";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {createRequire} from "node:module";
import type {ProofDatabase} from "../backup/snapshot";
import {storage} from "../backup/storage";
import {resolveDatabaseLocation} from "../db/location";
import type {SqlRow} from "../db/connection";
import {passwordCallbacks} from "../auth/password";
import {openRecoveryAttemptJournal} from "../auth/recovery-attempt-journal";
import {adminMaintenanceSourceEvidence,type AdminMaintenanceSource} from "../auth/gateway";
import {hasActiveBootstrapLease,type BootstrapLease} from "./ownership";
import {readProtectedRootAuthority} from "./root-authority";
import {readProtectedCandidateLedger} from "./candidate-records";
import type {LocalKeyConfiguration} from "./keys";
import {enrollmentDigest} from "./database";
import {rejectBootstrap} from "./windows";
import {restoredCandidate41AuthenticationEvidence,selectProtectedRestore41,type ProtectedRestoreCandidate41} from "./restore41";
import type {TrustedCandidateSelectionInteraction} from "./candidate-selection";
const Driver=createRequire(import.meta.url)("better-sqlite3") as new(filename:string,options:{readonly:true;fileMustExist:true})=>ProofDatabase;
declare const inheritedBrand:unique symbol;
export interface RestoredInheritedCredentialProof {readonly [inheritedBrand]:true;readonly signal:AbortSignal}
const proofs=new WeakMap<object,{candidate:ProtectedRestoreCandidate41;binding:string;expires:number;controller:AbortController}>();
const verifying=new WeakSet<object>(),latest=new WeakMap<object,AbortController>();
// No accounts are written/opened through a second gateway. Both inherited role
// passwords use the exact private POSPW001 verifier and the unchanged shared
// durable-attempt policy. Global + archive counters prevent restaging resets.
export async function verifyProtectedRestoreInheritedCredentials(candidate:ProtectedRestoreCandidate41,input:Readonly<{ADMIN:string;SALESPERSON:string}>):Promise<RestoredInheritedCredentialProof>{
 if(!candidate||typeof candidate!=="object"||verifying.has(candidate)||!input||Object.keys(input).sort().join(",")!=="ADMIN,SALESPERSON"||Object.values(input).some(v=>typeof v!=="string"))return rejectBootstrap();
 latest.get(candidate)?.abort();verifying.add(candidate);
 try{
  const e=await restoredCandidate41AuthenticationEvidence(candidate),db=new Driver(resolveDatabaseLocation(e.target.database).filename,{readonly:true,fileMustExist:true});db.defaultSafeIntegers(true);
  let baseline:SqlRow[],credentials:Record<"ADMIN"|"SALESPERSON",string>;
  try{
   const setup=db.prepare("SELECT format_version,admin_id,salesperson_id,completed_at_ms FROM auth_provisioning WHERE id=1").get();
   if(!setup||setup.format_version!==BigInt(1)||setup.admin_id!=="ADMIN"||setup.salesperson_id!=="SALESPERSON"||typeof setup.completed_at_ms!=="bigint"||setup.completed_at_ms<=BigInt(0)||setup.completed_at_ms>BigInt(Date.now()))return rejectBootstrap();
   credentials={} as typeof credentials;
   for(const role of ["ADMIN","SALESPERSON"] as const){
    const row=db.prepare("SELECT u.id,u.role,c.id AS credential_id,c.accountId,c.providerId,c.password,c.updatedAt,p.active,p.credential_version,p.auth_epoch,p.provisioned_at_ms FROM auth_users u JOIN auth_credentials c ON c.userId=u.id JOIN auth_principals p ON p.id=u.id WHERE u.id=?").get(role);
    if(!row||row.id!==role||row.role!==role||row.credential_id!==role||row.accountId!==role||row.providerId!=="credential"||row.active!==BigInt(1)||row.provisioned_at_ms!==setup.completed_at_ms||typeof row.password!=="string"||row.password.length!==161||typeof row.updatedAt!=="string"||typeof row.credential_version!=="bigint"||row.credential_version<=BigInt(0)||typeof row.auth_epoch!=="bigint"||row.auth_epoch<=BigInt(0))return rejectBootstrap();credentials[role]=row.password;
   }
   baseline=db.prepare("SELECT * FROM auth_login_attempts ORDER BY bucket").all();
  }finally{db.close();}
  const parent=path.join(e.rootDirectory,"ra");e.guard();
  if(!existsSync(parent))return rejectBootstrap();await storage(parent,"check");
  const context=enrollmentDigest({format:"POS_NATIVE_INHERITED_ATTEMPTS_V1",root:e.rootVaultDigest,anchor:e.anchor});
  const archiveDirectory=path.join(parent,e.archive.slice(0,32));
  const archiveExists=existsSync(archiveDirectory);
  const global=await openRecoveryAttemptJournal({directory:path.join(parent,"g"),context,baseline,allowCreate:false,namespace:{id:e.archive,exists:archiveExists},guard:e.guard,verify:async(role,password)=>{try{await(role==="ADMIN"?archive.verifyAdminPassword(password):archive.verifySalespersonPassword(password));return true;}catch{return false;}}});
  const archive=await openRecoveryAttemptJournal({directory:archiveDirectory,context:enrollmentDigest({context,archive:e.archive}),baseline,allowCreate:!archiveExists,guard:e.guard,verify:(role,password)=>passwordCallbacks.verify({hash:credentials[role],password:password as string})});  await global.verifyAdminPassword(input.ADMIN);await global.verifySalespersonPassword(input.SALESPERSON);await e.verify();
  const tick=Math.floor(performance.now());if(!Number.isSafeInteger(tick)||tick<0||!Number.isSafeInteger(tick+5000))return rejectBootstrap();
  const controller=new AbortController(),proof=Object.freeze({signal:controller.signal,toJSON:rejectBootstrap}) as unknown as RestoredInheritedCredentialProof;
  proofs.set(proof,{candidate,binding:e.binding,expires:tick+5000,controller});latest.set(candidate,controller);const timer=setTimeout(()=>controller.abort(),5000);timer.unref();return proof;
 }catch{return rejectBootstrap();}finally{verifying.delete(candidate);}
}
export async function selectAuthenticatedProtectedRestore41(candidate:ProtectedRestoreCandidate41,proof:unknown,interaction:TrustedCandidateSelectionInteraction){
 const p=proof&&typeof proof==="object"?proofs.get(proof):undefined;
 if(!p||p.candidate!==candidate||p.expires<=Math.floor(performance.now())||p.controller.signal.aborted||latest.get(candidate)!==p.controller)return rejectBootstrap();
 // Consume before awaited validation/confirmation; a cancelled or failed attempt
 // cannot replay the authenticated authorization. No extension of the5s window.
 proofs.delete(proof as object);p.controller.abort();const e=await restoredCandidate41AuthenticationEvidence(candidate);if(e.binding!==p.binding)return rejectBootstrap();e.guard();
 return selectProtectedRestore41(candidate,interaction);
}
// Called with fresh genuine source Admin authority BEFORE the first restore
// INTENT. Once any restore exists, missing root attempt evidence is fatal.
export async function initializeNativeRecoveryAttempts(root:LocalKeyConfiguration,sourceConfig:LocalKeyConfiguration,source:AdminMaintenanceSource,lease:BootstrapLease,operationId:string){
 const guard=()=>{if(!hasActiveBootstrapLease(lease,sourceConfig.database)||adminMaintenanceSourceEvidence(source,sourceConfig.database,lease,{operationId,purpose:"RESTORE41"}).schema!==41)return rejectBootstrap();};guard();
 const authority=await readProtectedRootAuthority(root),ledger=await readProtectedCandidateLedger(authority.vault,authority.originalAnchorDigest),parent=path.join(root.directory,"ra");
 let fresh=false;if(!existsSync(parent)){if(ledger.records.some(r=>r.purpose==="RESTORE41")||ledger.pending.length)return rejectBootstrap();mkdirSync(parent);await storage(parent,"initialize");fresh=true;}else await storage(parent,"check");
 const db=new Driver(resolveDatabaseLocation(sourceConfig.database).filename,{readonly:true,fileMustExist:true});db.defaultSafeIntegers(true);let baseline:SqlRow[];try{baseline=db.prepare("SELECT * FROM auth_login_attempts ORDER BY bucket").all();}finally{db.close();}
 const context=enrollmentDigest({format:"POS_NATIVE_INHERITED_ATTEMPTS_V1",root:authority.vault.vaultDigest,anchor:authority.originalAnchorDigest});
 await openRecoveryAttemptJournal({directory:path.join(parent,"g"),context,baseline,allowCreate:fresh,guard,verify:async()=>false});guard();
}