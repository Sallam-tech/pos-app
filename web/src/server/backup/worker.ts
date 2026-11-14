import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {createReadStream,lstatSync,readFileSync,readdirSync,mkdirSync} from "node:fs";
import {open} from "node:fs/promises";
import path from "node:path";
import {assertRuntimeOwnership} from "../hosting/ownership";
import {authorizedFileNamespace} from "../auth/database";
import type {AuthorizationGateway} from "../auth/types";
import type {DatabaseOptions} from "../db/location";
import {resolveDatabaseLocation} from "../db/location";
import {canonical,uuid} from "../inventory/validation";
import {custodyMetadata,hashFile,signProtectedEvidence,verifyProtectedEvidence,type BackupCustody} from "./crypto";
import {createTestArchive,inspectTestPortableArchive,restoredHistory,testSourceNamespace,type VerifiedTestRestore} from "./service";
import {openProofDatabase,verifySchema41} from "./snapshot";
import {fail,storage,testDirectory} from "./storage";

declare const configurationBrand:unique symbol;
export interface TestBackupConfiguration{readonly [configurationBrand]:true}
type Setup={format:"POS_TEST_BACKUP_CONFIG_V1";id:string;namespace:string;keyId:string;root:string;exportDirectory:string;configuredAtMs:number};
type Capability={setup:Setup;custody:BackupCustody;database:DatabaseOptions;restoreProof?:VerifiedTestRestore};
const configurations=new WeakMap<object,Capability>();
function mint(c:Capability){const result=Object.freeze({toJSON:fail}) as unknown as TestBackupConfiguration;configurations.set(result,c);return result;}
function source(database:DatabaseOptions){if(database.mode!=="test")return fail();return resolveDatabaseLocation({...database,create:false}).filename;}
async function checkSource(c:Capability){
 if(testSourceNamespace(source(c.database))!==c.setup.namespace)return fail();
 restoredHistory(c.restoreProof,c.database);
 const db=openProofDatabase(source(c.database));try{await verifySchema41(db);}finally{db.close();}
}
export async function configureTestBackups(g:AuthorizationGateway,request:Request,password:unknown,custody:BackupCustody,database:DatabaseOptions,root:string,exportDirectory:string,restoreProof?:VerifiedTestRestore){
 testDirectory(root);testDirectory(exportDirectory);if(path.resolve(root)===path.resolve(exportDirectory))return fail();
 const filename=source(database),namespace=testSourceNamespace(filename),receipt=await g.verifyAdminPassword(password);
 await g.withFreshAdminTransaction(request,receipt,async(tx,actor)=>{
  if(actor.role!=="ADMIN")return fail();
  if(authorizedFileNamespace(tx)!==namespace||testSourceNamespace(filename)!==namespace)return fail();
 });
 const setup:Setup={format:"POS_TEST_BACKUP_CONFIG_V1",id:randomUUID(),namespace,keyId:custodyMetadata(custody).id,root:path.resolve(root),exportDirectory:path.resolve(exportDirectory),configuredAtMs:Date.now()};
 const c:Capability={setup,custody,database:Object.freeze({...database,create:false}),restoreProof};
 await checkSource(c);await storage(root,"initialize");await storage(exportDirectory,"initialize");
 const payload=Buffer.from(canonical({record:setup,signature:signProtectedEvidence(custody,setup)}));
 try{await storage(root,"seal-record",{value:payload.toString("base64")});}finally{payload.fill(0);}
 return mint(c);
}
export async function reopenTestBackupConfiguration(custody:BackupCustody,database:DatabaseOptions,root:string,restoreProof?:VerifiedTestRestore){
 const encoded=await storage(root,"unseal-record");if(typeof encoded!=="string")return fail();
 const b=Buffer.from(encoded,"base64");
 try{
  const v=JSON.parse(b.toString("utf8")),s=v.record as Setup;
  if(!verifyProtectedEvidence(custody,s,v.signature)||!s||Object.keys(s).sort().join(",")!=="configuredAtMs,exportDirectory,format,id,keyId,namespace,root"||s.format!=="POS_TEST_BACKUP_CONFIG_V1"||uuid(s.id)!==s.id||s.keyId!==custodyMetadata(custody).id||s.root!==path.resolve(root)||!Number.isSafeInteger(s.configuredAtMs)||s.configuredAtMs<1)return fail();
  testDirectory(s.exportDirectory);await storage(s.exportDirectory,"check");
  const c:Capability={setup:s,custody,database:Object.freeze({...database,create:false}),restoreProof};await checkSource(c);return mint(c);
 }catch{return fail();}finally{b.fill(0);}
}
type Kind="MANUAL"|"AUTOMATIC"|"CLOSING"|"EXPORT";
type State="QUEUED"|"RUNNING"|"FAILED"|"SNAPSHOT_VERIFIED"|"EXPORTED";
export type BackupJob=Readonly<{id:string;kind:Kind;state:State;createdAtMs:number;updatedAtMs:number;trigger:string;sourceId?:string;archive?:string;sha256?:string;bytes?:string}>;
type Event={format:"POS_TEST_BACKUP_JOB_V1";configurationId:string;sequence:number;previous:string;job:BackupJob};
const PERIOD=30*60*1000;
function deterministicId(s:string){const h=createHash("sha256").update(s).digest("hex").slice(0,32).split("");h[12]="4";h[16]="8";const a=h.join("");return [a.slice(0,8),a.slice(8,12),a.slice(12,16),a.slice(16,20),a.slice(20)].join("-");}
function checkJob(j:BackupJob){
 if(!j||uuid(j.id)!==j.id||!["MANUAL","AUTOMATIC","CLOSING","EXPORT"].includes(j.kind)||!["QUEUED","RUNNING","FAILED","SNAPSHOT_VERIFIED","EXPORTED"].includes(j.state)||!Number.isSafeInteger(j.createdAtMs)||!Number.isSafeInteger(j.updatedAtMs)||j.createdAtMs<1||j.updatedAtMs<j.createdAtMs||typeof j.trigger!=="string"||j.trigger.length>100||Object.keys(j).some(k=>!["id","kind","state","createdAtMs","updatedAtMs","trigger","sourceId","archive","sha256","bytes"].includes(k)))return fail();
 if(j.kind==="EXPORT"&&(!j.sourceId||uuid(j.sourceId)!==j.sourceId))return fail();
 if(j.archive!==undefined&&!new RegExp("^job-"+j.id+"/try-[0-9a-f-]{36}/"+j.id+"\\.age$").test(j.archive))return fail();
 if(j.sha256!==undefined&&!/^[a-f0-9]{64}$/.test(j.sha256))return fail();
 if(j.bytes!==undefined&&!/^[1-9][0-9]{0,10}$/.test(j.bytes))return fail();
 if(j.state==="SNAPSHOT_VERIFIED"&&(!j.archive||!j.sha256||!j.bytes||j.kind==="EXPORT"))return fail();
 if(j.state==="EXPORTED"&&(j.kind!=="EXPORT"||!j.sha256||!j.bytes))return fail();
}
function dto(j:BackupJob){return Object.freeze({id:j.id,kind:j.kind,state:j.state,createdAtMs:String(j.createdAtMs),updatedAtMs:String(j.updatedAtMs),...(j.sourceId?{sourceId:j.sourceId}:{})});}
const workerBindings=new WeakMap<object,string>();
export async function startTestBackupWorker(configuration:TestBackupConfiguration,ownership:{assertHeld():void},database:DatabaseOptions){
 const c=configurations.get(configuration);if(!c||testSourceNamespace(source(database))!==c.setup.namespace)return fail();assertRuntimeOwnership(ownership);ownership.assertHeld();await checkSource(c);await storage(c.setup.root,"check");
 // The worker retains no gateway, Admin Request, password, session or business-write handle.
 const jobs=new Map<string,BackupJob>();let sequence=0,previous=createHash("sha256").update(canonical(c.setup)).digest("hex");
 const events=readdirSync(c.setup.root).filter(n=>/^[0-9]{8}\.json$/.test(n)).sort();if(events.length>30000)return fail();
 for(const name of events){
  const filename=path.join(c.setup.root,name),st=lstatSync(filename);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>16384)return fail();
  const envelope=JSON.parse(readFileSync(filename,"utf8")),e=envelope.record as Event;
  if(!verifyProtectedEvidence(c.custody,e,envelope.signature)||!e||Object.keys(e).sort().join(",")!=="configurationId,format,job,previous,sequence"||e.format!=="POS_TEST_BACKUP_JOB_V1"||e.configurationId!==c.setup.id||e.sequence!==sequence+1||name!==String(e.sequence).padStart(8,"0")+".json"||e.previous!==previous)return fail();
  checkJob(e.job);const old=jobs.get(e.job.id);
  if(old&&(old.kind!==e.job.kind||old.trigger!==e.job.trigger||old.sourceId!==e.job.sourceId||old.createdAtMs!==e.job.createdAtMs||old.state==="SNAPSHOT_VERIFIED"||old.state==="EXPORTED"||old.state==="FAILED"))return fail();
  jobs.set(e.job.id,Object.freeze(e.job));sequence=e.sequence;previous=createHash("sha256").update(canonical(e)).digest("hex");
 }
 if(jobs.size>10000)return fail();
 let stopped=false,broken=false,tail:Promise<void>=Promise.resolve();
 const enqueue=<T>(f:()=>Promise<T>):Promise<T>=>{const result=tail.then(async()=>{ownership.assertHeld();if(stopped||broken)return fail();return f();});tail=result.then(()=>{},()=>{});return result;};
 async function append(job:BackupJob){
  ownership.assertHeld();if(broken||sequence>=30000||jobs.size>=10000&&!jobs.has(job.id))return fail();checkJob(job);
  const record:Event={format:"POS_TEST_BACKUP_JOB_V1",configurationId:c!.setup.id,sequence:sequence+1,previous,job};
  const pending=randomUUID()+".pending",file=await open(path.join(c!.setup.root,pending),"wx");
  try{await file.writeFile(canonical({record,signature:signProtectedEvidence(c!.custody,record)}));await file.sync();}finally{await file.close();}
  try{await storage(c!.setup.root,"publish",{source:pending,target:String(sequence+1).padStart(8,"0")+".json"});}
  catch{broken=true;return fail();} // Acknowledgement loss requires full restart/replay, never a second append.
  sequence++;previous=createHash("sha256").update(canonical(record)).digest("hex");jobs.set(job.id,Object.freeze(job));
 }
 async function verifyArchive(filename:string,id:string){
  const directory=path.join(c!.setup.root,"verify-"+randomUUID());mkdirSync(directory);
  const v=await inspectTestPortableArchive(c!.custody,filename,directory);if(v.archiveId!==id)return fail();return {sha256:v.archiveSha256,bytes:v.archiveBytes};
 }
 async function recoverArchive(job:BackupJob){
  const root=path.join(c!.setup.root,"job-"+job.id);let names:string[];try{names=readdirSync(root);}catch(e){if((e as {code?:string}).code==="ENOENT")return undefined;throw e;}
  if(names.length>16)return fail();const found:string[]=[];
  for(const name of names){if(!/^try-[0-9a-f-]{36}$/.test(name))return fail();const directory=path.join(root,name);testDirectory(directory);const st=lstatSync(directory);if(!st.isDirectory()||st.isSymbolicLink())return fail();
   if(readdirSync(directory).includes(job.id+".age"))found.push("job-"+job.id+"/"+name+"/"+job.id+".age");}
  if(found.length>1)return fail();if(!found.length)return undefined;
  const facts=await verifyArchive(path.join(c!.setup.root,found[0]),job.id);return {archive:found[0],...facts};
 }
 async function perform(job:BackupJob){
  const running={...job,state:"RUNNING" as const,updatedAtMs:Math.max(Date.now(),job.updatedAtMs)};if(job.state!=="RUNNING")await append(running);
  try{
   await checkSource(c!);ownership.assertHeld();
   if(job.kind==="EXPORT"){
    const source=jobs.get(job.sourceId!);if(!source||source.state!=="SNAPSHOT_VERIFIED"||!source.archive||!source.sha256)return fail();
    const filename=path.join(c!.setup.root,source.archive),facts=await verifyArchive(filename,source.id);if(facts.sha256!==source.sha256||facts.bytes!==source.bytes)return fail();
    await storage(c!.setup.exportDirectory,"check");const final=path.join(c!.setup.exportDirectory,source.id+".age");
    let exists=false;try{lstatSync(final);exists=true;}catch(e){if((e as {code?:string}).code!=="ENOENT")throw e;}
    if(exists){if(canonical(await hashFile(final))!==canonical(facts))return fail();}
    else{
     const pending=job.id+".pending",file=await open(path.join(c!.setup.exportDirectory,pending),"wx");
     try{for await(const b of createReadStream(filename))await file.writeFile(b);await file.sync();}finally{await file.close();}
     if(canonical(await hashFile(path.join(c!.setup.exportDirectory,pending)))!==canonical(facts))return fail();
     ownership.assertHeld();await storage(c!.setup.exportDirectory,"publish",{source:pending,target:source.id+".age"});
     if(canonical(await hashFile(final))!==canonical(facts))return fail();
    }
    await append({...running,state:"EXPORTED",sha256:facts.sha256,bytes:facts.bytes,updatedAtMs:Math.max(Date.now(),job.updatedAtMs)});return;
   }
   let found=await recoverArchive(job);
   if(!found){
    const root=path.join(c!.setup.root,"job-"+job.id);try{mkdirSync(root);}catch(e){if((e as {code?:string}).code!=="EEXIST")throw e;}
    testDirectory(root);const directory=path.join(root,"try-"+randomUUID());mkdirSync(directory);
    const result=await createTestArchive(c!.custody,c!.database,directory,c!.restoreProof,undefined,job.id);
    ownership.assertHeld();if(result.manifest.sourceNamespace!==c!.setup.namespace)return fail();const facts=await hashFile(result.archive);
    found={archive:path.relative(c!.setup.root,result.archive).split(path.sep).join("/"),...facts};
   }
   await append({...running,state:"SNAPSHOT_VERIFIED",...found,updatedAtMs:Math.max(Date.now(),job.updatedAtMs)});
  }catch{if(!broken)await append({...running,state:"FAILED",updatedAtMs:Math.max(Date.now(),job.updatedAtMs)});}
 }
 async function admit(id:string,kind:Kind,trigger:string,sourceId?:string){
  uuid(id);const old=jobs.get(id);if(old){if(old.kind!==kind||old.trigger!==trigger||old.sourceId!==sourceId)return fail();return dto(old);}
  const now=Date.now(),j:BackupJob={id,kind,trigger,state:"QUEUED",createdAtMs:now,updatedAtMs:now,...(sourceId?{sourceId}:{})};await append(j);return dto(j);
 }
 // One serialized queue owns journal transitions, snapshots and exports.
 async function drain(){for(const j of [...jobs.values()])if(j.state==="QUEUED"||j.state==="RUNNING")await perform(j);}
 async function pulse(){
  const db=openProofDatabase(source(c!.database));let closings:Record<string,unknown>[];
  try{await verifySchema41(db);closings=db.prepare("SELECT id FROM closing_backup_jobs ORDER BY id LIMIT 10001").all();}finally{db.close();}
  if(closings.length>10000)return fail();
  const bucket=Math.floor(Date.now()/PERIOD),id=deterministicId(c!.setup.id+":automatic:"+bucket);
  await admit(id,"AUTOMATIC","interval:"+bucket);
  for(const row of closings){const closingId=uuid(row.id);await admit(deterministicId(c!.setup.id+":closing:"+closingId),"CLOSING","closing:"+closingId);}
  await drain();
 }
 // Recover uncertain original IDs before discovering new current-time work.
 await enqueue(async()=>{await drain();await pulse();});
 const timer=setInterval(()=>{void enqueue(pulse).catch(()=>{broken=true;});},30000);timer.unref();
 const worker=Object.freeze({
  manual(key:string){return enqueue(async()=>{const result=await admit(uuid(key),"MANUAL","manual");void enqueue(drain).catch(()=>{broken=true;});return result;});},
  export(key:string,sourceId:string){return enqueue(async()=>{uuid(sourceId);const source=jobs.get(sourceId);if(!source||source.state!=="SNAPSHOT_VERIFIED")return fail();const result=await admit(uuid(key),"EXPORT","export:"+sourceId,sourceId);void enqueue(drain).catch(()=>{broken=true;});return result;});},
  status(){ownership.assertHeld();if(broken)return fail();const list=[...jobs.values()].sort((a,b)=>b.createdAtMs-a.createdAtMs||b.id.localeCompare(a.id));return Object.freeze({configured:true,mode:"TEST_ONLY",automaticIntervalMinutes:30,configuredAtMs:String(c!.setup.configuredAtMs),observedAtMs:String(Date.now()),recoveryGap:"POWERED_OFF_INTERVALS_HAVE_NO_SNAPSHOT",cloud:"NOT_CONFIGURED",physicalOffDevice:"NOT_VERIFIED",applicationRestore:"SEPARATE_DRILL_REQUIRED",productionActivation:false,retention:"PRESERVE_ALL_PENDING_OWNER_STORAGE_ACCEPTANCE",jobs:list.slice(0,50).map(dto)});},
  job(key:string){const j=jobs.get(uuid(key));return j?dto(j):{id:key,state:"UNKNOWN"};},
  async scan(){await enqueue(pulse);},
  async idle(){await tail;},
  async stop(){clearInterval(timer);await tail;stopped=true;},
  // Internal TEST evidence only: no HTTP filesystem selector.
  archive(key:string){const j=jobs.get(uuid(key));if(!j||j.state!=="SNAPSHOT_VERIFIED"||!j.archive)return fail();return path.join(c!.setup.root,j.archive);},
 });
 workerBindings.set(worker,c.setup.id);return worker;
}
export type TestBackupWorker=Awaited<ReturnType<typeof startTestBackupWorker>>;

