export const SALE_FINANCIAL_GUARD="SELECT l.id FROM sale_lines l LEFT JOIN financial_events f ON f.sale_line_id=l.id LEFT JOIN sales parent ON parent.id=l.invoice_id WHERE f.id IS NULL OR f.kind<>'SALE' OR f.revenue_delta_m<>l.charged_m OR f.cogs_delta_m<>l.cogs_m OR f.valuation_delta_m<>0 OR f.effective_date<>parent.business_date OR f.recorded_at_ms<>parent.recorded_at_ms LIMIT 1";
export const SALE_PAYMENT_GUARD="SELECT p.id FROM sale_payments p JOIN sales s ON s.id=p.invoice_id LEFT JOIN cash_movements c ON c.sale_payment_id=p.id WHERE p.net_received_m<>s.charged_m OR p.recorded_at_ms<>s.recorded_at_ms OR c.id IS NULL OR c.kind<>'SALE' OR c.amount_m<>p.net_received_m OR c.cash_date<>coalesce(json_extract((SELECT payload_json FROM sale_operations WHERE id=s.operation_id),'$.cashDate'),s.business_date) LIMIT 1";
import {resumeGuardInputs,retainGuardInputs,captureGuardInputs,guardInputsUnchanged,type GuardInputPoint} from "../auth/database";
import {assertInvoiceLedgers} from "../invoices/ledgers";
import "server-only";
import {randomUUID} from "node:crypto";
import type {AuthorizedTransaction} from "../auth/types";
import {cumulativeRefund} from "../sales/calculations";
import {SCALE} from "../inventory/validation";
import {int64} from "../db/integers";
export async function postSaleLedgers(tx:AuthorizedTransaction,invoice:string){
 const s=await tx.get("SELECT s.business_date,s.recorded_at_ms,o.payload_json FROM sales s JOIN sale_operations o ON o.id=s.operation_id WHERE s.id=?",[invoice]);if(!s)throw Error();
 for(const l of await tx.all("SELECT id,charged_m,cogs_m FROM sale_lines WHERE invoice_id=?",[invoice]))await tx.run("INSERT INTO financial_events(id,kind,sale_line_id,return_line_id,disposition_id,revenue_delta_m,cogs_delta_m,valuation_delta_m,effective_date,recorded_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?)",[randomUUID(),"SALE",l.id,null,null,l.charged_m,l.cogs_m,BigInt(0),s.business_date,s.recorded_at_ms]);
 const p=await tx.get("SELECT id,net_received_m,recorded_at_ms FROM sale_payments WHERE invoice_id=?",[invoice]);
 if(p)await tx.run("INSERT INTO cash_movements(id,kind,sale_payment_id,refund_payment_id,amount_m,cash_date,recorded_at_ms,provenance) VALUES(?,?,?,?,?,?,?,?)",[randomUUID(),"SALE",p.id,null,p.net_received_m,JSON.parse(String(s.payload_json)).cashDate??s.business_date,p.recorded_at_ms,"SOURCE_RECORDED"]);
}
const continuationOwner=Object.freeze({});
const checkpoints=new WeakMap<object,GuardInputPoint>();
export async function assertReturnLedgers(tx:Pick<AuthorizedTransaction,"get"|"all">){
 if(resumeGuardInputs(tx,"RETURN",continuationOwner))return;
 const previous=checkpoints.get(tx);
 if(previous&&guardInputsUnchanged(tx,"RETURN",previous))return;
 checkpoints.delete(tx);const point=captureGuardInputs(tx,"RETURN");
 await assertReturnLedgersFull(tx);
 // A scan with any intervening write cannot mint a reusable verdict.
 if(point&&guardInputsUnchanged(tx,"RETURN",point,true)){checkpoints.set(tx,point);retainGuardInputs(tx,"RETURN",point,continuationOwner);}
}
export async function assertReturnLedgersFull(tx:Pick<AuthorizedTransaction,"get"|"all">){
 const bad=async(sql:string)=>{if(await tx.get(sql))throw Error("Ledger unavailable.");};
 await bad(SALE_FINANCIAL_GUARD);
 await bad(SALE_PAYMENT_GUARD);
 await bad("SELECT l.id FROM return_lines l JOIN returns r ON r.id=l.return_id LEFT JOIN financial_events f ON f.return_line_id=l.id WHERE f.id IS NULL OR f.kind<>'REFUND' OR f.revenue_delta_m<>-l.refund_m OR f.cogs_delta_m<>0 OR f.effective_date<>r.cash_date LIMIT 1");
 await bad("SELECT r.id FROM returns r LEFT JOIN refund_payments p ON p.id=r.refund_payment_id AND p.return_id=r.id LEFT JOIN cash_movements c ON c.refund_payment_id=p.id WHERE p.id IS NULL OR r.total_m<>p.amount_m OR r.cash_date<>p.cash_date OR c.id IS NULL OR c.kind<>'REFUND' OR c.amount_m<>-r.total_m OR c.cash_date<>r.cash_date OR r.line_count<>(SELECT count(*) FROM return_lines WHERE return_id=r.id) OR r.total_m<>(SELECT sum(refund_m) FROM return_lines WHERE return_id=r.id) LIMIT 1");
 await bad("SELECT sale_line_id FROM return_lines GROUP BY sale_line_id HAVING sum(quantity_q)>max(original_quantity_q) OR sum(refund_m)>max(original_paid_m) LIMIT 1");
 await bad("SELECT l.id FROM return_lines l WHERE coalesce((SELECT sum(quantity_q) FROM return_dispositions d WHERE d.return_line_id=l.id),0)>l.quantity_q LIMIT 1");
 await bad("SELECT d.id FROM return_dispositions d LEFT JOIN stock_movements m ON m.return_disposition_id=d.id LEFT JOIN financial_events f ON f.disposition_id=d.id WHERE (d.decision='RESTOCK' AND (m.id IS NULL OR f.id IS NULL OR m.kind<>'RETURN_RESTOCK' OR m.product_id<>d.product_id OR m.delta_q<>d.quantity_q OR m.cost_snapshot_m<>d.current_cost_m OR f.kind<>'RESTOCK' OR f.revenue_delta_m<>0 OR f.cogs_delta_m<>-d.cogs_reversal_m OR f.valuation_delta_m<>d.valuation_delta_m)) OR (d.decision='WRITE_OFF' AND (m.id IS NOT NULL OR f.id IS NOT NULL)) LIMIT 1");
 await bad("SELECT r.id FROM return_requests r JOIN return_operations o ON o.request_id=r.id JOIN return_cancellations c ON c.request_key=r.request_key LIMIT 1");
 await bad("SELECT o.id FROM return_operations o JOIN return_requests r ON r.id=o.request_id JOIN return_authorizations a ON a.id=o.authorization_id WHERE o.request_key<>r.request_key OR o.kind<>r.kind OR a.request_id<>r.id OR (o.kind='REFUND' AND a.action NOT IN ('EXECUTE_REFUND','RECORD_PRIOR_PAYOUT')) OR (o.kind='DISPOSITION' AND a.action NOT IN ('DISPOSE','RECORD_DISPOSITION')) LIMIT 1");
 await bad("SELECT d.id FROM return_dispositions d JOIN return_lines l ON l.id=d.return_line_id WHERE d.original_cost_m<>l.original_cost_m OR (d.decision='RESTOCK' AND (d.cogs_reversal_m<>d.original_cost_m*(d.quantity_q/1000000) OR d.valuation_delta_m<>(d.current_cost_m-d.original_cost_m)*(d.quantity_q/1000000))) LIMIT 1");
 if((await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version===BigInt(39)||(await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version===BigInt(40)||(await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version===BigInt(41))await assertInvoiceLedgers(tx);
 // Reject forks/gaps even when global caps would still appear plausible.
 const rows=await tx.all("SELECT sale_line_id,quantity_q,refund_m,prior_q,prior_m,after_q,after_m,original_quantity_q,original_paid_m,original_cost_m,original_cost_allocation_m,exact_numerator FROM return_lines ORDER BY sale_line_id,after_q");
 let id:unknown,q=BigInt(0),m=BigInt(0);for(const r of rows){if(r.sale_line_id!==id){id=r.sale_line_id;q=BigInt(0);m=BigInt(0);}if(r.prior_q!==q||r.prior_m!==m)throw Error("Return history unavailable.");if(cumulativeRefund(String(r.original_paid_m),(BigInt(String(r.original_quantity_q))/SCALE).toString(),(q/SCALE).toString(),m.toString(),(BigInt(String(r.quantity_q))/SCALE).toString())!==r.refund_m||BigInt(String(r.original_cost_m))*BigInt(String(r.quantity_q))/SCALE!==r.original_cost_allocation_m||String(BigInt(String(r.original_paid_m))/BigInt(100)*(BigInt(String(r.after_q))/SCALE))!==r.exact_numerator)throw Error("Return calculation unavailable.");q=int64(q+BigInt(String(r.quantity_q)));m=int64(m+BigInt(String(r.refund_m)));if(r.after_q!==q||r.after_m!==m)throw Error("Return history unavailable.");}
}
