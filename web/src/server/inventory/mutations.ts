import "server-only";
import { randomUUID } from "node:crypto";
import type { Actor, AuthorizedTransaction } from "../auth/types";
import type { AdminProduct, Kind, MutationResult } from "./contracts";
import { load, savedResult } from "./model";
import { nextProductCode, productCodePrefix } from "./product-code";
import { canonical, checked, digest, now, parseCommand, quantity, reject, SCALE, stockValue } from "./validation";
type Command=ReturnType<typeof parseCommand>;
const s=(c:Command,k:string)=>c[k] as string;
function recalculate(p: AdminProduct): AdminProduct {
 const q=quantity(p.quantity),threshold=quantity(p.lowStockThreshold),cost=BigInt(p.buyingPricePaisa),selling=p.sellingPricePaisa===null?null:BigInt(p.sellingPricePaisa);
 return {...p,stockStatus:q===BigInt(0)?"OUT":q<=threshold?"LOW":"OK",priceNeedsReview:selling===null||selling<cost,stockValuePaisa:stockValue(q,cost).toString()};
}
async function identifier(tx:AuthorizedTransaction, productId:string, barcode:AdminProduct["barcode"]) {
 if(barcode!==null && await tx.get("SELECT product_id FROM product_identifiers WHERE value=? AND product_id<>?",[barcode,productId])) return reject("CONFLICT");
}
async function operation(tx:AuthorizedTransaction,actor:Actor,kind:Kind,c:Command,result:MutationResult,t:bigint) {
 await tx.run(`INSERT INTO inventory_operations(id,request_key,product_id,kind,actor_id,actor_session_ref,payload_hash,payload_json,result_json,reason,reference,recorded_at_ms)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,[result.operationId,s(c,"requestKey"),result.product.id,kind,actor.principalId,actor.sessionId,
 digest({kind,...c}),canonical({kind,...c}),canonical(result),kind==="CREATE"?"Initial product":s(c,"reason"),kind==="RECEIVE"?c.reference as string|null:null,t]);
}
async function event(tx:AuthorizedTransaction,result:MutationResult,before:AdminProduct|null,t:bigint) {
 await tx.run("INSERT INTO product_events VALUES(?,?,?,?,?)",[result.operationId,result.product.id,before===null?null:canonical(before),canonical(result.product),t]);
}
async function movement(tx:AuthorizedTransaction,result:MutationResult,kind:"OPENING"|"RECEIVE"|"ADJUST",before:bigint,after:bigint,cost:bigint) {
 await tx.run("INSERT INTO stock_movements(id,operation_id,product_id,kind,before_q,delta_q,after_q,cost_snapshot_m,balance_version) VALUES(?,?,?,?,?,?,?,?,?)",[result.movementId!,result.operationId,result.product.id,kind,before,checked(after-before),after,cost,BigInt(result.product.balanceVersion)]);
}
export async function mutate(tx:AuthorizedTransaction,actor:Actor,kind:Kind,input:unknown):Promise<MutationResult> {
 const c=parseCommand(kind,input);
 if (await tx.get("SELECT request_key FROM inventory_cancellations WHERE request_key=?", [s(c,"requestKey")])) return reject("CONFLICT");
 const previous=await tx.get("SELECT id,product_id,kind,actor_id,payload_hash,payload_json,result_json FROM inventory_operations WHERE request_key=?",[s(c,"requestKey")]);
 if(previous) {
  if(previous.kind!==kind || previous.actor_id!==actor.principalId || previous.payload_hash!==digest({kind,...c}) || previous.payload_json!==canonical({kind,...c})) return reject("CONFLICT");
  const result=savedResult(previous.result_json);
  if(result.operationId!==previous.id || result.product.id!==previous.product_id) return reject("UNAVAILABLE");
  await load(tx,result.product.id); // Replay still fails closed on missing/corrupt current inventory.
  return result;
 }
 const salesProfile=[BigInt(36),BigInt(37),BigInt(38),BigInt(39),BigInt(40),BigInt(41)].includes(BigInt(String((await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version)));
 if(salesProfile)for(const field of ["buyingPricePaisa","sellingPricePaisa","unitBuyingPricePaisa"])if(typeof c[field]==="string"&&BigInt(c[field] as string)%BigInt(100))return reject();
 const t=now(), operationId=randomUUID();
 if(kind==="CREATE") {
  const prefix=productCodePrefix(s(c,"name")), id=randomUUID(), productCode=c.code as string|undefined??nextProductCode(prefix,(await tx.all("SELECT code FROM products WHERE code LIKE ?",[prefix+"-%"])).map(r=>String(r.code))),
    cost=BigInt(s(c,"buyingPricePaisa")), selling=c.sellingPricePaisa===null?null:BigInt(s(c,"sellingPricePaisa")), q=quantity(c.openingQuantity);
  if((selling!==null && selling<cost) || (c.sellingActive && selling===null)) return reject();
  if(await tx.get("SELECT id FROM products WHERE code=?",[productCode])) return reject("CONFLICT");
  await identifier(tx,id,c.barcode as string|null);
  const product=recalculate({id,code:productCode,name:s(c,"name"),category:c.category as string|null,sizeLabel:c.sizeLabel as string|null,
    unit:c.unit as "PACK"|"BOX",barcode:c.barcode as string|null,buyingPricePaisa:cost.toString(),sellingPricePaisa:selling?.toString()??null,
    quantity:(q/SCALE).toString(),lowStockThreshold:s(c,"lowStockThreshold"),sellingActive:c.sellingActive as boolean,archivedAtMs:null,
    productVersion:"1",balanceVersion:"1",stockValuePaisa:"0",stockStatus:"OUT",priceNeedsReview:false,createdAtMs:t.toString(),updatedAtMs:t.toString()});
  const result={operationId,product,movementId:q>BigInt(0)?randomUUID():null,valuationDeltaPaisa:null};
  await tx.run(`INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,productCode,product.name,product.name.toLowerCase(),product.category,product.sizeLabel,
    product.unit,SCALE,cost,selling,quantity(product.lowStockThreshold),product.sellingActive?BigInt(1):BigInt(0),null,BigInt(1),t,t]);
  await operation(tx,actor,kind,c,result,t);
  await tx.run("INSERT INTO stock_balances VALUES(?,?,?,?,?,?,?)",[id,operationId,q,cost,BigInt(product.stockValuePaisa),BigInt(1),t]);
  if(product.barcode!==null) await tx.run("INSERT INTO product_identifiers VALUES(?,?,?)",[id,"BARCODE",product.barcode]);
  if(result.movementId) await movement(tx,result,"OPENING",BigInt(0),q,cost);
  await event(tx,result,null,t); await load(tx,id); return result;
 }
 const current=await load(tx,s(c,"productId")), before=current.dto;
 if(current.version!==BigInt(s(c,"expectedProductVersion"))) return reject("CONFLICT");
 if(t<current.updated || t<current.balanceUpdated) return reject("UNAVAILABLE");
 const stockChange=kind==="REPRICE"||kind==="RECEIVE"||kind==="ADJUST";
 if(stockChange && current.balanceVersion!==BigInt(s(c,"expectedBalanceVersion"))) return reject("CONFLICT");
 // Physical corrections and explicit valuation changes remain possible for retained archived stock.
 if(current.archived!==null && kind!=="REPRICE" && kind!=="ADJUST") return reject("CONFLICT");
 let next={...before,updatedAtMs:t.toString()},after=current.q,newCost=current.cost;
 if(kind==="EDIT") {
  if(Object.hasOwn(c,"name")) next.name=s(c,"name");
  if(Object.hasOwn(c,"category")) next.category=c.category as string|null;
  if(Object.hasOwn(c,"barcode")) next.barcode=c.barcode as string|null;
  if(Object.hasOwn(c,"lowStockThreshold")) next.lowStockThreshold=s(c,"lowStockThreshold");
  await identifier(tx,before.id,next.barcode);
 } else if(kind==="SELLING_PRICE") {
  if(BigInt(s(c,"sellingPricePaisa"))<current.cost) return reject();
  next.sellingPricePaisa=s(c,"sellingPricePaisa");
 } else if(kind==="STATUS") {
  if(c.sellingActive===before.sellingActive) return reject("CONFLICT");
  if(c.sellingActive && (current.selling===null || current.selling<current.cost)) return reject();
  next.sellingActive=c.sellingActive as boolean;
 } else if(kind==="ARCHIVE") { next.archivedAtMs=t.toString(); next.sellingActive=false;
 } else if(kind==="REPRICE") {
  newCost=BigInt(s(c,"buyingPricePaisa")); if(newCost===current.cost) return reject("CONFLICT"); next.buyingPricePaisa=newCost.toString();
 } else if(kind==="RECEIVE") {
  if(BigInt(s(c,"unitBuyingPricePaisa"))!==current.cost){if(!salesProfile)return reject("POLICY_PENDING");newCost=BigInt(s(c,"unitBuyingPricePaisa"));next.buyingPricePaisa=newCost.toString();}
  after=checked(current.q+quantity(c.quantity,false)); quantity((after/SCALE).toString());
 } else { after=quantity(c.targetQuantity); if(after===current.q) return reject("CONFLICT"); }
 if((kind!=="RECEIVE" && kind!=="ADJUST") || newCost!==current.cost) next.productVersion=checked(current.version+BigInt(1)).toString();
 if(stockChange) next.balanceVersion=checked(current.balanceVersion+BigInt(1)).toString();
 next.quantity=(after/SCALE).toString(); next=recalculate(next);
 const result:MutationResult={operationId,product:next,movementId:kind==="RECEIVE"||kind==="ADJUST"?randomUUID():null,
  valuationDeltaPaisa:kind==="REPRICE"?checked(BigInt(next.stockValuePaisa)-current.value).toString():newCost!==current.cost?checked(current.q/SCALE*(newCost-current.cost)).toString():null};
 await operation(tx,actor,kind,c,result,t);
 if((kind!=="RECEIVE" && kind!=="ADJUST") || newCost!==current.cost) {
  const changed=await tx.run(`UPDATE products SET name=?,name_key=?,category=?,current_cost_m=?,selling_price_m=?,low_stock_q=?,selling_active=?,archived_at_ms=?,version=?,updated_at_ms=? WHERE id=? AND version=?`,
   [next.name,next.name.toLowerCase(),next.category,newCost,next.sellingPricePaisa===null?null:BigInt(next.sellingPricePaisa),quantity(next.lowStockThreshold),next.sellingActive?BigInt(1):BigInt(0),
    next.archivedAtMs===null?null:BigInt(next.archivedAtMs),BigInt(next.productVersion),t,next.id,current.version]);
  if(changed.changes!==BigInt(1)) return reject("CONFLICT");
 }
 if(stockChange) {
  const changed=await tx.run("UPDATE stock_balances SET sellable_q=?,cost_m=?,stock_value_m=?,version=?,updated_at_ms=? WHERE product_id=? AND version=?",[after,newCost,BigInt(next.stockValuePaisa),BigInt(next.balanceVersion),t,next.id,current.balanceVersion]);
  if(changed.changes!==BigInt(1)) return reject("CONFLICT");
 }
 if(kind==="EDIT" && before.barcode!==next.barcode) {
  await tx.run("DELETE FROM product_identifiers WHERE product_id=?",[next.id]);
  if(next.barcode!==null) await tx.run("INSERT INTO product_identifiers VALUES(?,?,?)",[next.id,"BARCODE",next.barcode]);
 }
 if(result.movementId) await movement(tx,result,kind as "RECEIVE"|"ADJUST",current.q,after,newCost);
 await event(tx,result,before,t); await load(tx,next.id); return result;
}
