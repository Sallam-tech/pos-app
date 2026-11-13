import {cashSaleIntentHash} from "../cash/sale-intent";
import {expenseBinding as recoveryBinding} from "../expenses/authority";
import {verifiedJson} from "../db/verified-json";
import {calendar} from "../expenses/calendar";
import {beforeSource,afterSource} from "../cash/source";
import "server-only";
import {postSaleLedgers,assertReturnLedgers} from "../returns/ledgers";
import {randomUUID} from "node:crypto";
import type {Actor,AuthorizationGateway,AuthorizedTransaction} from "../auth/types";
import {authorizedFileNamespace} from "../auth/database";
import {validateReviewedSchema} from "../db/validate-schema";
import {int64} from "../db/integers";
import {load} from "../inventory/model";
import {InventoryError} from "../inventory/contracts";
import {canonical,digest,object,text,uuid,SCALE,now} from "../inventory/validation";
import {MONEY_POLICY,SaleError,deny,lineAmounts,money,unsigned} from "./calculations";
export type SaleLineInput={productId:string;quantity:string;unitPricePaisa:string;discountPercent:string};
export type SaleCommand={requestKey:string;context:string;lines:SaleLineInput[];cashPaisa:string|null;customerName:string;customerPhone:string;cashDate?:string};
export type SafeLine={productId:string;code:string;name:string;sizeLabel:string|null;unit:string;quantity:string;unitPricePaisa:string;discountPercent:string;unitPayablePaisa:string;totalPaisa:string};
export type Receipt={id:string;number:string;recordedAtMs:string;businessDate:string;policy:typeof MONEY_POLICY;shopName:string;customerName:string;customerPhone:string;lines:SafeLine[];totalPaisa:string;payment:null|{tenderedPaisa:string;changePaisa:string;receivedPaisa:string}};
export function parseSale(input:unknown):SaleCommand{
 const o=object(input,["requestKey","context","lines"],["cashPaisa","customerName","customerPhone","cashDate"]);
 if(typeof o.context!=="string"||!/^[0-9a-f]{64}$/.test(o.context)||!Array.isArray(o.lines)||o.lines.length<1||o.lines.length>50)return deny();
 const seen=new Set<string>(),lines=o.lines.map(v=>{const l=object(v,["productId","quantity","unitPricePaisa","discountPercent"]),id=uuid(l.productId);if(seen.has(id))return deny();seen.add(id);unsigned(l.quantity,BigInt("999999999999"));money(l.unitPricePaisa);unsigned(l.discountPercent,BigInt(100),true);return {productId:id,quantity:String(l.quantity),unitPricePaisa:String(l.unitPricePaisa),discountPercent:String(l.discountPercent)};});
 return {requestKey:uuid(o.requestKey),context:o.context,lines,cashPaisa:o.cashPaisa==null?null:money(o.cashPaisa,false,BigInt("9223372036854775807")).toString(),customerName:text(o.customerName??"",120,true),customerPhone:text(o.customerPhone??"",40,true),...(o.cashDate===undefined?{}:{cashDate:calendar(o.cashDate)})};
}
export async function salesContext(tx:AuthorizedTransaction){
 const file=authorizedFileNamespace(tx),r=await tx.get("SELECT completed_at_ms FROM auth_provisioning WHERE id=1 AND admin_id='ADMIN' AND salesperson_id='SALESPERSON'"),m=await tx.get("SELECT checksum FROM schema_migrations WHERE version=36");
 if(!r||typeof r.completed_at_ms!=="bigint"||r.completed_at_ms<=BigInt(0)||typeof m?.checksum!=="string")return deny("UNAVAILABLE");
 const context=digest(["pos-test-sales-context-v1",file,r.completed_at_ms.toString(),m.checksum]);authorizedFileNamespace(tx);return context;
}
function commandHash(c:SaleCommand){return digest({kind:"SALE",policy:MONEY_POLICY,...c});}
const big=(v:unknown)=>{if(typeof v!=="bigint")return deny("UNAVAILABLE");return int64(v);};
const day=(t:bigint)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Number(t)));
export async function readReceipt(tx:AuthorizedTransaction,id:string):Promise<Receipt>{
 const s=await tx.get("SELECT * FROM sales WHERE id=?",[id]);if(!s)return deny("NOT_FOUND");
 const op=await tx.get("SELECT * FROM sale_operations WHERE id=? AND invoice_id=?",[s.operation_id,id]);
 if(!op||op.actor_id!=="SALESPERSON"||op.policy!==MONEY_POLICY||op.recorded_at_ms!==s.recorded_at_ms||s.policy!==MONEY_POLICY||s.actor_id!=="SALESPERSON")return deny("UNAVAILABLE");
 const command=parseSale(JSON.parse(String(op.payload_json)));
 if(commandHash(command)!==op.payload_hash||canonical(command)!==op.payload_json||command.requestKey!==op.request_key||command.context!==op.context_fingerprint)return deny("UNAVAILABLE");
 const rows=await tx.all("SELECT * FROM sale_lines WHERE invoice_id=? ORDER BY line_no LIMIT 51",[id]);
 if(!rows.length||rows.length>50||BigInt(rows.length)!==big(s.line_count)||rows.length!==command.lines.length)return deny("UNAVAILABLE");
 let total=BigInt(0),cogs=BigInt(0);
 const lines:SafeLine[]=[];
 for(const [index,r]of rows.entries()){
  const saved=command.lines[index],amount=lineAmounts(r.unit_price_m?.toString(),(big(r.quantity_q)/SCALE).toString(),r.discount_percent?.toString(),big(r.cost_snapshot_m));
  if(r.product_id!==saved.productId||r.line_no!==BigInt(index+1)||r.unit_price_m?.toString()!==saved.unitPricePaisa||amount.count.toString()!==saved.quantity||amount.percent.toString()!==saved.discountPercent||
    amount.unitPayable!==r.unit_payable_m||amount.charged!==r.charged_m||amount.cogs!==r.cogs_m||amount.numerator!==r.exact_unit_numerator||r.exact_unit_denominator!==BigInt(100))return deny("UNAVAILABLE");
  const movement=await tx.all("SELECT * FROM stock_movements WHERE sale_line_id=? LIMIT 2",[r.id]);
  if(movement.length!==1||movement[0].kind!=="SALE"||movement[0].operation_id!==null||movement[0].product_id!==r.product_id||movement[0].delta_q!==-big(r.quantity_q)||movement[0].cost_snapshot_m!==r.cost_snapshot_m)return deny("UNAVAILABLE");
  await load(tx,String(r.product_id));
  total=int64(total+amount.charged);cogs=int64(cogs+amount.cogs);
  lines.push({productId:uuid(r.product_id),code:text(r.code,32),name:text(r.name,120),sizeLabel:r.size_label===null?null:text(r.size_label,40),unit:text(r.unit,4),quantity:amount.count.toString(),unitPricePaisa:amount.unit.toString(),discountPercent:amount.percent.toString(),unitPayablePaisa:amount.unitPayable.toString(),totalPaisa:amount.charged.toString()});
 }
 if(total!==s.charged_m||cogs!==s.cogs_m||total-cogs!==s.profit_m||s.business_date!==day(big(s.recorded_at_ms))||s.invoice_number!=="TEST-"+id)return deny("UNAVAILABLE");
 const payments=await tx.all("SELECT * FROM sale_payments WHERE invoice_id=? LIMIT 2",[id]);if(payments.length>1)return deny("UNAVAILABLE");
 let payment:Receipt["payment"]=null;
 if(payments.length){const p=payments[0],t=big(p.tendered_m),change=big(p.change_m);if(t%BigInt(100)||change<BigInt(0)||t-change!==total||p.net_received_m!==total||t.toString()!==command.cashPaisa)return deny("UNAVAILABLE");payment={tenderedPaisa:t.toString(),changePaisa:change.toString(),receivedPaisa:total.toString()};}
 else if(command.cashPaisa!==null)return deny("UNAVAILABLE");
 const snap=await tx.get("SELECT * FROM invoice_snapshots WHERE invoice_id=?",[id]);if(!snap||snap.format_version!==BigInt(1)||snap.recorded_at_ms!==s.recorded_at_ms||typeof snap.receipt_json!=="string"||digest(JSON.parse(snap.receipt_json))!==snap.sha256)return deny("UNAVAILABLE");
 const stored=object(JSON.parse(snap.receipt_json),["id","number","recordedAtMs","businessDate","policy","shopName","customerName","customerPhone","lines","totalPaisa","payment"]);
 const result:Receipt={id,number:"TEST-"+id,recordedAtMs:big(s.recorded_at_ms).toString(),businessDate:String(s.business_date),policy:MONEY_POLICY,shopName:text(stored.shopName,80),customerName:command.customerName,customerPhone:command.customerPhone,lines,totalPaisa:total.toString(),payment};
 if(canonical(result)!==snap.receipt_json)return deny("UNAVAILABLE");return result;
}

