import {beforeAll,test,expect,vi} from "vitest";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {mkdtempSync,readFileSync,readdirSync,existsSync,statSync,writeFileSync} from "node:fs";
import path from "node:path";
import {ready,seed,passwords} from "../helpers/admin-products-settings-ready";
import {createTestCustody} from "../../src/server/backup/crypto";
import {createTestArchive,authorizeTestRestore,restoreTestArchive} from "../../src/server/backup/service";
import {openProofDatabase,fingerprint} from "../../src/server/backup/snapshot";
import {storage} from "../../src/server/backup/storage";
import {copyFileSync} from "node:fs";
const injected=vi.hoisted(()=>({target:"",writes:0,swapPath:"",reads:0,replacement:undefined as Uint8Array|undefined}));
vi.mock("node:fs",async original=>{const actual=await original<typeof import("node:fs")>();return {...actual,createReadStream:(...args:Parameters<typeof actual.createReadStream>)=>{if(String(args[0])===injected.swapPath){injected.reads++;if(injected.reads===2&&injected.replacement)actual.writeFileSync(args[0],injected.replacement);}return actual.createReadStream(...args);}};});
vi.mock("node:fs/promises",async original=>{
 const actual=await original<typeof import("node:fs/promises")>();
 return {...actual,open:async(...args:Parameters<typeof actual.open>)=>{
  const h=await actual.open(...args);if(String(args[0])===injected.target)return new Proxy(h,{get(t,p){
   if(p==="write")return async(...v:Parameters<typeof h.write>)=>{injected.writes++;if(injected.writes>1)throw Object.assign(Error("TEST simulated disk full"),{code:"ENOSPC"});return t.write(...v);};
   const value=Reflect.get(t,p,t);return typeof value==="function"?value.bind(t):value;
  }});return h;
 }};
});
beforeAll(seed);
test("controlled ENOSPC native-write failures and actual ACL rejection preserve original and prior archive; no partial success",async()=>{
 const f=await ready(),base=path.dirname(f.config.database.directory),dir=(n:string)=>mkdtempSync(path.join(base,n)),custody=await createTestCustody(dir("io-vault-"));
 const source=path.join(f.config.database.directory,f.config.database.filename),db=openProofDatabase(source);let before;let attempts;try{before=fingerprint(db);attempts=db.prepare("SELECT * FROM auth_login_attempts ORDER BY bucket").all();}finally{db.close();}
 try{
  const good=await createTestArchive(custody,f.config.database,dir("io-good-")),original=readFileSync(good.archive),failed=dir("io-failure-");
  injected.target=path.join(failed,"archive.pending");injected.writes=0;
  await expect(createTestArchive(custody,f.config.database,failed)).rejects.toThrow();expect(injected.writes).toBeGreaterThan(1);injected.target="";
  expect(readdirSync(failed).filter(n=>n.endsWith(".age"))).toHaveLength(0);expect(readFileSync(good.archive)).toEqual(original);
  const target=dir("io-restore-"),authority=await authorizeTestRestore(f.g,f.admin,passwords.ADMIN,good.archive,target);
  injected.target=path.join(target,"restored.pending");injected.writes=0;
  await expect(restoreTestArchive(custody,authority,good.archive,target)).rejects.toThrow();injected.target="";
  expect(existsSync(path.join(target,"restored.sqlite3"))).toBe(false);expect(existsSync(path.join(target,"restored.pending"))).toBe(false);
  await expect(restoreTestArchive(custody,authority,good.archive,target)).rejects.toThrow();
  await expect(storage(dir("unprotected-"),"check")).rejects.toThrow();
  const after=openProofDatabase(source);try{const actual=fingerprint(after);expect(actual.schemaDigest).toBe(before.schemaDigest);expect(actual.userVersion).toBe(before.userVersion);expect(actual.tables.filter(t=>t.name!=="auth_login_attempts")).toEqual(before.tables.filter(t=>t.name!=="auth_login_attempts"));
   const rows=after.prepare("SELECT * FROM auth_login_attempts ORDER BY bucket").all();expect(rows).toHaveLength(attempts.length);for(let i=0;i<rows.length;i++){expect(rows[i].revision as bigint).toBeGreaterThanOrEqual(attempts[i].revision as bigint);expect(rows[i].last_seen_ms as bigint).toBeGreaterThanOrEqual(attempts[i].last_seen_ms as bigint);const stable=(r:Record<string,unknown>)=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=="revision"&&k!=="last_seen_ms"));expect(stable(rows[i])).toEqual(stable(attempts[i]));}
  }finally{after.close();}
 }finally{injected.target="";await f.g.close();}
},240000);
test("actual child termination during partial backup and partial restore leaves original safe and accepts only a new verified result",async()=>{
 const f=await ready(),base=path.dirname(f.config.database.directory),dir=(n:string)=>mkdtempSync(path.join(base,n)),vault=dir("kill-vault-"),custody=await createTestCustody(vault);
 const source=path.join(f.config.database.directory,f.config.database.filename),db=openProofDatabase(source);let before;try{before=fingerprint(db);}finally{db.close();}
 async function killDuring(operation:"BACKUP"|"RESTORE",directory:string,archive?:string){
  const child=spawn(process.execPath,["--experimental-transform-types",fileURLToPath(new URL("../helpers/backup-security-crash-child.mjs",import.meta.url))],{cwd:process.cwd(),env:{...process.env,NODE_ENV:"test"},windowsHide:true,stdio:["pipe","pipe","pipe"]});
  await new Promise<void>((resolve,reject)=>{
   let partial=false,output="";const timer=setTimeout(()=>{child.kill();reject(Error("TEST crash barrier timeout"));},60000);timer.unref();
   child.stdout.on("data",(b:Buffer)=>{output+=b.toString();if(output.length>1024){child.kill();reject(Error("TEST output bound"));}if(output.includes("PARTIAL_WRITTEN")){partial=true;child.kill();}});
   child.stderr.on("data",()=>{});child.once("error",reject);child.once("close",()=>{clearTimeout(timer);if(partial)resolve();else reject(Error("TEST child denied before barrier"));});
   const payload=Buffer.from(JSON.stringify({operation,config:f.config,vault,directory,archive,password:passwords.ADMIN}));child.stdin.end(payload,()=>payload.fill(0));
  });
 }
 try{
  const partial=dir("killed-backup-");await killDuring("BACKUP",partial);
  expect(statSync(path.join(partial,"archive.pending")).size).toBeGreaterThan(0);expect(readdirSync(partial).some(n=>n.endsWith(".age"))).toBe(false);
  const good=await createTestArchive(custody,f.config.database,dir("post-kill-good-")),bytes=readFileSync(good.archive);
  const target=dir("killed-restore-");await killDuring("RESTORE",target,good.archive);
  expect(statSync(path.join(target,"restored.pending")).size).toBeGreaterThan(0);expect(existsSync(path.join(target,"restored.sqlite3"))).toBe(false);expect(readFileSync(good.archive)).toEqual(bytes);
  const next=dir("post-kill-restore-"),authority=await authorizeTestRestore(f.g,f.admin,passwords.ADMIN,good.archive,next);
  await restoreTestArchive(custody,authority,good.archive,next);
  const after=openProofDatabase(source);try{expect(fingerprint(after).tables.filter(t=>!t.name.startsWith("auth_"))).toEqual(before.tables.filter(t=>!t.name.startsWith("auth_")));}finally{after.close();}
  writeFileSync(path.resolve("test-results/backup-security-preflight-20261114/crash-proof.json"),JSON.stringify({actualChildTermination:true,backupPartialRejected:true,restorePartialUnpublished:true,originalFinancialRowsPreserved:true,previousArchivePreserved:true,relaunchNewResultVerified:true,physicalPowerLoss:"NOT_VERIFIED",productionActivation:false},null,2));
 }finally{await f.g.close();}
},300000);

