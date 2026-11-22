import "server-only";
import type { AuthorizedTransaction } from "../auth/types";
import type { SqlRow, SqlValue } from "../db/connection";
import { int64 } from "../db/integers";
import type { InventoryTotals } from "./contracts";
import { brokenChain, load, savedProduct, selectProduct, state } from "./model";
import { integer, object, parseQuery, reject, SCALE, text, uuid } from "./validation";
function totals(row:SqlRow|undefined):InventoryTotals {
 if(!row || row.invalid!==BigInt(0)) return reject("UNAVAILABLE");
 const read=(k:string)=>{ if(typeof row[k]!=="bigint" || row[k]<BigInt(0)) return reject("UNAVAILABLE"); return int64(row[k]).toString(); };
 return {products:read("products"),quantity:read("quantity"),lowStock:read("lowStock"),outOfStock:read("outOfStock"),stockValuePaisa:read("stockValuePaisa")};
}
const invalidDeep=`coalesce(sum(CASE WHEN b.product_id IS NULL OR b.cost_m<>p.current_cost_m OR ${brokenChain} OR
 b.sellable_q<>(SELECT coalesce(sum(m.delta_q),0) FROM stock_movements m WHERE m.product_id=p.id) OR
 NOT EXISTS(SELECT 1 FROM inventory_operations o WHERE o.id=b.opening_operation_id AND o.product_id=p.id AND o.kind='CREATE') THEN 1 ELSE 0 END),0)`;
const summarySql=(deep:boolean)=>`SELECT count(*) AS products,coalesce(sum(b.sellable_q/1000000),0) AS quantity,
 coalesce(sum(CASE WHEN b.sellable_q<=p.low_stock_q THEN 1 ELSE 0 END),0) AS lowStock,
 coalesce(sum(CASE WHEN b.sellable_q=0 THEN 1 ELSE 0 END),0) AS outOfStock,coalesce(sum(b.stock_value_m),0) AS stockValuePaisa,
 ${deep?invalidDeep:"0"} AS invalid
 FROM products p LEFT JOIN stock_balances b ON b.product_id=p.id LEFT JOIN product_identifiers i ON i.product_id=p.id`;
