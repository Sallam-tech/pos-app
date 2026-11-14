import "server-only";
import { assertProtectedWriterAdmission, type ProtectedWriterAdmission } from "../bootstrap/writer-admission";
import { protectedRestoredHistory, type ProtectedRestoredHistory } from "./protected-history";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import {unlink} from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { AuthorizationGateway, AuthorizedTransaction } from "../auth/types";
import type { DatabaseOptions } from "../db/location";
import { resolveDatabaseLocation } from "../db/location";
import { canonical, digest } from "../inventory/validation";
import { load } from "../inventory/model";
import { assertReturnLedgers } from "../returns/ledgers";
import { assertExpenseLedgers } from "../expenses/ledgers";
import { assertInvoiceLedgers } from "../invoices/ledgers";
import { assertCashLedgers } from "../cash/source";
import { assertStoredSettingsLedgers } from "../settings/model";
import { custodyMetadata, decryptSnapshot, encryptSnapshot, hashFile, signProtectedEvidence, verifyProtectedEvidence, type BackupCustody } from "./crypto";
import { fingerprint, fingerprintTable, openProofDatabase, verifySchema41, type ProofDatabase } from "./snapshot";
import { SETTINGS_HISTORY_TABLES, rowHasher, type TableProof } from "./row-hash";
import { storage, fail, testDirectory } from "./storage";

