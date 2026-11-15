import { createRequire, registerHooks } from "node:module";
import path from "node:path";
registerHooks({resolve(specifier,context,next){if(specifier==="server-only")return next(new URL("../../node_modules/next/dist/compiled/server-only/empty.js",import.meta.url).href,context);try{return next(specifier,context);}catch(error){if((specifier.startsWith("./")||specifier.startsWith("../"))&&!specifier.endsWith(".ts")&&error.code==="ERR_MODULE_NOT_FOUND")return next(specifier+".ts",context);throw error;}}});
process.once("message",async m=>{try{
 const {acquireRuntimeOwnership}=await import("../../src/server/hosting/ownership.ts"),{createImportedRootWriterAdmission,createImportedPreparationAdmission}=await import("../../src/server/bootstrap/writer-admission.ts"),{createProtectedRestoredHistory}=await import("../../src/server/backup/protected-history.ts"),{withProtectedLocalKeys}=await import("../../src/server/bootstrap/keys.ts"),{openAuthorizationGateway}=await import("../../src/server/auth/gateway.ts");
 if(m.action==="pause-import-copy"){
  const {importTestPortableRecovery}=await import("../../src/server/backup/crypto.ts"),{withImportedRootPreparation41,bindTrustedImportedRootInteraction}=await import("../../src/server/bootstrap/imported-root41.ts");
  const custody=await importTestPortableRecovery(m.identity,m.trust);delete m.identity;const Driver=createRequire(import.meta.url)("better-sqlite3"),backup=Driver.prototype.backup;
  Driver.prototype.backup=async function(dest,options){const result=await backup.call(this,dest,options);if(path.resolve(dest).toLowerCase()===path.join(m.directory,"imported41.sqlite3").toLowerCase()){process.send?.({status:"ACTUAL_IMPORTED_COPY_UNACKNOWLEDGED"});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000);throw Error("TEST pause deadline");}return result;};
  await withImportedRootPreparation41(custody,m.archive,m.packet,m.directory,m.migrations,{key:Buffer.from(m.tls.key,"base64"),certificate:Buffer.from(m.tls.certificate,"base64"),trustAnchor:Buffer.from(m.tls.trustAnchor,"base64")},bindTrustedImportedRootInteraction({confirm:async()=>"CONFIRM_TEST_OLD_DEVICE_FENCED"}),async c=>{await createImportedPreparationAdmission(c,{});throw Error("TEST no acknowledged completion");});return;
 }
 if(m.action!=="reopen-import")throw Error();
 const runtime=await acquireRuntimeOwnership(path.join(m.config.database.directory,m.config.database.filename));let gateway;
 try{
  const admission=await createImportedRootWriterAdmission(m.config,runtime),history=createProtectedRestoredHistory(admission,m.config.database);let secrets;
  await withProtectedLocalKeys(m.config,async keys=>{secrets={...keys.signingSecrets};});
  gateway=await openAuthorizationGateway({database:m.config.database,migrationsDirectory:m.config.migrationsDirectory,signingSecrets:secrets,origins:{ADMIN:"https://localhost:49993",SALESPERSON:"https://127.0.0.1:49993"},sessionLifetimeSeconds:600,protectedAdmission:admission,protectedHistory:history},41);
  const roles=[];for(const role of ["ADMIN","SALESPERSON"]){const proof=await(role==="ADMIN"?gateway.verifyAdminPassword(m.passwords[role]):gateway.verifySalespersonPassword(m.passwords[role]));const response=await(role==="ADMIN"?gateway.issueAdminSession(proof):gateway.issueSalespersonSession(proof));if(response.status!==200)throw Error();roles.push(role);}delete m.passwords;process.send?.({status:"IMPORTED_ROOT_REOPENED",roles,productionActivation:false});
 }finally{await gateway?.close();await runtime.close();}
 process.disconnect?.();
}catch{process.send?.({status:"IMPORTED_PROBE_ERROR"});process.disconnect?.();}});