export async function createTestIsolatedRestore(configuration:TestBackupConfiguration,worker:TestBackupWorker,g:AuthorizationGateway,request:Request,password:unknown,key:string,archiveId:string){
 const c=configurations.get(configuration);if(!c||workerBindings.get(worker)!==c.setup.id)return fail();uuid(key);uuid(archiveId);await checkSource(c);
 const archive=worker.archive(archiveId),parent=path.join(c.setup.root,"restores");
 // Fresh authority is required even when resolving an original restored result.
 const receipt=await g.verifyAdminPassword(password);await g.withFreshAdminTransaction(request,receipt,async()=>{});
 let newParent=false;try{mkdirSync(parent);newParent=true;}catch(e){if((e as {code?:string}).code!=="EEXIST")throw e;}testDirectory(parent);await storage(parent,newParent?"initialize":"check");
 const binding={format:"POS_TEST_RESTORE_REQUEST_V1",key,archiveId,namespace:c.setup.namespace,archiveSha256:(await hashFile(archive)).sha256};
 const requestFile=path.join(parent,key+".json");let exists=false;try{const st=lstatSync(requestFile);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>4096)return fail();exists=true;}catch(e){if((e as {code?:string}).code!=="ENOENT")throw e;}
 const directory=path.join(parent,key);
 if(exists){
  const saved=JSON.parse(readFileSync(requestFile,"utf8"));if(!verifyProtectedEvidence(c.custody,saved.record,saved.signature)||canonical(saved.record)!==canonical(binding))return fail();
  const {reopenTestRestore}=await import("./service");await reopenTestRestore(c.custody,directory);
 }else{
  const {authorizeTestRestore,restoreTestArchive}=await import("./service");
  // New empty target only; a preexisting unknown result is never overwritten.
  mkdirSync(directory);const authority=await authorizeTestRestore(g,request,password,archive,directory);
  const pending=randomUUID()+".pending",f=await open(path.join(parent,pending),"wx");
  try{await f.writeFile(canonical({record:binding,signature:signProtectedEvidence(c.custody,binding)}));await f.sync();}finally{await f.close();}
  await storage(parent,"publish",{source:pending,target:key+".json"});
  await restoreTestArchive(c.custody,authority,archive,directory);
 }
 return Object.freeze({key,archiveId,state:"ISOLATED_RESTORE_VERIFIED_LOGIN_PENDING",productionActivation:false});
}
