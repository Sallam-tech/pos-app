import "server-only";
import { hash } from "node:crypto";
import { int64, INT64_MAX } from "../db/integers";
import { InventoryError, type InventoryCode, type Kind, type ProductQuery } from "./contracts";
export const SCALE = BigInt(1000000), MAX_WHOLE = BigInt("999999999999"), MAX_PRICE = BigInt("99999999999999");
export const reject = (code: InventoryCode = "INVALID_INPUT"): never => { throw new InventoryError(code); };
export function object(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
 if (!input || typeof input !== "object" || Array.isArray(input) ||
   ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Object.getOwnPropertySymbols(input).length) return reject();
 const entries = Object.getOwnPropertyDescriptors(input);
 if (Object.keys(entries).length > 24 || required.some(k => !Object.hasOwn(entries,k)) ||
   Object.entries(entries).some(([k,v]) => (!required.includes(k)&&!optional.includes(k)) || !("value" in v))) return reject();
 return input as Record<string, unknown>;
}
export function text(value: unknown, max: number, empty = false): string {
 if (typeof value !== "string" || value !== value.trim() || (!empty && !value) ||
   Array.from(value).length > max || Buffer.byteLength(value,"utf8") > max * 4 ||
   /[\u0000-\u001f\u007f-\u009f]/u.test(value) ||
   Array.from(value).some(c => { const cp=c.codePointAt(0)!; return cp>=0xd800 && cp<=0xdfff; })) return reject();
 return value;
}
export const optionalText = (value: unknown, max: number) => value === null ? null : text(value,max);
export function uuid(value: unknown): string {
 if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) return reject();
 return value;
}
export function integer(value: unknown, max = INT64_MAX, zero = false): bigint {
 if (typeof value !== "string" || value.length > 19 || !/^(?:0|[1-9][0-9]*)$/.test(value)) return reject();
 const n = BigInt(value);
 if (n > max || n < (zero ? BigInt(0) : BigInt(1))) return reject(n>INT64_MAX ? "OVERFLOW" : "INVALID_INPUT");
 return int64(n);
}
export const quantity = (value: unknown, zero = true) => int64(integer(value,MAX_WHOLE,zero) * SCALE);
export const price = (value: unknown) => integer(value,MAX_PRICE);
export function checked(value: bigint) {
 try { return int64(value); } catch { return reject("OVERFLOW"); }
}
export function stockValue(q: bigint, cost: bigint) { return checked((q / SCALE) * cost); }
export function code(value: unknown): string {
 if (typeof value !== "string" || !/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(value)) return reject();
 return value;
}
export function barcode(value: unknown): string | null {
 if (value === null) return null;
 if (typeof value !== "string" || !/^[\x21-\x7e]{1,128}$/.test(value)) return reject();
 return value; // Opaque, exact, leading zeros preserved. No GTIN/scanner claims.
}
export function canonical(value: unknown): string {
 return JSON.stringify(value,(_,v)=>v && typeof v==="object" && !Array.isArray(v) ?
   Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)) : v);
}
export const digest = (value: unknown) => hash("sha256",canonical(value),"hex");
export function now(): bigint {
 const n=Date.now();
 if (!Number.isSafeInteger(n) || n<=0 || n>8640000000000000) return reject("UNAVAILABLE");
 return int64(BigInt(n));
}
export function parseCommand(kind: Kind, input: unknown): Record<string, string | boolean | null> {
 const base=["requestKey","productId","expectedProductVersion","reason"], stock=[...base,"expectedBalanceVersion"];
 const required = kind==="CREATE" ? ["requestKey","name","unit","buyingPricePaisa","sellingPricePaisa","sellingActive","openingQuantity","lowStockThreshold"] :
   kind==="EDIT" ? base : kind==="SELLING_PRICE" ? [...base,"sellingPricePaisa"] : kind==="STATUS" ? [...base,"sellingActive"] :
   kind==="ARCHIVE" ? base : kind==="REPRICE" ? [...stock,"buyingPricePaisa","confirmAllRemaining"] :
   kind==="RECEIVE" ? [...stock,"quantity","unitBuyingPricePaisa"] : [...stock,"targetQuantity"];
 const optional=kind==="CREATE" ? ["code","category","sizeLabel","barcode"] :
   kind==="EDIT" ? ["name","category","barcode","lowStockThreshold"] : kind==="RECEIVE" ? ["reference"] : [];
 const o=object(input,required,optional), out: Record<string,string|boolean|null>={requestKey:uuid(o.requestKey)};
 if(kind!=="CREATE") {
  out.productId=uuid(o.productId); out.expectedProductVersion=integer(o.expectedProductVersion).toString(); out.reason=text(o.reason,160);
  if(stock.every(k=>required.includes(k))) out.expectedBalanceVersion=integer(o.expectedBalanceVersion).toString();
 }
 if(kind==="CREATE" || kind==="EDIT") {
  if(kind==="CREATE" || Object.hasOwn(o,"name")) out.name=text(o.name,120);
  for(const [field,max] of [["category",80],["sizeLabel",40]] as const) {
   if(kind==="CREATE") out[field]=optionalText(o[field]===undefined ? null : o[field],max);
   else if(Object.hasOwn(o,field)) out[field]=optionalText(o[field],max);
  }
  if(kind==="CREATE" || Object.hasOwn(o,"barcode")) out.barcode=barcode(o.barcode===undefined?null:o.barcode);
  if(kind==="CREATE" || Object.hasOwn(o,"lowStockThreshold")) { quantity(o.lowStockThreshold); out.lowStockThreshold=o.lowStockThreshold as string; }
 }
 if(kind==="CREATE") {
  if(o.unit!=="PACK" && o.unit!=="BOX") return reject();
  out.unit=o.unit; if(Object.hasOwn(o,"code")) out.code=code(o.code);
  quantity(o.openingQuantity); out.openingQuantity=o.openingQuantity as string;
 }
 if(kind==="CREATE" || kind==="REPRICE") { price(o.buyingPricePaisa); out.buyingPricePaisa=o.buyingPricePaisa as string; }
 if(kind==="CREATE" || kind==="SELLING_PRICE") out.sellingPricePaisa=o.sellingPricePaisa===null && kind==="CREATE" ? null : price(o.sellingPricePaisa).toString();
 if(kind==="CREATE" || kind==="STATUS") { if(typeof o.sellingActive!=="boolean") return reject(); out.sellingActive=o.sellingActive; }
 if(kind==="REPRICE") { if(o.confirmAllRemaining!==true) return reject(); out.confirmAllRemaining=true; }
 if(kind==="RECEIVE") { quantity(o.quantity,false); price(o.unitBuyingPricePaisa); out.quantity=o.quantity as string; out.unitBuyingPricePaisa=o.unitBuyingPricePaisa as string; out.reference=optionalText(o.reference===undefined?null:o.reference,120); }
 if(kind==="ADJUST") { quantity(o.targetQuantity); out.targetQuantity=o.targetQuantity as string; }
 if(kind==="EDIT" && !optional.some(k=>Object.hasOwn(o,k))) return reject();
 return out;
}
export function parseQuery(input: unknown) {
 const o=object(input,[],["query","status","stock","cursor","limit"]);
 const rawQuery=text(o.query===undefined?"":o.query,120,true), query=rawQuery.toLowerCase(), status=o.status??"ALL", stock=o.stock??"ALL";
 if(typeof status!=="string" || typeof stock!=="string" || !["ALL","SELLING","STOPPED","ARCHIVED"].includes(status) || !["ALL","AVAILABLE","LOW","OUT"].includes(stock)) return reject();
 const limit=o.limit??50;
 if(typeof limit!=="number" || !Number.isInteger(limit) || limit<1 || limit>100) return reject();
 return {query,rawQuery,status:status as NonNullable<ProductQuery["status"]>,stock:stock as NonNullable<ProductQuery["stock"]>,
   cursor:o.cursor===undefined?null:uuid(o.cursor),limit};
}
