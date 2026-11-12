import "server-only";
import type {AuthorizedTransaction} from "../auth/types";
import type {SqlRow} from "../db/connection";
import {readReceipt,type Receipt,type SafeLine} from "../sales/service";
import {canonical,digest,object} from "../inventory/validation";
export type Row=SqlRow;
export async function invoiceBasis(tx:AuthorizedTransaction,id:string){
 const original=await readReceipt(tx,id),sale=await tx.get("SELECT * FROM sales WHERE id=?",[id]);if(!sale)throw Error("Invoice unavailable.");
 const revision=await tx.get("SELECT * FROM invoice_revisions WHERE invoice_id=? ORDER BY revision DESC LIMIT 1",[id]);
 const rows=revision?await tx.all("SELECT s.name,s.code,s.size_label,s.unit,l.* FROM invoice_revision_lines l JOIN sale_lines s ON s.id=l.sale_line_id WHERE l.revision_id=? ORDER BY l.line_no",[revision.id]):await tx.all("SELECT *,id AS sale_line_id FROM sale_lines WHERE invoice_id=? ORDER BY line_no",[id]);
 const payment=await tx.get("SELECT * FROM sale_payments WHERE invoice_id=?",[id]),settlement=revision?await tx.get("SELECT * FROM invoice_settlements WHERE revision_id=?",[revision.id]):undefined;
 return {original,sale,revision,rows,payment,settlement,version:revision?String(revision.revision):"1",total:BigInt(String(revision?.charged_m??sale.charged_m)),cogs:BigInt(String(revision?.cogs_m??sale.cogs_m))};
}
export type RevisedReceipt={invoiceId:string;number:string;revision:string;businessDate:string;correctedDate:string;recordedAtMs:string;shopName:string;customerName:string;customerPhone:string;lines:SafeLine[];totalPaisa:string;settlement:{originalReceivedPaisa:string;priorAdjustmentTotalPaisa:string;thisAdjustmentPaisa:string;verifiedNetReceivedPaisa:string;cashDate:string|null}};
export function safeLines(rows:Row[]):SafeLine[]{return rows.map(l=>({productId:String(l.product_id),code:String(l.code),name:String(l.name),sizeLabel:l.size_label===null?null:String(l.size_label),unit:String(l.unit),quantity:(BigInt(String(l.quantity_q))/BigInt(1000000)).toString(),unitPricePaisa:String(l.unit_price_m),discountPercent:String(l.discount_percent),unitPayablePaisa:String(l.unit_payable_m),totalPaisa:String(l.charged_m)}));}
export async function revisionReceipt(tx:AuthorizedTransaction,id:string):Promise<RevisedReceipt>{
 const v=await tx.get("SELECT * FROM invoice_revisions WHERE id=?",[id]);if(!v)throw Error("Invoice unavailable.");
 const raw=String(v.receipt_json),parsed=JSON.parse(raw);if(digest(parsed)!==v.receipt_hash||canonical(parsed)!==raw)throw Error("Invoice snapshot unavailable.");
 const p=object(parsed,["invoiceId","number","revision","businessDate","correctedDate","recordedAtMs","shopName","customerName","customerPhone","lines","totalPaisa","settlement"]);
 const original=await readReceipt(tx,String(v.invoice_id)),rows=await tx.all("SELECT s.name,s.code,s.size_label,s.unit,l.* FROM invoice_revision_lines l JOIN sale_lines s ON s.id=l.sale_line_id WHERE l.revision_id=? ORDER BY l.line_no",[id]);
 const payment=await tx.get("SELECT * FROM sale_payments WHERE invoice_id=?",[v.invoice_id]),adjust=await tx.get("SELECT * FROM invoice_cash_adjustments WHERE revision_id=?",[id]);if(!payment)throw Error("Settlement unavailable.");
 const prior=await tx.get("SELECT coalesce(sum(a.amount_m),0) AS n FROM invoice_cash_adjustments a JOIN invoice_revisions r ON r.id=a.revision_id WHERE r.invoice_id=? AND r.revision<?",[v.invoice_id,v.revision]);
 const expected:RevisedReceipt={invoiceId:String(v.invoice_id),number:original.number,revision:String(v.revision),businessDate:original.businessDate,correctedDate:String(v.effective_date),recordedAtMs:String(v.recorded_at_ms),shopName:original.shopName,customerName:original.customerName,customerPhone:original.customerPhone,lines:safeLines(rows),totalPaisa:String(v.charged_m),settlement:{originalReceivedPaisa:String(payment.net_received_m),priorAdjustmentTotalPaisa:String(prior?.n),thisAdjustmentPaisa:String(adjust?.amount_m??BigInt(0)),verifiedNetReceivedPaisa:String(v.charged_m),cashDate:adjust?String(adjust.cash_date):null}};
 if(canonical(p)!==canonical(expected))throw Error("Invoice snapshot unavailable.");return expected;
}
export async function effectiveReceipt(tx:AuthorizedTransaction,id:string):Promise<{original:Receipt;current:RevisedReceipt|null}>{const b=await invoiceBasis(tx,id);return {original:b.original,current:b.revision?await revisionReceipt(tx,String(b.revision.id)):null};}
