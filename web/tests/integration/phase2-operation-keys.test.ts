import {test,expect,beforeAll} from "vitest";
import {randomUUID} from "node:crypto";
import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from "node:fs";
import path from "node:path";
import {markerCommand,markerKinds,nativeMarker,markerTransition,type MarkerModule,type NativeMarker} from "../../src/server/desktop/recovery-contract";
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
const marker=(kind="SALE")=>({v:1 as const,context:"a".repeat(64),key:randomUUID(),kind,state:"PENDING" as const});
test("eight marker families accept only bounded exact metadata and reject extra financial/auth/path fields",()=>{
 for(const family of Object.keys(markerKinds) as MarkerModule[]){
  const value=family==="backup"?{key:randomUUID(),kind:"manual" as const}:marker(markerKinds[family][0]);
  expect(nativeMarker(family,value)).toEqual(value);
  for(const extra of [{password:"secret"},{cookie:"bearer"},{filename:"x"},{amount:"100"},{quantity:"1"},{payload:{}}])expect(()=>nativeMarker(family,{...value,...extra})).toThrow();
  expect(()=>nativeMarker(family,{...value,key:"../bad"})).toThrow();
 }
 expect(()=>nativeMarker("backup",{key:randomUUID(),kind:"export"})).toThrow();
 expect(()=>nativeMarker("backup",{key:randomUUID(),kind:"restore",archiveId:"a".repeat(36)})).toThrow();
 expect(()=>markerCommand({module:"__proto__",action:"read"})).toThrow();
 expect(()=>markerCommand({module:"sales",action:"read",role:"ADMIN"})).toThrow();
});
test("uncertain keys cannot be deleted, changed or regressed; existing confirmation and acknowledgement rules survive",()=>{
 const pending=marker(),attempted={...pending,state:"ATTEMPTED" as const},confirmed={...pending,state:"CONFIRMED" as const};
 expect(()=>markerTransition("sales",null,pending)).not.toThrow();
 expect(()=>markerTransition("sales",pending,attempted)).not.toThrow();
 expect(()=>markerTransition("sales",attempted,confirmed)).not.toThrow();
 expect(()=>markerTransition("sales",confirmed,null)).not.toThrow();
 for(const [a,b] of [[pending,null],[attempted,null],[attempted,pending],[confirmed,pending],[pending,{...confirmed,key:randomUUID()}],[pending,{...confirmed,context:"b".repeat(64)}]] as [NativeMarker,NativeMarker|null][])expect(()=>markerTransition("sales",a,b)).toThrow();
 expect(()=>markerTransition("inventory",marker("CREATE"),{...marker("CREATE"),state:"ATTEMPTED"})).toThrow();
});
const base=path.resolve("test-results/sqlite-b1b-part1/keys-"+randomUUID().slice(0,8));mkdirSync(base,{recursive:true});
let root:LocalKeyConfiguration;
beforeAll(async()=>{
 const directory=path.join(base,randomUUID()),data=path.join(directory,"d");mkdirSync(directory);await storage(directory,"initialize");mkdirSync(data);await storage(data,"initialize");
 root={directory,database:{directory:data,filename:"shop.sqlite3",mode:"test",create:false},migrationsDirectory:path.resolve("src/server/db/migrations")};
 const db=openDatabase({...root.database,create:true});try{applyMigrations(db,root.migrationsDirectory);applySalesMigration36(db);applyReturnsMigration37(db);applyExpensesMigration38(db);applyInvoicesMigration39(db);applyCashMigration40(db);applySettingsMigration41(db);}finally{db.close();}
 const tls=await createDesktopTestTls();try{await createProtectedLocalKeys(root,tls);}finally{Object.values(tls).forEach(b=>b.fill(0));}
},180000);
test("real CurrentUser DPAPI CAS survives reopen, keeps exact uncertain key, denies cross-role/replay/regression and persists safe acknowledgement",async()=>{
 const lease=await acquireRuntimeOwnership(path.join(root.database.directory,root.database.filename));try{
  let access=await openDesktopOperationKeys(root,root,lease.assertHeld),read=await access("SALESPERSON",{module:"sales",action:"read"});expect(read.marker).toBeNull();
  await expect(access("ADMIN",{module:"sales",action:"read"})).rejects.toThrow();await expect(access("SALESPERSON",{module:"inventory",action:"read"})).rejects.toThrow();
  const pending=marker(),claim={module:"sales",action:"cas",revision:read.revision,expected:null,next:pending};
  read=await access("SALESPERSON",claim);expect(read.marker).toEqual(pending);await expect(access("SALESPERSON",claim)).rejects.toThrow();
  access=await openDesktopOperationKeys(root,root,lease.assertHeld);read=await access("SALESPERSON",{module:"sales",action:"read"});expect(read.marker).toEqual(pending);
  await expect(access("SALESPERSON",{module:"sales",action:"cas",revision:read.revision,expected:pending,next:null})).rejects.toThrow();
  const attempted={...pending,state:"ATTEMPTED"};read=await access("SALESPERSON",{module:"sales",action:"cas",revision:read.revision,expected:pending,next:attempted});
  const cipher=readFileSync(path.join(root.directory,"operation-keys/markers.dpapi"));expect(cipher.includes(Buffer.from(pending.key))).toBe(false);expect(cipher.includes(Buffer.from(pending.context))).toBe(false);
  access=await openDesktopOperationKeys(root,root,lease.assertHeld);read=await access("SALESPERSON",{module:"sales",action:"read"});expect(read.marker).toEqual(attempted);
  const confirmed={...pending,state:"CONFIRMED"};read=await access("SALESPERSON",{module:"sales",action:"cas",revision:read.revision,expected:attempted,next:confirmed});
  read=await access("SALESPERSON",{module:"sales",action:"cas",revision:read.revision,expected:confirmed,next:null});expect(read.marker).toBeNull();
  const backup={key:randomUUID(),kind:"restore",archiveId:randomUUID()};read=await access("ADMIN",{module:"backup",action:"read"});await access("ADMIN",{module:"backup",action:"cas",revision:read.revision,expected:null,next:backup});
  access=await openDesktopOperationKeys(root,root,lease.assertHeld);expect((await access("ADMIN",{module:"backup",action:"read"})).marker).toEqual(backup);  for(const [family,kind]of [["returns","REFUND"],["expenses","CREATE"]] as const){
   const value=marker(kind);let snap=await access("SALESPERSON",{module:family,action:"read"});
   if(family==="returns")await expect(access("SALESPERSON",{module:family,action:"cas",revision:snap.revision,expected:null,next:{...value,kind:"DISPOSITION"}})).rejects.toThrow();
   snap=await access("SALESPERSON",{module:family,action:"cas",revision:snap.revision,expected:null,next:value});expect(snap.marker).toEqual(value);
   expect((await access("ADMIN",{module:family,action:"read"})).marker).toBeNull();
   access=await openDesktopOperationKeys(root,root,lease.assertHeld);expect((await access("SALESPERSON",{module:family,action:"read"})).marker).toEqual(value);
  }
 }finally{await lease.close();}
},180000);
test("lost fence, stale ciphertext and interrupted publication fail closed and preserve all evidence",async()=>{
 const lease=await acquireRuntimeOwnership(path.join(root.database.directory,root.database.filename));let held=true;
 try{
  const access=await openDesktopOperationKeys(root,root,()=>{lease.assertHeld();if(!held)throw Error();}),file=path.join(root.directory,"operation-keys/markers.dpapi"),before=readFileSync(file);
  held=false;await expect(access("ADMIN",{module:"backup",action:"read"})).rejects.toThrow();expect(readFileSync(file)).toEqual(before);held=true;
  const read=await access("ADMIN",{module:"backup",action:"read"});await access("ADMIN",{module:"backup",action:"cas",revision:read.revision,expected:read.marker,next:null});
  copyFileSync(file,path.join(base,"latest-ciphertext.dpapi"));writeFileSync(file,before);await expect(access("ADMIN",{module:"backup",action:"read"})).rejects.toThrow();
  copyFileSync(path.join(base,"latest-ciphertext.dpapi"),file);
  const bytes=readFileSync(file);bytes[bytes.length-1]^=1;writeFileSync(file,bytes);await expect(openDesktopOperationKeys(root,root,lease.assertHeld)).rejects.toThrow();
  copyFileSync(path.join(base,"latest-ciphertext.dpapi"),file);writeFileSync(path.join(root.directory,"operation-keys/markers.pending"),"interrupted");await expect(openDesktopOperationKeys(root,root,lease.assertHeld)).rejects.toThrow();
 }finally{await lease.close();}
},180000);