import "server-only";
import {randomUUID} from "node:crypto";
import {mkdirSync} from "node:fs";
import path from "node:path";
import {withLocalRuntimeMaintenance,type LocalRuntime} from "../hosting/runtime";
import {openTestCustody,hashFile} from "../backup/crypto";
import {withProtectedRestore41,bindTrustedProtectedRestoreInteraction,completeProtectedRestore41,restoredCandidate41AuthenticationEvidence,withKnownCommittedRestoreCandidate41,quarantineNeverAdmittedRestore41} from "../bootstrap/restore41";
import {initializeNativeRecoveryAttempts,verifyProtectedRestoreInheritedCredentials,selectAuthenticatedProtectedRestore41} from "../bootstrap/restore41-authentication";
import {bindTrustedCandidateSelectionInteraction} from "../bootstrap/candidate-selection";
import {createRestoredCandidateProtectedLocalKeys,withProtectedLocalKeys,type LocalKeyConfiguration} from "../bootstrap/keys";
import {enrollmentDigest} from "../bootstrap/database";
import {rejectBootstrap} from "../bootstrap/windows";
import {createDesktopTestTls} from "./tls";
import {openAuthorizationGateway,withAdminMaintenanceSource} from "../auth/gateway";
import {createProtectedRootRecoveryAdmission,createSelectedRecoveryAdmission} from "../bootstrap/writer-admission";
import {bindTrustedCandidateRecoveryInteraction} from "../bootstrap/candidate-recovery8";
import {createProtectedRestoredHistory} from "../backup/protected-history";
import {acquireRuntimeOwnership} from "../hosting/ownership";
import {assertNoAuthorizationOwner} from "../bootstrap/ownership";
import {inspectDesktopRecoveryReview,resolveDesktopCurrent} from "./current";
import {prepareDesktopBackup} from "./backup-configuration";
export interface DesktopRecoveryInput {archive:string;archiveSha256:string;sourceAdmin:string;ADMIN:string;SALESPERSON:string}
export async function recoverDesktopTest(runtime:LocalRuntime,root:LocalKeyConfiguration,active:LocalKeyConfiguration,base:string,origins:Readonly<Record<"ADMIN"|"SALESPERSON",string>>,input:DesktopRecoveryInput,confirm:(type:"confirm-protected-restore"|"confirm-writer-selection",request:unknown)=>Promise<unknown>){
 if(!input||Object.keys(input).sort().join(",")!=="ADMIN,SALESPERSON,archive,archiveSha256,sourceAdmin"||Object.values(input).some(v=>typeof v!=="string")||!path.isAbsolute(input.archive)||! /^[a-f0-9]{64}$/.test(input.archiveSha256)||(await hashFile(input.archive)).sha256!==input.archiveSha256)return rejectBootstrap();
 const operationId=randomUUID(),directory=path.join(base,operationId),tls=await createDesktopTestTls();let selected=false;
 try{
  const custody=await openTestCustody(path.join(base,"k"));
  await withLocalRuntimeMaintenance(runtime,input.sourceAdmin,{operationId,purpose:"RESTORE41"},async(source,lease)=>{
   await initializeNativeRecoveryAttempts(root,active,source,lease,operationId);mkdirSync(directory);
   await withProtectedRestore41(root,active,source,lease,custody,input.archive,directory,operationId,bindTrustedProtectedRestoreInteraction({confirm:async request=>{
    if(request.archiveSha256!==input.archiveSha256)return "CANCELLED";return await confirm("confirm-protected-restore",request)==="CONFIRM_SEPARATE_TEST_RESTORE41"?"CONFIRM_SEPARATE_TEST_RESTORE41":"CANCELLED";
   }}),async(candidate,target)=>{
    await createRestoredCandidateProtectedLocalKeys(target,tls,candidate);await completeProtectedRestore41(candidate);const evidence=await restoredCandidate41AuthenticationEvidence(candidate);
    // Human sees the exact completed operation/file/state/vault BEFORE password
    // derivation. Accepted consent is private, exact-bound and consumed once.
    if(await confirm("confirm-writer-selection",evidence.selection)!=="CONFIRM_TEST_WRITER_SELECTION")return rejectBootstrap();let consent=true;
    const proof=await verifyProtectedRestoreInheritedCredentials(candidate,{ADMIN:input.ADMIN,SALESPERSON:input.SALESPERSON});
    await selectAuthenticatedProtectedRestore41(candidate,proof,bindTrustedCandidateSelectionInteraction({confirm:async request=>{if(!consent||enrollmentDigest(request)!==enrollmentDigest(evidence.selection))return "CANCELLED";consent=false;return "CONFIRM_TEST_WRITER_SELECTION";}}));selected=true;
   });
  });
  if(!selected)return rejectBootstrap();const current=await resolveDesktopCurrent(root);if(!current.selected||path.basename(current.active.directory)!==operationId)return rejectBootstrap();
  await withProtectedLocalKeys(current.active,async keys=>{await prepareDesktopBackup(root,current,base,{database:current.active.database,migrationsDirectory:current.active.migrationsDirectory,origins,signingSecrets:keys.signingSecrets,sessionLifetimeSeconds:28800},async()=>input.ADMIN);});
  return Object.freeze({status:"TEST_RECOVERY_SELECTED_BACKUP_CONFIGURED" as const,generation:current.generation,productionActivation:false});
 }finally{Object.values(tls).forEach(b=>b.fill(0));}
}
export async function resumeDesktopRecoveryReview(root:LocalKeyConfiguration,base:string,origins:Readonly<Record<"ADMIN"|"SALESPERSON",string>>,input:Readonly<{sourceAdmin:string;ADMIN?:string;SALESPERSON?:string}>,confirm:(type:"confirm-writer-selection"|"confirm-quarantine",request:unknown)=>Promise<unknown>){
 const review=await inspectDesktopRecoveryReview(root);if(!review||!input||typeof input.sourceAdmin!=="string")return rejectBootstrap();
 const lease=await acquireRuntimeOwnership(path.join(review.source.database.directory,review.source.database.filename));
 try{
  await withProtectedLocalKeys(review.source,async keys=>{
   const admission=review.selectedSource?await createSelectedRecoveryAdmission(root,review.source,lease):await createProtectedRootRecoveryAdmission(root,lease,41),history=review.selectedSource?createProtectedRestoredHistory(admission,review.source.database):undefined;
   const gateway=await openAuthorizationGateway({database:review.source.database,migrationsDirectory:review.source.migrationsDirectory,origins,signingSecrets:keys.signingSecrets,sessionLifetimeSeconds:600,protectedAdmission:admission,...(history?{protectedHistory:history}:{})},41);
   try{await withAdminMaintenanceSource(gateway,await gateway.verifyAdminPassword(input.sourceAdmin),lease,{operationId:review.operationId,purpose:"RESTORE41"},async(source,bootstrap)=>{
    if(review.kind==="INTENT"){
     await quarantineNeverAdmittedRestore41(root,review.source,source,bootstrap,review.operationId,bindTrustedCandidateRecoveryInteraction({confirm:async request=>await confirm("confirm-quarantine",request)==="CONFIRM_PERMANENT_NO_ADMISSION"?"CONFIRM_PERMANENT_NO_ADMISSION":"CANCELLED"}));return;
    }
    if(typeof input.ADMIN!=="string"||typeof input.SALESPERSON!=="string")return rejectBootstrap();
    await withKnownCommittedRestoreCandidate41(root,review.source,review.target,source,bootstrap,review.operationId,async candidate=>{
     const evidence=await restoredCandidate41AuthenticationEvidence(candidate);if(await confirm("confirm-writer-selection",evidence.selection)!=="CONFIRM_TEST_WRITER_SELECTION")return rejectBootstrap();let consent=true;
     const proof=await verifyProtectedRestoreInheritedCredentials(candidate,{ADMIN:input.ADMIN!,SALESPERSON:input.SALESPERSON!});await selectAuthenticatedProtectedRestore41(candidate,proof,bindTrustedCandidateSelectionInteraction({confirm:async request=>{if(!consent||enrollmentDigest(request)!==enrollmentDigest(evidence.selection))return "CANCELLED";consent=false;return "CONFIRM_TEST_WRITER_SELECTION";}}));
    });
   });}finally{await gateway.close();}
  });
 }finally{assertNoAuthorizationOwner();await lease.close();}
 const current=await resolveDesktopCurrent(root);if(review.kind==="COMMITTED")await withProtectedLocalKeys(current.active,async keys=>{await prepareDesktopBackup(root,current,base,{database:current.active.database,migrationsDirectory:current.active.migrationsDirectory,origins,signingSecrets:keys.signingSecrets,sessionLifetimeSeconds:600},async()=>input.ADMIN);});
 return Object.freeze({status:review.kind==="COMMITTED"?"AUTHENTICATED_KNOWN_COMMIT_SELECTED":"PERMANENT_NO_ADMISSION_RECORDED",productionActivation:false});
}