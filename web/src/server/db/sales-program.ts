import "server-only";
import { createHash } from "node:crypto";
import { lstatSync,readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rejectRedirectedPath } from "./location";
export const SALES36_NAME="0036_sales_and_stock_ledger.sql";
export const SALES36_HASH="f1f884057268602a0a3d53a6712d7760f1893becae849fbb5461b56857d561fd";
export const SALES_TABLES=["sale_operations","sales","sale_lines","invoice_snapshots","sale_payments","sale_cancellations"] as const;
export function salesSteps(){
 const p=fileURLToPath(new URL("./migrations/"+SALES36_NAME,import.meta.url));rejectRedirectedPath(path.dirname(p));
 const stat=lstatSync(p);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>200000)throw Error("Reviewed program unavailable.");
 const bytes=readFileSync(p);if(createHash("sha256").update(bytes).digest("hex")!==SALES36_HASH)throw Error("Reviewed program changed.");
 const steps=bytes.toString("utf8").split("-- SALES36 STEP\n").slice(1).map(s=>s.trim());
 if(steps.length!==42)throw Error("Incomplete program.");return steps;
}
export const SALES_AUTO={
 sale_operations:[["pk","id"],["u","request_key"],["u","invoice_id"]],
 sales:[["pk","id"],["u","invoice_number"],["u","operation_id"],["u","id","operation_id"]],
 sale_lines:[["pk","id"],["u","invoice_id","line_no"],["u","invoice_id","product_id"],["u","id","product_id"]],
 invoice_snapshots:[["pk","invoice_id"]],sale_payments:[["pk","id"],["u","invoice_id"]],sale_cancellations:[["pk","request_key"]],
 stock_movements:[["pk","id"],["u","operation_id"],["u","sale_line_id"],["u","product_id","balance_version"]]
} as const;
export const SALES_INDEXES={
 sales_date:{table:"sales",columns:["business_date","recorded_at_ms","id"],unique:BigInt(0),partial:BigInt(0)},
 sale_lines_product:{table:"sale_lines",columns:["product_id","invoice_id"],unique:BigInt(0),partial:BigInt(0)}
} as const;
export function salesObjects(){
 const result=new Map<string,{type:"table"|"index"|"trigger";table:string;sql:string}>();
 for(const step of salesSteps()){
  const t=/^CREATE TABLE ([a-z_]+) \(/.exec(step),i=/^CREATE (?:UNIQUE )?INDEX ([a-z_]+) ON ([a-z_]+)/.exec(step),
   g=/^CREATE TRIGGER ([a-z_]+) (?:BEFORE|AFTER) (?:INSERT|UPDATE|DELETE) ON ([a-z_]+)/.exec(step);
  if(t){const stock=t[1]==="stock_movements_next",name=stock?"stock_movements":t[1];
   result.set(name,{type:"table",table:name,sql:stock?step.replace("stock_movements_next",'"stock_movements"'):step});
  }else if(i)result.set(i[1],{type:"index",table:i[2],sql:step});
  else if(g)result.set(g[1],{type:"trigger",table:g[2],sql:step});
 }
 return result;
}
