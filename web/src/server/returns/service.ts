import {beforeSource,afterSource} from "../cash/source";
import {invoiceBasis} from "../invoices/model";
import "server-only";
import {randomUUID} from "node:crypto";
import type {Actor,AuthorizationGateway,AuthorizedTransaction,Role} from "../auth/types";
import {authorizedFileNamespace} from "../auth/database";
import {validateReviewedSchema} from "../db/validate-schema";
import {int64} from "../db/integers";
import {canonical,digest,object,text,uuid,SCALE} from "../inventory/validation";
import {load} from "../inventory/model";
import {readReceipt} from "../sales/service";
import {InventoryError} from "../inventory/contracts";
import {cumulativeRefund,unsigned,SaleError} from "../sales/calculations";
import {assertReturnLedgers} from "./ledgers";
type Tx=AuthorizedTransaction;
type Row=Awaited<ReturnType<Tx["get"]>>;
type Kind="REFUND"|"DISPOSITION";
export class ReturnError extends Error{constructor(readonly code:"INVALID_INPUT"|"CONFLICT"|"NOT_FOUND"|"UNAVAILABLE"="INVALID_INPUT"){super("Return unavailable.");this.name="ReturnError";}}
const deny=(code:ReturnError["code"]="INVALID_INPUT"):never=>{throw new ReturnError(code);};
const zero=BigInt(0),one=BigInt(1),big=(v:unknown)=>{if(typeof v!=="bigint")return deny("UNAVAILABLE");return int64(v);};
const day=(t:bigint)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Number(t)));
const evidence=(v:unknown)=>digest(JSON.parse(JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x)));
const clocks=new Map<string,{wall:number;tick:number;origin:number;start:number}>();
async function binding(tx:Tx,a:Actor){
 const r=await tx.get("SELECT s.*,p.active,p.credential_version AS current_version,p.auth_epoch AS current_epoch FROM auth_session_authorizations s JOIN auth_principals p ON p.id=s.principal_id WHERE s.session_id=? AND p.id=?",[a.sessionId,a.principalId]);
 const wall=Date.now(),tick=Math.floor(performance.now());
 if(!Number.isSafeInteger(wall)||!Number.isSafeInteger(tick)||wall<=0||tick<0)return deny("UNAVAILABLE");
 if(!r||r.active!==one||r.revoked_at_ms!==null||r.credential_version!==r.current_version||r.auth_epoch!==r.current_epoch)return deny("CONFLICT");
 const boot=String(r.boot_generation),old=clocks.get(boot);
 if(old&&(wall<old.wall||tick<old.tick))return deny("UNAVAILABLE");
 const state=old??{wall,tick,origin:wall,start:tick};state.wall=wall;state.tick=tick;clocks.set(boot,state);if(clocks.size>8)clocks.delete(clocks.keys().next().value!);
 const now=int64(BigInt(Math.max(wall,state.origin+tick-state.start)));
 if(big(r.expires_at_ms)<=now||big(r.created_at_ms)>now)return deny("CONFLICT");
 return {now,boot,credential_version:big(r.credential_version),auth_epoch:big(r.auth_epoch),expires_at_ms:big(r.expires_at_ms)};
}
async function context(tx:Tx){const p=await tx.get("SELECT completed_at_ms FROM auth_provisioning WHERE id=1"),m=await tx.get("SELECT checksum FROM schema_migrations WHERE version=37");if(!p||!m)return deny("UNAVAILABLE");return digest(["returns37-v1",authorizedFileNamespace(tx),String(p.completed_at_ms),m.checksum]);}
const count=(v:unknown,allowZero=false)=>unsigned(v,BigInt("999999999999"),allowZero);
function refundInput(input:unknown){
 const o=object(input,["invoiceId","lines"]);if(!Array.isArray(o.lines)||!o.lines.length||o.lines.length>50)return deny();
 const seen=new Set<string>();return {invoiceId:uuid(o.invoiceId),lines:o.lines.map(x=>{const l=object(x,["saleLineId","quantity"]),id=uuid(l.saleLineId);if(seen.has(id))return deny();seen.add(id);count(l.quantity);return {saleLineId:id,quantity:String(l.quantity)};})};
}
function dispositionInput(input:unknown){
 const o=object(input,["returnId","lines"]);if(!Array.isArray(o.lines)||!o.lines.length||o.lines.length>50)return deny();const seen=new Set<string>();
 return {returnId:uuid(o.returnId),lines:o.lines.map(x=>{const l=object(x,["returnLineId","restockQuantity","writeOffQuantity","reason"]),id=uuid(l.returnLineId),restock=count(l.restockQuantity,true),damaged=count(l.writeOffQuantity,true);if(seen.has(id)||restock+damaged<=zero)return deny();seen.add(id);return {returnLineId:id,restockQuantity:restock.toString(),writeOffQuantity:damaged.toString(),reason:text(l.reason,160)};})};
}
async function refundQuote(tx:Tx,input:unknown){
 const c=refundInput(input),receipt=await readReceipt(tx,c.invoiceId);if(!receipt.payment)return deny("CONFLICT");
 const payment=await tx.get("SELECT * FROM sale_payments WHERE invoice_id=?",[c.invoiceId]);if(!payment||payment.net_received_m!==BigInt(receipt.totalPaisa))return deny("UNAVAILABLE");
 const modern=(await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version===BigInt(39)||(await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version===BigInt(40)||(await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version===BigInt(41),basis=modern?await invoiceBasis(tx,c.invoiceId):undefined;
 if(modern&&await tx.get("SELECT q.id FROM invoice_correction_requests q WHERE q.invoice_id=? AND NOT EXISTS(SELECT 1 FROM invoice_correction_operations o WHERE o.request_id=q.id) AND NOT EXISTS(SELECT 1 FROM invoice_correction_cancellations x WHERE x.request_key=q.request_key) LIMIT 1",[c.invoiceId]))return deny("CONFLICT");
 const privateLines=[],lines=[];let total=zero;
 for(const l of c.lines){
  const revised=basis?.revision?basis.rows.find(x=>x.sale_line_id===l.saleLineId):undefined;
  const original=revised?{...revised,id:revised.sale_line_id,revision_line_id:revised.id}:await tx.get("SELECT * FROM sale_lines WHERE id=? AND invoice_id=?",[l.saleLineId,c.invoiceId]);if(!original)return deny();
  const prior=await tx.get("SELECT coalesce(sum(quantity_q),0) AS q,coalesce(sum(refund_m),0) AS m FROM return_lines WHERE sale_line_id=?",[l.saleLineId]);
  const q=big(prior?.q),m=big(prior?.m),n=big(original.quantity_q)/SCALE,amount=cumulativeRefund(String(original.charged_m),n.toString(),(q/SCALE).toString(),m.toString(),l.quantity),requested=count(l.quantity);
  if(amount<=zero)return deny("CONFLICT");total=int64(total+amount);
  privateLines.push({original,priorQ:q,priorM:m,quantity:requested,refund:amount});
  lines.push({saleLineId:l.saleLineId,name:String(original.name),code:String(original.code),quantity:l.quantity,remainingQuantity:(n-q/SCALE).toString(),refundPaisa:amount.toString(),unitPayablePaisa:String(original.unit_payable_m)});
 }
 return {input:c,public:{invoiceId:c.invoiceId,invoiceNumber:receipt.number,lines,totalPaisa:total.toString()},evidence:evidence(privateLines),privateLines,payment,basis};
}
async function dispositionQuote(tx:Tx,input:unknown){
 const c=dispositionInput(input),rows=[];if(!await tx.get("SELECT id FROM returns WHERE id=?",[c.returnId]))return deny();
 for(const l of c.lines){const original=await tx.get("SELECT * FROM return_lines WHERE id=? AND return_id=?",[l.returnLineId,c.returnId]);if(!original)return deny();
  const used=big((await tx.get("SELECT coalesce(sum(quantity_q),0) AS q FROM return_dispositions WHERE return_line_id=?",[l.returnLineId]))?.q);
  if((count(l.restockQuantity,true)+count(l.writeOffQuantity,true))*SCALE>big(original.quantity_q)-used)return deny("CONFLICT");
  const product=await load(tx,String(original.product_id));rows.push({original,used,cost:product.cost,version:product.balanceVersion,line:l});
 }
 return {input:c,evidence:evidence(rows.map(r=>({id:r.original.id,used:r.used,cost:r.cost,version:r.version}))),rows};
}
async function savedRequest(tx:Tx,key:string,ctx:string){const r=await tx.get("SELECT * FROM return_requests WHERE request_key=?",[key]);if(r&&r.context!==ctx)return deny("CONFLICT");if(r&&(digest(JSON.parse(String(r.payload_json)))!==r.payload_hash||canonical(JSON.parse(String(r.payload_json)))!==r.payload_json))return deny("UNAVAILABLE");return r;}
async function publicReturn(tx:Tx,id:string){
 const r=await tx.get("SELECT * FROM returns WHERE id=?",[id]);if(!r)return deny("NOT_FOUND");
 const lines=await tx.all("SELECT l.id,l.sale_line_id,l.quantity_q,l.refund_m,s.name FROM return_lines l JOIN sale_lines s ON s.id=l.sale_line_id WHERE l.return_id=? ORDER BY l.id",[id]);
 return {id,invoiceId:String(r.invoice_id),totalPaisa:String(r.total_m),cashDate:String(r.cash_date),recordedAtMs:String(r.recorded_at_ms),lines:lines.map(l=>({returnLineId:String(l.id),saleLineId:String(l.sale_line_id),name:String(l.name),quantity:(big(l.quantity_q)/SCALE).toString(),refundPaisa:String(l.refund_m)})),inspection:"PENDING_OR_PARTLY_DISPOSED"};
}
export function createReturnsService(gateway:AuthorizationGateway,schema:37|38|39|40|41=37){
 const commitGuards=new WeakMap<Tx,()=>Promise<void>>();
 async function scope<T>(request:Request,role:Role,work:(tx:Tx,a:Actor)=>Promise<T>,proof?:unknown){
  let domain:ReturnError|undefined;const run=proof!==undefined?((w:(t:Tx,a:Actor)=>Promise<T>)=>gateway.withFreshAdminTransaction(request,proof,w)):((w:(t:Tx,a:Actor)=>Promise<T>)=>(role==="ADMIN"?gateway.withAdminTransaction(request,w):gateway.withSalespersonTransaction(request,w)));
  try{return await run(async(tx,a)=>{try{if(a.role!==role||!(await validateReviewedSchema(tx,schema)).ok)return deny("UNAVAILABLE");await binding(tx,a);await assertReturnLedgers(tx);const before=schema>=39?await tx.get("SELECT total_changes() AS n,schema_version AS s FROM pragma_schema_version"):undefined;const cashMark=await beforeSource(tx);const v=await work(tx,a);await afterSource(tx,a,cashMark);const after=schema>=39?await tx.get("SELECT total_changes() AS n,schema_version AS s FROM pragma_schema_version"):undefined;if(schema<39||!before||!after||typeof before.n!=="bigint"||before.n!==after.n||before.s!==after.s)await assertReturnLedgers(tx);await commitGuards.get(tx)?.();await binding(tx,a);return v;}catch(e){if(e instanceof ReturnError)domain=e;else if(e instanceof InventoryError||e instanceof SaleError)domain=new ReturnError(e.code==="INVALID_INPUT"?"INVALID_INPUT":"CONFLICT");throw e;}});}catch{throw domain??new ReturnError("UNAVAILABLE");}
 }
 async function fresh<T>(r:Request,p:unknown,w:(tx:Tx,a:Actor)=>Promise<T>){let proof:unknown;try{proof=await gateway.verifyAdminPassword(p);}catch{return deny("UNAVAILABLE");}return scope(r,"ADMIN",w,proof);}
 async function terminal(tx:Tx,key:string,ctx:string,actor:Actor){
  const role=actor.role;
  if(ctx!==await context(tx))return deny("CONFLICT");const request=await savedRequest(tx,key,ctx),op=await tx.get("SELECT * FROM return_operations WHERE request_key=?",[key]),cancel=await tx.get("SELECT * FROM return_cancellations WHERE request_key=?",[key]);
  if(cancel&&cancel.context!==ctx||op&&cancel)return deny("UNAVAILABLE");if(role==="SALESPERSON"&&request&&(request.kind!=="REFUND"||request.requester_role!=="SALESPERSON"))return deny("NOT_FOUND");
  if(op)return {state:"COMMITTED" as const,key,context:ctx,kind:String(op.kind),...(op.return_id?{refund:await publicReturn(tx,String(op.return_id))}:{operationId:String(op.id)})};
  if(cancel)return {state:"CANCELLED" as const,key,context:ctx,kind:String(cancel.kind)};
  const grant=request?await tx.get("SELECT id FROM return_authorizations WHERE request_id=? ORDER BY issued_at_ms DESC LIMIT 1",[request.id]):undefined;
  let ready=false;if(request&&grant)try{await validGrant(tx,role==="ADMIN"?{role:request.requester_role as Role,principalId:request.requester_role as Role,sessionId:String(request.session_ref)}:actor,request);if((request.kind==="REFUND"?await refundQuote(tx,JSON.parse(String(request.payload_json)).input):await dispositionQuote(tx,JSON.parse(String(request.payload_json)).input)).evidence!==request.evidence_hash)return deny("CONFLICT");ready=true;}catch(e){if(!(e instanceof ReturnError)||e.code!=="CONFLICT")throw e;}
  return {state:request?(grant?(ready?"APPROVED":"AWAITING_RECONCILIATION"):"AWAITING_APPROVAL"):"UNKNOWN",key,context:ctx,kind:request?String(request.kind):undefined,...(request?.kind==="REFUND"?{quote:JSON.parse(String(request.payload_json)).quote,cashDate:day((await binding(tx,actor)).now)}:{})};
 }
 async function prepare(tx:Tx,a:Actor,kind:Kind,key:string,input:unknown){
  const ctx=await context(tx),previous=await savedRequest(tx,key,ctx);
  if(previous){const parsed=kind==="REFUND"?refundInput(input):dispositionInput(input);if(previous.requester_role!==a.role||previous.kind!==kind||canonical(JSON.parse(String(previous.payload_json)).input)!==canonical(parsed))return deny("CONFLICT");return previous;}
  const quote=kind==="REFUND"?await refundQuote(tx,input):await dispositionQuote(tx,input);
  const payload={input:quote.input,...(kind==="REFUND"?{quote:(quote as Awaited<ReturnType<typeof refundQuote>>).public}:{})};
  if(await tx.get("SELECT request_key FROM return_cancellations WHERE request_key=?",[key]))return deny("CONFLICT");
  if(await tx.get("SELECT r.id FROM return_requests r WHERE r.requester_role=? AND NOT EXISTS(SELECT 1 FROM return_operations o WHERE o.request_id=r.id) AND NOT EXISTS(SELECT 1 FROM return_cancellations c WHERE c.request_key=r.request_key) LIMIT 1",[a.role]))return deny("CONFLICT");
  // An unresolved physical payout reserves its original lines across BOTH role hosts.
  // A stale approval must never cause two operators to hand over cash before SQL rejects one.
  if(kind==="REFUND"){const selected=new Set((quote.input as ReturnType<typeof refundInput>).lines.map(l=>l.saleLineId));for(const pending of await tx.all("SELECT r.payload_json FROM return_requests r WHERE r.kind='REFUND' AND NOT EXISTS(SELECT 1 FROM return_operations o WHERE o.request_id=r.id) AND NOT EXISTS(SELECT 1 FROM return_cancellations c WHERE c.request_key=r.request_key)")){const other=refundInput(JSON.parse(String(pending.payload_json)).input);if(other.lines.some(l=>selected.has(l.saleLineId)))return deny("CONFLICT");}}
  const b=await binding(tx,a);
  await tx.run("INSERT INTO return_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",[key,key,kind,ctx,a.role,a.sessionId,b.credential_version,b.auth_epoch,b.boot,canonical(payload),digest(payload),quote.evidence,b.now]);
  return (await savedRequest(tx,key,ctx))!;
 }
 async function grant(tx:Tx,a:Actor,r:NonNullable<Row>,action:string,recovery=false){
  const admin=await binding(tx,a);
  const requester=await binding(tx,recovery?a:{role:r.requester_role as Role,principalId:r.requester_role as Role,sessionId:String(r.session_ref)});
  if(!recovery&&(requester.boot!==r.boot_generation||requester.credential_version!==r.credential_version||requester.auth_epoch!==r.auth_epoch))return deny("CONFLICT");
  const existing=await tx.get("SELECT * FROM return_authorizations WHERE request_id=? AND action=? ORDER BY issued_at_ms DESC LIMIT 1",[r.id,action]);if(existing&&!recovery){if(existing.admin_session_ref!==a.sessionId||existing.boot_generation!==admin.boot||existing.admin_version!==admin.credential_version||existing.admin_epoch!==admin.auth_epoch||big(existing.expires_at_ms)<=admin.now)return deny("CONFLICT");return String(existing.id);}
  const expires=[admin.now+BigInt(300000),big(admin.expires_at_ms),big(requester.expires_at_ms)].reduce((x,y)=>x<y?x:y);
  if(expires<=admin.now)return deny("CONFLICT");const id=randomUUID();
  await tx.run("INSERT INTO return_authorizations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[id,r.id,action,a.sessionId,admin.credential_version,admin.auth_epoch,admin.boot,recovery?a.sessionId:r.session_ref,requester.credential_version,requester.auth_epoch,admin.now,expires]);return id;
 }
 async function validGrant(tx:Tx,a:Actor,r:NonNullable<Row>,id?:string,recovery=false){
  const g=id?await tx.get("SELECT * FROM return_authorizations WHERE id=? AND request_id=?",[id,r.id]):await tx.get("SELECT * FROM return_authorizations WHERE request_id=? ORDER BY issued_at_ms DESC,id DESC LIMIT 1",[r.id]);if(!g)return deny("CONFLICT");
  const current=await binding(tx,a),admin=await binding(tx,{role:"ADMIN",principalId:"ADMIN",sessionId:String(g.admin_session_ref)});
  if(current.boot!==g.boot_generation||admin.boot!==g.boot_generation||admin.credential_version!==g.admin_version||admin.auth_epoch!==g.admin_epoch||current.now<big(g.issued_at_ms)||current.now>=big(g.expires_at_ms))return deny("CONFLICT");
  if(!recovery&&(a.sessionId!==r.session_ref||a.role!==r.requester_role||current.credential_version!==r.credential_version||current.auth_epoch!==r.auth_epoch||g.requester_session_ref!==a.sessionId||g.requester_version!==current.credential_version||g.requester_epoch!==current.auth_epoch))return deny("CONFLICT");
  if(recovery?(a.role!=="ADMIN"||!["RECORD_PRIOR_PAYOUT","RECORD_DISPOSITION"].includes(String(g.action))):(g.action!==(r.kind==="REFUND"?"EXECUTE_REFUND":"DISPOSE")))return deny("CONFLICT");
  if(await tx.get("SELECT id FROM return_operations WHERE authorization_id=?",[g.id]))return deny("CONFLICT");return g;
 }
 async function execute(tx:Tx,a:Actor,r:NonNullable<Row>,confirm:string,cashDate:string,id?:string,recovery=false){
  const ctx=await context(tx),old=await terminal(tx,String(r.request_key),ctx,a);if(old.state==="COMMITTED")return old;if(old.state==="CANCELLED")return deny("CONFLICT");
  const g=await validGrant(tx,a,r,id,recovery),b=await binding(tx,a),payload=JSON.parse(String(r.payload_json)),op=randomUUID();
  if(r.kind==="REFUND"){
   if(confirm!==(recovery?"ADMIN_VERIFIED_PRIOR_PAYOUT":"CASH_HANDED_OVER"))return deny();
   if(!/^\d{4}-\d{2}-\d{2}$/.test(cashDate)||!Number.isFinite(Date.parse(cashDate+"T00:00:00Z"))||new Date(cashDate+"T00:00:00Z").toISOString().slice(0,10)!==cashDate||cashDate<day(big(r.created_at_ms))||cashDate>day(b.now)||(!recovery&&cashDate!==day(b.now)))return deny("CONFLICT");
   const q=await refundQuote(tx,payload.input);if(q.evidence!==r.evidence_hash||canonical(q.public)!==canonical(payload.quote))return deny("CONFLICT");
   const rid=randomUUID(),pay=randomUUID(),provenance=recovery?"ADMIN_ATTESTED":"OPERATOR_CONFIRMED";
   await tx.run("INSERT INTO return_operations VALUES(?,?,?,?,?,?,?,?,?,?)",[op,r.id,r.request_key,g.id,"REFUND",a.role,a.sessionId,b.now,rid,null]);
   await tx.run("INSERT INTO returns(id,operation_id,invoice_id,original_payment_id,line_count,total_m,cash_date,recorded_at_ms,refund_payment_id,provenance"+(schema>=39?",invoice_revision_id,invoice_settlement_id":"")+") VALUES("+Array(schema>=39?12:10).fill("?").join(",")+")",[rid,op,q.input.invoiceId,q.payment.id,BigInt(q.privateLines.length),BigInt(q.public.totalPaisa),cashDate,b.now,pay,provenance,...(schema>=39?[q.basis?.revision?.id??null,q.basis?.settlement?.id??null]:[])]);
   for(const v of q.privateLines){const line=randomUUID(),afterQ=int64(v.priorQ+v.quantity*SCALE),afterM=int64(v.priorM+v.refund),cost=int64(big(v.original.cost_snapshot_m)*v.quantity);
    await tx.run("INSERT INTO return_lines VALUES("+Array(schema>=39?19:17).fill("?").join(",")+")",[line,rid,q.input.invoiceId,v.original.id,v.original.product_id,v.original.quantity_q,v.original.charged_m,v.original.cost_snapshot_m,v.quantity*SCALE,v.refund,v.priorQ,v.priorM,afterQ,afterM,cost,(big(v.original.charged_m)/BigInt(100)*(afterQ/SCALE)).toString(),"PKR_CUMULATIVE_HALF_UP_V1",...(schema>=39?[v.original.revision_line_id?null:v.original.id,v.original.revision_line_id??null]:[])]);
    await tx.run("INSERT INTO financial_events(id,kind,sale_line_id,return_line_id,disposition_id,revenue_delta_m,cogs_delta_m,valuation_delta_m,effective_date,recorded_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?)",[randomUUID(),"REFUND",null,line,null,-v.refund,zero,zero,cashDate,b.now]);
   }
   await tx.run("INSERT INTO refund_payments VALUES("+Array(schema>=39?9:8).fill("?").join(",")+")",[pay,rid,q.input.invoiceId,q.payment.id,BigInt(q.public.totalPaisa),cashDate,b.now,confirm,...(schema>=39?[q.basis?.settlement?.id??null]:[])]);
   await tx.run("INSERT INTO cash_movements(id,kind,sale_payment_id,refund_payment_id,amount_m,cash_date,recorded_at_ms,provenance) VALUES(?,?,?,?,?,?,?,?)",[randomUUID(),"REFUND",null,pay,-BigInt(q.public.totalPaisa),cashDate,b.now,provenance]);
  }else{
   if(confirm!=="GOODS_INSPECTED")return deny();const q=await dispositionQuote(tx,payload.input);if(q.evidence!==r.evidence_hash)return deny("CONFLICT");
   const decisions=[];for(const v of q.rows)for(const decision of ["RESTOCK","WRITE_OFF"] as const){const qty=count(decision==="RESTOCK"?v.line.restockQuantity:v.line.writeOffQuantity,true);if(qty)decisions.push({v,decision,qty,id:randomUUID()});}
   await tx.run("INSERT INTO return_operations VALUES(?,?,?,?,?,?,?,?,?,?)",[op,r.id,r.request_key,g.id,"DISPOSITION",a.role,a.sessionId,b.now,null,decisions[0].id]);
   for(const {v,decision,qty,id:did}of decisions){
    const cost=big(v.original.original_cost_m),reversed=decision==="RESTOCK"?int64(cost*qty):zero,delta=decision==="RESTOCK"?int64((v.cost-cost)*qty):zero;
    await tx.run("INSERT INTO return_dispositions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[did,op,v.original.id,v.original.product_id,decision,qty*SCALE,cost,decision==="RESTOCK"?v.cost:null,reversed,delta,b.now,v.line.reason]);
    if(decision==="RESTOCK"){
     const product=await load(tx,String(v.original.product_id)),after=int64(product.q+qty*SCALE),value=int64(after/SCALE*product.cost),version=int64(product.balanceVersion+one);if(after>BigInt("999999999999000000"))return deny("CONFLICT");
     const changed=await tx.run("UPDATE stock_balances SET sellable_q=?,stock_value_m=?,version=?,updated_at_ms=? WHERE product_id=? AND version=?",[after,value,version,b.now,v.original.product_id,product.balanceVersion]);if(changed.changes!==one)return deny("CONFLICT");
     await tx.run("INSERT INTO stock_movements(id,operation_id,product_id,kind,before_q,delta_q,after_q,cost_snapshot_m,balance_version,sale_line_id,return_disposition_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)",[randomUUID(),null,v.original.product_id,"RETURN_RESTOCK",product.q,qty*SCALE,after,product.cost,version,null,did]);
     await tx.run("INSERT INTO financial_events(id,kind,sale_line_id,return_line_id,disposition_id,revenue_delta_m,cogs_delta_m,valuation_delta_m,effective_date,recorded_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?)",[randomUUID(),"RESTOCK",null,null,did,zero,-reversed,delta,day(b.now),b.now]);await load(tx,String(v.original.product_id));
    }
   }
  }
  if(schema>=39)commitGuards.set(tx,async()=>{const admin=await binding(tx,{role:"ADMIN",principalId:"ADMIN",sessionId:String(g.admin_session_ref)}),current=await binding(tx,a);if(admin.credential_version!==g.admin_version||admin.auth_epoch!==g.admin_epoch||admin.boot!==g.boot_generation||current.boot!==g.boot_generation||current.now>=big(g.expires_at_ms)||current.now<big(g.issued_at_ms))return deny("CONFLICT");});
  const adminAfter=await binding(tx,{role:"ADMIN",principalId:"ADMIN",sessionId:String(g.admin_session_ref)}),after=await binding(tx,a);if(adminAfter.credential_version!==g.admin_version||adminAfter.auth_epoch!==g.admin_epoch||after.now>=big(g.expires_at_ms)||after.now<big(g.issued_at_ms))return deny("CONFLICT");
  return terminal(tx,String(r.request_key),ctx,a);
 }
 return Object.freeze({
  context:(r:Request,role:Role)=>scope(r,role,async tx=>({context:await context(tx)})),
  quote:(r:Request,role:Role,input:unknown)=>scope(r,role,async tx=>(await refundQuote(tx,input)).public),
  invoices:(r:Request,role:Role,query="",cursor?:string)=>scope(r,role,async tx=>{
   text(query,120,true);const rows=await tx.all("SELECT id FROM sales WHERE (instr(invoice_number,?)>0 OR EXISTS(SELECT 1 FROM sale_lines l WHERE l.invoice_id=sales.id AND instr(lower(l.name),?)>0)) AND (? IS NULL OR id<?) ORDER BY id DESC LIMIT 51",[query,query.toLowerCase(),cursor?uuid(cursor):null,cursor??null]),items=[];
   for(const row of rows.slice(0,50)){const receipt=await readReceipt(tx,String(row.id)),basis=schema>=39?await invoiceBasis(tx,String(row.id)):undefined,lines=[];const source:NonNullable<Row>[]=basis?.revision?basis.rows.map(l=>({...l,id:l.sale_line_id})):await tx.all("SELECT id,quantity_q,name,unit_payable_m,charged_m FROM sale_lines WHERE invoice_id=? ORDER BY line_no",[row.id]);for(const l of source){const returned=big((await tx.get("SELECT coalesce(sum(quantity_q),0) AS q FROM return_lines WHERE sale_line_id=?",[l.id]))?.q);lines.push({saleLineId:String(l.id),name:String(l.name),quantity:(big(l.quantity_q)/SCALE).toString(),remainingQuantity:((big(l.quantity_q)-returned)/SCALE).toString(),unitPayablePaisa:String(l.unit_payable_m),paidPaisa:receipt.payment?String(l.charged_m):null});}items.push({invoiceId:receipt.id,invoiceNumber:receipt.number,paymentRecorded:!!receipt.payment,lines});}return {items,nextCursor:rows.length>50?String(rows[49].id):null};
  }),
  prepareSalesperson:(r:Request,key:string,input:unknown)=>scope(r,"SALESPERSON",async(tx,a)=>{await prepare(tx,a,"REFUND",uuid(key),input);return terminal(tx,key,await context(tx),a);}),
  executeSalesperson:(r:Request,key:string,confirmation:string,cashDate:string)=>scope(r,"SALESPERSON",async(tx,a)=>{const v=await savedRequest(tx,uuid(key),await context(tx));if(!v||v.requester_role!=="SALESPERSON"||v.kind!=="REFUND")return deny();return execute(tx,a,v,confirmation,cashDate);}),
  status:(r:Request,role:Role,key:string,ctx:string)=>scope(r,role,(tx,a)=>terminal(tx,uuid(key),ctx,a)),
  requests:(r:Request)=>scope(r,"ADMIN",async tx=>({items:(await tx.all("SELECT r.* FROM return_requests r WHERE NOT EXISTS(SELECT 1 FROM return_operations o WHERE o.request_id=r.id) AND NOT EXISTS(SELECT 1 FROM return_cancellations c WHERE c.request_key=r.request_key) ORDER BY r.created_at_ms,r.id LIMIT 50")).map(v=>({id:String(v.id),kind:String(v.kind),requesterRole:String(v.requester_role),createdAtMs:String(v.created_at_ms),intent:JSON.parse(String(v.payload_json))}))})),
  approve:(r:Request,password:unknown,key:string,decision:string)=>fresh(r,password,async(tx,a)=>{
   const ctx=await context(tx),v=await savedRequest(tx,uuid(key),ctx);if(!v||v.kind!=="REFUND"||v.requester_role!=="SALESPERSON")return deny();
   const state=await terminal(tx,key,ctx,a);if(["COMMITTED","CANCELLED"].includes(state.state))return state;
   if(decision==="DENY_NO_CASH_PAID"){await tx.run("INSERT INTO return_cancellations VALUES(?,?,?,?,?,?,?)",[key,ctx,v.kind,"ADMIN",a.sessionId,"NO_CASH_PAID",(await binding(tx,a)).now]);return terminal(tx,key,ctx,a);}
   if(decision!=="APPROVE")return deny();const q=await refundQuote(tx,JSON.parse(String(v.payload_json)).input);if(q.evidence!==v.evidence_hash)return deny("CONFLICT");await grant(tx,a,v,"EXECUTE_REFUND");return terminal(tx,key,ctx,a);
  }),
  prepareAdmin:(r:Request,password:unknown,key:string,input:unknown)=>fresh(r,password,async(tx,a)=>{const v=await prepare(tx,a,"REFUND",uuid(key),input),state=await terminal(tx,key,await context(tx),a);if(!["COMMITTED","CANCELLED"].includes(state.state))await grant(tx,a,v,"EXECUTE_REFUND");return terminal(tx,key,await context(tx),a);}),
  executeAdmin:(r:Request,key:string,confirmation:string,cashDate:string)=>scope(r,"ADMIN",async(tx,a)=>{const v=await savedRequest(tx,uuid(key),await context(tx));if(!v||v.requester_role!=="ADMIN"||v.kind!=="REFUND")return deny();return execute(tx,a,v,confirmation,cashDate);}),
  list:(r:Request,cursor?:string)=>scope(r,"ADMIN",async tx=>{const pivot=cursor?await tx.get("SELECT id,recorded_at_ms FROM returns WHERE id=?",[uuid(cursor)]):undefined;if(cursor&&!pivot)return deny();const rows=await tx.all("SELECT id FROM returns WHERE (? IS NULL OR recorded_at_ms<? OR (recorded_at_ms=? AND id<?)) ORDER BY recorded_at_ms DESC,id DESC LIMIT 51",[pivot?.recorded_at_ms??null,pivot?.recorded_at_ms??null,pivot?.recorded_at_ms??null,pivot?.id??null]),items=[];for(const v of rows.slice(0,50))items.push(await publicReturn(tx,String(v.id)));return {items,nextCursor:rows.length>50?String(rows[49].id):null};}),
  detail:(r:Request,id:string)=>scope(r,"ADMIN",async tx=>{const result=await publicReturn(tx,uuid(id)),lines=[];for(const l of result.lines){const v=await tx.get("SELECT product_id,original_cost_m FROM return_lines WHERE id=?",[l.returnLineId]);const used=big((await tx.get("SELECT coalesce(sum(quantity_q),0) AS q FROM return_dispositions WHERE return_line_id=?",[l.returnLineId]))?.q),p=await load(tx,String(v?.product_id));lines.push({...l,pendingQuantity:(BigInt(l.quantity)-used/SCALE).toString(),originalCostPaisa:String(v?.original_cost_m),currentCostPaisa:p.cost.toString()});}return {...result,lines};}),
  dispose:async(r:Request,password:unknown,key:string,input:unknown)=>{
   // Persist the frozen inspection intent BEFORE its effect transaction. A failed
   // stock/COMMIT must retain the original decision for fresh Admin reconciliation.
   const admitted=await fresh(r,password,async(tx,a)=>{const v=await prepare(tx,a,"DISPOSITION",uuid(key),input),old=await terminal(tx,key,await context(tx),a);if(["COMMITTED","CANCELLED"].includes(old.state))return old;await grant(tx,a,v,"DISPOSE");return terminal(tx,key,await context(tx),a);});
   if(["COMMITTED","CANCELLED"].includes(admitted.state))return admitted;
   return scope(r,"ADMIN",async(tx,a)=>{const v=await savedRequest(tx,uuid(key),await context(tx));if(!v||v.kind!=="DISPOSITION"||v.requester_role!=="ADMIN")return deny();return execute(tx,a,v,"GOODS_INSPECTED","");});
  },
  recover:(r:Request,password:unknown,key:string,ctx:string,resolution:string,cashDate="",kind:Kind="REFUND")=>fresh(r,password,async(tx,a)=>{
   const k=uuid(key),state=await terminal(tx,k,ctx,a);if(["COMMITTED","CANCELLED"].includes(state.state))return state;const v=await savedRequest(tx,k,ctx);
   if(resolution==="NO_CASH_PAID"||resolution==="NO_DISPOSITION_APPLIED"){
    const actual=v?.kind??kind;if(resolution!==(actual==="REFUND"?"NO_CASH_PAID":"NO_DISPOSITION_APPLIED"))return deny();
    await tx.run("INSERT INTO return_cancellations VALUES(?,?,?,?,?,?,?)",[k,ctx,actual,"ADMIN",a.sessionId,resolution,(await binding(tx,a)).now]);return terminal(tx,k,ctx,a);
   }
   if(!v)return deny("CONFLICT");
   if(resolution==="RECORD_PRIOR_PAYOUT"&&v.kind==="REFUND"){const id=await grant(tx,a,v,"RECORD_PRIOR_PAYOUT",true);return execute(tx,a,v,"ADMIN_VERIFIED_PRIOR_PAYOUT",cashDate,id,true);}
   if(resolution==="RECORD_DISPOSITION"&&v.kind==="DISPOSITION"){const id=await grant(tx,a,v,"RECORD_DISPOSITION",true);return execute(tx,a,v,"GOODS_INSPECTED","",id,true);}
   return deny();
  })
 });
}