// The author is the authenticated original Staff requester. A recovery executor is
// independently recorded in the exact Admin cash operation and resolution.
async function persistPreparedSale(tx:AuthorizedTransaction,actor:Actor,command:SaleCommand,schema:36|37|38|39|40,shopName:string):Promise<Receipt>{
 if(actor.role!=="SALESPERSON"||actor.principalId!=="SALESPERSON")return deny("UNAVAILABLE");text(shopName,80);
   const c=command;if(schema<40&&c.cashDate!==undefined)return deny();if(c.context!==await salesContext(tx))return deny("CONFLICT");
   const previous=await tx.get("SELECT * FROM sale_operations WHERE request_key=?",[c.requestKey]);
   if(await tx.get("SELECT request_key FROM sale_cancellations WHERE request_key=?",[c.requestKey]))return deny("CONFLICT");
   if(previous){if(previous.payload_hash!==commandHash(c)||previous.payload_json!==canonical(c)||previous.actor_id!==actor.principalId)return deny("CONFLICT");return readReceipt(tx,String(previous.invoice_id));}
   if(schema===40){if(c.cashPaisa!==null&&c.cashDate===undefined)return deny();const admission=await tx.get("SELECT payload_hash FROM counter_cash_admissions WHERE source_kind=\'SALE\' AND source_key=?",[c.requestKey]);if(admission){if(c.cashPaisa===null||admission.payload_hash!==cashSaleIntentHash(c))return deny("CONFLICT");}else if(c.cashPaisa!==null)return deny("CONFLICT");}
   const id=randomUUID(),operation=randomUUID(),t=now(),date=day(t),rows=[];
   let total=BigInt(0),cogs=BigInt(0);
   for(const l of c.lines){const current=await load(tx,l.productId);if(!current.dto.sellingActive||current.archived!==null||t<current.balanceUpdated)return deny("CONFLICT");const amount=lineAmounts(l.unitPricePaisa,l.quantity,l.discountPercent,current.cost);if(current.q<amount.count*SCALE)return deny("CONFLICT");total=int64(total+amount.charged);cogs=int64(cogs+amount.cogs);rows.push({current,amount,id:randomUUID()});}
   const tender=c.cashPaisa===null?null:money(c.cashPaisa,false,BigInt("9223372036854775807"));if(tender!==null&&tender<total)return deny();
   await tx.run("INSERT INTO sale_operations VALUES(?,?,?,?,?,?,?,?,?,?)",[operation,c.requestKey,c.context,actor.principalId,actor.sessionId,commandHash(c),canonical(c),id,MONEY_POLICY,t]);
   await tx.run("INSERT INTO sales VALUES(?,?,?,?,?,?,?,?,?,?,?)",[id,"TEST-"+id,operation,actor.principalId,t,date,BigInt(rows.length),total,cogs,int64(total-cogs),MONEY_POLICY]);
   const safe:SafeLine[]=[];
   for(const [i,{current:v,amount:a,id:lineId}]of rows.entries()){
    await tx.run("INSERT INTO sale_lines VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[lineId,id,BigInt(i+1),v.dto.id,v.dto.code,v.dto.name,v.dto.sizeLabel,v.dto.unit,a.count*SCALE,a.unit,a.percent,a.numerator,a.denominator,a.unitPayable,a.charged,v.cost,a.cogs]);
    const after=int64(v.q-a.count*SCALE),version=int64(v.balanceVersion+BigInt(1)),value=int64(after/SCALE*v.cost);
    const changed=await tx.run("UPDATE stock_balances SET sellable_q=?,stock_value_m=?,version=?,updated_at_ms=? WHERE product_id=? AND version=? AND sellable_q>=?",[after,value,version,t,v.dto.id,v.balanceVersion,a.count*SCALE]);if(changed.changes!==BigInt(1))return deny("CONFLICT");
    await tx.run("INSERT INTO stock_movements(id,operation_id,product_id,kind,before_q,delta_q,after_q,cost_snapshot_m,balance_version,sale_line_id) VALUES(?,?,?,?,?,?,?,?,?,?)",[randomUUID(),null,v.dto.id,"SALE",v.q,-a.count*SCALE,after,v.cost,version,lineId]);
    safe.push({productId:v.dto.id,code:v.dto.code,name:v.dto.name,sizeLabel:v.dto.sizeLabel,unit:v.dto.unit,quantity:a.count.toString(),unitPricePaisa:a.unit.toString(),discountPercent:a.percent.toString(),unitPayablePaisa:a.unitPayable.toString(),totalPaisa:a.charged.toString()});
   }
   if(tender!==null)await tx.run("INSERT INTO sale_payments VALUES(?,?,?,?,?,?)",[randomUUID(),id,tender,int64(tender-total),total,t]);
   const result:Receipt={id,number:"TEST-"+id,recordedAtMs:t.toString(),businessDate:date,policy:MONEY_POLICY,shopName,customerName:c.customerName,customerPhone:c.customerPhone,lines:safe,totalPaisa:total.toString(),payment:tender===null?null:{tenderedPaisa:tender.toString(),changePaisa:(tender-total).toString(),receivedPaisa:total.toString()}};
   await tx.run("INSERT INTO invoice_snapshots VALUES(?,?,?,?,?)",[id,BigInt(1),canonical(result),digest(result),t]);if(schema>=37)await postSaleLedgers(tx,id);return readReceipt(tx,id);
}
export function createSalesService(gateway:AuthorizationGateway,shopName:string,schema:36|37|38|39|40=36){
 text(shopName,80);
 async function scope<T>(request:Request,admin:boolean,work:(tx:AuthorizedTransaction,actor:Actor)=>Promise<T>){
  let failure:SaleError|undefined;
  try{return await (admin?gateway.withAdminTransaction.bind(gateway):gateway.withSalespersonTransaction.bind(gateway))(request,async(tx,actor)=>{
   try{if(actor.role!==(admin?"ADMIN":"SALESPERSON")||!(await validateReviewedSchema(tx,schema)).ok)return deny("UNAVAILABLE");if(schema>=37)await assertReturnLedgers(tx);const before=schema>=39?await tx.get("SELECT total_changes() AS n,schema_version AS s FROM pragma_schema_version"):undefined;const cashMark=await beforeSource(tx);const result=await work(tx,actor);await afterSource(tx,actor,cashMark);const after=schema>=39?await tx.get("SELECT total_changes() AS n,schema_version AS s FROM pragma_schema_version"):undefined;if(schema>=37&&(schema<39||!before||!after||typeof before.n!=="bigint"||before.n!==after.n||before.s!==after.s))await assertReturnLedgers(tx);return result;}
   catch(e){if(e instanceof SaleError)failure=e;else if(e instanceof InventoryError&&e.code==="INVALID_INPUT")failure=new SaleError();else failure=Object.assign(new SaleError("UNAVAILABLE"),{cause:e});throw e;}
  });}catch{throw failure??new SaleError("UNAVAILABLE");}
 }
 async function terminal(tx:AuthorizedTransaction,key:string,context:string){
  if(context!==await salesContext(tx))return deny("CONFLICT");
  const op=await tx.get("SELECT invoice_id,context_fingerprint FROM sale_operations WHERE request_key=?",[key]),cancel=await tx.get("SELECT * FROM sale_cancellations WHERE request_key=?",[key]);
  if(op&&cancel)return deny("UNAVAILABLE");
  if(op){if(op.context_fingerprint!==context)return deny("CONFLICT");return {state:"COMMITTED" as const,requestKey:key,context,receipt:await readReceipt(tx,String(op.invoice_id))};}
  if(cancel){if(cancel.context_fingerprint!==context||cancel.actor_id!=="ADMIN")return deny("CONFLICT");return {state:"CANCELLED" as const,requestKey:key,context};}
  return {state:"UNKNOWN" as const,requestKey:key,context};
 }
 return Object.freeze({
  context:(r:Request)=>scope(r,false,async tx=>({context:await salesContext(tx)})),
  catalog:(r:Request,query="")=>scope(r,false,async tx=>{
   text(query,120,true);const rows=await tx.all("SELECT p.id,p.code,p.name,p.size_label,p.unit,p.selling_price_m FROM products p WHERE p.selling_active=1 AND p.archived_at_ms IS NULL AND p.selling_price_m%100=0 AND (instr(p.name_key,?)>0 OR p.code=?) ORDER BY p.name_key,p.id LIMIT 100",[query.toLowerCase(),query.toUpperCase()]);
   const items=[];for(const row of rows){await load(tx,String(row.id));items.push({id:uuid(row.id),code:text(row.code,32),name:text(row.name,120),sizeLabel:row.size_label===null?null:text(row.size_label,40),unit:text(row.unit,4),sellingPricePaisa:money(String(row.selling_price_m)).toString()});}return {items};
  }),
  get:(r:Request,id:unknown)=>scope(r,false,tx=>readReceipt(tx,uuid(id))),
  history:(r:Request,cursor?:string,query="")=>scope(r,false,async tx=>{
   text(query,120,true);const anchor=cursor?await tx.get("SELECT business_date,recorded_at_ms FROM sales WHERE id=?",[uuid(cursor)]):undefined;if(cursor&&!anchor)return deny();const clauses=["(instr(invoice_number,?)>0 OR EXISTS(SELECT 1 FROM sale_lines l WHERE l.invoice_id=sales.id AND instr(lower(l.name||' '||l.code),?)>0))"],values:import("../db/connection").SqlValue[]=[query,query.toLowerCase()];if(anchor){clauses.push("(business_date,recorded_at_ms,id)<(?,?,?)");values.push(anchor.business_date,anchor.recorded_at_ms,cursor!);}const rows=await tx.all("SELECT id FROM sales WHERE "+clauses.join(" AND ")+" ORDER BY business_date DESC,recorded_at_ms DESC,id DESC LIMIT 51",values);
   const items=[];for(const row of rows.slice(0,50)){const saved=await readReceipt(tx,String(row.id));items.push({id:saved.id,number:saved.number,recordedAtMs:saved.recordedAtMs,totalPaisa:schema>=39?String((await tx.get("SELECT charged_m FROM invoice_revisions WHERE invoice_id=? ORDER BY revision DESC LIMIT 1",[saved.id]))?.charged_m??saved.totalPaisa):saved.totalPaisa,customerName:saved.customerName});}return {items,nextCursor:rows.length>50?items.at(-1)!.id:null};
  }),
  operation:(r:Request,key:unknown,context:string)=>scope(r,false,tx=>terminal(tx,uuid(key),context)),
  recovery:(r:Request,key:unknown,context:string,confirm:boolean)=>scope(r,true,async(tx,actor)=>{
   const k=uuid(key),value=await terminal(tx,k,context);if(!confirm||value.state!=="UNKNOWN")return value;
   await tx.run("INSERT INTO sale_cancellations VALUES(?,?,?,?,?)",[k,context,actor.principalId,actor.sessionId,now()]);return terminal(tx,k,context);
  }),
  create:(r:Request,input:unknown)=>scope(r,false,(tx,actor)=>persistPreparedSale(tx,actor,parseSale(input),schema,shopName))
 });
}

export async function finalizePreparedCashSale(tx:AuthorizedTransaction,admin:Actor,admissionId:string,cashDate:string,tenderPaisa:string,changePaisa:string,requestId:string,grantId:string){
 if(admin.role!=="ADMIN"||admin.principalId!=="ADMIN")return deny("UNAVAILABLE");
 const a=await tx.get("SELECT * FROM counter_cash_admissions WHERE id=? AND source_kind='SALE' AND actor_id='SALESPERSON'",[uuid(admissionId)]),q=await tx.get("SELECT * FROM cash_action_requests WHERE id=?",[uuid(requestId)]),g=await tx.get("SELECT * FROM cash_action_authorizations WHERE id=? AND request_id=?",[uuid(grantId),requestId]),b=await recoveryBinding(tx,admin);
 if(!a||!q||!g)return deny("CONFLICT");const purpose=verifiedJson(q.payload_json,q.payload_hash,true) as {admissionId:string;resolution:string;actualDate:string;actualTenderPaisa:string;actualChangePaisa:string};
 if(q.action!=="RESOLVE_ADMISSION"||purpose.resolution!=="RECORD_PRIOR_SALE"||purpose.admissionId!==a.id||purpose.actualDate!==calendar(cashDate)||purpose.actualTenderPaisa!==tenderPaisa||purpose.actualChangePaisa!==changePaisa||g.session_ref!==admin.sessionId||g.credential_version!==b.credential_version||g.auth_epoch!==b.auth_epoch||g.boot_generation!==b.boot||b.now<big(g.issued_at_ms)||b.now>=big(g.expires_at_ms)||await tx.get("SELECT id FROM cash_action_operations WHERE authorization_id=?",[g.id]))return deny("CONFLICT");
 const stored=verifiedJson(a.payload_json,a.payload_digest,true) as {intent:Record<string,unknown>;shopName:string;expectedChargePaisa:string},c=parseSale({...stored.intent,cashPaisa:tenderPaisa,cashDate}),tender=money(tenderPaisa,false,BigInt("9223372036854775807")),change=money(changePaisa,true,BigInt("9223372036854775807"));
 if(c.requestKey!==a.source_key||cashSaleIntentHash(c)!==a.payload_hash||tender-change!==BigInt(stored.expectedChargePaisa)||await tx.get("SELECT id FROM sale_operations WHERE request_key=?",[c.requestKey]))return deny("CONFLICT");
 const receipt=await persistPreparedSale(tx,{role:"SALESPERSON",principalId:"SALESPERSON",sessionId:String(a.session_ref)},c,40,text(stored.shopName,80));
 if(receipt.totalPaisa!==stored.expectedChargePaisa||receipt.payment?.changePaisa!==changePaisa)return deny("UNAVAILABLE");return receipt;
}