export type HistoricalSettings = Readonly<{ namespace: string; context: string; tables: readonly TableProof[] }>;
declare const restoreBrand: unique symbol;
export interface VerifiedTestRestore { readonly [restoreBrand]: true }
declare const authorityBrand: unique symbol;
export interface TestRestoreAuthority { readonly [authorityBrand]: true }
type Identity={filename:string;device:string;inode:string};
interface RestoreState { identity:Identity; history:readonly HistoricalSettings[]; archiveId:string }
const restores=new WeakMap<object,RestoreState>();
const authorities=new WeakMap<object,{gateway:AuthorizationGateway;request:Request;archiveHash:string;directory:string;expires:number}>();
const fileIdentity=(filename:string):Identity=>{const s=lstatSync(filename,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||s.nlink!==BigInt(1))return fail();return {filename:path.resolve(filename).toLowerCase(),device:String(s.dev),inode:String(s.ino)};};
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
export function testSourceNamespace(filename:string){const i=fileIdentity(filename);return createHash("sha256").update(JSON.stringify(["pos-test-inventory-file-v1",i.filename,i.device,i.inode])).digest("hex");}
export function validateHistoricalSettings(value:unknown):HistoricalSettings {
 if(!value||typeof value!=="object"||Array.isArray(value))return fail();
 const h=value as HistoricalSettings;
 if(Object.keys(h).sort().join(",")!=="context,namespace,tables"||!/^([a-f0-9]{64})$/.test(h.context)||!/^([a-f0-9]{64})$/.test(h.namespace)||!Array.isArray(h.tables)||h.tables.length!==5)return fail();
 for(const name of SETTINGS_HISTORY_TABLES){const t=h.tables.find(t=>t.name===name);if(!t||Object.keys(t).sort().join(",")!=="count,digest,maxRowid,name"||!/^([a-f0-9]{64})$/.test(t.digest)||!/^([0-9]{1,19})$/.test(t.count)||!/^([0-9]{1,19})$/.test(t.maxRowid)||BigInt(t.maxRowid)>BigInt("9223372036854775807")||BigInt(t.count)>BigInt(t.maxRowid))return fail();}
 return Object.freeze({namespace:h.namespace,context:h.context,tables:Object.freeze(h.tables.map(t=>Object.freeze({...t})))});
}
export function restoredHistory(proof:unknown,database:DatabaseOptions):readonly HistoricalSettings[]{
 if(proof===undefined)return [];
 if(process.env.NODE_ENV!=="test"||database.mode!=="test"||!proof||typeof proof!=="object")return fail();
 const s=restores.get(proof);if(!s)return fail();
 const location=resolveDatabaseLocation({...database,create:false});
 if(!same(s.identity,fileIdentity(location.filename)))return fail();
 return s.history;
}
export async function verifyHistoricalPrefixes(tx:Pick<AuthorizedTransaction,"all">,histories:readonly HistoricalSettings[]){
 for(const h of histories)for(const expected of h.tables){
  const hash=rowHasher();let after=BigInt(0);const maximum=BigInt(expected.maxRowid);
  for(;;){const rows=await tx.all('SELECT rowid AS __proof_rowid,* FROM "'+expected.name+'" WHERE rowid>? AND rowid<=? ORDER BY rowid LIMIT 200',[after,maximum]);if(!rows.length)break;
   for(const row of rows){hash.add(row);after=row.__proof_rowid as bigint;}
  }
  if(!same(hash.result(expected.name),expected))return fail();
 }
}
const scope=(db:ProofDatabase):AuthorizedTransaction=>({get:async(sql,values)=>db.prepare(sql).get(...(values??[])),all:async(sql,values)=>db.prepare(sql).all(...(values??[])),run:async()=>fail()});
async function settingsOrigin(db:ProofDatabase,namespace:string):Promise<HistoricalSettings>{
 const p=db.prepare("SELECT completed_at_ms FROM auth_provisioning WHERE id=1").get(),m=db.prepare("SELECT checksum FROM schema_migrations WHERE version=41").get();
 if(!p||!m)return fail();
 const tables=SETTINGS_HISTORY_TABLES.map(name=>fingerprintTable(db,name));
 return validateHistoricalSettings({namespace,context:digest(["settings41-v1",namespace,String(p.completed_at_ms),m.checksum]),tables});
}
export async function verifyProtectedSnapshotContents(db:ProofDatabase,namespace:string,prior:readonly HistoricalSettings[]){
 await verifySchema41(db);const tx=scope(db);await verifyHistoricalPrefixes(tx,prior);
 const origin=await settingsOrigin(db,namespace);
 await assertStoredSettingsLedgers(tx,origin.context,prior);
 await assertReturnLedgers(tx);await assertExpenseLedgers(tx);await assertInvoiceLedgers(tx);await assertCashLedgers(tx);
 let after="";
 for(;;){const products=await tx.all("SELECT id FROM products WHERE id>? ORDER BY id LIMIT 200",[after]);if(!products.length)break;for(const p of products){after=String(p.id);await load(tx,after);}}
 return {fingerprint:fingerprint(db),origin};
}
async function signedRecord(custody:BackupCustody,directory:string,record:unknown){
 const b=Buffer.from(canonical({record,signature:signProtectedEvidence(custody,record)}));try{await storage(directory,"seal-record",{value:b.toString("base64")});}finally{b.fill(0);}
}
function mint(state:RestoreState):VerifiedTestRestore {const proof=Object.freeze({toJSON:fail}) as unknown as VerifiedTestRestore;restores.set(proof,state);return proof;}
export async function authorizeTestRestore(gateway:AuthorizationGateway,request:Request,password:unknown,archive:string,directory:string):Promise<TestRestoreAuthority>{
 testDirectory(directory);testDirectory(path.dirname(archive));
 const receipt=await gateway.verifyAdminPassword(password);
 await gateway.withFreshAdminTransaction(request,receipt,async(_tx,actor)=>{if(actor.role!=="ADMIN")return fail();});
 const expires=performance.now()+30000;
 const proof=Object.freeze({toJSON:fail}) as unknown as TestRestoreAuthority;
 authorities.set(proof,{gateway,request,archiveHash:(await hashFile(archive)).sha256,directory:path.resolve(directory),expires});
 return proof;
}
async function cleanupStaging(directory:string,names:readonly string[]){
 testDirectory(directory);
 for(const name of names){if(!/^(?:snapshot|verification)\.sqlite3(?:-wal|-shm|-journal)?$|^restored\.pending(?:-wal|-shm|-journal)?$/.test(name))return fail();
  const filename=path.join(directory,name);let stat;try{stat=lstatSync(filename);}catch(e){if(e&&typeof e==="object"&&"code"in e&&e.code==="ENOENT")continue;throw e;}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)return fail();await unlink(filename);
 }
}
async function createArchive(custody:BackupCustody,database:DatabaseOptions,directory:string,prior:readonly HistoricalSettings[],guard:()=>void,signal?:AbortSignal,archiveId?:string){
 guard();if(database.mode!=="test")return fail();testDirectory(directory);
 await storage(directory,"initialize");
 try{
 const source=resolveDatabaseLocation({...database,create:false}).filename,identity=fileIdentity(source),namespace=testSourceNamespace(source);
 const raw=openProofDatabase(source),snapshot=path.join(directory,"snapshot.sqlite3");
 try{raw.exec("BEGIN");const pages=raw.prepare("SELECT page_count*page_size AS bytes FROM pragma_page_count,pragma_page_size").get()?.bytes;
 if(typeof pages!=="bigint"||pages<=BigInt(0)||pages>BigInt(1024*1024*1024))return fail();
 const available=await storage(directory,"space");if(typeof available!=="string"||BigInt(available)<pages*BigInt(4)+BigInt(16*1024*1024))return fail();
 await raw.backup(snapshot,{progress:()=>{guard();if(signal?.aborted)return fail();return 64;}});if(!same(identity,fileIdentity(source)))return fail();raw.exec("ROLLBACK");}finally{raw.close();}
 const copied=openProofDatabase(snapshot);let facts:Awaited<ReturnType<typeof verifyProtectedSnapshotContents>>;
 try{copied.exec("BEGIN");facts=await verifyProtectedSnapshotContents(copied,namespace,prior);copied.exec("ROLLBACK");}finally{copied.close();}
 const free=await storage(directory,"space");if(typeof free!=="string"||BigInt(free)<lstatSync(snapshot,{bigint:true}).size*BigInt(4)+BigInt(16*1024*1024))return fail();
 const pending=path.join(directory,"archive.pending");
 const manifest=await encryptSnapshot(custody,snapshot,pending,namespace,facts.fingerprint,signal,[...prior],archiveId);
 const verification=path.join(directory,"verification.sqlite3"),decoded=await decryptSnapshot(custody,pending,verification,signal);
 if(!same(decoded,manifest))return fail();
 const check=openProofDatabase(verification);try{check.exec("BEGIN");const result=await verifyProtectedSnapshotContents(check,namespace,prior);if(!same(result.fingerprint,manifest.fingerprint))return fail();check.exec("ROLLBACK");}finally{check.close();}
 guard();const name=manifest.archiveId+".age";await storage(directory,"publish",{source:"archive.pending",target:name});
 guard();
 // SNAPSHOT_VERIFIED is deliberately distinct from app/independent restore PASS.
 return Object.freeze({archive:path.join(directory,name),manifest,state:"SNAPSHOT_VERIFIED_APP_RESTORE_PENDING" as const,keyId:custodyMetadata(custody).id});
 }finally{await cleanupStaging(directory,["snapshot.sqlite3","snapshot.sqlite3-wal","snapshot.sqlite3-shm","snapshot.sqlite3-journal","verification.sqlite3","verification.sqlite3-wal","verification.sqlite3-shm","verification.sqlite3-journal"]);}
}
export function createTestArchive(custody:BackupCustody,database:DatabaseOptions,directory:string,priorProof?:VerifiedTestRestore,signal?:AbortSignal,archiveId?:string){
 return createArchive(custody,database,directory,restoredHistory(priorProof,database),()=>{},signal,archiveId);
}
export function createProtectedArchive41(custody:BackupCustody,database:DatabaseOptions,directory:string,admission:ProtectedWriterAdmission,history?:ProtectedRestoredHistory,signal?:AbortSignal,archiveId?:string){
 const guard=()=>{const facts=assertProtectedWriterAdmission(admission,database,undefined,true);if(facts.schema!==41||facts.maintenanceOnly||facts.restored&&!history)return fail();};
 guard();const prior=protectedRestoredHistory(history,database);return createArchive(custody,database,directory,prior,guard,signal,archiveId);
}
export async function restoreTestArchive(custody:BackupCustody,authority:TestRestoreAuthority,archive:string,directory:string,signal?:AbortSignal){
 const a=authorities.get(authority);authorities.delete(authority);
 if(!a||a.directory!==path.resolve(directory)||a.expires<=performance.now()||a.archiveHash!==(await hashFile(archive)).sha256)return fail();
 testDirectory(directory);if(readdirSync(directory).length)return fail();
 await storage(directory,"initialize");
 try{
 const pending=path.join(directory,"restored.pending"),manifest=await decryptSnapshot(custody,archive,pending,signal,undefined,a.archiveHash);
 const prior=manifest.history.map(validateHistoricalSettings),db=openProofDatabase(pending);let origin:HistoricalSettings;
 try{db.exec("BEGIN");const result=await verifyProtectedSnapshotContents(db,manifest.sourceNamespace,prior);if(!same(result.fingerprint,manifest.fingerprint))return fail();origin=result.origin;db.exec("ROLLBACK");}finally{db.close();}
 const histories=[...prior,origin];if(histories.length>16)return fail();
 if(signal?.aborted||a.expires<=performance.now())return fail();
 if((await a.gateway.authorizeAdmin(a.request)).role!=="ADMIN")return fail();
 if(signal?.aborted||a.expires<=performance.now())return fail();
 await storage(directory,"publish",{source:"restored.pending",target:"restored.sqlite3"});
 const identity=fileIdentity(path.join(directory,"restored.sqlite3"));
 const state:RestoreState={identity,history:Object.freeze(histories),archiveId:manifest.archiveId};
 await signedRecord(custody,directory,{format:"POS_TEST_RESTORE_V1",state,archiveSha256:a.archiveHash,snapshotSha256:manifest.databaseSha256});
 return Object.freeze({database:{directory,filename:"restored.sqlite3",mode:"test" as const,create:false},proof:mint(state),archiveId:manifest.archiveId});
 }finally{await cleanupStaging(directory,["restored.pending","restored.pending-wal","restored.pending-shm","restored.pending-journal"]);}
}
export async function reopenTestRestore(custody:BackupCustody,directory:string){
 const encoded=await storage(directory,"unseal-record");if(typeof encoded!=="string")return fail();
 const b=Buffer.from(encoded,"base64");
 try{const envelope=JSON.parse(b.toString("utf8")),record=envelope.record;
  if(!verifyProtectedEvidence(custody,record,envelope.signature)||record.format!=="POS_TEST_RESTORE_V1"||!record.state||!Array.isArray(record.state.history)||record.state.history.length>16)return fail();
  const database={directory,filename:"restored.sqlite3",mode:"test" as const,create:false},location=resolveDatabaseLocation(database);
  if(!same(record.state.identity,fileIdentity(location.filename)))return fail();
  const histories=record.state.history.map(validateHistoricalSettings),db=openProofDatabase(location.filename);
  try{db.exec("BEGIN");await verifyProtectedSnapshotContents(db,testSourceNamespace(location.filename),histories);db.exec("ROLLBACK");}finally{db.close();}
  return Object.freeze({database,proof:mint({...record.state,history:Object.freeze(histories)})});
 }catch{return fail();}finally{b.fill(0);}
}

export async function inspectTestPortableArchive(custody:BackupCustody,archive:string,directory:string){
 testDirectory(directory);if(readdirSync(directory).length)return fail();await storage(directory,"initialize");
 const pending=path.join(directory,"restored.pending");
 try{
  const bound=await hashFile(archive),manifest=await decryptSnapshot(custody,archive,pending,undefined,undefined,bound.sha256),prior=manifest.history.map(validateHistoricalSettings),db=openProofDatabase(pending);
  try{db.exec("BEGIN");const result=await verifyProtectedSnapshotContents(db,manifest.sourceNamespace,prior);if(!same(result.fingerprint,manifest.fingerprint))return fail();db.exec("ROLLBACK");
   return Object.freeze({state:"READ_ONLY_PORTABLE_TEST_VERIFIED" as const,schema:41,archiveId:manifest.archiveId,archiveSha256:bound.sha256,archiveBytes:bound.bytes,snapshotSha256:manifest.databaseSha256,fingerprint:result.fingerprint,productionActivation:false as const});
  }finally{db.close();}
 }finally{await cleanupStaging(directory,["restored.pending","restored.pending-wal","restored.pending-shm","restored.pending-journal"]);}
}
