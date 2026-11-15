import { createPrivateKey, randomBytes, randomUUID } from "node:crypto";
import { execFile, fork } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { openDatabase } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { applySalesMigration36 } from "../../src/server/db/sales-migrate";
import { applyReturnsMigration37 } from "../../src/server/db/returns-migrate";
import { applyExpensesMigration38 } from "../../src/server/db/expenses-migrate";
import { applyInvoicesMigration39 } from "../../src/server/db/invoices-migrate";
import { applyCashMigration40 } from "../../src/server/db/cash-migrate";
import { applySettingsMigration41 } from "../../src/server/db/settings-migrate";
import { createProtectedLocalKeys, withProtectedLocalKeys, type LocalKeyConfiguration } from "../../src/server/bootstrap/keys";
import { bindTrustedDesktopOwnerInteraction, createTrustedOwnerEnrollmentEntry } from "../../src/server/bootstrap/owner-enrollment";
import { createProtectedRootWriterAdmission, createImportedRootWriterAdmission, createImportedPreparationAdmission, assertProtectedWriterAdmission } from "../../src/server/bootstrap/writer-admission";
import { createProtectedRestoredHistory } from "../../src/server/backup/protected-history";
import { acquireRuntimeOwnership } from "../../src/server/hosting/ownership";
import { openAuthorizationGateway, withAdminMaintenanceSource } from "../../src/server/auth/gateway";
import { bindTrustedImportedRootInteraction, withImportedRootPreparation41, completeImportedRoot41, quarantineImportedRoot41, finalizeImportedRoot41, readImportedRootProvenance } from "../../src/server/bootstrap/imported-root41";
import { createTestCustody, importTestPortableRecovery, custodyMetadata, withTestRecoveryMaterial, signProtectedEvidence, type BackupCustody } from "../../src/server/backup/crypto";
import { createProtectedArchive41 } from "../../src/server/backup/service";
import { inspectPortableOrigin41, validatePortableOriginPacket, type PortableOriginPacket41 } from "../../src/server/bootstrap/portable-origin41";
import { storage } from "../../src/server/backup/storage";
import { fingerprint, openProofDatabase } from "../../src/server/backup/snapshot";
import { enrollmentDigest } from "../../src/server/bootstrap/database";
import type { AuthorizationConfiguration, AuthorizationGateway } from "../../src/server/auth/types";
import type { LocalTlsMaterial } from "../../src/server/hosting/https";
const fault=vi.hoisted(()=>({blockedRoot:"",oldRootAttempts:0,lostKind:"",published:0}));
vi.mock("../../src/server/bootstrap/windows",async original=>{const actual=await original<typeof import("../../src/server/bootstrap/windows")>();return {...actual,windowsProtection:async(m:Readonly<Record<string,string>>)=>{
 if(fault.blockedRoot&&m.directory?.toLowerCase().startsWith(fault.blockedRoot)){fault.oldRootAttempts++;throw new actual.BootstrapRejected();}
 const result=await actual.windowsProtection(m);if(m.operation==="candidate-append"){const kind=JSON.parse(Buffer.from(m.payload,"base64").toString()).kind;if(kind==="CURRENT")fault.published++;if(fault.lostKind===kind){fault.lostKind="";throw new actual.BootstrapRejected();}}return result;
}};});
const root=path.resolve("test-results/sqlite-b1b-part1");mkdirSync(root,{recursive:true});const run=mkdtempSync(path.join(root,"imported-root41-")),migrations=path.resolve("src/server/db/migrations");
let originalTls:LocalTlsMaterial,newTls:LocalTlsMaterial,thirdTls:LocalTlsMaterial;
let source:LocalKeyConfiguration,sourceAuth:AuthorizationConfiguration,sourceGateway:AuthorizationGateway,sourceRuntime:Awaited<ReturnType<typeof acquireRuntimeOwnership>>,custody:BackupCustody,portable:BackupCustody,packet:PortableOriginPacket41,archive:string,identity:string;
const passwords={ADMIN:randomBytes(24).toString("base64url"),SALESPERSON:randomBytes(24).toString("base64url")};
let sourceState:string,adminRequest:Request,staffRequest:Request,saleId:string,receipt:unknown,imported:LocalKeyConfiguration,oldSession:Request;
const proofState=(config:LocalKeyConfiguration,omitAttempts=false)=>{const db=openProofDatabase(path.join(config.database.directory,config.database.filename));try{const f=fingerprint(db);return enrollmentDigest({...f,tables:f.tables.filter(t=>!omitAttempts||t.name!=="auth_login_attempts")});}finally{db.close();}};
const freshDirectory=()=>{const d=path.join(run,randomUUID());mkdirSync(d);return d;};
const trusted=()=>bindTrustedImportedRootInteraction({confirm:async()=>"CONFIRM_TEST_OLD_DEVICE_FENCED"});
async function keysFor(config:LocalKeyConfiguration){let secrets!:AuthorizationConfiguration["signingSecrets"],tls!:LocalTlsMaterial;await withProtectedLocalKeys(config,async k=>{secrets={...k.signingSecrets};tls={key:Buffer.from(k.tls.key),certificate:Buffer.from(k.tls.certificate),trustAnchor:Buffer.from(k.tls.trustAnchor)};});return {secrets,tls};}
async function openImported(config:LocalKeyConfiguration,runtime:unknown,recovery=false){const admission=await createImportedRootWriterAdmission(config,runtime,recovery),history=createProtectedRestoredHistory(admission,config.database),keys=await keysFor(config);const authorization={...sourceAuth,database:config.database,signingSecrets:keys.secrets,protectedAdmission:admission,protectedHistory:history};return {gateway:await openAuthorizationGateway(authorization,41),authorization,admission,history};}
async function login(g:AuthorizationGateway,role:"ADMIN"|"SALESPERSON",origins=sourceAuth.origins){const r=role==="ADMIN"?await g.issueAdminSession(await g.verifyAdminPassword(passwords.ADMIN)):await g.issueSalespersonSession(await g.verifySalespersonPassword(passwords.SALESPERSON));return new Request(origins[role]+"/private",{method:"POST",headers:{origin:origins[role],cookie:r.headers.getSetCookie().map(x=>x.split(";")[0]).join("; ")}});}
beforeAll(async()=>{
 const dir=path.join(run,"tls");mkdirSync(dir);const passphrase=randomBytes(36).toString("base64url"),execute=promisify(execFile);const ssl=(...args:string[])=>{const child=execute("C:\\Program Files\\Git\\usr\\bin\\openssl.exe",args,{cwd:dir,windowsHide:true});child.child.stdin!.end(passphrase);return child;};
 await ssl("req","-x509","-newkey","rsa:2048","-passout","stdin","-days","1","-subj","/CN=POS-IMPORTED-ROOT-TEST","-addext","basicConstraints=critical,CA:TRUE","-keyout","ca.key","-out","ca.pem");
 writeFileSync(path.join(dir,"leaf.ext"),"basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n");
 const make=async(name:string)=>{await ssl("req","-newkey","rsa:2048","-passout","stdin","-subj","/CN=localhost","-keyout",name+".key","-out",name+".csr");await ssl("x509","-req","-in",name+".csr","-CA","ca.pem","-CAkey","ca.key","-passin","stdin","-CAcreateserial","-days","1","-sha256","-extfile","leaf.ext","-out",name+".pem");return {key:Buffer.from(createPrivateKey({key:readFileSync(path.join(dir,name+".key")),passphrase}).export({type:"pkcs8",format:"pem"})),certificate:readFileSync(path.join(dir,name+".pem")),trustAnchor:readFileSync(path.join(dir,"ca.pem"))};};
 originalTls=await make("source");newTls=await make("imported");thirdTls=await make("descendant");
});
afterAll(async()=>{await sourceGateway?.close().catch(()=>{});await sourceRuntime?.close().catch(()=>{});for(const tls of [originalTls,newTls,thirdTls])if(tls)for(const value of Object.values(tls))value.fill(0);});
it("imported root prerequisite enrolls disposable41 and records exact sale cash stock and historical Settings",async()=>{
 const directory=freshDirectory(),data=path.join(directory,"data");await storage(directory,"initialize");mkdirSync(data);await storage(data,"initialize");source={directory,database:{directory:data,filename:"test.sqlite3",mode:"test",create:false},migrationsDirectory:migrations};
 const db=openDatabase({...source.database,create:true});try{applyMigrations(db,migrations);applySalesMigration36(db);applyReturnsMigration37(db);applyExpensesMigration38(db);applyInvoicesMigration39(db);applyCashMigration40(db);applySettingsMigration41(db);}finally{db.close();}
 await createProtectedLocalKeys(source,originalTls);await createTrustedOwnerEnrollmentEntry(source,bindTrustedDesktopOwnerInteraction({confirm:async r=>r.action==="FIRST_ENROLLMENT"?"CONFIRM_FIRST_ENROLLMENT":"CONFIRM_MATCHING_COMMITTED_ENROLLMENT",readPasswords:async()=>passwords})).enroll();
 sourceRuntime=await acquireRuntimeOwnership(path.join(data,"test.sqlite3"));sourceAuth={database:source.database,migrationsDirectory:migrations,signingSecrets:(await keysFor(source)).secrets,origins:{ADMIN:"https://localhost:49993",SALESPERSON:"https://127.0.0.1:49993"},sessionLifetimeSeconds:600,protectedAdmission:await createProtectedRootWriterAdmission(source,sourceRuntime,41)};sourceGateway=await openAuthorizationGateway(sourceAuth,41);adminRequest=await login(sourceGateway,"ADMIN");staffRequest=await login(sourceGateway,"SALESPERSON");oldSession=adminRequest;
 const {createInventoryService}=await import("../../src/server/inventory/service"),{createSalesService}=await import("../../src/server/sales/service"),{createCashService}=await import("../../src/server/cash/service"),{createSettingsService}=await import("../../src/server/settings/service");
 const product=await createInventoryService(sourceGateway,41).createProduct(adminRequest,{requestKey:randomUUID(),name:"TEST independent root",unit:"PACK",buyingPricePaisa:"12300",sellingPricePaisa:"15000",sellingActive:true,openingQuantity:"10",lowStockThreshold:"1"});
 const settings=createSettingsService(sourceGateway,"TEST SHOP"),current=await settings.current(adminRequest,"ADMIN");if(!("context" in current)||typeof current.context!=="string")throw Error();await settings.save(adminRequest,passwords.ADMIN,randomUUID(),current.context,{expectedRevision:"0",settings:{shopName:"TEST original portable shop",address:"",phone:"",footer:"",receiptLayout:"ordinary",currency:"PKR",timezone:"Asia/Karachi"},reason:"TEST immutable origin"});
 const cash=createCashService(sourceGateway,"TEST SHOP",41),ctx=(await cash.context(adminRequest)).context,date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const action=async(kind:import("../../src/server/cash/service").CashAction,input:unknown)=>{const key=randomUUID();await cash.prepare(adminRequest,passwords.ADMIN,key,ctx,kind,input);const result=await cash.execute(adminRequest,key,ctx,"ADMIN_VERIFIED_CASH_FACTS");if(result.state!=="COMMITTED")throw Error();return result.result as Record<string,unknown>;};const count=await action("START_COUNT",{businessDate:date,evidence:"TEST declaration"}),recorded=await action("RECORD_COUNT",{sessionId:count.sessionId,actualPaisa:"100000",evidence:"TEST opening"});await action("OPEN_ANCHOR",{countId:recorded.countId,untouchedOpening:"NO",evidence:"TEST preserve unknown history"});
 const sales=createSalesService(sourceGateway,"TEST SHOP",41),key=randomUUID(),command={requestKey:key,context:(await sales.context(staffRequest)).context,lines:[{productId:product.product.id,quantity:"2",unitPricePaisa:"15000",discountPercent:"0"}],cashPaisa:"30000",cashDate:date,customerName:"",customerPhone:""};await cash.admit(staffRequest,"SALESPERSON",{kind:"SALE",key,input:command});receipt=await sales.create(staffRequest,command);saleId=(receipt as {id:string}).id;
 const keys=path.join(run,"custody");mkdirSync(keys);custody=await createTestCustody(keys);
});
it("protected backup publishes signed portable origin then original DPAPI authority becomes unavailable",async()=>{
 const directory=path.join(run,"archive");mkdirSync(directory);const result=await createProtectedArchive41(custody,source.database,directory,sourceAuth.protectedAdmission!);archive=result.archive;packet=await inspectPortableOrigin41(custody,archive);expect(packet.origin.manifest.schema).toBe(41);expect(packet.origin.selectedGeneration).toBe("ROOT");
 await withTestRecoveryMaterial(custody,async b=>{identity=b;portable=await importTestPortableRecovery(b,custodyMetadata(custody));});expect(()=>signProtectedEvidence(portable,packet.origin)).toThrow();
 await sourceGateway.close();await sourceRuntime.close();sourceState=proofState(source);fault.blockedRoot=source.directory.toLowerCase();
});
it("B or JSON or a substituted signer cannot issue archive origin or preparation authority",async()=>{
 expect(()=>validatePortableOriginPacket(portable,{...packet,origin:{...packet.origin,selectedGeneration:"2"}})).toThrow();const wrong=await importTestPortableRecovery(identity,{...custodyMetadata(custody),signingPublic:(await import("node:crypto")).generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"}).toString()});expect(()=>validatePortableOriginPacket(wrong,packet)).toThrow();
 await expect(createImportedPreparationAdmission({} as Parameters<typeof createImportedPreparationAdmission>[0],{})).rejects.toThrow();const directory=freshDirectory();await expect(withImportedRootPreparation41(portable,archive,{},directory,migrations,newTls,trusted(),async()=>{})).rejects.toThrow();expect(readdirSync(directory)).toEqual([]);expect(fault.oldRootAttempts).toBe(0);
});
it("import preparation rejects original TLS private-key reuse and missing explicit device fencing",async()=>{
 await expect(withImportedRootPreparation41(portable,archive,packet,freshDirectory(),migrations,originalTls,trusted(),async()=>{})).rejects.toThrow();await expect(withImportedRootPreparation41(portable,archive,packet,freshDirectory(),migrations,newTls,bindTrustedImportedRootInteraction({confirm:async()=>"CANCEL"}),async()=>{})).rejects.toThrow();expect(proofState(source)).toBe(sourceState);expect(fault.oldRootAttempts).toBe(0);
});
it("independent B import needs fresh existing Admin plus separate fence and publishes distinct known CURRENT",async()=>{
 await withImportedRootPreparation41(portable,archive,packet,freshDirectory(),migrations,newTls,trusted(),async(candidate,config,runtime)=>{
  imported=config;expect(proofState(config,true)).toBe(proofState(source,true));const admission=await createImportedPreparationAdmission(candidate,runtime),history=createProtectedRestoredHistory(admission,config.database),keys=await keysFor(config);expect(keys.secrets.ADMIN).not.toBe(sourceAuth.signingSecrets.ADMIN);
  const authorization={...sourceAuth,database:config.database,signingSecrets:keys.secrets,protectedAdmission:admission,protectedHistory:history},g=await openAuthorizationGateway(authorization,41);
  try{await expect(g.verifySalespersonPassword(passwords.SALESPERSON)).rejects.toThrow();await expect(g.issueAdminSession({})).rejects.toThrow();await expect(g.withAdminTransaction(adminRequest,async()=>"BAD")).rejects.toThrow();
   const proof=await g.verifyAdminPassword(passwords.ADMIN);await withAdminMaintenanceSource(g,proof,runtime,{operationId:path.basename(config.directory),purpose:"RESTORE41"},async(source,lease)=>{
    await expect(completeImportedRoot41({} as typeof candidate,source,lease)).rejects.toThrow();expect(await completeImportedRoot41(candidate,source,lease)).toEqual({status:"IMPORTED_ROOT_CURRENT",generation:"1",productionActivation:false,physicalAcceptance:"NOT_WITNESSED"});await expect(completeImportedRoot41(candidate,source,lease)).rejects.toThrow();
   });
  }finally{await g.close();}
 });
 const continuation=path.join(run,"focused-continuation");mkdirSync(continuation);await storage(continuation,"initialize");const bytes=Buffer.from(JSON.stringify({format:"POS_DISPOSABLE_IMPORTED_TEST_CONTINUATION_V1",imported,passwords,saleId,receipt,source,sourceState}));try{await storage(continuation,"seal",{value:bytes.toString("base64")});}finally{bytes.fill(0);}console.info("IMPORTED_TEST_ENCRYPTED_CONTINUATION",continuation);
 expect(proofState(source)).toBe(sourceState);expect(fault.oldRootAttempts).toBe(0);
});
it("actual separate process reopens imported root without original configuration and requires both role passwords",async()=>{
 const child=fork(path.resolve("tests/helpers/imported-root-probe.mjs"),[],{execArgv:["--experimental-transform-types","--disable-warning=ExperimentalWarning","--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"],env:{...process.env,NODE_ENV:"test"},silent:true,windowsHide:true});const response=once(child,"message"),exited=once(child,"exit");child.send({action:"reopen-import",config:imported,passwords});expect((await response)[0]).toEqual({status:"IMPORTED_ROOT_REOPENED",roles:["ADMIN","SALESPERSON"],productionActivation:false});expect((await exited)[0]).toBe(0);
});
it("imported current rejects source sessions and preserves receipt financial rows and historical prefix in a new namespace",async()=>{
 const runtime=await acquireRuntimeOwnership(path.join(imported.database.directory,imported.database.filename));let g:AuthorizationGateway|undefined;
 try{const opened=await openImported(imported,runtime);g=opened.gateway;await expect(g.authorizeAdmin(oldSession)).rejects.toThrow();const request=await login(g,"ADMIN"),staff=await login(g,"SALESPERSON");
  const {createSalesService}=await import("../../src/server/sales/service"),{createSettingsService}=await import("../../src/server/settings/service");expect(await createSalesService(g,"TEST SHOP",41).get(staff,saleId)).toEqual(receipt);const catalog=await createSalesService(g,"TEST SHOP",41).catalog(staff);expect(JSON.stringify(catalog)).not.toMatch(/buyingPrice|quantity|profit/i);
  const settings=createSettingsService(g,"TEST SHOP"),current=await settings.current(request,"ADMIN");if(!("context" in current)||typeof current.context!=="string")throw Error();await settings.save(request,passwords.ADMIN,randomUUID(),current.context,{expectedRevision:"1",settings:{shopName:"TEST imported current",address:"",phone:"",footer:"",receiptLayout:"ordinary",currency:"PKR",timezone:"Asia/Karachi"},reason:"TEST new namespace"});
  expect((await readImportedRootProvenance(imported)).kind).toBe("IMPORTED_ROOT");expect(fault.oldRootAttempts).toBe(0);
 }finally{await g?.close();await runtime.close();}
});
let killed:LocalKeyConfiguration,killedState:string;
it("actual child death after imported SQLite copy but before acknowledgement grants no preparation or writer",async()=>{
 const directory=freshDirectory(),child=fork(path.resolve("tests/helpers/imported-root-probe.mjs"),[],{execArgv:["--experimental-transform-types","--disable-warning=ExperimentalWarning","--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"],env:{...process.env,NODE_ENV:"test"},silent:true,windowsHide:true});const response=once(child,"message");child.send({action:"pause-import-copy",identity,trust:custodyMetadata(custody),archive,packet,directory,migrations,tls:Object.fromEntries(Object.entries(newTls).map(([k,v])=>[k,v.toString("base64")]))});expect((await response)[0]).toEqual({status:"ACTUAL_IMPORTED_COPY_UNACKNOWLEDGED"});const exited=once(child,"exit");child.kill();await exited;
 killed={directory,database:{directory,filename:"imported41.sqlite3",mode:"test",create:false},migrationsDirectory:migrations};killedState=proofState(killed);const runtime=await acquireRuntimeOwnership(path.join(directory,"imported41.sqlite3"));try{await expect(createImportedRootWriterAdmission(killed,runtime)).rejects.toThrow();await expect(createImportedRootWriterAdmission(killed,runtime,true)).rejects.toThrow();}finally{await runtime.close();}
});
it("restart permanently quarantines unknown imported copy and retained orphan; native late completion stays fenced",async()=>{
 const runtime=await acquireRuntimeOwnership(path.join(killed.database.directory,killed.database.filename));try{const root=await readImportedRootProvenance(killed),intent=root.ledger.records[0],orphan=path.join(killed.directory,"protected-identity","candidate-authority","000002."+intent.operationId+".committed.dpapi."+randomUUID()+".pending");writeFileSync(orphan,Buffer.alloc(0));
  expect(await quarantineImportedRoot41(killed,runtime,bindTrustedImportedRootInteraction({confirm:async()=>"CONFIRM_PERMANENT_NO_ADMISSION"}))).toMatchObject({status:"QUARANTINED_NO_ADMISSION",sqlOutcome:"UNKNOWN"});expect(readFileSync(orphan)).toHaveLength(0);expect(proofState(killed)).toBe(killedState);await expect(createImportedRootWriterAdmission(killed,runtime)).rejects.toThrow();
  const {candidateLedgerContext,candidateRecordBytes,candidateRecordDigest}=await import("../../src/server/bootstrap/candidate-records"),{windowsProtection}=await import("../../src/server/bootstrap/windows");await expect(windowsProtection({...candidateLedgerContext(root.vault,root.originalAnchorDigest),operation:"candidate-append",payload:candidateRecordBytes({...intent,kind:"COMMITTED",sequence:"2",previousDigest:candidateRecordDigest(intent),intentDigest:candidateRecordDigest(intent),targetStateDigest:enrollmentDigest(packet.origin.manifest.fingerprint),targetVaultDigest:root.vault.vaultDigest,generation:null}).toString("base64")})).rejects.toThrow();
 }finally{await runtime.close();}expect(proofState(source)).toBe(sourceState);
});
let lostCompletion:LocalKeyConfiguration;
it("lost native imported COMMITTED reply retains known SQL evidence and denies automatic current",async()=>{
 fault.lostKind="COMMITTED";await expect(withImportedRootPreparation41(portable,archive,packet,freshDirectory(),migrations,newTls,trusted(),async(candidate,config,runtime)=>{lostCompletion=config;const admission=await createImportedPreparationAdmission(candidate,runtime),history=createProtectedRestoredHistory(admission,config.database),g=await openAuthorizationGateway({...sourceAuth,database:config.database,signingSecrets:(await keysFor(config)).secrets,protectedAdmission:admission,protectedHistory:history},41);try{const proof=await g.verifyAdminPassword(passwords.ADMIN);await withAdminMaintenanceSource(g,proof,runtime,{operationId:path.basename(config.directory),purpose:"RESTORE41"},async(source,lease)=>{await completeImportedRoot41(candidate,source,lease);});}finally{await g.close().catch(()=>{});}})).rejects.toThrow();
 const runtime=await acquireRuntimeOwnership(path.join(lostCompletion.database.directory,lostCompletion.database.filename));try{await expect(createImportedRootWriterAdmission(lostCompletion,runtime)).rejects.toThrow();expect((await readImportedRootProvenance(lostCompletion)).ledger.records.at(-1)?.kind).toBe("COMMITTED");}finally{await runtime.close();}
});
it("known imported COMMITTED restart needs new Admin and fence and resolves lost CURRENT by readback without SQL replay",async()=>{
 const runtime=await acquireRuntimeOwnership(path.join(lostCompletion.database.directory,lostCompletion.database.filename));let g:AuthorizationGateway|undefined;const before=proofState(lostCompletion,true),published=fault.published;
 try{const opened=await openImported(lostCompletion,runtime,true);g=opened.gateway;await expect(g.verifySalespersonPassword(passwords.SALESPERSON)).rejects.toThrow();fault.lostKind="CURRENT";const proof=await g.verifyAdminPassword(passwords.ADMIN);await expect(withAdminMaintenanceSource(g,proof,runtime,{operationId:path.basename(lostCompletion.directory),purpose:"RESTORE41"},async(source,lease)=>finalizeImportedRoot41(lostCompletion,source,lease,trusted()))).rejects.toThrow();expect(fault.published).toBe(published+1);expect(proofState(lostCompletion,true)).toBe(before);
 }finally{await g?.close().catch(()=>{});await runtime.close();}
 const resumed=await acquireRuntimeOwnership(path.join(lostCompletion.database.directory,lostCompletion.database.filename));try{const admission=await createImportedRootWriterAdmission(lostCompletion,resumed);expect(assertProtectedWriterAdmission(admission,lostCompletion.database)).toMatchObject({generation:"1",maintenanceOnly:false});expect(fault.published).toBe(published+1);}finally{await resumed.close();}
});
it("imported provenance tampering stales a genuine admission and denies restart without touching SQL",async()=>{
 const runtime=await acquireRuntimeOwnership(path.join(lostCompletion.database.directory,lostCompletion.database.filename)),before=proofState(lostCompletion);try{const admission=await createImportedRootWriterAdmission(lostCompletion,runtime),file=path.join(lostCompletion.directory,"protected-identity","imported-root","restore.dpapi"),bytes=readFileSync(file);bytes[bytes.length-1]^=1;writeFileSync(file,bytes);expect(()=>assertProtectedWriterAdmission(admission,lostCompletion.database,undefined,true)).toThrow();await expect(createImportedRootWriterAdmission(lostCompletion,runtime)).rejects.toThrow();expect(proofState(lostCompletion)).toBe(before);}finally{await runtime.close();}
});