test("a valid signed archive swapped after authority hash checking is rejected against ciphertext actually consumed",async()=>{
 const f=await ready(),base=path.dirname(f.config.database.directory),dir=(n:string)=>mkdtempSync(path.join(base,n)),custody=await createTestCustody(dir("swap-vault-"));
 try{
  const first=await createTestArchive(custody,f.config.database,dir("swap-first-")),second=await createTestArchive(custody,f.config.database,dir("swap-second-"));
  const original=readFileSync(first.archive),replacement=readFileSync(second.archive);expect(original.equals(replacement)).toBe(false);expect(second.keyId).toBe(first.keyId);
  const victimDirectory=dir("swap-victim-");await storage(victimDirectory,"initialize");const victim=path.join(victimDirectory,"race.age");copyFileSync(first.archive,victim);
  const target=dir("swap-restore-"),authority=await authorizeTestRestore(f.g,f.admin,passwords.ADMIN,victim,target);
  injected.swapPath=victim;injected.reads=0;injected.replacement=replacement;
  await expect(restoreTestArchive(custody,authority,victim,target)).rejects.toThrow();
  expect(injected.reads).toBe(2);expect(existsSync(path.join(target,"restored.sqlite3"))).toBe(false);expect(existsSync(path.join(target,"restored.pending"))).toBe(false);
  expect(readFileSync(first.archive)).toEqual(original);expect(readFileSync(second.archive)).toEqual(replacement);
 }finally{injected.swapPath="";injected.replacement=undefined;await f.g.close();}
},240000);
