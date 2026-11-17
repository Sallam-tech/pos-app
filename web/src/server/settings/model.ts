import {assertSaleCashBindingsAndSettings} from "../cash/sale-bindings";
import "server-only";
import type {HistoricalSettings} from "../backup/service";
import type {AuthorizedTransaction as Tx} from "../auth/types";
import {resumeGuardInputs,retainGuardInputs,captureGuardInputs,guardInputsUnchanged,authorizedFileNamespace,restoredSettingsHistory} from "../auth/database";
import {canonical,digest,integer,object,text,uuid} from "../inventory/validation";
import {verifiedJson} from "../db/verified-json";
export type Branding={shopName:string;address:string;phone:string;footer:string;receiptLayout:"ordinary"|"compact";currency:"PKR";timezone:"Asia/Karachi"};
export function branding(value:unknown):Branding{
 const o=object(value,["shopName","address","phone","footer","receiptLayout","currency","timezone"]);
 if(o.phone && (typeof o.phone!=="string"||!/^[-+()0-9 .]+$/.test(o.phone)||!/[0-9]/.test(o.phone)))throw Error();
 if(!["ordinary","compact"].includes(String(o.receiptLayout))||o.currency!=="PKR"||o.timezone!=="Asia/Karachi")throw Error("Settings unavailable.");
 return {shopName:text(o.shopName,80),address:text(o.address,240,true),phone:text(o.phone,32,true),footer:text(o.footer,160,true),receiptLayout:o.receiptLayout as Branding["receiptLayout"],currency:"PKR",timezone:"Asia/Karachi"};
}
export function settingsPayload(value:unknown){const o=object(value,["expectedRevision","settings","reason"]);return {expectedRevision:integer(o.expectedRevision,undefined,true).toString(),settings:branding(o.settings),reason:text(o.reason,160)};}
type Row=NonNullable<Awaited<ReturnType<Tx["get"]>>>;
export const revisionValue=(r:Row)=>({id:uuid(r.id),revision:String(r.revision),settings:branding({shopName:r.shop_name,address:r.address,phone:r.phone,footer:r.footer,receiptLayout:r.receipt_layout,currency:r.currency,timezone:r.timezone}),reason:text(r.reason,160),recordedAtMs:String(r.recorded_at_ms)});
export async function settingsContext(tx:Tx){const p=await tx.get("SELECT completed_at_ms FROM auth_provisioning WHERE id=1"),m=await tx.get("SELECT checksum FROM schema_migrations WHERE version=41");if(!p||!m)throw Error();return digest(["settings41-v1",authorizedFileNamespace(tx),String(p.completed_at_ms),m.checksum]);}
export async function currentSettings(tx:Tx){const r=await tx.get("SELECT * FROM shop_settings_revisions ORDER BY revision DESC LIMIT 1");return r?revisionValue(r):null;}
export async function frozenBranding(tx:Tx,id:string):Promise<Branding>{const r=await tx.get("SELECT * FROM shop_settings_revisions WHERE id=?",[uuid(id)]);if(!r)throw Error();return revisionValue(r).settings;}
export async function receiptBranding(tx:Tx,id:string){await assertFinancialSettings(tx,[id]);if((await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version!==BigInt(41))return undefined;const r=await tx.get("SELECT * FROM invoice_shop_snapshots WHERE invoice_id=?",[id]);if(!r)return undefined;const value=branding(verifiedJson(r.branding_json,r.branding_hash,true));if(r.format_version!==BigInt(1)||canonical(value)!==canonical(await frozenBranding(tx,String(r.settings_id))))throw Error();return value;}
export async function assertAccountSettingsLedgers(tx:Tx){
 if((await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version!==BigInt(41))return;
 await assertStoredAccountSettings(tx,await settingsContext(tx),await restoredSettingsHistory(tx));
}
const continuationOwner=Object.freeze({});
export async function assertSettingsLedgers(tx:Tx){
 if(resumeGuardInputs(tx,"SETTINGS",continuationOwner))return;
 const point=captureGuardInputs(tx,"SETTINGS");
 if((await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version!==BigInt(41))return;
 const current=await settingsContext(tx),historical=await restoredSettingsHistory(tx);
 await assertStoredSettingsLedgers(tx,current,historical);
 if(point&&guardInputsUnchanged(tx,"SETTINGS",point,true))retainGuardInputs(tx,"SETTINGS",point,continuationOwner);
}
// Pure READ validator for authenticated snapshots, not an authority capability.
export async function assertStoredSettingsLedgers(tx:Tx,current:string,historical:readonly HistoricalSettings[]=[]){
 await assertStoredAccountSettings(tx,current,historical);await assertFinancialSettings(tx);
}
async function assertStoredAccountSettings(tx:Tx,current:string,historical:readonly HistoricalSettings[]=[]){
 if((await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version!==BigInt(41))return;
 const accepted=(table:string,r:Row)=>{if(r.context===current)return true;const id=r.__restore_rowid;return typeof id==="bigint"&&id>BigInt(0)&&historical.some(h=>h.context===r.context&&h.tables.some(t=>t.name===table&&id<=BigInt(t.maxRowid)));};let prior:Row|undefined,cursor=BigInt(0);
 for(;;){const rows=await tx.all("SELECT * FROM shop_settings_revisions WHERE revision>? ORDER BY revision LIMIT 200",[cursor]);if(!rows.length)break;
 for(const r of rows){if(r.revision!==cursor+BigInt(1)||r.previous_id!==(prior?.id??null)||r.actor_id!=="ADMIN"||prior&&BigInt(String(r.recorded_at_ms))<BigInt(String(prior.recorded_at_ms)))throw Error();
 const op=await tx.get("SELECT rowid AS __restore_rowid,* FROM shop_settings_operations WHERE id=?",[r.operation_id]);if(!op||op.id!==op.request_key||!accepted("shop_settings_operations",op)||op.expected_revision!==cursor||op.result_revision!==r.revision||op.actor_id!==r.actor_id||op.session_ref!==r.session_ref||op.recorded_at_ms!==r.recorded_at_ms)throw Error();
 const payload=settingsPayload(verifiedJson(op.payload_json,op.payload_hash,true)),result=verifiedJson(op.result_json,op.result_hash,true);
 if(payload.expectedRevision!==String(cursor)||canonical(payload.settings)!==canonical(revisionValue(r).settings)||payload.reason!==r.reason||canonical(result)!==canonical(revisionValue(r)))throw Error();prior=r;cursor=r.revision as bigint;
 }}
 const bad=async(sql:string)=>{if(await tx.get(sql))throw Error("Settings source mismatch.");};
 await bad("SELECT o.id FROM shop_settings_operations o LEFT JOIN shop_settings_revisions r ON r.operation_id=o.id WHERE r.id IS NULL LIMIT 1");
 await bad("SELECT c.request_key FROM shop_settings_cancellations c WHERE EXISTS(SELECT 1 FROM shop_settings_operations o WHERE o.request_key=c.request_key) OR EXISTS(SELECT 1 FROM shop_password_operations p WHERE p.request_key=c.request_key) LIMIT 1");
 await bad("SELECT o.request_key FROM shop_settings_operations o JOIN shop_password_operations p ON p.request_key=o.request_key LIMIT 1");
 for(const r of await tx.all("SELECT rowid AS __restore_rowid,* FROM shop_settings_cancellations"))if(!accepted("shop_settings_cancellations",r)||r.actor_id!=="ADMIN")throw Error();
 for(const role of ["ADMIN","SALESPERSON"]){let old:Row|undefined;for(const r of await tx.all("SELECT rowid AS __restore_rowid,* FROM shop_password_operations WHERE target=? ORDER BY after_version",[role])){
  if(!accepted("shop_password_operations",r)||r.actor_id!=="ADMIN"||r.id!==r.request_key||r.after_version!==(r.before_version as bigint)+BigInt(1)||r.after_epoch!==(r.before_epoch as bigint)+BigInt(1)||old&&(r.before_version!==old.after_version||r.before_epoch!==old.after_epoch||BigInt(String(r.recorded_at_ms))<BigInt(String(old.recorded_at_ms))))throw Error();old=r;
 }if(old){const p=await tx.get("SELECT credential_version,auth_epoch FROM auth_principals WHERE id=?",[role]);if(p?.credential_version!==old.after_version||p.auth_epoch!==old.after_epoch)throw Error();}}
}

async function assertFinancialSettings(tx:Tx,ids?:readonly string[]){
 if((await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version!==BigInt(41))return;
 if(ids&&!ids.length)return;const args=ids?.map(uuid)??[],slots=args.map(()=>"?").join(",");
 const bad=async(sql:string,values:readonly string[])=>{if(await tx.get(sql,values))throw Error("Settings source mismatch.");};
 for(const r of await tx.all("SELECT p.*,s.shop_name,a.payload_json,a.payload_digest,sale.recorded_at_ms AS sale_time FROM invoice_shop_snapshots p JOIN shop_settings_revisions s ON s.id=p.settings_id JOIN sales sale ON sale.id=p.invoice_id JOIN sale_operations op ON op.id=sale.operation_id LEFT JOIN counter_cash_admissions a ON a.source_kind='SALE' AND a.source_key=op.request_key"+(ids?" WHERE p.invoice_id IN ("+slots+")":""),args)){
  const value=branding(verifiedJson(r.branding_json,r.branding_hash,true)),raw=await tx.get("SELECT receipt_json FROM invoice_snapshots WHERE invoice_id=?",[r.invoice_id]);
  if(canonical(value)!==canonical(await frozenBranding(tx,String(r.settings_id)))||JSON.parse(String(raw?.receipt_json)).shopName!==value.shopName||r.recorded_at_ms!==r.sale_time)throw Error();
  if(r.payload_json!==null){const admitted=verifiedJson(r.payload_json,r.payload_digest,true) as {settingsId?:string|null};if(admitted.settingsId!==r.settings_id)throw Error();}
 }
 if(!ids)await assertSaleCashBindingsAndSettings(tx,value=>{if(value.settingsId)return frozenBranding(tx,uuid(value.settingsId)).then(saved=>{if(value.shopName!==saved.shopName)throw Error();});});
 else for(const a of await tx.all("SELECT payload_json,payload_digest FROM counter_cash_admissions WHERE source_kind=\'SALE\' AND source_key IN (SELECT request_key FROM sale_operations WHERE invoice_id IN ("+slots+"))",args)){const value=verifiedJson(a.payload_json,a.payload_digest,true) as {settingsId?:string|null;shopName:string};if(value.settingsId&&value.shopName!==(await frozenBranding(tx,value.settingsId)).shopName)throw Error();}
 await bad("SELECT a.id FROM counter_cash_admissions a JOIN sale_operations o ON o.request_key=a.source_key LEFT JOIN invoice_shop_snapshots p ON p.invoice_id=o.invoice_id WHERE a.source_kind='SALE' AND json_extract(a.payload_json,'$.settingsId') IS NOT NULL AND (p.invoice_id IS NULL OR p.settings_id IS NOT json_extract(a.payload_json,'$.settingsId')) "+(ids?" AND o.invoice_id IN ("+slots+")":"")+" LIMIT 1",args);
}
