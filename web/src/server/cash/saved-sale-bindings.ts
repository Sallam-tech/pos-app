import "server-only";
import {assertSaleCashBindingsFull} from "./sale-bindings";
import type {AuthorizedTransaction} from "../auth/types";
// Disposable TEST read integration. Original validator JS is reused; only
// its exact compiled bounded page SELECT can be narrowed. Unknown SQL refuses.
export async function assertSavedSaleCashBindings(tx:AuthorizedTransaction,invoiceIds:readonly string[]){
 if(invoiceIds.length===0)return;if(invoiceIds.length>50||invoiceIds.some(id=>typeof id!=="string"||id.length>64))throw Error("Saved binding selection unavailable.");
 const marks=invoiceIds.map(()=>"?").join(",");
 const where="a.source_key IN(SELECT request_key FROM sale_operations WHERE invoice_id IN("+marks+")) OR a.id IN(SELECT admission_id FROM counter_cash_admission_resolutions WHERE sale_operation_id IN(SELECT id FROM sale_operations WHERE invoice_id IN("+marks+"))) OR a.id IN(SELECT admission_id FROM cash_flow_evidence WHERE movement_id IN(SELECT id FROM cash_movements WHERE sale_payment_id IN(SELECT id FROM sale_payments WHERE invoice_id IN("+marks+"))))";
 const head="SELECT a.rowid AS ordinal,a.source_kind,a.source_key,a.payload_hash,a.payload_json AS admission_json,a.payload_digest,r.outcome,o.id AS operation_id,o.request_key AS operation_key,o.payload_json AS operation_json FROM counter_cash_admissions a LEFT JOIN counter_cash_admission_resolutions r ON r.admission_id=a.id AND r.outcome='POSTED' LEFT JOIN sale_operations o ON o.id=r.sale_operation_id";
 const tail=" ORDER BY a.rowid LIMIT 512";
 await assertSaleCashBindingsFull({
  async all(sql,bindings=[]){
   if(bindings.length>1||bindings.length===1&&typeof bindings[0]!=="bigint"||sql!==head+(bindings.length?" WHERE a.rowid>?":"")+tail)throw Error("Unreviewed binding query.");
   return tx.all(head+" WHERE ("+where+")"+(bindings.length?" AND a.rowid>?":"")+tail,[...invoiceIds,...invoiceIds,...invoiceIds,...bindings]);
  },
  async get(){throw Error("Unreviewed binding read.");},
  async run(){throw Error("Read-only saved binding.");}
 });
}
