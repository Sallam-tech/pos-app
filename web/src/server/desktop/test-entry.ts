import "server-only";
import {randomUUID} from "node:crypto";
import {existsSync,lstatSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import net from "node:net";
import {openDatabase} from "../db/connection";
import {applyMigrations} from "../db/migrate";
import {applySalesMigration36} from "../db/sales-migrate";
import {applyReturnsMigration37} from "../db/returns-migrate";
import {applyExpensesMigration38} from "../db/expenses-migrate";
import {applyInvoicesMigration39} from "../db/invoices-migrate";
import {applyCashMigration40} from "../db/cash-migrate";
import {applySettingsMigration41} from "../db/settings-migrate";
import {createProtectedLocalKeys,withProtectedLocalKeys,type LocalKeyConfiguration} from "../bootstrap/keys";
import {bindTrustedDesktopOwnerInteraction,createTrustedOwnerEnrollmentEntry,inspectOwnerEnrollment} from "../bootstrap/owner-enrollment";
import {inspectDesktopStartup,resolveDesktopCurrent} from "./current";
import {recoverDesktopTest,resumeDesktopRecoveryReview,type DesktopRecoveryInput} from "./recovery";
import {prepareDesktopBackup} from "./backup-configuration";
import {storage} from "../backup/storage";
import type {SetupPasswords} from "../auth/provision";
import {assertPatchedLocalRuntime} from "../hosting/runtime-policy";
import {createDesktopTestTls} from "./tls";
import {startLocalRuntime,withLocalRuntimeOperationKeys,withLocalRuntimeSharedLogin,type LocalRuntime} from "../hosting/runtime";
import {rejectRedirectedPath} from "../db/location";
const fail=():never=>{throw Error("Disposable TEST desktop unavailable. Data retained; recovery review may be required.");};
type Message={type:string;id?:string;value?:unknown;dataRoot?:string;applicationDirectory?:string};
const pending=new Map<string,{resolve(v:unknown):void;reject(e:unknown):void;timer:ReturnType<typeof setTimeout>}>();
function ask(type:string,value?:unknown){return new Promise<unknown>((resolve,reject)=>{
 const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error("Trusted TEST setup expired."));},180000);timer.unref();
 pending.set(id,{resolve,reject,timer});process.send?.({type,id,value});
});}
async function port(){const server=net.createServer();await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});const p=(server.address() as net.AddressInfo).port;await new Promise<void>(resolve=>server.close(()=>resolve()));return p;}
async function directory(parent:string,name:string){const target=path.join(parent,name);mkdirSync(target);await storage(target,"initialize");return target;}
let runtime:LocalRuntime|undefined,startup:Promise<void>|undefined,starting=false,closing=false;
let sharedLoginRunning=false;
let stage="ENTRY";
const bootStartedAt=Date.now();
function setStage(value:string){stage=value;process.send?.({type:"startup-stage",value,elapsedMs:Date.now()-bootStartedAt});}
let recovery:Promise<void>|undefined,context:{root:LocalKeyConfiguration;active:LocalKeyConfiguration;base:string;origins:Readonly<Record<"ADMIN"|"SALESPERSON",string>>}|undefined;
function cancelPending(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error("Desktop closed."));}pending.clear();}
async function start(message:Message){
 assertPatchedLocalRuntime();
 if(starting||process.env.NODE_ENV!=="test"||!process.send||!process.connected||typeof message.dataRoot!=="string"||typeof message.applicationDirectory!=="string")return fail();
 starting=true;setStage("PRIVATE_DATA");const dataRoot=path.resolve(message.dataRoot);rejectRedirectedPath(dataRoot);process.chdir(dataRoot);
 const marker=path.join(dataRoot,"desktop-test.json"),base=path.join(dataRoot,"test-results/sqlite-b1b-part1");
 let id:string,fresh=false;
 if(!existsSync(marker)){
  if(existsSync(base))return fail();
  id=randomUUID();writeFileSync(marker,JSON.stringify({format:"SHOP_POS_DISPOSABLE_DESKTOP_V1",id,productionActivation:false}),{flag:"wx"});fresh=true;
  mkdirSync(base,{recursive:true});
 }else{
  const stat=lstatSync(marker);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>512)return fail();
  const record=JSON.parse(readFileSync(marker,"utf8"));
  if(Object.keys(record).sort().join(",")!=="format,id,productionActivation"||record.format!=="SHOP_POS_DISPOSABLE_DESKTOP_V1"||record.productionActivation!==false||typeof record.id!=="string"||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(record.id))return fail();
  id=record.id;
 }
 const shop=path.join(base,id),data=path.join(shop,"d"),migrations=fileURLToPath(new URL("../db/migrations/",import.meta.url));
 const config:LocalKeyConfiguration={directory:shop,database:{directory:data,filename:"shop.sqlite3",mode:"test",create:false},migrationsDirectory:migrations};
 if(fresh){
  setStage("FRESH_SCHEMA");await directory(base,id);await directory(shop,"d");
  const db=openDatabase({...config.database,create:true});
  try{applyMigrations(db,migrations);applySalesMigration36(db);applyReturnsMigration37(db);applyExpensesMigration38(db);applyInvoicesMigration39(db);applyCashMigration40(db);applySettingsMigration41(db);}finally{db.close();}
  setStage("LOCAL_TLS");const tls=await createDesktopTestTls();try{await createProtectedLocalKeys(config,tls);}finally{Object.values(tls).forEach(b=>b.fill(0));}
 }
 let values:SetupPasswords|undefined;
 const interaction=bindTrustedDesktopOwnerInteraction({
  async confirm(request){const answer=await ask("confirm-enrollment",request);return answer==="CONFIRM_FIRST_ENROLLMENT"||answer==="CONFIRM_MATCHING_COMMITTED_ENROLLMENT"?answer:"CANCELLED";},
  async readPasswords(){const supplied=await ask("read-passwords");if(!supplied||typeof supplied!=="object"||Object.keys(supplied).sort().join(",")!=="ADMIN,SALESPERSON")return fail();values=supplied as SetupPasswords;return values;},
 });
 setStage("ENROLLMENT");
 // Existing ENROLLED file is only a routing hint; resolveDesktopCurrent fully
 // validates historical native authority before any selected keys/SQL admission.
 if(!existsSync(path.join(config.directory,"protected-identity/enrollment/enrolled.dpapi"))){
  if(existsSync(path.join(config.directory,"protected-identity/candidate-authority")))return fail();
  const enrollment=await inspectOwnerEnrollment(config),entry=createTrustedOwnerEnrollmentEntry(config,interaction);
  if(["UNENROLLED","RETRY_REQUIRES_OWNER"].includes(enrollment.status))await entry.enroll();
  else if(enrollment.status==="RECONCILIATION_REQUIRES_OWNER")await entry.reconcile();else if(enrollment.status!=="ENROLLED")return fail();
 }
 setStage("CURRENT_RESOLUTION");const initial=await inspectDesktopStartup(config,setStage),review=initial.kind==="REVIEW"?initial.review:undefined;
 if(review){
  setStage("RECOVERY_REVIEW");const supplied=await ask("recovery-review",{operationId:review.operationId,kind:review.kind,destinationFileIdentity:review.record.destinationFileIdentity,sourceStateDigest:review.record.sourceStateDigest,productionActivation:false});
  if(!supplied||typeof supplied!=="object")return fail();
  await resumeDesktopRecoveryReview(config,base,{ADMIN:"https://localhost:49893",SALESPERSON:"https://127.0.0.1:49893"},supplied as {sourceAdmin:string;ADMIN?:string;SALESPERSON?:string},(type,request)=>ask(type,request));
 }
 const current=initial.kind==="REVIEW"?await resolveDesktopCurrent(config,setStage):initial.current,active=current.active;
 const selectedPort=await port(),origins={ADMIN:"https://localhost:"+selectedPort,SALESPERSON:"https://127.0.0.1:"+selectedPort};
 setStage("PROTECTED_KEYS");await withProtectedLocalKeys(active,async keys=>{
  const authorization={database:active.database,migrationsDirectory:migrations,origins,signingSecrets:keys.signingSecrets,sessionLifetimeSeconds:28800};
  setStage("BACKUP_CONFIGURATION");const backup=await prepareDesktopBackup(config,current,base,authorization,values?async()=>values!.ADMIN:current.selected?()=>ask("backup-handoff-password",{generation:current.generation,databaseFile:path.basename(active.database.filename)}):undefined);values=undefined;
  setStage("HTTPS_RUNTIME");runtime=await startLocalRuntime({onDrainStage:value=>{process.send?.({type:"lifecycle",value});},applicationDirectory:message.applicationDirectory!,port:selectedPort,authorization,tls:keys.tls,protectedIdentity:{root:config,...(current.selected?{selected:active}:{})},testSales:{shopName:"Shop POS TEST"},testReturns:true,testExpenses:true,testInvoiceCorrections:true,testReports:true,testCash:true,testSettings:true,testDesktopOperationKeys:true,testBackups:backup});
  context={root:config,active,base,origins};setStage("READY");process.send?.({type:"ready",value:{origins,certificate:keys.tls.certificate.toString("utf8"),trustAnchor:keys.tls.trustAnchor.toString("utf8"),productionActivation:false}});
 });
}
async function stop(){if(closing)return;closing=true;process.send?.({type:"lifecycle",value:"STOP_RECEIVED"});cancelPending();await startup?.catch(()=>{});await recovery?.catch(()=>{});process.send?.({type:"lifecycle",value:"STARTUP_DRAINED"});await runtime?.close();process.send?.({type:"lifecycle",value:"RUNTIME_CLOSED"});if(process.connected){process.send?.({type:"stopped"});process.disconnect?.();}}
function replyOperationKeys(id:string,value:unknown){if(process.connected&&!closing)process.send?.({type:"operation-keys-result",id,value},()=>{});}
process.on("message",(message:Message)=>{
 if(!message||typeof message!=="object")return;
 if(message.type==="reply"&&typeof message.id==="string"){const p=pending.get(message.id);if(p){pending.delete(message.id);clearTimeout(p.timer);p.resolve(message.value);}return;}
 if(message.type==="start"){if(startup||closing)return;startup=start(message);void startup.catch(()=>{if(process.connected&&!closing)process.send?.({type:"fatal",stage,value:"Disposable TEST startup unavailable. Existing data retained; no automatic reset or migration."});});}
 if(message.type==="recover"){
  if(!runtime||!context||recovery||closing)return;const c=context,live=runtime;
  recovery=(async()=>{try{const result=await recoverDesktopTest(live,c.root,c.active,c.base,c.origins,message.value as DesktopRecoveryInput,(type,request)=>ask(type,request));runtime=undefined;process.send?.({type:"recovery-completed",value:result});}catch{process.send?.({type:"fatal",stage:"RECOVERY_REVIEW_REQUIRED",value:"Recovery not confirmed. Original data and staged evidence retained. No automatic retry."});}})();return;
 }
 if(message.type==="shared-login"){
  const id=message.id,v=message.value as {password?:unknown}|undefined;
  if(typeof id!=="string"||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))return;
  if(sharedLoginRunning){process.send?.({type:"shared-login-result",id,value:{ok:false}});return;}
  sharedLoginRunning=true;
  void(async()=>{try{
   if(!runtime||closing||recovery||!v||Object.keys(v).join(",")!=="password"||typeof v.password!=="string"||v.password.length>256||Array.from(v.password).length<8||Array.from(v.password).length>128||Buffer.byteLength(v.password)>512)return fail();
   const value=await withLocalRuntimeSharedLogin(runtime,v.password);process.send?.({type:"shared-login-result",id,value:{ok:true,...value}});
  }catch{process.send?.({type:"shared-login-result",id,value:{ok:false}});}finally{if(v)v.password=undefined;sharedLoginRunning=false;}})();return;
 }
 if(message.type==="operation-keys"){
  const id=message.id,v=message.value as {role?:unknown;cookie?:unknown;command?:unknown}|undefined;
  if(typeof id!=="string"||! /^[a-f0-9-]{36}$/.test(id))return;
  void(async()=>{try{if(!runtime||closing||recovery||!v||Object.keys(v).sort().join(",")!=="command,cookie,role"||!["ADMIN","SALESPERSON"].includes(String(v.role))||typeof v.cookie!=="string")return fail();const value=await withLocalRuntimeOperationKeys(runtime,v.role as "ADMIN"|"SALESPERSON",v.cookie,v.command);replyOperationKeys(id,{ok:true,value});}catch{replyOperationKeys(id,{ok:false});}})();return;
 }
 if(message.type==="stop")void stop().catch(()=>{process.send?.({type:"fatal",value:"Safe shutdown could not be confirmed. Data and ownership retained."});});
});
process.on("disconnect",()=>{cancelPending();void stop().catch(()=>{});});
