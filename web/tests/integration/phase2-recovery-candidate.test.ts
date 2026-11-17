import {test,expect,beforeAll,vi} from "vitest";
import {createHash,randomUUID,randomBytes} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {readFileSync} from "node:fs";
import {settingsContext} from "../../src/server/settings/model";
import {openDatabase} from "../../src/server/db/connection";
import {applyMigrations} from "../../src/server/db/migrate";
import {applySalesMigration36} from "../../src/server/db/sales-migrate";
import {applyReturnsMigration37} from "../../src/server/db/returns-migrate";
import {applyExpensesMigration38} from "../../src/server/db/expenses-migrate";
import {applyInvoicesMigration39} from "../../src/server/db/invoices-migrate";
import {applyCashMigration40} from "../../src/server/db/cash-migrate";
import {applySettingsMigration41} from "../../src/server/db/settings-migrate";
import {createProtectedLocalKeys,createRestoredCandidateProtectedLocalKeys,withProtectedLocalKeys,type LocalKeyConfiguration} from "../../src/server/bootstrap/keys";
import {bindTrustedDesktopOwnerInteraction,createTrustedOwnerEnrollmentEntry} from "../../src/server/bootstrap/owner-enrollment";
import {createProtectedRootWriterAdmission,createSelectedWriterAdmission} from "../../src/server/bootstrap/writer-admission";
import {createProtectedRestoredHistory} from "../../src/server/backup/protected-history";
import {acquireRuntimeOwnership} from "../../src/server/hosting/ownership";
import {openAuthorizationGateway,withAdminMaintenanceSource} from "../../src/server/auth/gateway";
import {createTestCustody} from "../../src/server/backup/crypto";
import {createProtectedArchive41} from "../../src/server/backup/service";
import {storage} from "../../src/server/backup/storage";
import {bindTrustedProtectedRestoreInteraction,withProtectedRestore41,completeProtectedRestore41} from "../../src/server/bootstrap/restore41";
import {initializeNativeRecoveryAttempts,verifyProtectedRestoreInheritedCredentials,selectAuthenticatedProtectedRestore41} from "../../src/server/bootstrap/restore41-authentication";
import {bindTrustedCandidateSelectionInteraction} from "../../src/server/bootstrap/candidate-selection";
import {createDesktopTestTls} from "../../src/server/desktop/tls";
import {resolveDesktopCurrent} from "../../src/server/desktop/current";
import {prepareDesktopBackup} from "../../src/server/desktop/backup-configuration";
import type {AuthorizationConfiguration} from "../../src/server/auth/types";
const base=path.resolve("test-results/sqlite-b1b-part1/r2-"+randomUUID().slice(0,8));mkdirSync(base,{recursive:true});
const currentAdmin=randomBytes(24).toString("base64url"),passwords={ADMIN:randomBytes(24).toString("base64url"),SALESPERSON:randomBytes(24).toString("base64url")},migrations=path.resolve("src/server/db/migrations");
let root:LocalKeyConfiguration;const report={status:"IN_PROGRESS",checks:[] as string[]};const record=(s:string)=>{report.checks.push(s);writeFileSync(path.join(base,"progress.json"),JSON.stringify(report,null,2));};
beforeAll(async()=>{
 const sources=["src/server/auth/login-attempts.ts","src/server/auth/recovery-attempt-journal.ts","src/server/bootstrap/restore41.ts","src/server/bootstrap/restore41-authentication.ts","src/server/desktop/current.ts","src/server/desktop/backup-configuration.ts","src/server/desktop/recovery.ts","tests/integration/phase2-recovery-candidate.test.ts"].map(p=>({path:p,sha256:createHash("sha256").update(readFileSync(p)).digest("hex")}));writeFileSync(path.join(base,"source-manifest.json"),JSON.stringify({sources,productionActivation:false},null,2));
 const directory=path.join(base,randomUUID()),data=path.join(directory,"d");mkdirSync(directory);await storage(directory,"initialize");mkdirSync(data);await storage(data,"initialize");
 root={directory,database:{directory:data,filename:"shop.sqlite3",mode:"test",create:false},migrationsDirectory:migrations};const db=openDatabase({...root.database,create:true});try{applyMigrations(db,migrations);applySalesMigration36(db);applyReturnsMigration37(db);applyExpensesMigration38(db);applyInvoicesMigration39(db);applyCashMigration40(db);applySettingsMigration41(db);}finally{db.close();}
 const tls=await createDesktopTestTls();try{await createProtectedLocalKeys(root,tls);}finally{Object.values(tls).forEach(b=>b.fill(0));}
 await createTrustedOwnerEnrollmentEntry(root,bindTrustedDesktopOwnerInteraction({confirm:async()=>"CONFIRM_FIRST_ENROLLMENT",readPasswords:async()=>passwords})).enroll();record("genuine fresh protected schema41 enrollment");
});
test("genuine fenced candidate requires inherited roles, rejects fake/expired/replayed proof, selects exact CURRENT and authenticates a fresh backup namespace",async()=>{
 const keyRoot=path.join(base,"k");mkdirSync(keyRoot);const custody=await createTestCustody(keyRoot),archiveRoot=path.join(base,"a");mkdirSync(archiveRoot);
 let authorization!:AuthorizationConfiguration;await withProtectedLocalKeys(root,async keys=>{authorization={database:root.database,migrationsDirectory:migrations,signingSecrets:{...keys.signingSecrets},origins:{ADMIN:"https://localhost:49891",SALESPERSON:"https://127.0.0.1:49891"},sessionLifetimeSeconds:600};});
 const lease=await acquireRuntimeOwnership(path.join(root.database.directory,root.database.filename));let target!:LocalKeyConfiguration;
 try{
  const admission=await createProtectedRootWriterAdmission(root,lease,41),archive=await createProtectedArchive41(custody,root.database,archiveRoot,admission),g=await openAuthorizationGateway({...authorization,protectedAdmission:admission},41),operation={operationId:randomUUID(),purpose:"RESTORE41" as const},directory=path.join(base,operation.operationId);mkdirSync(directory);
  const originalAdmin=await g.issueAdminSession(await g.verifyAdminPassword(passwords.ADMIN)),adminRequest=new Request(authorization.origins.ADMIN+"/private",{headers:{origin:authorization.origins.ADMIN,cookie:originalAdmin.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")}});
  const context=await g.withAdminTransaction(adminRequest,tx=>settingsContext(tx));await g.rotateAdminPassword(adminRequest,await g.verifyAdminPassword(passwords.ADMIN),currentAdmin,{key:randomUUID(),context});record("source Admin changed after backup through genuine audited rotation; archive retains inherited password");
  const tls=await createDesktopTestTls();try{
   await withAdminMaintenanceSource(g,await g.verifyAdminPassword(currentAdmin),lease,operation,async(source,bootstrap)=>{
    await expect(acquireRuntimeOwnership(path.join(root.database.directory,root.database.filename))).rejects.toThrow();
    await initializeNativeRecoveryAttempts(root,root,source,bootstrap,operation.operationId);
    await withProtectedRestore41(root,root,source,bootstrap,custody,archive.archive,directory,operation.operationId,bindTrustedProtectedRestoreInteraction({confirm:async()=>"CONFIRM_SEPARATE_TEST_RESTORE41"}),async(candidate,destination)=>{
     target=destination;await createRestoredCandidateProtectedLocalKeys(destination,tls,candidate);await completeProtectedRestore41(candidate);record("known committed candidate with fresh protected TLS; concurrent writer refused");
     const interaction=bindTrustedCandidateSelectionInteraction({confirm:async request=>{expect(request.operationId).toBe(operation.operationId);expect(request.productionActivation).toBe(false);return "CONFIRM_TEST_WRITER_SELECTION";}});
     await expect(selectAuthenticatedProtectedRestore41(candidate,{},interaction)).rejects.toThrow();await expect(verifyProtectedRestoreInheritedCredentials(candidate,{...passwords,ADMIN:currentAdmin})).rejects.toThrow();record("counterfeit proof and wrong inherited password refused");
     const expired=await verifyProtectedRestoreInheritedCredentials(candidate,passwords),wall=Date.now(),deadline=performance.now()+5100;while(performance.now()<deadline){/* Hold this worker so timer delivery is deliberately late. */}expect(expired.signal.aborted).toBe(false);const wallClock=vi.spyOn(Date,"now").mockReturnValue(wall-60000);try{await expect(selectAuthenticatedProtectedRestore41(candidate,expired,interaction)).rejects.toThrow();}finally{wallClock.mockRestore();}record("genuine both-role proof expires by monotonic deadline despite wall rollback and delayed timer");
     const proof=await verifyProtectedRestoreInheritedCredentials(candidate,passwords);expect(await selectAuthenticatedProtectedRestore41(candidate,proof,interaction)).toMatchObject({status:"RECORDED_CURRENT",generation:"1",sourceRetired:true});await expect(selectAuthenticatedProtectedRestore41(candidate,proof,interaction)).rejects.toThrow();record("exact one-use authenticated CURRENT selected; replay refused");
    });
   });
  }finally{Object.values(tls).forEach(b=>b.fill(0));await g.close();}
 }finally{await lease.close();}
 const current=await resolveDesktopCurrent(root);expect(current.active).toEqual(target);expect(current.backupName).toBe("b1");
 await withProtectedLocalKeys(target,async keys=>{
  const auth={...authorization,database:target.database,signingSecrets:keys.signingSecrets};let reads=0;await prepareDesktopBackup(root,current,base,auth,async()=>{reads++;return passwords.ADMIN;});expect(reads).toBe(1);await prepareDesktopBackup(root,current,base,auth,async()=>{throw Error("Existing config must reopen, not recreate");});record("fresh authenticated b1/e1 namespace using original custody; protected config reopens");
  const held=await acquireRuntimeOwnership(path.join(target.database.directory,target.database.filename));try{await expect(createProtectedRootWriterAdmission(root,held,41)).rejects.toThrow();const admission=await createSelectedWriterAdmission(root,target,held),g=await openAuthorizationGateway({...auth,protectedAdmission:admission,protectedHistory:createProtectedRestoredHistory(admission,target.database)},41);try{expect((await g.issueAdminSession(await g.verifyAdminPassword(passwords.ADMIN))).status).toBe(200);expect((await g.issueSalespersonSession(await g.verifySalespersonPassword(passwords.SALESPERSON))).status).toBe(200);}finally{await g.close();}}finally{await held.close();}
 });record("retired original writer refused; fresh normal Admin and Staff sessions on selected database");report.status="PASS";writeFileSync(path.join(base,"result.json"),JSON.stringify(report,null,2));
},600000);