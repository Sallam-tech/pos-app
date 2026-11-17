import {test,expect,beforeAll} from "vitest";
import {randomUUID,randomBytes} from "node:crypto";
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from "node:fs";
import path from "node:path";
import {openRecoveryAttemptJournal} from "../../src/server/auth/recovery-attempt-journal";
import {passwordCallbacks} from "../../src/server/auth/password";
import {storage} from "../../src/server/backup/storage";
import type {SqlRow} from "../../src/server/db/connection";
const base=path.resolve("test-results/sqlite-b1b-part1/recovery-attempts-"+randomUUID());mkdirSync(base,{recursive:true});
const baseline=()=>["ADMIN","GLOBAL","SALESPERSON"].map(bucket=>Object.fromEntries([["bucket",bucket],["format_version",BigInt(1)],["revision",BigInt(0)],["last_seen_ms",BigInt(0)],["cooldown_until_ms",BigInt(0)],...Array.from({length:10},(_,i)=>["failed_"+(i+1)+"_ms",BigInt(0)])]) as SqlRow);
let hash:string;const password=randomBytes(24).toString("base64url");beforeAll(async()=>{hash=await passwordCallbacks.hash(password);});
async function latest(directory:string){const names=readdirSync(directory).sort(),encoded=await storage(path.join(directory,names.at(-1)!),"unseal-record");return JSON.parse(Buffer.from(encoded as string,"base64").toString("utf8"));}
test("five real failed passwords persist across reopen; cooldown rejects a correct password before KDF; other role remains usable",async()=>{
 const directory=path.join(base,"persistent"),calls:string[]=[];const open=(allowCreate:boolean)=>openRecoveryAttemptJournal({directory,context:"test-persistent",baseline:baseline(),allowCreate,guard(){},verify:async(role,value)=>{calls.push(role);return passwordCallbacks.verify({hash,password:value as string});}});
 let p=await open(true);for(let i=0;i<3;i++)await expect(p.verifyAdminPassword("wrong-password")).rejects.toThrow("Authentication failed.");p=await open(false);for(let i=0;i<2;i++)await expect(p.verifyAdminPassword("wrong-password")).rejects.toThrow();expect(calls).toHaveLength(5);p=await open(false);await expect(p.verifyAdminPassword(password)).rejects.toThrow();expect(calls).toHaveLength(5);const row=(await latest(directory)).rows.find((r:SqlRow)=>r.bucket==="ADMIN");expect(BigInt(row.cooldown_until_ms)).toBeGreaterThan(BigInt(row.failed_5_ms));await p.verifySalespersonPassword(password);expect(calls.at(-1)).toBe("SALESPERSON");
});
test("reservation is durably read back before verifier; an interrupted KDF retains its pessimistic charge",async()=>{
 const directory=path.join(base,"interrupted");let reserved=false;const p=await openRecoveryAttemptJournal({directory,context:"test-interrupted",baseline:baseline(),allowCreate:true,guard(){},verify:async()=>{const r=(await latest(directory)).rows.find((r:SqlRow)=>r.bucket==="ADMIN");reserved=BigInt(r.failed_1_ms)>BigInt(0);throw Error("controlled verifier interruption");}});await expect(p.verifyAdminPassword(password)).rejects.toThrow();expect(reserved).toBe(true);
 const reopen=await openRecoveryAttemptJournal({directory,context:"test-interrupted",baseline:baseline(),allowCreate:false,guard(){},verify:async()=>false});await expect(reopen.verifyAdminPassword(password)).rejects.toThrow();const r=(await latest(directory)).rows.find((r:SqlRow)=>r.bucket==="ADMIN");expect(BigInt(r.failed_2_ms)).toBeGreaterThan(BigInt(0));
});
test("tampered prior ciphertext, wrong binding and incomplete publication fail closed without password work",async()=>{
 const directory=path.join(base,"tamper");let calls=0;const input={directory,context:"test-tamper",baseline:baseline(),allowCreate:true,guard(){},verify:async()=>{calls++;return false;}};const p=await openRecoveryAttemptJournal(input);await expect(p.verifyAdminPassword(password)).rejects.toThrow();expect(calls).toBe(1);await expect(openRecoveryAttemptJournal({...input,allowCreate:false,context:"wrong-binding"})).rejects.toThrow();
 const file=path.join(directory,"000001/restore.dpapi"),bytes=readFileSync(file);bytes[bytes.length-1]^=1;writeFileSync(file,bytes);await expect(openRecoveryAttemptJournal({...input,allowCreate:false})).rejects.toThrow();expect(calls).toBe(1);
 const pending=path.join(base,"pending");mkdirSync(pending);await storage(pending,"initialize");mkdirSync(path.join(pending,"000001"));await expect(openRecoveryAttemptJournal({...input,directory:pending,allowCreate:false})).rejects.toThrow();
});
test("missing journal and lost genuine fence never recreate state or invoke the verifier",async()=>{
 let held=true,calls=0;const directory=path.join(base,"fence"),input={directory,context:"test-fence",baseline:baseline(),allowCreate:false,guard(){if(!held)throw Error("fence lost");},verify:async()=>{calls++;return true;}};await expect(openRecoveryAttemptJournal(input)).rejects.toThrow();const p=await openRecoveryAttemptJournal({...input,allowCreate:true});held=false;await expect(p.verifyAdminPassword(password)).rejects.toThrow();expect(calls).toBe(0);
});
test("namespace registry fences missing/replaced archive state before any credential derivation",async()=>{
 const directory=path.join(base,"registry"),id="a".repeat(64),input={directory,context:"test-registry",baseline:baseline(),allowCreate:true,guard(){},verify:async()=>{throw Error("No verifier may run during registration");}};
 await openRecoveryAttemptJournal({...input,namespace:{id,exists:false}});
 await expect(openRecoveryAttemptJournal({...input,allowCreate:false,namespace:{id,exists:false}})).rejects.toThrow();
 await openRecoveryAttemptJournal({...input,allowCreate:false,namespace:{id,exists:true}});
 await expect(openRecoveryAttemptJournal({...input,allowCreate:false,namespace:{id:"b".repeat(64),exists:true}})).rejects.toThrow();
});