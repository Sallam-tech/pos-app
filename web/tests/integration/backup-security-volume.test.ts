import {test,expect} from "vitest";
import {mkdtempSync,writeFileSync} from "node:fs";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {retainedBook,hash} from "../helpers/admin-products-settings-volume";
import {openDatabase} from "../../src/server/db/connection";
import {applySettingsMigration41} from "../../src/server/db/settings-migrate";
import {createTestCustody} from "../../src/server/backup/crypto";
import {createTestArchive,authorizeTestRestore,restoreTestArchive} from "../../src/server/backup/service";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {signed} from "../helpers/returns-fixture";
import {createReportsService} from "../../src/server/reports/service";
test("retained 1k/10k/50k originals remain unchanged while new TEST41 copies encrypt, restore, login and reconcile",async()=>{
 const results:unknown[]=[];
 for(const n of [1000,10000,50000]){
  const f=await retainedBook("expense",n),database=f.config.authorization.database,base=path.dirname(database.directory),dir=(name:string)=>mkdtempSync(path.join(base,name));
  const db=openDatabase(database);try{expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(40));applySettingsMigration41(db);}finally{db.close();}
  expect(hash(f.source)).toBe(f.sourceHash);
  const config={...f.config.authorization,sessionLifetimeSeconds:1800},g=await openAuthorizationGateway(config,41);
  let closed=false;
  try{
   const response=await g.issueAdminSession(await g.verifyAdminPassword(f.adminPassword)),request=signed(config,"ADMIN",response.headers.getSetCookie());
   const period={from:"2000-01-01",to:f.date,asOf:String(Date.now())},before=await createReportsService(g,41).overview(request,period);
   const custody=await createTestCustody(dir("volume-backup-vault-")),started=performance.now();
   const archive=await createTestArchive(custody,database,dir("volume-backup-")),backupMs=Math.round(performance.now()-started);
   const target=dir("volume-restore-"),authority=await authorizeTestRestore(g,request,f.adminPassword,archive.archive,target),restoreStarted=performance.now();
   const restored=await restoreTestArchive(custody,authority,archive.archive,target),restoreMs=Math.round(performance.now()-restoreStarted);
   await g.close();closed=true;
   const recoveredConfig={...config,database:restored.database,restoreProof:restored.proof},recovered=await openAuthorizationGateway(recoveredConfig,41);
   try{
    const admin=signed(recoveredConfig,"ADMIN",(await recovered.issueAdminSession(await recovered.verifyAdminPassword(f.adminPassword))).headers.getSetCookie());
    const after=await createReportsService(recovered,41).overview(admin,period);
    const economics=(v:unknown):unknown=>Array.isArray(v)?v.map(economics):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).filter(([k])=>k!=="snapshot"&&k!=="capturedAtMs").map(([k,x])=>[k,economics(x)])):v;
    expect(economics(after)).toEqual(economics(before));
   }finally{await recovered.close();}
   expect(hash(f.source)).toBe(f.sourceHash);
   results.push({n,sourceUnchanged:true,backupMs,restoreMs,bytes:archive.manifest.databaseBytes,encryptedAuthenticated:true,exactFinancialReconciliation:true,productionActivation:false});
   writeFileSync(path.resolve("test-results/backup-security-preflight-20261114/volume-progress.json"),JSON.stringify(results,null,2));
  }finally{if(!closed)await g.close();}
 }
 expect(results).toHaveLength(3);
},900000);
