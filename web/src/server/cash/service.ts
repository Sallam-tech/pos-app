import {withDependencyRead} from "../auth/gateway";
import {currentSettings} from "../settings/model";
import {cashSaleIntent,cashSaleIntentHash} from "./sale-intent";
import {load as loadProduct} from "../inventory/model";
import {lineAmounts} from "../sales/calculations";
import "server-only";
import {randomUUID} from "node:crypto";
import type {Actor,AuthorizationGateway,Role} from "../auth/types";
import {authorizedFileNamespace} from "../auth/database";
import {validateReviewedSchema} from "../db/validate-schema";
import {canonical,digest,integer,object,text,uuid} from "../inventory/validation";
import {verifiedJson} from "../db/verified-json";
import {expenseBinding as binding} from "../expenses/authority";
import {calendar,expenseDay} from "../expenses/calendar";
import {readFinancialSource} from "../reports/financial";
import {assertReturnLedgers} from "../returns/ledgers";
import {assertExpenseLedgers} from "../expenses/ledgers";
import {finalizePreparedCashSale,parseSale,salesContext} from "../sales/service";
import {admitSource,assertCashLedgers,beforeSource,afterSource,type SourceKind} from "./source";
import {activeCount,appendClosingLinks,asStrings,big,cashDigest,cashMoney,countSnapshot,countStillCurrent,cutoffs,deny,evidence,expectation,financialDigest,json,observedCount,pendingAdmissions,type Row,type Tx,CashError,z} from "./model";
export {CashError} from "./model";
export const ACTIONS=["OPEN_ANCHOR","START_COUNT","RECORD_COUNT","ABORT_COUNT","ACCEPT_VARIANCE","CLOSE_DAY","RESOLVE_EVIDENCE","RESOLVE_ADMISSION"] as const;
export type CashAction=typeof ACTIONS[number];
type Input=Record<string,string|null>;
async function context(tx:Tx){const p=await tx.get("SELECT completed_at_ms FROM auth_provisioning WHERE id=1"),m=await tx.get("SELECT checksum FROM schema_migrations WHERE version=40");if(!p||!m)return deny("UNAVAILABLE");return digest(["cash40-v1",authorizedFileNamespace(tx),String(p.completed_at_ms),m.checksum]);}
function parse(action:CashAction,value:unknown):Input{
 if(!ACTIONS.includes(action))return deny();
 const fields:Record<CashAction,string[]>={OPEN_ANCHOR:["countId","untouchedOpening","evidence"],START_COUNT:["businessDate","evidence"],RECORD_COUNT:["sessionId","actualPaisa","evidence"],ABORT_COUNT:["sessionId","evidence"],ACCEPT_VARIANCE:["countId","evidence"],CLOSE_DAY:["businessDate","countId","sourceDigest","allowUnreconciled","evidence"],RESOLVE_EVIDENCE:["movementId","actualDate","earliestAtMs","latestAtMs","evidence"],RESOLVE_ADMISSION:["evidence"]};
 const o=object(value,fields[action],action==="RESOLVE_ADMISSION"?["admissionId","resolution","actualDate","actualTenderPaisa","actualChangePaisa","sourceKey","sourceContext"]:[]),out:Input={};for(const k of fields[action]){const v=o[k];if(k==="countId"&&action==="CLOSE_DAY"&&v===null){out[k]=null;continue;}if(k.endsWith("Id"))out[k]=uuid(v);else if(k==="businessDate"||k==="actualDate")out[k]=calendar(v);else if(k==="actualPaisa")out[k]=cashMoney(v).toString();else if(k.endsWith("AtMs"))out[k]=integer(v).toString();else if(k==="sourceDigest"){const s=text(v,64);if(!/^[0-9a-f]{64}$/.test(s))return deny();out[k]=s;}else if(k==="untouchedOpening"||k==="allowUnreconciled"){if(v!=="YES"&&v!=="NO")return deny();out[k]=v;}else out[k]=evidence(v);}
 if(action==="RESOLVE_ADMISSION"){const mode=o.resolution??"NO_EFFECT_VERIFIED";if(mode!=="NO_EFFECT_VERIFIED"&&mode!=="RECORD_PRIOR_SALE")return deny();out.resolution=mode;if(o.admissionId!==undefined&&o.admissionId!==null){out.admissionId=uuid(o.admissionId);if(o.sourceKey!==undefined||o.sourceContext!==undefined)return deny();}else{if(mode!=="NO_EFFECT_VERIFIED")return deny();out.admissionId=null;out.sourceKey=uuid(o.sourceKey);out.sourceContext=text(o.sourceContext,64);if(!/^[0-9a-f]{64}$/.test(out.sourceContext))return deny();}if(mode==="RECORD_PRIOR_SALE"){out.actualDate=calendar(o.actualDate);out.actualTenderPaisa=cashMoney(o.actualTenderPaisa).toString();out.actualChangePaisa=cashMoney(o.actualChangePaisa).toString();}else if(o.actualDate!==undefined||o.actualTenderPaisa!==undefined||o.actualChangePaisa!==undefined)return deny();}
 return out;
}
async function historyStamp(tx:Tx){return digest(asStrings(await tx.get("SELECT (SELECT coalesce(max(rowid),0) FROM cash_movements) AS cash,(SELECT coalesce(max(rowid),0) FROM cash_flow_evidence) AS evidence,(SELECT coalesce(max(rowid),0) FROM cash_counts) AS counts,(SELECT coalesce(max(rowid),0) FROM counter_cash_admissions) AS admissions,(SELECT coalesce(max(rowid),0) FROM counter_cash_admission_resolutions) AS resolved,(SELECT coalesce(max(rowid),0) FROM daily_closings) AS closings,(SELECT coalesce(max(rowid),0) FROM closing_adjustments) AS supplements")));}
function nextCursor(kind:string,filter:unknown,stamp:string,after:unknown){return Buffer.from(canonical({v:1,kind,filter:digest(filter),stamp,after:String(after)})).toString("base64url");}
function cursorPivot(cursor:string|undefined,kind:string,filter:unknown,stamp:string){if(!cursor)return null;if(cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(cursor))return deny();try{const o=object(JSON.parse(Buffer.from(cursor,"base64url").toString("utf8")),["v","kind","filter","stamp","after"]);if(o.v!==1||o.kind!==kind||o.filter!==digest(filter))return deny();if(o.stamp!==stamp)return deny("CONFLICT");return integer(o.after);}catch(e){if(e instanceof CashError)throw e;return deny();}}
export function createCashService(gateway:AuthorizationGateway,shopName?:string,schema:40|41=40){
 const finalGuards=new WeakMap<Tx,()=>Promise<void>>();
 async function scope<T>(r:Request,role:Role,w:(tx:Tx,a:Actor)=>Promise<T>,proof?:unknown,bindingOnly=false):Promise<T>{
 let failure:CashError|undefined;const run=(f:(tx:Tx,a:Actor)=>Promise<T>)=>proof?gateway.withFreshAdminTransaction(r,proof,f):bindingOnly?withDependencyRead(gateway,role,r,f):role==="ADMIN"?gateway.withAdminTransaction(r,f):gateway.withSalespersonTransaction(r,f);
 try{return await run(async(tx,a)=>{try{if(a.role!==role||!(await validateReviewedSchema(tx,schema)).ok)return deny("UNAVAILABLE");await binding(tx,a);if(bindingOnly){const before=await tx.get("SELECT total_changes() AS n,schema_version AS s FROM pragma_schema_version"),value=await w(tx,a),after=await tx.get("SELECT total_changes() AS n,schema_version AS s FROM pragma_schema_version");if(!before||!after||typeof before.n!=="bigint"||before.n!==after.n||before.s!==after.s)return deny("UNAVAILABLE");await binding(tx,a);return value;}await assertReturnLedgers(tx);await assertExpenseLedgers(tx);await assertCashLedgers(tx);const before=await tx.get("SELECT total_changes() AS n"),v=await w(tx,a),after=await tx.get("SELECT total_changes() AS n");if(before?.n!==after?.n){await assertReturnLedgers(tx);await assertExpenseLedgers(tx);await assertCashLedgers(tx);}await finalGuards.get(tx)?.();await binding(tx,a);return v;}catch(e){failure=e instanceof CashError?e:Object.assign(new CashError(["INVALID_INPUT","OVERFLOW"].includes(String((e as {code?:string})?.code))?"INVALID_INPUT":"UNAVAILABLE"),{cause:e});throw e;}});}catch{throw failure??new CashError("UNAVAILABLE");}
 }
 async function fresh<T>(r:Request,password:unknown,w:(tx:Tx,a:Actor)=>Promise<T>){return scope(r,"ADMIN",w,await gateway.verifyAdminPassword(password));}
 async function valid(tx:Tx,a:Actor,g:Row){const b=await binding(tx,a);if(g.session_ref!==a.sessionId||g.credential_version!==b.credential_version||g.auth_epoch!==b.auth_epoch||g.boot_generation!==b.boot||b.now<big(g.issued_at_ms)||b.now>=big(g.expires_at_ms))return deny("CONFLICT");}
 async function terminal(tx:Tx,key:string,ctx:string){
 if(ctx!==await context(tx))return deny("CONFLICT");const q=await tx.get("SELECT * FROM cash_action_requests WHERE request_key=?",[key]),o=await tx.get("SELECT * FROM cash_action_operations WHERE request_key=?",[key]),c=await tx.get("SELECT * FROM cash_action_cancellations WHERE request_key=?",[key]);
 if(o&&c||q&&q.context!==ctx||c&&c.context!==ctx)return deny("UNAVAILABLE");
 if(o)return {state:"COMMITTED" as const,key,context:ctx,result:verifiedJson(o.result_json,o.result_hash)};
 if(c)return {state:"CANCELLED" as const,key,context:ctx};
 if(q)return {state:"READY" as const,key,context:ctx,action:String(q.action),input:verifiedJson(q.payload_json,q.payload_hash)};
 return {state:"UNKNOWN" as const,key,context:ctx};
 }
 async function grant(tx:Tx,a:Actor,q:Row){const b=await binding(tx,a),expires=b.now+BigInt(300000)<b.expires_at_ms?b.now+BigInt(300000):b.expires_at_ms;await tx.run("INSERT INTO cash_action_authorizations VALUES(?,?,?,?,?,?,?,?)",[randomUUID(),q.id,a.sessionId,b.credential_version,b.auth_epoch,b.boot,b.now,expires]);}
 async function summary(tx:Tx,date:string,countId?:string){
 calendar(date);const c=countId?await observedCount(tx,uuid(countId)):null;if(c&&c.target_date!==date)return deny("CONFLICT");
 const f=await readFinancialSource(tx,40,date,date),e=await expectation(tx,BigInt(Date.now())),pending=await pendingAdmissions(tx),snap=c?json(c) as Record<string,unknown>:null;
 const flow=await tx.all("SELECT m.kind,sum(m.amount_m) AS amount FROM cash_movements m LEFT JOIN cash_flow_evidence e ON e.movement_id=m.id AND e.rowid=(SELECT max(x.rowid) FROM cash_flow_evidence x WHERE x.movement_id=m.id) WHERE coalesce(e.actual_date,m.cash_date)=? GROUP BY m.kind",[date]);
 const sourceDigest=digest(asStrings([await financialDigest(tx,date),c?String(c.id):null,c?String(c.snapshot_hash):null,c?await tx.get("SELECT id,delta_m FROM cash_reconciliations WHERE count_id=?",[c.id]):null]));
 return {businessDate:date,financial:f,sourceDigest,currentExpectedPaisa:pending===z?e.value?.toString()??null:null,currentGaps:[...e.gaps,...(pending?[pending.toString()+" unresolved cash admission(s)"]:[])],pendingAdmissions:pending.toString(),anchor:e.anchor?{countId:String(e.anchor.count_id),activatedAtMs:String(e.anchor.activated_at_ms),openingDate:e.anchor.opening_date}:null,recordedSignedFlows:flow.map(v=>({kind:String(v.kind),amountPaisa:String(v.amount)})),count:c?{id:String(c.id),...snap,acceptedVariance:!!await tx.get("SELECT id FROM cash_reconciliations WHERE count_id=?",[c.id])}:null};
 }
 async function perform(tx:Tx,a:Actor,q:Row,operationId:string){
 const b=await binding(tx,a),p=parse(q.action as CashAction,verifiedJson(q.payload_json,q.payload_hash)),action=q.action as CashAction;
 if(action==="START_COUNT"){
  const date=calendar(p.businessDate);if(date>expenseDay(Number(b.now))||await pendingAdmissions(tx)||await activeCount(tx,b.now,b.boot))return deny("CONFLICT");
  const cuts=await cutoffs(tx),id=randomUUID(),stamp=await cashDigest(tx,cuts.cash,cuts.evidence);
  await tx.run("INSERT INTO cash_count_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[id,operationId,date,b.now,b.now+BigInt(180000),cuts.cash,cuts.financial,cuts.evidence,stamp,b.boot,"ADMIN",a.sessionId]);
  return {sessionId:id,businessDate:date,cutoffTimeMs:b.now.toString(),leaseUntilMs:(b.now+BigInt(180000)).toString()};
 }
 if(action==="RECORD_COUNT"||action==="ABORT_COUNT"){
  const s=await tx.get("SELECT * FROM cash_count_sessions WHERE id=?",[p.sessionId]);if(!s||s.actor_id!=="ADMIN")return deny("NOT_FOUND");if(await tx.get("SELECT id FROM cash_counts WHERE session_id=?",[s.id]))return deny("CONFLICT");
  const live=s.boot_generation===b.boot&&b.now>=big(s.started_at_ms)&&b.now<big(s.lease_until_ms);
  if(action==="RECORD_COUNT"&&!live)return deny("CONFLICT");
  if(action==="RECORD_COUNT"&&await pendingAdmissions(tx))return deny("CONFLICT");
  if(action==="RECORD_COUNT"&&await cashDigest(tx,big(s.cash_cutoff),big(s.evidence_cutoff))!==s.source_digest)return deny("UNAVAILABLE");
  const id=randomUUID(),outcome=action==="RECORD_COUNT"?"RECORDED":live?"ABORTED":"EXPIRED",snap=outcome==="RECORDED"?{...await countSnapshot(tx,s,cashMoney(p.actualPaisa)),countTimeMs:b.now.toString(),cutoffTimeMs:String(s.started_at_ms)}:{businessDate:String(s.target_date),gaps:[outcome==="EXPIRED"?"Count expired/interrupted; recount required":"Count cancelled; no observed amount"]};
  const unknownDuringCount=outcome==="RECORDED"?big((await tx.get("SELECT count(*) AS n FROM sales s WHERE s.recorded_at_ms>? AND s.recorded_at_ms<=? AND NOT EXISTS(SELECT 1 FROM sale_payments p WHERE p.invoice_id=s.id)",[s.started_at_ms,b.now]))?.n):z;if(unknownDuringCount){Object.assign(snap,{cutoffStable:false,complete:false,boundaryComplete:false,expectedAtCountPaisa:null,variancePaisa:null,postBoundaryPhysicalFlowPaisa:null,reconstructedBoundaryPaisa:null,rawBoundaryDifferencePaisa:null,gaps:[...snap.gaps,"Sale payment evidence missing during the count window"]});}
  const timingDuringCount=outcome==="RECORDED"?await tx.get("SELECT e.id FROM cash_flow_evidence e JOIN cash_movements m ON m.id=e.movement_id WHERE e.rowid>? AND m.rowid<=? AND e.rowid=(SELECT max(x.rowid) FROM cash_flow_evidence x WHERE x.movement_id=e.movement_id) AND e.latest_at_ms>? AND e.earliest_at_ms<=? LIMIT 1",[s.evidence_cutoff,s.cash_cutoff,s.started_at_ms,b.now]):undefined;if(timingDuringCount)Object.assign(snap,{cutoffStable:false,complete:false,boundaryComplete:false,expectedAtCountPaisa:null,variancePaisa:null,postBoundaryPhysicalFlowPaisa:null,reconstructedBoundaryPaisa:null,rawBoundaryDifferencePaisa:null,gaps:[...snap.gaps,"New evidence places a physical movement inside the counting window; recount required"]});
  await tx.run("INSERT INTO cash_counts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[id,s.id,outcome,outcome==="RECORDED"?cashMoney(p.actualPaisa):null,outcome==="RECORDED"?b.now:null,canonical(snap),digest(snap),p.evidence,"ADMIN",a.sessionId,b.now,operationId]);
  if(outcome==="RECORDED")finalGuards.set(tx,async()=>{const final=await binding(tx,a);if(final.boot!==s.boot_generation||final.now>=big(s.lease_until_ms))return deny("CONFLICT");});
  return {countId:id,outcome,snapshot:snap};
 }
 if(action==="OPEN_ANCHOR"){
  const c=await observedCount(tx,String(p.countId));await countStillCurrent(tx,c);
  if(await tx.get("SELECT id FROM cash_anchors WHERE count_id=?",[c.id]))return deny("CONFLICT");
  const e=await expectation(tx,big(c.started_at_ms)),accepted=await tx.get("SELECT id FROM cash_reconciliations WHERE count_id=?",[c.id]);
  if(e.value!==null&&e.value!==big(c.actual_m)&&!accepted)return deny("CONFLICT");
  const date=expenseDay(Number(c.counted_at_ms));
  if(p.untouchedOpening==="YES"&&(await tx.get("SELECT m.id FROM cash_movements m LEFT JOIN cash_flow_evidence e ON e.movement_id=m.id AND e.rowid=(SELECT max(x.rowid) FROM cash_flow_evidence x WHERE x.movement_id=m.id) WHERE coalesce(e.actual_date,m.cash_date)=? AND m.rowid<=? LIMIT 1",[date,c.cash_cutoff])||await tx.get("SELECT id FROM sales WHERE business_date=? AND recorded_at_ms<=? LIMIT 1",[date,c.counted_at_ms])))return deny("CONFLICT");
  if(await tx.get("SELECT id FROM cash_anchors WHERE activated_at_ms>=? LIMIT 1",[c.counted_at_ms]))return deny("CONFLICT");
  const id=randomUUID(),basis={evidence:p.evidence,prospective:true,actualPaisa:String(c.actual_m),sourceDigest:String(c.source_digest)};
  await tx.run("INSERT INTO cash_anchors VALUES(?,?,?,?,?,?,?,?,?,?)",[id,c.id,operationId,c.cash_cutoff,c.counted_at_ms,p.untouchedOpening==="YES"?date:null,canonical(basis),"ADMIN",a.sessionId,b.now]);
  return {anchorId:id,countId:String(c.id),actualPaisa:String(c.actual_m),observedAtMs:String(c.counted_at_ms),openingDate:p.untouchedOpening==="YES"?date:null};
 }
 if(action==="ACCEPT_VARIANCE"){
  const c=await observedCount(tx,String(p.countId));await countStillCurrent(tx,c);const snap=json(c) as {variancePaisa:string|null;expectedAtCountPaisa:string|null};
  if(snap.variancePaisa===null||snap.expectedAtCountPaisa===null)return deny("CONFLICT");const delta=BigInt(snap.variancePaisa);if(delta===z||delta%BigInt(100)||await tx.get("SELECT id FROM cash_reconciliations WHERE count_id=?",[c.id]))return deny("CONFLICT");
  const id=randomUUID(),movement=randomUUID();await tx.run("INSERT INTO cash_reconciliations VALUES(?,?,?,?,?,?,?,?,?,?)",[id,c.id,operationId,delta,c.counted_at_ms,BigInt(snap.expectedAtCountPaisa),p.evidence,"ADMIN",a.sessionId,b.now]);
  await tx.run("INSERT INTO cash_movements(id,kind,amount_m,cash_date,recorded_at_ms,provenance,reconciliation_id) VALUES(?,?,?,?,?,?,?)",[movement,"COUNTER_RECONCILIATION",delta,expenseDay(Number(c.counted_at_ms)),b.now,"ADMIN_ATTESTED",id]);
  await appendClosingLinks(tx,"RECONCILIATION",id,[String(c.target_date),expenseDay(Number(c.counted_at_ms))],{countId:String(c.id),deltaPaisa:delta.toString(),nonProfit:true},b.now);
  return {reconciliationId:id,countId:String(c.id),deltaPaisa:delta.toString(),nonProfit:true};
 }
 if(action==="CLOSE_DAY"){
  const date=calendar(p.businessDate);if(date>=expenseDay(Number(b.now)))return deny("CONFLICT");if(await tx.get("SELECT id FROM daily_closings WHERE business_date=?",[date]))return deny("CONFLICT");
  const review=await summary(tx,date,p.countId??undefined);if(p.sourceDigest!==review.sourceDigest)return deny("CONFLICT");
  let verified=false;if(p.countId){const c=await observedCount(tx,p.countId);await countStillCurrent(tx,c);const s=json(c) as {boundaryComplete?:boolean;variancePaisa:string|null};verified=s.boundaryComplete===true&&(s.variancePaisa==="0"||!!await tx.get("SELECT id FROM cash_reconciliations WHERE count_id=?",[c.id]));}
  if(!verified&&p.allowUnreconciled!=="YES")return deny("CONFLICT");
  const id=randomUUID(),snapshot={...review,status:verified?"VERIFIED":"UNRECONCILED",confirmedAtMs:b.now.toString(),evidence:p.evidence,backup:"BLOCKED_NOT_CONFIGURED"};
  await tx.run("INSERT INTO daily_closings VALUES(?,?,?,?,?,?,?,?,?,?)",[id,date,operationId,p.countId,verified?"VERIFIED":"UNRECONCILED",canonical(snapshot),digest(snapshot),"ADMIN",a.sessionId,b.now]);
  await tx.run("INSERT INTO closing_backup_jobs VALUES(?,?,?,?)",[randomUUID(),id,"BLOCKED_NOT_CONFIGURED",b.now]);return {closingId:id,...snapshot};
 }
 if(action==="RESOLVE_EVIDENCE"){
  const movement=await tx.get("SELECT * FROM cash_movements WHERE id=? AND kind<>'COUNTER_RECONCILIATION'",[p.movementId]);if(!movement)return deny("NOT_FOUND");
  const early=integer(p.earliestAtMs),late=integer(p.latestAtMs),date=calendar(p.actualDate);if(early>late||late>b.now||expenseDay(Number(early))!==date||expenseDay(Number(late))!==date)return deny();
  const previous=await tx.get("SELECT id,actual_date FROM cash_flow_evidence WHERE movement_id=? ORDER BY rowid DESC LIMIT 1",[movement.id]),id=randomUUID();
  await tx.run("INSERT INTO cash_flow_evidence VALUES(?,?,?,?,?,?,?,?,?,?,?)",[id,movement.id,previous?.id??null,null,date,early,late,p.evidence,"ADMIN",a.sessionId,b.now]);
  await appendClosingLinks(tx,"EVIDENCE",id,[date,String(movement.cash_date),String(previous?.actual_date??movement.cash_date)],{movementId:String(movement.id),actualDate:date,earliestAtMs:early.toString(),latestAtMs:late.toString(),evidence:p.evidence},b.now);
  return {evidenceId:id,movementId:String(movement.id)};
 }
 if(p.admissionId===null){if(p.resolution!=="NO_EFFECT_VERIFIED"||p.sourceContext!==await salesContext(tx)||await tx.get("SELECT id FROM sale_operations WHERE request_key=?",[p.sourceKey])||await tx.get("SELECT id FROM counter_cash_admissions WHERE source_kind=\'SALE\' AND source_key=?",[p.sourceKey]))return deny("CONFLICT");const cancelled=await tx.get("SELECT context_fingerprint FROM sale_cancellations WHERE request_key=?",[p.sourceKey]);if(cancelled&&cancelled.context_fingerprint!==p.sourceContext)return deny("CONFLICT");if(!cancelled)await tx.run("INSERT INTO sale_cancellations VALUES(?,?,?,?,?)",[p.sourceKey,p.sourceContext,"ADMIN",a.sessionId,b.now]);return {originalSaleKey:p.sourceKey,sourcePermanentlyFenced:true,noAdmissionRecorded:true,outcome:"NO_EFFECT"};}
 const admission=await tx.get("SELECT * FROM counter_cash_admissions WHERE id=?",[p.admissionId]);if(!admission)return deny("NOT_FOUND");if(await tx.get("SELECT id FROM counter_cash_admission_resolutions WHERE admission_id=?",[admission.id]))return deny("CONFLICT");
 if(p.resolution==="RECORD_PRIOR_SALE"){if(admission.source_kind!=="SALE"||!p.actualDate||!p.actualTenderPaisa||p.actualChangePaisa===undefined)return deny();const grant=await tx.get("SELECT id FROM cash_action_authorizations WHERE request_id=? ORDER BY rowid DESC LIMIT 1",[q.id]);if(!grant)return deny("CONFLICT");const mark=await beforeSource(tx),receipt=await finalizePreparedCashSale(tx,a,String(admission.id),p.actualDate,p.actualTenderPaisa,String(p.actualChangePaisa),String(q.id),String(grant.id));await afterSource(tx,a,mark,operationId);return {admissionId:String(admission.id),originalSaleKey:String(admission.source_key),invoiceId:receipt.id,receipt,originalRequester:"SALESPERSON",recoveryExecutor:"ADMIN",noNewCashHandover:true};}
 const kind=String(admission.source_kind),key=String(admission.source_key);
 // Fence the source key in its own existing ledger; a cash-only cancellation cannot leave a payable source reusable.
 if(kind==="SALE"){
  if(await tx.get("SELECT id FROM sale_operations WHERE request_key=?",[key]))return deny("CONFLICT");
  if(!await tx.get("SELECT request_key FROM sale_cancellations WHERE request_key=?",[key]))await tx.run("INSERT INTO sale_cancellations VALUES(?,?,?,?,?)",[key,await salesContext(tx),"ADMIN",a.sessionId,b.now]);
 }else{
  const table=kind==="REFUND"?"return":kind==="EXPENSE"?"expense":"invoice_correction",q0=await tx.get("SELECT * FROM "+table+"_requests WHERE request_key=?",[key]);if(!q0||await tx.get("SELECT id FROM "+table+"_operations WHERE request_key=?",[key]))return deny("CONFLICT");
  if(!await tx.get("SELECT request_key FROM "+table+"_cancellations WHERE request_key=?",[key])){
   if(kind==="REFUND")await tx.run("INSERT INTO return_cancellations VALUES(?,?,?,?,?,?,?)",[key,q0.context,q0.kind,"ADMIN",a.sessionId,"NO_CASH_PAID",b.now]);
   else await tx.run("INSERT INTO "+table+"_cancellations VALUES(?,?,?,?,?,?)",[key,q0.context,"ADMIN",a.sessionId,p.evidence,b.now]);
  }
 }
 await tx.run("INSERT INTO counter_cash_admission_resolutions(id,admission_id,outcome,source_id,actor_id,session_ref,evidence,recorded_at_ms) VALUES(?,?,?,?,?,?,?,?)",[randomUUID(),admission.id,"NO_EFFECT",null,"ADMIN",a.sessionId,p.evidence,b.now]);return {admissionId:String(admission.id),outcome:"NO_EFFECT",sourcePermanentlyFenced:true};
 }
 async function historyRead(tx:Tx,from:string,to:string,cursor?:string,kind="MOVEMENTS",movementId?:string){ calendar(from);calendar(to);if(from>to||!["MOVEMENTS","COUNTS","ADMISSIONS","EVIDENCE"].includes(kind))return deny();const stamp=await historyStamp(tx),filter=[from,to,kind,movementId??null],pivot=cursorPivot(cursor,"cash-history",filter,stamp);let rows:Row[];
 if(kind==="COUNTS")rows=await tx.all("SELECT c.rowid AS ordinal,c.id,s.id AS session_id,s.target_date,c.outcome,c.actual_m,c.counted_at_ms FROM cash_counts c JOIN cash_count_sessions s ON s.id=c.session_id WHERE s.target_date BETWEEN ? AND ? AND (? IS NULL OR c.rowid<?) ORDER BY c.rowid DESC LIMIT 51",[from,to,pivot,pivot]);
 else if(kind==="ADMISSIONS")rows=await tx.all("SELECT a.rowid AS ordinal,a.id,a.source_kind,a.source_key,a.actor_id,a.admitted_at_ms FROM counter_cash_admissions a WHERE NOT EXISTS(SELECT 1 FROM counter_cash_admission_resolutions r WHERE r.admission_id=a.id) AND (? IS NULL OR a.rowid<?) ORDER BY a.rowid DESC LIMIT 51",[pivot,pivot]);
 else if(kind==="EVIDENCE"){if(!movementId)return deny();uuid(movementId);rows=await tx.all("SELECT rowid AS ordinal,id,movement_id,actual_date,earliest_at_ms,latest_at_ms,evidence,actor_id,recorded_at_ms FROM cash_flow_evidence WHERE movement_id=? AND (? IS NULL OR rowid<?) ORDER BY rowid DESC LIMIT 51",[movementId,pivot,pivot]);}
 else rows=await tx.all("SELECT m.rowid AS ordinal,m.*,e.actual_date AS verified_actual_date,e.id AS evidence_id FROM cash_movements m LEFT JOIN cash_flow_evidence e ON e.movement_id=m.id AND e.rowid=(SELECT max(x.rowid) FROM cash_flow_evidence x WHERE x.movement_id=m.id) WHERE coalesce(e.actual_date,m.cash_date) BETWEEN ? AND ? AND (? IS NULL OR m.rowid<?) ORDER BY m.rowid DESC LIMIT 51",[from,to,pivot,pivot]);
 const pending=await tx.all("SELECT a.rowid AS ordinal,a.id,a.source_kind,a.source_key,a.actor_id,a.admitted_at_ms FROM counter_cash_admissions a WHERE NOT EXISTS(SELECT 1 FROM counter_cash_admission_resolutions r WHERE r.admission_id=a.id) ORDER BY a.rowid DESC LIMIT 51"),counts=await tx.all("SELECT c.rowid AS ordinal,c.id,s.id AS session_id,s.target_date,c.outcome,c.actual_m,c.counted_at_ms FROM cash_counts c JOIN cash_count_sessions s ON s.id=c.session_id WHERE s.target_date BETWEEN ? AND ? ORDER BY c.rowid DESC LIMIT 51",[from,to]);
 return {kind,snapshot:stamp,items:asStrings(rows.slice(0,50)),nextCursor:rows.length>50?nextCursor("cash-history",filter,stamp,rows[49].ordinal):null,pending:asStrings(pending.slice(0,50)),nextAdmissionsCursor:pending.length>50?nextCursor("cash-history",[from,to,"ADMISSIONS",null],stamp,pending[49].ordinal):null,counts:asStrings(counts.slice(0,50)),nextCountsCursor:counts.length>50?nextCursor("cash-history",[from,to,"COUNTS",null],stamp,counts[49].ordinal):null};
 }
 async function closingsRead(tx:Tx,from:string,to:string,cursor?:string){calendar(from);calendar(to);if(from>to)return deny();const stamp=await historyStamp(tx),filter=[from,to],pivot=cursorPivot(cursor,"closings",filter,stamp),rows=await tx.all("SELECT rowid AS ordinal,id,business_date,status,recorded_at_ms FROM daily_closings WHERE business_date BETWEEN ? AND ? AND (? IS NULL OR rowid<?) ORDER BY rowid DESC LIMIT 51",[from,to,pivot,pivot]);return {snapshot:stamp,items:asStrings(rows.slice(0,50)),nextCursor:rows.length>50?nextCursor("closings",filter,stamp,rows[49].ordinal):null};}
 async function execute(tx:Tx,a:Actor,key:string,ctx:string,confirmation:string){
 const old=await terminal(tx,key,ctx);if(old.state==="COMMITTED")return old;if(old.state!=="READY"||confirmation!=="ADMIN_VERIFIED_CASH_FACTS")return deny("CONFLICT");
 const q=(await tx.get("SELECT * FROM cash_action_requests WHERE request_key=?",[key]))!,g=await tx.get("SELECT * FROM cash_action_authorizations WHERE request_id=? ORDER BY rowid DESC LIMIT 1",[q.id]);if(!g)return deny("CONFLICT");await valid(tx,a,g);
 const id=randomUUID(),result=asStrings(await perform(tx,a,q,id)),b=await binding(tx,a),previous=finalGuards.get(tx);
 await tx.run("INSERT INTO cash_action_operations VALUES(?,?,?,?,?,?,?,?,?)",[id,q.id,key,g.id,"ADMIN",a.sessionId,canonical(result),digest(result),b.now]);
 finalGuards.set(tx,async()=>{await previous?.();await valid(tx,a,g);});return terminal(tx,key,ctx);
 }
 async function prepareInTransaction(tx:Tx,a:Actor,key:string,ctx:string,action:CashAction,value:unknown){uuid(key);if(ctx!==await context(tx))return deny("CONFLICT");const p=parse(action,value),old=await tx.get("SELECT * FROM cash_action_requests WHERE request_key=?",[key]);if(old){if(old.context!==ctx||old.action!==action||old.payload_json!==canonical(p)||old.payload_hash!==digest(p))return deny("CONFLICT");const t=await terminal(tx,key,ctx);if(t.state==="COMMITTED"||t.state==="CANCELLED")return t;await grant(tx,a,old);return terminal(tx,key,ctx);}if(await tx.get("SELECT request_key FROM cash_action_cancellations WHERE request_key=?",[key]))return deny("CONFLICT");const b=await binding(tx,a);await tx.run("INSERT INTO cash_action_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[key,key,ctx,action,"ADMIN",a.sessionId,b.credential_version,b.auth_epoch,b.boot,canonical(p),digest(p),b.now]);const q=(await tx.get("SELECT * FROM cash_action_requests WHERE id=?",[key]))!;await grant(tx,a,q);return terminal(tx,key,ctx);}
 return Object.freeze({
 overview:(r:Request,date:string,countId?:string)=>scope(r,"ADMIN",async tx=>{const today=expenseDay();return {context:await context(tx),businessDate:today,summary:await summary(tx,calendar(date),countId),history:await historyRead(tx,date,today),closings:await closingsRead(tx,"2000-01-01",today)};}),
 context:(r:Request)=>scope(r,"ADMIN",async tx=>({context:await context(tx),businessDate:expenseDay()}),undefined,true),
 status:(r:Request,role:Role)=>scope(r,role,async(tx,a)=>{const b=await binding(tx,a);return {physicalAdmissionPaused:!!await activeCount(tx,b.now,b.boot)};}),
 summary:(r:Request,date:string,countId?:string)=>scope(r,"ADMIN",tx=>summary(tx,calendar(date),countId)),
 prepare:(r:Request,password:unknown,key:string,ctx:string,action:CashAction,value:unknown)=>fresh(r,password,(tx,a)=>prepareInTransaction(tx,a,key,ctx,action,value)),
 commitCount:(r:Request,password:unknown,key:string,ctx:string,action:CashAction,value:unknown,confirmation:string)=>fresh(r,password,async(tx,a)=>{if((action!=="START_COUNT"&&action!=="RECORD_COUNT")||confirmation!=="ADMIN_VERIFIED_CASH_FACTS")return deny();const prepared=await prepareInTransaction(tx,a,key,ctx,action,value);if(prepared.state==="COMMITTED"||prepared.state==="CANCELLED")return prepared;return execute(tx,a,key,ctx,confirmation);}),
 execute:(r:Request,key:string,ctx:string,confirmation:string)=>scope(r,"ADMIN",(tx,a)=>execute(tx,a,uuid(key),ctx,confirmation)),
 operation:(r:Request,key:string,ctx:string)=>scope(r,"ADMIN",tx=>terminal(tx,uuid(key),ctx)),
 recover:(r:Request,password:unknown,key:string,ctx:string,resolution:string,why:string)=>fresh(r,password,async(tx,a)=>{evidence(why);const t=await terminal(tx,uuid(key),ctx);if(t.state==="COMMITTED"||t.state==="CANCELLED")return t;if(resolution!=="NO_EFFECT_VERIFIED")return deny("CONFLICT");await tx.run("INSERT INTO cash_action_cancellations VALUES(?,?,?,?,?,?)",[key,ctx,"ADMIN",a.sessionId,why,(await binding(tx,a)).now]);return terminal(tx,key,ctx);}),
 admit:(r:Request,role:Role,value:unknown)=>scope(r,role,async(tx,a)=>{
  const o=object(value,["kind","key"],["input"]),kind=text(o.kind,24) as SourceKind,key=uuid(o.key);let hash:string,payload:unknown;
  if(kind==="SALE"){if(role!=="SALESPERSON")return deny("CONFLICT");const c=parseSale(o.input);const existing=await tx.get("SELECT id FROM counter_cash_admissions WHERE source_kind=\'SALE\' AND source_key=?",[key]);if(!existing&&(await tx.get("SELECT id FROM sale_operations WHERE request_key=?",[key])||await tx.get("SELECT request_key FROM sale_cancellations WHERE request_key=?",[key])))return deny("CONFLICT");if(c.requestKey!==key||c.context!==await salesContext(tx)||c.cashPaisa===null)return deny();if(existing){const old=await admitSource(tx,a,"SALE",key,cashSaleIntentHash(c)),done=await tx.get("SELECT outcome FROM counter_cash_admission_resolutions WHERE admission_id=?",[old.id]);return {id:String(old.id),kind,key,admitted:!done,state:done?String(done.outcome):"UNRESOLVED"};}const labels:unknown[]=[];let total=z;for(const line of c.lines){const product=await loadProduct(tx,line.productId),amount=lineAmounts(line.unitPricePaisa,line.quantity,line.discountPercent,product.cost);if(!product.dto.sellingActive||product.archived!==null||product.q<amount.count*BigInt(1000000))return deny("CONFLICT");total=big(total+amount.charged);labels.push({productId:line.productId,name:product.dto.name,code:product.dto.code,quantity:line.quantity,totalPaisa:amount.charged.toString()});}if(BigInt(c.cashPaisa)<total)return deny();if(!shopName)return deny("UNAVAILABLE");hash=cashSaleIntentHash(c);const saved=schema===41?await currentSettings(tx):null;payload={...(schema===41?{settingsId:saved?.id??null}:{}),intent:cashSaleIntent(c),shopName:saved?.settings.shopName??text(shopName,80),expectedChargePaisa:total.toString(),plannedTenderPaisa:c.cashPaisa,labels};}
  else {const table=kind==="REFUND"?"return_requests":kind==="EXPENSE"?"expense_requests":kind==="INVOICE_CORRECTION"?"invoice_correction_requests":null;if(!table)return deny();const q=await tx.get("SELECT * FROM "+table+" WHERE request_key=?",[key]);if(!q||q.requester_role!==undefined&&q.requester_role!==role||q.actor_id!==undefined&&q.actor_id!==role)return deny("NOT_FOUND");hash=String(q.payload_hash);}
  const admission=await admitSource(tx,a,kind,key,hash,payload);const resolved=await tx.get("SELECT outcome FROM counter_cash_admission_resolutions WHERE admission_id=?",[admission.id]);return {id:String(admission.id),kind,key,admitted:!resolved,state:resolved?String(resolved.outcome):"UNRESOLVED"};
 }),
 admission:(r:Request,role:Role,id:string,kind?:string)=>scope(r,role,async tx=>{
 uuid(id);if(kind!==undefined&&!["SALE","REFUND","EXPENSE","INVOICE_CORRECTION"].includes(kind))return deny();
 const a=await tx.get("SELECT * FROM counter_cash_admissions WHERE "+(kind?"source_key=? AND source_kind=?":"id=?")+" AND (?='ADMIN' OR actor_id=?)",kind?[id,kind,role,role]:[id,role,role]);if(!a)return deny("NOT_FOUND");
 const terminal=await tx.get("SELECT outcome FROM counter_cash_admission_resolutions WHERE admission_id=?",[a.id]),saved=a.source_kind==="SALE"?verifiedJson(a.payload_json,a.payload_digest,true):undefined;
 return {id:String(a.id),key:String(a.source_key),kind:String(a.source_kind),state:terminal?String(terminal.outcome):"UNRESOLVED",...(saved?{retainedSale:saved}:{}),admittedAtMs:String(a.admitted_at_ms)};
 }),

 history:(r:Request,from:string,to:string,cursor?:string,kind="MOVEMENTS",movementId?:string)=>scope(r,"ADMIN",tx=>historyRead(tx,from,to,cursor,kind,movementId)),
 closings:(r:Request,from:string,to:string,cursor?:string)=>scope(r,"ADMIN",tx=>closingsRead(tx,from,to,cursor)),
 closing:(r:Request,id:string,before?:string)=>scope(r,"ADMIN",async tx=>{const c=await tx.get("SELECT * FROM daily_closings WHERE id=?",[uuid(id)]);if(!c)return deny("NOT_FOUND");const stamp=await historyStamp(tx),pivot=cursorPivot(before,"closing-detail",id,stamp),rows=await tx.all("SELECT rowid AS ordinal,* FROM closing_adjustments WHERE closing_id=? AND (? IS NULL OR rowid<?) ORDER BY rowid DESC LIMIT 51",[c.id,pivot,pivot]);return {id:String(c.id),snapshot:json(c),supplements:rows.slice(0,50).map(x=>({id:String(x.id),kind:String(x.source_kind),sourceId:String(x.source_id),effect:verifiedJson(x.effect_json,x.effect_hash),recordedAtMs:String(x.recorded_at_ms)})),nextCursor:rows.length>50?nextCursor("closing-detail",id,stamp,rows[49].ordinal):null,backup:"BLOCKED_NOT_CONFIGURED"};})
 });
}
