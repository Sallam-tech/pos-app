import "server-only";
import type { AuthorizedTransaction } from "../auth/types";
import type { SqlRow } from "../db/connection";
import { int64 } from "../db/integers";
import type { AdminProduct, MutationResult } from "./contracts";
import { barcode, code, integer, object, optionalText, price, quantity, reject, SCALE, stockValue, text, uuid } from "./validation";
// A correct sum alone does not prove an ordered before/after movement chain.
// Version gaps from cost-only repricing are valid: it does not move physical stock.
export const brokenChain = `EXISTS(SELECT 1 FROM (
 SELECT m.before_q,lag(m.after_q,1,0) OVER (ORDER BY m.balance_version) AS preceding_after
 FROM stock_movements m WHERE m.product_id=p.id
 ) WHERE before_q<>preceding_after)`;
export const selectProduct = `SELECT p.*, b.sellable_q,b.cost_m,b.stock_value_m,b.version AS balance_version,
 b.updated_at_ms AS balance_updated_at, i.value AS barcode, ${brokenChain} AS broken_chain,
 (SELECT coalesce(sum(m.delta_q),0) FROM stock_movements m WHERE m.product_id=p.id) AS ledger_q,
 (SELECT count(*) FROM stock_movements m WHERE m.product_id=p.id AND m.kind='OPENING') AS openings,
 (SELECT o.kind FROM inventory_operations o WHERE o.id=b.opening_operation_id AND o.product_id=p.id) AS opening_kind
 FROM products p JOIN stock_balances b ON b.product_id=p.id LEFT JOIN product_identifiers i ON i.product_id=p.id`;
function big(value: unknown): bigint { if(typeof value!=="bigint") return reject("UNAVAILABLE"); return int64(value); }
export function state(row: SqlRow | undefined) {
 if(!row) return reject("NOT_FOUND");
 const q=big(row.sellable_q), cost=big(row.current_cost_m), balanceVersion=big(row.balance_version), version=big(row.version),
   threshold=big(row.low_stock_q), value=big(row.stock_value_m), updated=big(row.updated_at_ms), balanceUpdated=big(row.balance_updated_at);
 if(q<BigInt(0) || q%SCALE!==BigInt(0) || threshold<BigInt(0) || threshold%SCALE!==BigInt(0) ||
   big(row.cost_m)!==cost || value!==stockValue(q,cost) || big(row.ledger_q)!==q || big(row.broken_chain)!==BigInt(0) ||
   ![BigInt(0),BigInt(1)].includes(big(row.openings)) || row.opening_kind!=="CREATE" ||
   version<BigInt(1) || balanceVersion<BigInt(1)) return reject("UNAVAILABLE");
 const selling=row.selling_price_m===null?null:big(row.selling_price_m), archived=row.archived_at_ms===null?null:big(row.archived_at_ms);
 const dto: AdminProduct={id:uuid(row.id),code:code(row.code),name:text(row.name,120),category:optionalText(row.category,80),
   sizeLabel:optionalText(row.size_label,40),unit:row.unit as "PACK"|"BOX",barcode:barcode(row.barcode),
   buyingPricePaisa:cost.toString(),sellingPricePaisa:selling?.toString()??null,quantity:(q/SCALE).toString(),
   lowStockThreshold:(threshold/SCALE).toString(),sellingActive:row.selling_active===BigInt(1),archivedAtMs:archived?.toString()??null,
   productVersion:version.toString(),balanceVersion:balanceVersion.toString(),stockValuePaisa:value.toString(),
   stockStatus:q===BigInt(0)?"OUT":q<=threshold?"LOW":"OK",priceNeedsReview:selling===null||selling<cost,
   createdAtMs:big(row.created_at_ms).toString(),updatedAtMs:(updated>balanceUpdated?updated:balanceUpdated).toString()};
 if(dto.unit!=="PACK" && dto.unit!=="BOX") return reject("UNAVAILABLE");
 return {dto,q,cost,version,balanceVersion,threshold,value,updated,balanceUpdated,selling,archived};
}
export const load = async(tx: AuthorizedTransaction,id: string) => state(await tx.get(selectProduct+" WHERE p.id=?",[id]));
// Persisted replay/audit JSON is never returned as an arbitrary object. Rebuild an allowlisted DTO.
export function savedProduct(value: unknown): AdminProduct {
 const o=object(value,["id","code","name","category","sizeLabel","unit","barcode","buyingPricePaisa","sellingPricePaisa",
  "quantity","lowStockThreshold","sellingActive","archivedAtMs","productVersion","balanceVersion","stockValuePaisa",
  "stockStatus","priceNeedsReview","createdAtMs","updatedAtMs"]);
 const q=quantity(o.quantity),threshold=quantity(o.lowStockThreshold),cost=price(o.buyingPricePaisa),
  selling=o.sellingPricePaisa===null?null:price(o.sellingPricePaisa);
 if((o.unit!=="PACK"&&o.unit!=="BOX") || typeof o.sellingActive!=="boolean" ||
   (o.sellingActive && (selling===null || o.archivedAtMs!==null)) || o.priceNeedsReview!==(selling===null||selling<cost) || o.stockStatus!==(q===BigInt(0)?"OUT":q<=threshold?"LOW":"OK") ||
   integer(o.stockValuePaisa,undefined,true)!==stockValue(q,cost) || integer(o.updatedAtMs)<integer(o.createdAtMs)) return reject("UNAVAILABLE");
 return {id:uuid(o.id),code:code(o.code),name:text(o.name,120),category:optionalText(o.category,80),sizeLabel:optionalText(o.sizeLabel,40),
  unit:o.unit,barcode:barcode(o.barcode),buyingPricePaisa:cost.toString(),sellingPricePaisa:selling?.toString()??null,
  quantity:(q/SCALE).toString(),lowStockThreshold:(threshold/SCALE).toString(),sellingActive:o.sellingActive,
  archivedAtMs:o.archivedAtMs===null?null:integer(o.archivedAtMs).toString(),productVersion:integer(o.productVersion).toString(),
  balanceVersion:integer(o.balanceVersion).toString(),stockValuePaisa:String(o.stockValuePaisa),stockStatus:o.stockStatus as AdminProduct["stockStatus"],
  priceNeedsReview:o.priceNeedsReview,createdAtMs:String(o.createdAtMs),updatedAtMs:String(o.updatedAtMs)};
}
export function savedResult(raw: unknown): MutationResult {
 try {
  if(typeof raw!=="string") return reject("UNAVAILABLE");
  const o=object(JSON.parse(raw),["operationId","product","movementId","valuationDeltaPaisa"]);
  let delta: string|null=null;
  if(o.valuationDeltaPaisa!==null) {
   if(typeof o.valuationDeltaPaisa!=="string" || !/^-?(?:0|[1-9][0-9]*)$/.test(o.valuationDeltaPaisa)) return reject("UNAVAILABLE");
   delta=int64(BigInt(o.valuationDeltaPaisa)).toString();
  }
  return {operationId:uuid(o.operationId),product:savedProduct(o.product),movementId:o.movementId===null?null:uuid(o.movementId),valuationDeltaPaisa:delta};
 } catch { return reject("UNAVAILABLE"); }
}
