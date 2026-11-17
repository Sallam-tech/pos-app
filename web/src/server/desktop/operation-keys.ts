import "server-only";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,lstatSync,mkdirSync,openSync,writeSync,fsyncSync,closeSync,readFileSync,readdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import type {Role} from "../auth/types";
import type {LocalKeyConfiguration} from "../bootstrap/keys";
import {withProtectedLocalKeys} from "../bootstrap/keys";
import {resolveDatabaseLocation} from "../db/location";
import {storage} from "../backup/storage";
import {markerCommand,markerKinds,nativeMarker,markerFailure,markerTransition,sameNativeMarker,type MarkerSnapshot,type NativeMarker,type MarkerModule} from "./recovery-contract";
const digest=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).sort().join(",")===keys.sort().join(",");
const modules=Object.keys(markerKinds) as MarkerModule[];
const allowed=(role:Role,module:MarkerModule)=>role==="SALESPERSON"?["sales","returns","expenses"].includes(module):module!=="sales";
const empty=()=>({ADMIN:Object.fromEntries(modules.filter(m=>allowed("ADMIN",m)).map(m=>[m,null])),SALESPERSON:Object.fromEntries(modules.filter(m=>allowed("SALESPERSON",m)).map(m=>[m,null]))});
type RecordState={format:"SHOP_POS_OPERATION_KEYS_V2";root:string;binding:string;revision:string;retired:string[];slots:Record<Role,Partial<Record<MarkerModule,NativeMarker|null>>>};
async function native(directory:string,operation:"read"|"cas",fields:Record<string,string>={}){
 return await new Promise<{value:string;digest:string}>((resolve,reject)=>{
  const child=spawn(path.join(process.env.SystemRoot!,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoLogo","-NoProfile","-NonInteractive","-File",fileURLToPath(new URL("./operation-keys.ps1",import.meta.url))],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
  const chunks:Buffer[]=[];let size=0,errors=0,done=false;
  const finish=(bad:boolean)=>{if(done)return;done=true;clearTimeout(timer);try{if(bad)return reject(Error("Original recovery key storage unavailable."));const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!exact(value,["value","digest"])||typeof value.value!=="string"||typeof value.digest!=="string"||!/^[a-f0-9]{64}$/.test(value.digest))return reject(Error("Original recovery key storage unavailable."));resolve(value as {value:string;digest:string});}catch{reject(Error("Original recovery key storage unavailable."));}finally{chunks.forEach(c=>c.fill(0));}};
  const timer=setTimeout(()=>{child.kill();finish(true);},15000);timer.unref();
  child.stdout.on("data",(b:Buffer)=>{size+=b.length;if(size>180000){child.kill();finish(true);}else chunks.push(Buffer.from(b));});
  child.stderr.on("data",(b:Buffer)=>{errors+=b.length;if(errors>4096){child.kill();finish(true);}});
  child.once("error",()=>finish(true));child.once("close",code=>finish(code!==0||errors!==0));child.stdin.once("error",()=>finish(true));
  const payload=Buffer.from(JSON.stringify({directory,operation,...fields}));child.stdin.end(payload,()=>payload.fill(0));
 });
}
// Called only after selected/root admission and while the single runtime lease
// is held. Renderer input can never select the directory, identity or generation.
export async function openDesktopOperationKeys(root:LocalKeyConfiguration,active:LocalKeyConfiguration,guard:()=>void){
 guard();let rootId!:string;await withProtectedLocalKeys(root,async k=>{rootId=digest([k.metadata.installationId,k.metadata.deviceId]);});
 const file=resolveDatabaseLocation(active.database).filename,stat=lstatSync(file,{bigint:true});
 let binding!:string;await withProtectedLocalKeys(active,async k=>{binding=digest([k.metadata.installationId,k.metadata.deviceId,stat.dev.toString(),stat.ino.toString()]);});
 const directory=path.join(root.directory,"operation-keys"),anchor=path.join(root.directory,"operation-keys.json");
 let state:RecordState,cipher:string|undefined,poisoned=false;
 const live=()=>{guard();if(poisoned)return markerFailure();const s=lstatSync(file,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||s.nlink!==BigInt(1)||s.dev!==stat.dev||s.ino!==stat.ino)return markerFailure();};
 function validate(value:unknown):RecordState{
  if(!exact(value,["format","root","binding","revision","retired","slots"])||value.format!=="SHOP_POS_OPERATION_KEYS_V2"||value.root!==rootId||typeof value.binding!=="string"||!/^[a-f0-9]{64}$/.test(value.binding)||typeof value.revision!=="string"||!/^(0|[1-9][0-9]{0,14})$/.test(value.revision)||!Array.isArray(value.retired)||value.retired.length>64||value.retired.some(v=>typeof v!=="string"||!/^[a-f0-9]{64}$/.test(v))||new Set(value.retired).size!==value.retired.length||value.retired.includes(value.binding)||!exact(value.slots,["ADMIN","SALESPERSON"]))return markerFailure();
  const slots=value.slots;for(const role of ["ADMIN","SALESPERSON"] as const){const keys=modules.filter(m=>allowed(role,m));if(!exact(slots[role],keys))return markerFailure();for(const m of keys){const marker=nativeMarker(m,slots[role][m]);if(role==="SALESPERSON"&&m==="returns"&&marker!==null&&marker.kind!=="REFUND")return markerFailure();}}
  return value as unknown as RecordState;
 }
 function files(){live();const names=readdirSync(directory);if(names.length!==1||names[0]!=="markers.dpapi")return markerFailure();const s=lstatSync(path.join(directory,names[0]));if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size<1||s.size>131072)return markerFailure();}
 async function load(){
  files();const read=await native(directory,"read");live();if(cipher!==undefined&&read.digest!==cipher)return markerFailure();
  const bytes=Buffer.from(read.value,"base64");try{state=validate(JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(bytes)));cipher=read.digest;}finally{bytes.fill(0);}files();
 }
 async function save(next:RecordState,initial=false){
  live();const raw=JSON.stringify(validate(next));if(Buffer.byteLength(raw)>65536)return markerFailure();
  try{const result=await native(directory,"cas",{expected:initial?"ABSENT":cipher!,value:Buffer.from(raw).toString("base64")});live();const bytes=Buffer.from(result.value,"base64");try{if(bytes.toString("utf8")!==raw)return markerFailure();state=validate(JSON.parse(raw));cipher=result.digest;}finally{bytes.fill(0);}files();}catch{poisoned=true;return markerFailure();}
 }
 if(!existsSync(anchor)){
  if(existsSync(directory))return markerFailure();
  const fd=openSync(anchor,"wx");try{writeSync(fd,rootId);fsyncSync(fd);}finally{closeSync(fd);}
  mkdirSync(directory);await storage(directory,"initialize");
  await save({format:"SHOP_POS_OPERATION_KEYS_V2",root:rootId,binding,revision:"0",retired:[],slots:empty()},true);
 }else{
  const a=lstatSync(anchor);if(!a.isFile()||a.isSymbolicLink()||a.nlink!==1||a.size!==64||readFileSync(anchor,"utf8")!==rootId||!existsSync(directory))return markerFailure();await storage(root.directory,"check",{filename:"operation-keys.json"});await load();
 }
 if(state!.binding!==binding){
  if(state!.retired.includes(binding)||state!.retired.length>=64||Object.values(state!.slots).some(s=>Object.values(s).some(m=>m!==null)))return markerFailure();
  await save({...state!,binding,revision:String(BigInt(state!.revision)+BigInt(1)),retired:[...state!.retired,state!.binding],slots:empty()});
 }
 const access=async(role:Role,input:unknown):Promise<MarkerSnapshot>=>{
  live();const command=markerCommand(input);if(!allowed(role,command.module))return markerFailure();if(command.action==="cas"&&role==="SALESPERSON"&&command.module==="returns"&&[command.expected,command.next].some(m=>m!==null&&m.kind!=="REFUND"))return markerFailure();await load();if(state.binding!==binding)return markerFailure();
  const current=state.slots[role][command.module]??null;
  if(command.action==="read")return {revision:state.revision,marker:current};
  if(command.revision!==state.revision||!sameNativeMarker(current,command.expected))return markerFailure();markerTransition(command.module,current,command.next);
  const revision=String(BigInt(state.revision)+BigInt(1));
  await save({...state,revision,slots:{...state.slots,[role]:{...state.slots[role],[command.module]:command.next}}});
  return {revision,marker:command.next};
 };
 return Object.assign(access,{async assertSettled(){
  live();await load();if(state.binding!==binding||Object.values(state.slots).some(s=>Object.values(s).some(m=>m!==null)))return markerFailure();
 }});
}