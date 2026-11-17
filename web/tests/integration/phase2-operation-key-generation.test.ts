import {test,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {mkdirSync,renameSync,readFileSync,writeFileSync} from "node:fs";
import path from "node:path";
import {openDesktopOperationKeys} from "../../src/server/desktop/operation-keys";
import {createProtectedLocalKeys,type LocalKeyConfiguration} from "../../src/server/bootstrap/keys";
import {createDesktopTestTls} from "../../src/server/desktop/tls";
import {storage} from "../../src/server/backup/storage";
import {openDatabase} from "../../src/server/db/connection";
import {applyMigrations} from "../../src/server/db/migrate";
import {applySalesMigration36} from "../../src/server/db/sales-migrate";
import {applyReturnsMigration37} from "../../src/server/db/returns-migrate";
import {applyExpensesMigration38} from "../../src/server/db/expenses-migrate";
import {applyInvoicesMigration39} from "../../src/server/db/invoices-migrate";
import {applyCashMigration40} from "../../src/server/db/cash-migrate";
import {applySettingsMigration41} from "../../src/server/db/settings-migrate";
import {acquireRuntimeOwnership} from "../../src/server/hosting/ownership";
const base=path.resolve("test-results/sqlite-b1b-part1/keygen-"+randomUUID().slice(0,8));mkdirSync(base,{recursive:true});
async function fresh(){
 const directory=path.join(base,randomUUID()),data=path.join(directory,"d");mkdirSync(directory);await storage(directory,"initialize");mkdirSync(data);await storage(data,"initialize");
 const config:LocalKeyConfiguration={directory,database:{directory:data,filename:"shop.sqlite3",mode:"test",create:false},migrationsDirectory:path.resolve("src/server/db/migrations")};
 const db=openDatabase({...config.database,create:true});try{applyMigrations(db,config.migrationsDirectory);applySalesMigration36(db);applyReturnsMigration37(db);applyExpensesMigration38(db);applyInvoicesMigration39(db);applyCashMigration40(db);applySettingsMigration41(db);}finally{db.close();}
 const tls=await createDesktopTestTls();try{await createProtectedLocalKeys(config,tls);}finally{Object.values(tls).forEach(b=>b.fill(0));}return config;
}
test("unresolved original keys fence generation handoff; safe acknowledgement allows a distinct namespace and retired/missing state never resets",async()=>{
 const root=await fresh(),selected=await fresh(),db=(c:LocalKeyConfiguration)=>path.join(c.database.directory,c.database.filename),file=path.join(root.directory,"operation-keys/markers.dpapi");
 let lease=await acquireRuntimeOwnership(db(root));const pending={v:1,context:"a".repeat(64),key:randomUUID(),kind:"SALE",state:"PENDING"};
 try{const access=await openDesktopOperationKeys(root,root,lease.assertHeld),snap=await access("SALESPERSON",{module:"sales",action:"read"});await access("SALESPERSON",{module:"sales",action:"cas",revision:snap.revision,expected:null,next:pending});await expect(access.assertSettled()).rejects.toThrow();}finally{await lease.close();}
 const before=readFileSync(file);lease=await acquireRuntimeOwnership(db(selected));try{await expect(openDesktopOperationKeys(root,selected,lease.assertHeld)).rejects.toThrow();expect(readFileSync(file)).toEqual(before);}finally{await lease.close();}
 lease=await acquireRuntimeOwnership(db(root));try{
  const access=await openDesktopOperationKeys(root,root,lease.assertHeld);let snap=await access("SALESPERSON",{module:"sales",action:"read"});const confirmed={...pending,state:"CONFIRMED"};snap=await access("SALESPERSON",{module:"sales",action:"cas",revision:snap.revision,expected:pending,next:confirmed});await access("SALESPERSON",{module:"sales",action:"cas",revision:snap.revision,expected:confirmed,next:null});await access.assertSettled();
 }finally{await lease.close();}
 lease=await acquireRuntimeOwnership(db(selected));try{
  const access=await openDesktopOperationKeys(root,selected,lease.assertHeld);expect((await access("SALESPERSON",{module:"sales",action:"read"})).marker).toBeNull();
  await expect(openDesktopOperationKeys(root,root,lease.assertHeld)).rejects.toThrow();
  renameSync(file,path.join(base,"retained-selected-ciphertext.dpapi"));await expect(openDesktopOperationKeys(root,selected,lease.assertHeld)).rejects.toThrow();
  writeFileSync(path.join(base,"result.json"),JSON.stringify({status:"PASS",productionActivation:false,checks:["unresolved handoff denied without rewriting checkpoint","settled handoff uses distinct protected identity","retired binding refused","missing checkpoint retained for review without reset"]},null,2));
 }finally{await lease.close();}
},180000);