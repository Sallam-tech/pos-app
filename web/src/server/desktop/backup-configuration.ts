import "server-only";
import {existsSync,mkdirSync} from "node:fs";
import path from "node:path";
import type {LocalKeyConfiguration} from "../bootstrap/keys";
import {createProtectedRootWriterAdmission,createSelectedWriterAdmission} from "../bootstrap/writer-admission";
import {createProtectedRestoredHistory} from "../backup/protected-history";
import {createTestCustody,openTestCustody} from "../backup/crypto";
import {configureProtectedBackups41,reopenTestBackupConfiguration} from "../backup/worker";
import {openAuthorizationGateway} from "../auth/gateway";
import type {AuthorizationConfiguration} from "../auth/types";
import {acquireRuntimeOwnership} from "../hosting/ownership";
import {assertNoAuthorizationOwner} from "../bootstrap/ownership";
import {rejectBootstrap} from "../bootstrap/windows";
import type {resolveDesktopCurrent} from "./current";
export async function prepareDesktopBackup(root:LocalKeyConfiguration,current:Awaited<ReturnType<typeof resolveDesktopCurrent>>,base:string,authorization:AuthorizationConfiguration,readAdminPassword?:()=>Promise<unknown>){
 const active=current.active,lease=await acquireRuntimeOwnership(path.join(active.database.directory,active.database.filename));
 try{
  const admission=current.selected?await createSelectedWriterAdmission(root,active,lease):await createProtectedRootWriterAdmission(root,lease,41),history=current.selected?createProtectedRestoredHistory(admission,active.database):undefined;
  const backupRoot=path.join(base,current.backupName),keyRoot=path.join(base,"k"),exported=path.join(base,current.selected?"e"+current.generation:"e");
  if(existsSync(backupRoot))return await reopenTestBackupConfiguration(await openTestCustody(keyRoot),active.database,backupRoot,undefined,admission,history);
  // A selected generation always retains the ORIGINAL custody. Fresh namespace
  // creation requires a genuine login and explicit private human input. Partial
  // setup is retained and rejected, never silently repaired/replaced.
  if(!readAdminPassword||existsSync(exported)||current.selected&&!existsSync(keyRoot)||!current.selected&&existsSync(keyRoot))return rejectBootstrap();
  let password=await readAdminPassword();const gateway=await openAuthorizationGateway({...authorization,protectedAdmission:admission,...(history?{protectedHistory:history}:{})},41);
  try{
   const response=await gateway.issueAdminSession(await gateway.verifyAdminPassword(password)),request=new Request(authorization.origins.ADMIN+"/desktop-backup-handoff",{headers:{origin:authorization.origins.ADMIN,cookie:response.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")}});
   let custody;if(current.selected)custody=await openTestCustody(keyRoot);else{mkdirSync(keyRoot);custody=await createTestCustody(keyRoot);}
   mkdirSync(backupRoot);mkdirSync(exported);return await configureProtectedBackups41(gateway,request,password,custody,active.database,backupRoot,exported,admission,history);
  }finally{password=undefined;await gateway.close();}
 }finally{assertNoAuthorizationOwner();await lease.close();}
}