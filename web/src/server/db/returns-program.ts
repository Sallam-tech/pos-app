import "server-only";
import { createHash } from "node:crypto";
import { lstatSync,readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rejectRedirectedPath } from "./location";
export const RETURNS37_NAME="0037_returns_refunds_and_ledgers.sql";
export const RETURNS37_HASH="6b3ff7b30c45f737dc87d9350d60367d8484d94728d4bb3a84d032e3faf45bba";
export const RETURN_TABLES=["return_requests","return_authorizations","return_operations","returns","return_lines","refund_payments","return_dispositions","cash_movements","financial_events","return_cancellations"] as const;
export function returnsSteps(){
 const p=fileURLToPath(new URL("./migrations/"+RETURNS37_NAME,import.meta.url));rejectRedirectedPath(path.dirname(p));
 const stat=lstatSync(p);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>200000)throw Error("Reviewed program unavailable.");
 const bytes=readFileSync(p);if(createHash("sha256").update(bytes).digest("hex")!==RETURNS37_HASH)throw Error("Reviewed program changed.");
 const steps=bytes.toString("utf8").split("-- RETURNS37 STEP\n").slice(1).map(s=>s.trim());
 if(steps.length!==70)throw Error("Incomplete program.");return steps;
}
export const RETURN_AUTO={"return_requests":[["pk","id"],["u","request_key"],["u","id","request_key"]],"return_authorizations":[["pk","id"],["u","id","request_id"]],"return_operations":[["pk","id"],["u","request_id"],["u","request_key"],["u","authorization_id"],["u","return_id"],["u","first_disposition_id"]],"returns":[["pk","id"],["u","operation_id"],["u","refund_payment_id"],["u","id","operation_id"],["u","id","invoice_id"]],"return_lines":[["pk","id"],["u","return_id","sale_line_id"],["u","sale_line_id","after_q"],["u","id","product_id"]],"refund_payments":[["pk","id"],["u","return_id"],["u","id","return_id","amount_m"]],"return_dispositions":[["pk","id"],["u","operation_id","return_line_id","decision"],["u","id","product_id"],["u","id","operation_id"]],"cash_movements":[["pk","id"],["u","sale_payment_id"],["u","refund_payment_id"]],"financial_events":[["pk","id"],["u","sale_line_id"],["u","return_line_id"],["u","disposition_id"]],"return_cancellations":[["pk","request_key"]],"stock_movements":[["pk","id"],["u","operation_id"],["u","sale_line_id"],["u","return_disposition_id"],["u","product_id","balance_version"]]} as const;
export const RETURN_INDEXES={"sale_lines_returns_binding":{table:"sale_lines",columns:["id","invoice_id","product_id","quantity_q","charged_m","cost_snapshot_m"],unique:BigInt(1),partial:BigInt(0)},"sale_payments_returns_binding":{table:"sale_payments",columns:["id","invoice_id"],unique:BigInt(1),partial:BigInt(0)},"return_requests_role":{table:"return_requests",columns:["requester_role","created_at_ms","id"],unique:BigInt(0),partial:BigInt(0)},"returns_invoice":{table:"returns",columns:["invoice_id","recorded_at_ms","id"],unique:BigInt(0),partial:BigInt(0)},"return_lines_original":{table:"return_lines",columns:["sale_line_id","after_q"],unique:BigInt(0),partial:BigInt(0)},"return_dispositions_line":{table:"return_dispositions",columns:["return_line_id","recorded_at_ms","id"],unique:BigInt(0),partial:BigInt(0)},"return_authorizations_request":{table:"return_authorizations",columns:["request_id","issued_at_ms","id"],unique:BigInt(0),partial:BigInt(0)}} as const;
export function returnsObjects(){
 const result=new Map<string,{type:"table"|"index"|"trigger";table:string;sql:string}>();
 for(const step of returnsSteps()){
  const t=/^CREATE TABLE ([a-z_]+) \(/.exec(step),i=/^CREATE (?:UNIQUE )?INDEX ([a-z_]+) ON ([a-z_]+)/.exec(step),
   g=/^CREATE TRIGGER ([a-z_]+) (?:BEFORE|AFTER) (?:INSERT|UPDATE|DELETE) ON ([a-z_]+)/.exec(step);
  if(t){const stock=t[1]==="stock_movements_returns_next",name=stock?"stock_movements":t[1];
   result.set(name,{type:"table",table:name,sql:stock?step.replace("stock_movements_returns_next",'"stock_movements"'):step});
  }else if(i)result.set(i[1],{type:"index",table:i[2],sql:step});
  else if(g)result.set(g[1],{type:"trigger",table:g[2],sql:step});
 }
 return result;
}
