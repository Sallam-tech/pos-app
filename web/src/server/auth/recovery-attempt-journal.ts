import "server-only";
import {createHash} from "node:crypto";
import {existsSync,lstatSync,mkdirSync,readdirSync,readFileSync} from "node:fs";
import path from "node:path";
import {storage} from "../backup/storage";
import {enrollmentDigest} from "../bootstrap/database";
import type {SqlRow,SqlValue} from "../db/connection";
import type {Role} from "./types";
import {createPersistentLoginAttemptProtection} from "./login-attempts";
const fail=():never=>{throw Error("Authentication failed.");};
const hash=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
const names=["revision","last_seen_ms","cooldown_until_ms",...Array.from({length:10},(_,i)=>"failed_"+(i+1)+"_ms")];
const copy=(rows:SqlRow[])=>rows.map(row=>({...row}));
const encoded=(rows:SqlRow[])=>rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==="bigint"?String(v):v])));
function decoded(value:unknown):SqlRow[]{
 if(!Array.isArray(value)||value.length!==3)return fail();
 return value.map((row,i)=>{
  if(!row||typeof row!=="object"||Object.keys(row).sort().join(",")!==["bucket","format_version",...names].sort().join(",")||row.bucket!==["ADMIN","GLOBAL","SALESPERSON"][i])return fail();
  return Object.fromEntries(Object.entries(row).map(([k,v])=>{if(k==="bucket")return [k,v];if(typeof v!=="string"||! /^(?:0|[1-9][0-9]{0,18})$/.test(v)||BigInt(v)>BigInt("9223372036854775807"))return fail();return [k,BigInt(v)];})) as SqlRow;
 });
}
// Attempts ONLY, never credentials/accounts/sessions or a SQL connection. A
// protected append is acknowledged and read back BEFORE any password derivation.
// Shared by every staged copy with the same inherited credential snapshot.
export async function openRecoveryAttemptJournal(input:{directory:string;context:string;baseline:SqlRow[];allowCreate:boolean;namespace?:{id:string;exists:boolean};guard():void;verify(role:Role,password:unknown):Promise<boolean>}){
 const {directory,context,guard}=input;guard();
 let sequence=0,inventory="",rows:SqlRow[]=[],working:SqlRow[]|undefined,poisoned=false,namespaces:string[]=[];
 function files(){
  guard();const entries=readdirSync(directory).sort();if(entries.length>256||entries.some((n,i)=>n!==String(i+1).padStart(6,"0")))return fail();
  return entries.map(name=>{const d=path.join(directory,name),s=lstatSync(d);if(!s.isDirectory()||s.isSymbolicLink()||readdirSync(d).join(",")!=="restore.dpapi")return fail();const f=path.join(d,"restore.dpapi"),t=lstatSync(f);if(!t.isFile()||t.isSymbolicLink()||t.nlink!==1||t.size<9||t.size>16384)return fail();return [name,hash(readFileSync(f))];});
 }
 async function load(){
  guard();await storage(directory,"check");const before=files();if(!before.length||before.length<sequence||(sequence>0&&enrollmentDigest(before.slice(0,sequence))!==inventory))return fail();
  const value=await storage(path.join(directory,before.at(-1)![0]),"unseal-record");if(typeof value!=="string")return fail();const bytes=Buffer.from(value,"base64");
  try{const record=JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(bytes));if(!record||Object.keys(record).sort().join(",")!=="context,format,namespaces,previous,rows,sequence"||record.format!=="POS_RECOVERY_ATTEMPTS_V2"||record.context!==context||record.sequence!==String(before.length)||record.previous!==enrollmentDigest(before.slice(0,-1)))return fail();if(!Array.isArray(record.namespaces)||record.namespaces.length>128||record.namespaces.some((v:unknown,i:number)=>typeof v!=="string"||! /^[a-f0-9]{64}$/.test(v)||i>0&&record.namespaces[i-1]>=v))return fail();namespaces=[...record.namespaces];rows=decoded(record.rows);sequence=before.length;inventory=enrollmentDigest(before);if(enrollmentDigest(files())!==inventory)return fail();}finally{bytes.fill(0);}guard();
 }
 async function append(next:SqlRow[]){
  guard();if(sequence>=256||enrollmentDigest(files())!==inventory)return fail();const destination=path.join(directory,String(sequence+1).padStart(6,"0"));mkdirSync(destination);await storage(destination,"initialize");
  const bytes=Buffer.from(JSON.stringify({format:"POS_RECOVERY_ATTEMPTS_V2",context,namespaces,sequence:String(sequence+1),previous:inventory,rows:encoded(next)}));
  try{await storage(destination,"seal-record",{value:bytes.toString("base64")});}finally{bytes.fill(0);}await load();if(enrollmentDigest(encoded(rows))!==enrollmentDigest(encoded(next)))return fail();
 }
 if(!existsSync(directory)){
  if(!input.allowCreate)return fail();mkdirSync(directory);await storage(directory,"initialize");inventory=enrollmentDigest([]);await append(decoded(encoded(input.baseline)));
 }else await load();
 if(input.namespace){const n=input.namespace;if(! /^[a-f0-9]{64}$/.test(n.id)||namespaces.includes(n.id)!==n.exists)return fail();if(!n.exists){namespaces.push(n.id);namespaces.sort();await append(rows);}}
 const identity={};return createPersistentLoginAttemptProtection({identity,
  read(){guard();if(!working||poisoned)return fail();return copy(working);},
  update(values:readonly SqlValue[]){guard();if(!working||poisoned||values.length!==15)return fail();const row=working.find(r=>r.bucket===values[13]);if(!row||row.revision!==values[14])return BigInt(0);names.forEach((name,i)=>(row as Record<string,SqlValue>)[name]=values[i]);return BigInt(1);},
  reserve(){guard();if(!working||poisoned)return fail();},inTransaction:()=>!!working,quarantine(){poisoned=true;},
  async withTransaction<T>(work:()=>Promise<T>):Promise<T>{guard();if(working||poisoned)return fail();await load();working=copy(rows);try{const result=await work(),next=working;await append(next);working=undefined;return result;}catch{poisoned=true;working=undefined;return fail();}},
  async verifyCredential(role,password){guard();if(poisoned)return fail();const result=await input.verify(role,password);guard();return result;},
 });
}