// The full ledger cross-check (every balance vs sum of its movements, cost, chain, opening) runs for the OVERALL
// summary. A filtered summary covers a subset of the same rows under the same predicate, and totals() rejects the
// whole request if the overall check fails, so repeating the O(movements) scan for it only doubles the cost.
const summary=summarySql(true),summaryFiltered=summarySql(false);
export async function list(tx:AuthorizedTransaction,input:unknown) {
 const q=parseQuery(input),where:string[]=[],values:SqlValue[]=[];
 if(q.query) { where.push("(instr(p.name_key,?)>0 OR p.code=? OR i.value=?)");values.push(q.query,q.rawQuery.toUpperCase(),q.rawQuery); }
 if(q.status==="SELLING") where.push("p.selling_active=1 AND p.archived_at_ms IS NULL");
 if(q.status==="STOPPED") where.push("p.selling_active=0 AND p.archived_at_ms IS NULL");
 if(q.status==="ARCHIVED") where.push("p.archived_at_ms IS NOT NULL");
 if(q.stock==="AVAILABLE") where.push("b.sellable_q>0");
 if(q.stock==="LOW") where.push("b.sellable_q<=p.low_stock_q");
 if(q.stock==="OUT") where.push("b.sellable_q=0");
 const filter=where.length?" WHERE "+where.join(" AND "):"";
 const overall=totals(await tx.get(summary)),filtered=totals(await tx.get(summaryFiltered+filter,values));
 const pageFilter=filter+(q.cursor?(filter?" AND ":" WHERE ")+"p.id>?":"");
 const rows=await tx.all(selectProduct+pageFilter+" ORDER BY p.id LIMIT ?",[...values,...(q.cursor?[q.cursor]:[]),BigInt(q.limit+1)]);
 const items=rows.slice(0,q.limit).map(r=>state(r).dto);
 return {items,nextCursor:rows.length>q.limit?items.at(-1)!.id:null,filtered,overall};
}
function historyQuery(input:unknown) {
 const o=object(input,["productId"],["cursor","limit"]),limit=o.limit??50;
 if(typeof limit!=="number" || !Number.isInteger(limit) || limit<1 || limit>100) return reject();
 return {productId:uuid(o.productId),cursor:o.cursor,limit};
}
export async function movements(tx:AuthorizedTransaction,input:unknown) {
 const q=historyQuery(input); await load(tx,q.productId);
 const cursor=q.cursor===undefined?null:integer(q.cursor);
 const version=(await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version,salesProfile=version===BigInt(36)||version===BigInt(37)||version===BigInt(38);
 const sql36=`SELECT m.*,coalesce(o.actor_id,s.actor_id) AS actor_id,coalesce(o.reason,'Sale') AS reason,coalesce(o.reference,s.invoice_number) AS reference,coalesce(o.recorded_at_ms,s.recorded_at_ms) AS recorded_at_ms,coalesce(o.id,s.operation_id) AS source_operation_id FROM stock_movements m LEFT JOIN inventory_operations o ON o.id=m.operation_id AND o.product_id=m.product_id LEFT JOIN sale_lines l ON l.id=m.sale_line_id AND l.product_id=m.product_id LEFT JOIN sales s ON s.id=l.invoice_id
 WHERE m.product_id=?`;
 const sql35="SELECT m.*,o.actor_id,o.reason,o.reference,o.recorded_at_ms,o.id AS source_operation_id FROM stock_movements m JOIN inventory_operations o ON o.id=m.operation_id AND o.product_id=m.product_id WHERE m.product_id=?";
 const sql37=sql36.replace("coalesce(o.actor_id,s.actor_id)","coalesce(o.actor_id,s.actor_id,ro.actor_id)").replace("coalesce(o.reason,'Sale')","coalesce(o.reason,d.reason,'Sale')").replace("coalesce(o.reference,s.invoice_number)","coalesce(o.reference,s.invoice_number,'Return restock')").replace("coalesce(o.recorded_at_ms,s.recorded_at_ms)","coalesce(o.recorded_at_ms,s.recorded_at_ms,d.recorded_at_ms)").replace("coalesce(o.id,s.operation_id)","coalesce(o.id,s.operation_id,d.operation_id)").replace(" WHERE m.product_id=?"," LEFT JOIN return_dispositions d ON d.id=m.return_disposition_id AND d.product_id=m.product_id LEFT JOIN return_operations ro ON ro.id=d.operation_id WHERE m.product_id=?");
 const sql39=sql37.replace("coalesce(o.actor_id,s.actor_id,ro.actor_id)","coalesce(o.actor_id,s.actor_id,ro.actor_id,io.actor_id)").replace("coalesce(o.reason,d.reason,\'Sale\')","coalesce(o.reason,d.reason,ir.reason,\'Sale\')").replace("coalesce(o.reference,s.invoice_number,\'Return restock\')","coalesce(o.reference,s.invoice_number,cs.invoice_number,\'Return restock\')").replace("coalesce(o.recorded_at_ms,s.recorded_at_ms,d.recorded_at_ms)","coalesce(o.recorded_at_ms,s.recorded_at_ms,d.recorded_at_ms,ir.recorded_at_ms)").replace("coalesce(o.id,s.operation_id,d.operation_id)","coalesce(o.id,s.operation_id,d.operation_id,ir.operation_id)").replace(" WHERE m.product_id=?"," LEFT JOIN invoice_revision_lines cl ON cl.id=m.correction_line_id AND cl.product_id=m.product_id LEFT JOIN invoice_revisions ir ON ir.id=cl.revision_id LEFT JOIN invoice_correction_operations io ON io.id=ir.operation_id LEFT JOIN sales cs ON cs.id=ir.invoice_id WHERE m.product_id=?");
 const rows=await tx.all((typeof version==="bigint"&&version>=BigInt(39)?sql39:typeof version==="bigint"&&version>=BigInt(37)?sql37:salesProfile?sql36:sql35)+(cursor===null?"":" AND m.balance_version<?")+" ORDER BY m.balance_version DESC LIMIT ?",[q.productId,...(cursor===null?[]:[cursor]),BigInt(q.limit+1)]);
 const items=rows.slice(0,q.limit).map(r=>{
  const whole=(v:unknown)=>{if(typeof v!=="bigint" || v%SCALE!==BigInt(0)) return reject("UNAVAILABLE");return (int64(v)/SCALE).toString();};
  if((r.kind==="SALE"?r.actor_id!=="SALESPERSON":r.actor_id!=="ADMIN") || !["OPENING","RECEIVE","ADJUST","SALE","RETURN_RESTOCK","INVOICE_CORRECTION"].includes(String(r.kind))) return reject("UNAVAILABLE");
  return {id:uuid(r.id),operationId:uuid(r.source_operation_id),kind:String(r.kind),actor:r.actor_id as "ADMIN"|"SALESPERSON",reason:text(r.reason,160),
   reference:r.reference===null?null:text(r.reference,120),beforeQuantity:whole(r.before_q),deltaQuantity:whole(r.delta_q),afterQuantity:whole(r.after_q),
   buyingPricePaisa:integer(String(r.cost_snapshot_m)).toString(),balanceVersion:integer(String(r.balance_version)).toString(),recordedAtMs:integer(String(r.recorded_at_ms)).toString()};
 });
 return {items,nextCursor:rows.length>q.limit?items.at(-1)!.balanceVersion:null};
}
export async function events(tx:AuthorizedTransaction,input:unknown) {
 const q=historyQuery(input); await load(tx,q.productId);
 let cursor:SqlRow|undefined;
 if(q.cursor!==undefined) {cursor=await tx.get("SELECT recorded_at_ms FROM product_events WHERE operation_id=? AND product_id=?",[uuid(q.cursor),q.productId]);if(!cursor) return reject();}
 const rows=await tx.all(`SELECT e.*,o.kind,o.actor_id,o.reason FROM product_events e JOIN inventory_operations o ON o.id=e.operation_id AND o.product_id=e.product_id WHERE e.product_id=?`+
  (cursor?" AND (e.recorded_at_ms<? OR (e.recorded_at_ms=? AND e.operation_id<?))":"")+" ORDER BY e.recorded_at_ms DESC,e.operation_id DESC LIMIT ?",
  [q.productId,...(cursor?[cursor.recorded_at_ms,cursor.recorded_at_ms,q.cursor as string]:[]),BigInt(q.limit+1)]);
 const items=rows.slice(0,q.limit).map(r=>{
  try {
   if(r.actor_id!=="ADMIN") return reject("UNAVAILABLE");
   const before=r.before_json===null?null:savedProduct(JSON.parse(String(r.before_json))),after=savedProduct(JSON.parse(String(r.after_json)));
   if(after.id!==q.productId || (before!==null && before.id!==q.productId) ||
     (r.kind==="CREATE" ? before!==null : before===null)) return reject("UNAVAILABLE");
   return {operationId:uuid(r.operation_id),kind:text(r.kind,20),actor:"ADMIN" as const,reason:text(r.reason,160),recordedAtMs:integer(String(r.recorded_at_ms)).toString(),before,after};
  } catch {return reject("UNAVAILABLE");}
 });
 return {items,nextCursor:rows.length>q.limit?items.at(-1)!.operationId:null};
}
