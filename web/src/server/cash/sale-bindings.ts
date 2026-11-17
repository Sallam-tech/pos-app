import {resumeGuardInputs,retainGuardInputs,captureGuardInputs,guardInputsUnchanged,type GuardInputPoint} from "../auth/database";
import "server-only";

import {cashSaleIntentHashFromJson,verifiedCashSaleAdmission,sharesVerifiedCashIntent} from "./sale-intent";
import {deny,big,type Tx} from "./model";
// Bounded batches within the same fresh transaction preserves all three original checks: every SALE
// admission, every POSTED SALE's operation/key, and every posted sale-operation
// intent (including a sale-operation reference on a different source kind).
const continuationOwner=Object.freeze({});
const checkpoints=new WeakMap<object,GuardInputPoint>();
export async function assertSaleCashBindings(tx:Tx){
 if(resumeGuardInputs(tx,"SALE_CASH_BINDINGS",continuationOwner))return;
 const previous=checkpoints.get(tx);
 if(previous&&guardInputsUnchanged(tx,"SALE_CASH_BINDINGS",previous))return;
 checkpoints.delete(tx);const point=captureGuardInputs(tx,"SALE_CASH_BINDINGS");
 await assertSaleCashBindingsFull(tx);
 // A scan with any intervening write cannot mint a reusable verdict.
 if(point&&guardInputsUnchanged(tx,"SALE_CASH_BINDINGS",point,true)){checkpoints.set(tx,point);retainGuardInputs(tx,"SALE_CASH_BINDINGS",point,continuationOwner);}
}
export async function assertSaleCashBindingsAndSettings(tx:Tx,check:(value:Record<string,unknown>)=>void|Promise<void>){
 const point=captureGuardInputs(tx,"SALE_CASH_BINDINGS");await scanSaleCashBindings(tx,check);
 if(point&&guardInputsUnchanged(tx,"SALE_CASH_BINDINGS",point,true)){checkpoints.set(tx,point);retainGuardInputs(tx,"SALE_CASH_BINDINGS",point,continuationOwner);}
}
export async function assertSaleCashBindingsFull(tx:Tx){return scanSaleCashBindings(tx);}
async function scanSaleCashBindings(tx:Tx,check?:(value:Record<string,unknown>)=>void|Promise<void>){
 let cursor:bigint|null=null;
 for(;;){
 const rows=await tx.all("SELECT a.rowid AS ordinal,a.source_kind,a.source_key,a.payload_hash,a.payload_json AS admission_json,a.payload_digest,r.outcome,o.id AS operation_id,o.request_key AS operation_key,o.payload_json AS operation_json FROM counter_cash_admissions a LEFT JOIN counter_cash_admission_resolutions r ON r.admission_id=a.id AND r.outcome='POSTED' LEFT JOIN sale_operations o ON o.id=r.sale_operation_id"+(cursor===null?"":" WHERE a.rowid>?")+" ORDER BY a.rowid LIMIT 512",cursor===null?[]:[cursor]);
 if(!rows.length)break;
 for(const r of rows){
  let sameIntent=false;
  if(r.source_kind==="SALE"){
   // Preserve SQL <> three-valued semantics; schema validation independently
   // enforces required columns. The original missing-operation test is strict.
   if(r.outcome==="POSTED"&&(r.operation_id===null||r.operation_key!==null&&r.source_key!==null&&r.operation_key!==r.source_key))return deny("UNAVAILABLE");
   const admitted=verifiedCashSaleAdmission(r.admission_json,r.payload_digest,r.source_key);if(admitted.hash!==r.payload_hash)return deny("UNAVAILABLE");if(check){const pending=check(admitted.value);if(pending)await pending;}sameIntent=sharesVerifiedCashIntent(r.operation_json,admitted);
  }
  // Only exact freshly verified bytes may bypass a duplicate normalized-hash computation.
  if(r.operation_id!==null&&!sameIntent&&cashSaleIntentHashFromJson(r.operation_json)!==r.payload_hash)return deny("UNAVAILABLE");
 }
 const next=big(rows.at(-1)!.ordinal);if(cursor!==null&&next<=cursor)return deny("UNAVAILABLE");cursor=next;
 }
}
