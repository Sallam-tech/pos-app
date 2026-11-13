import {digestSqlRows} from "../db/canonical-row-digest";
import "server-only";
import {randomUUID} from "node:crypto";
import type {AuthorizedTransaction} from "../auth/types";
import {int64} from "../db/integers";
import {canonical,digest,integer,text} from "../inventory/validation";
import {calendar} from "../expenses/calendar";
import {karachiStart,nextDay} from "../reports/period";
import {verifiedJson} from "../db/verified-json";
export type Tx=AuthorizedTransaction;
export type Row=NonNullable<Awaited<ReturnType<Tx["get"]>>>;
export class CashError extends Error{constructor(readonly code:"INVALID_INPUT"|"CONFLICT"|"NOT_FOUND"|"UNAVAILABLE"="INVALID_INPUT"){super("Counter cash unavailable.");}}
export const deny=(c:CashError["code"]="INVALID_INPUT"):never=>{throw new CashError(c);};
export const z=BigInt(0),big=(v:unknown)=>{if(typeof v!=="bigint")return deny("UNAVAILABLE");return int64(v);};
export const cashMoney=(v:unknown)=>{const n=integer(v,BigInt("9223372036854775807"),true);if(n<z||n%BigInt(100))return deny();return n;};
export const json=(r:Row,prefix="snapshot")=>verifiedJson(r[prefix+"_json"],r[prefix+"_hash"]);
export const asStrings=(v:unknown):unknown=>JSON.parse(JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x));
export async function cutoffs(tx:Tx){const r=await tx.get("SELECT (SELECT coalesce(max(rowid),0) FROM cash_movements) AS cash,(SELECT coalesce(max(rowid),0) FROM financial_events) AS financial,(SELECT coalesce(max(rowid),0) FROM cash_flow_evidence) AS evidence");if(!r)return deny("UNAVAILABLE");return {cash:big(r.cash),financial:big(r.financial),evidence:big(r.evidence)};}
export async function activeCount(tx:Tx,now:bigint,boot:string){return tx.get("SELECT s.* FROM cash_count_sessions s WHERE s.boot_generation=? AND s.started_at_ms<=? AND s.lease_until_ms>? AND NOT EXISTS(SELECT 1 FROM cash_counts c WHERE c.session_id=s.id) ORDER BY s.rowid DESC LIMIT 1",[boot,now,now]);}
export async function pendingAdmissions(tx:Tx){let old=z;for(const t of ["return","expense","invoice_correction"]){const extra=t==="return"?" AND q.kind=\'REFUND\'":"";old+=big((await tx.get("SELECT count(*) AS n FROM "+t+"_requests q WHERE NOT EXISTS(SELECT 1 FROM "+t+"_operations o WHERE o.request_id=q.id) AND NOT EXISTS(SELECT 1 FROM "+t+"_cancellations c WHERE c.request_key=q.request_key) AND NOT EXISTS(SELECT 1 FROM counter_cash_admissions a WHERE a.source_key=q.request_key)"+extra))?.n);}return old+big((await tx.get("SELECT count(*) AS n FROM counter_cash_admissions a WHERE NOT EXISTS(SELECT 1 FROM counter_cash_admission_resolutions r WHERE r.admission_id=a.id)"))?.n);}
export async function physicalRows(tx:Tx,cutoff?:bigint,evidenceCutoff?:bigint){
 const c=cutoff??(await cutoffs(tx)).cash,e=evidenceCutoff??(await cutoffs(tx)).evidence;
 return tx.all("SELECT m.rowid AS ordinal,m.*,e.id AS evidence_id,e.actual_date,e.earliest_at_ms,e.latest_at_ms,e.admission_id FROM cash_movements m LEFT JOIN cash_flow_evidence e ON e.movement_id=m.id AND e.rowid=(SELECT max(p.rowid) FROM cash_flow_evidence p WHERE p.movement_id=m.id AND p.rowid<=?) WHERE m.rowid<=? ORDER BY m.rowid",[e,c]);
}
export async function cashDigest(tx:Tx,cutoff:bigint,evidence:bigint){return digestSqlRows(after=>tx.all("SELECT m.rowid AS ordinal,m.*,e.id AS evidence_id,e.actual_date,e.earliest_at_ms,e.latest_at_ms,e.admission_id FROM cash_movements m LEFT JOIN cash_flow_evidence e ON e.movement_id=m.id AND e.rowid=(SELECT max(p.rowid) FROM cash_flow_evidence p WHERE p.movement_id=m.id AND p.rowid<=?) WHERE m.rowid<=? AND m.rowid>? ORDER BY m.rowid LIMIT 1000",[evidence,cutoff,after]),"ordinal");}
export async function financialDigest(tx:Tx,date:string){calendar(date);return digestSqlRows(after=>tx.all("SELECT rowid,* FROM financial_events NOT INDEXED WHERE effective_date=? AND rowid>? ORDER BY rowid LIMIT 1000",[date,after]),"rowid");}
export async function observedCount(tx:Tx,id:string){const c=await tx.get("SELECT c.*,s.target_date,s.started_at_ms,s.cash_cutoff,s.financial_cutoff,s.evidence_cutoff,s.source_digest,s.boot_generation FROM cash_counts c JOIN cash_count_sessions s ON s.id=c.session_id WHERE c.id=?",[id]);if(!c||c.outcome!=="RECORDED")return deny("NOT_FOUND");json(c);return c;}
function interval(r:Row){if(r.kind==="COUNTER_RECONCILIATION")return null;if(r.evidence_id)return {date:calendar(r.actual_date),earliest:big(r.earliest_at_ms),latest:big(r.latest_at_ms)};return {date:calendar(r.cash_date),earliest:karachiStart(String(r.cash_date)),latest:karachiStart(nextDay(String(r.cash_date)))-BigInt(1)};}
export async function currentAnchor(tx:Tx,at:bigint){const a=await tx.get("SELECT a.*,c.actual_m,c.counted_at_ms,c.snapshot_json,c.snapshot_hash,cs.evidence_cutoff AS source_evidence_cutoff FROM cash_anchors a JOIN cash_counts c ON c.id=a.count_id JOIN cash_count_sessions cs ON cs.id=c.session_id WHERE a.activated_at_ms<=? ORDER BY a.activated_at_ms DESC,a.rowid DESC LIMIT 1",[at]);if(a){verifiedJson(a.basis_json,digest(JSON.parse(String(a.basis_json))));if(a.counted_at_ms!==a.activated_at_ms||a.actual_m===null)return deny("UNAVAILABLE");}return a;}
export async function expectation(tx:Tx,at:bigint,cutoff?:bigint,evidenceCutoff?:bigint){
 const a=await currentAnchor(tx,at),gaps:string[]=[];if(!a)return {value:null,anchor:null,gaps:["No verified opening/count anchor"],physical:z,bridges:z};
 const basis=json(a) as {calculationEvidenceCutoff?:string},anchorEvidence=basis.calculationEvidenceCutoff===undefined?big(a.source_evidence_cutoff):integer(basis.calculationEvidenceCutoff,BigInt("9223372036854775807"),true),changedBeforeAnchor=new Set((await tx.all("SELECT DISTINCT m.id FROM cash_flow_evidence e JOIN cash_movements m ON m.id=e.movement_id WHERE e.rowid>? AND e.rowid<=? AND m.rowid<=?",[anchorEvidence,evidenceCutoff??(await cutoffs(tx)).evidence,a.cutoff])).map(r=>String(r.id)));
 const rows=await physicalRows(tx,cutoff,evidenceCutoff);let physical=z,bridges=z;
 for(const r of rows){
  if(big(r.ordinal)<=big(a.cutoff)&&(r.kind==="COUNTER_RECONCILIATION"||!changedBeforeAnchor.has(String(r.id))))continue;
  if(r.kind==="COUNTER_RECONCILIATION"){const bridge=await tx.get("SELECT observed_at_ms FROM cash_reconciliations WHERE id=?",[r.reconciliation_id]);if(!bridge)return deny("UNAVAILABLE");const t=big(bridge.observed_at_ms);if(t>big(a.activated_at_ms)&&t<=at)bridges=int64(bridges+big(r.amount_m));continue;}
  const v=interval(r)!;if(v.latest<=big(a.activated_at_ms))continue;
  if(v.earliest<big(a.activated_at_ms)){gaps.push("Cash timing overlaps the opening/count anchor");continue;}
  if(v.earliest>at)continue;
  if(v.latest>at){gaps.push("Cash timing overlaps the requested cutoff");continue;}
  physical=int64(physical+big(r.amount_m));
 }
 const missing=big((await tx.get("SELECT count(*) AS n FROM sales s WHERE s.recorded_at_ms>? AND s.recorded_at_ms<=? AND NOT EXISTS(SELECT 1 FROM sale_payments p WHERE p.invoice_id=s.id)",[a.activated_at_ms,at]))?.n);
 if(missing)gaps.push(missing.toString()+" sale payment(s) unrecorded");
 return {value:gaps.length?null:int64(big(a.actual_m)+physical+bridges),anchor:a,gaps:[...new Set(gaps)],physical,bridges};
}
export async function countSnapshot(tx:Tx,s:Row,actual:bigint){
 const day=calendar(s.target_date),boundary=karachiStart(nextDay(day)),at=big(s.started_at_ms),calculation=await cutoffs(tx),rows=await physicalRows(tx,calculation.cash,calculation.evidence),e=await expectation(tx,at,calculation.cash,calculation.evidence);
 let opening:bigint|null=null,boundaryExpected:bigint|null=null,flows=z,bridges=z,flowsComplete=true;const gaps=[...e.gaps];
 if(at<boundary){flowsComplete=false;gaps.push("Count precedes the selected midnight boundary");}
 if(e.anchor){const anchorTime=big(e.anchor.activated_at_ms),contradicted=e.anchor.opening_date===day&&rows.some(r=>r.kind!=="COUNTER_RECONCILIATION"&&String(r.actual_date??r.cash_date)===day&&(big(r.ordinal)<=big(e.anchor!.cutoff)||interval(r)!.earliest<anchorTime)),untouched=e.anchor.opening_date===day&&!contradicted;if(contradicted)gaps.push("Later recorded cash evidence contradicts the untouched opening declaration");if(anchorTime<=karachiStart(day)||untouched){const start=await expectation(tx,karachiStart(day),calculation.cash,calculation.evidence);opening=untouched?big(e.anchor.actual_m):start.value;}if(anchorTime<=boundary){const end=await expectation(tx,boundary-BigInt(1),calculation.cash,calculation.evidence);boundaryExpected=at>=boundary?end.value:null;}else gaps.push("Verified anchor starts after the selected day");}
 for(const r of rows){if(r.kind==="COUNTER_RECONCILIATION"){const v=await tx.get("SELECT observed_at_ms FROM cash_reconciliations WHERE id=?",[r.reconciliation_id]);if(v&&big(v.observed_at_ms)>=boundary&&big(v.observed_at_ms)<=at)bridges=int64(bridges+big(r.amount_m));continue;}if(String(r.actual_date??r.cash_date)<nextDay(day))continue;const v=interval(r)!;if(v.earliest>at)continue;if(v.latest>at){flowsComplete=false;gaps.push("Later flow has unknown count-cutoff membership");continue;}flows=int64(flows+big(r.amount_m));}
 const missingLater=big((await tx.get("SELECT count(*) AS n FROM sales s WHERE s.recorded_at_ms>=? AND s.recorded_at_ms<=? AND NOT EXISTS(SELECT 1 FROM sale_payments p WHERE p.invoice_id=s.id)",[boundary,at]))?.n);if(missingLater){flowsComplete=false;gaps.push("Unrecorded sale payment may affect later cash flows");}
 const reconstructed=int64(actual-flows);if(flowsComplete&&reconstructed<z)gaps.push("Reconstructed physical boundary is negative");
 if(opening===null)gaps.push("Selected-day opening is not verified");
 const expected=boundaryExpected===null||!flowsComplete?null:int64(boundaryExpected+flows+bridges),complete=gaps.length===0&&expected!==null&&e.value!==null;
 if(complete&&e.value!==expected)return deny("UNAVAILABLE");
 return {cutoffStable:true,businessDate:day,countTimeMs:at.toString(),actualPaisa:actual.toString(),openingPaisa:opening?.toString()??null,expectedBoundaryPaisa:boundaryExpected?.toString()??null,postBoundaryPhysicalFlowPaisa:flowsComplete?flows.toString():null,acceptedBridgePaisa:bridges.toString(),reconstructedBoundaryPaisa:flowsComplete&&reconstructed>=z?reconstructed.toString():null,rawBoundaryDifferencePaisa:flowsComplete&&boundaryExpected!==null?int64(reconstructed-boundaryExpected).toString():null,expectedAtCountPaisa:e.value?.toString()??null,variancePaisa:e.value===null?null:int64(actual-e.value).toString(),complete:e.value!==null,boundaryComplete:complete,gaps:[...new Set(gaps)],calculationCashCutoff:calculation.cash.toString(),calculationEvidenceCutoff:calculation.evidence.toString(),cashCutoff:String(s.cash_cutoff),evidenceCutoff:String(s.evidence_cutoff),method:at<boundary?"CURRENT_COUNT":at===boundary?"BOUNDARY_COUNT":"LATE_RECONSTRUCTION"};
}
export async function countStillCurrent(tx:Tx,c:Row){
 if(await cashDigest(tx,big(c.cash_cutoff),big(c.evidence_cutoff))!==c.source_digest)return deny("UNAVAILABLE");
 const snapshot=json(c) as {cutoffStable?:boolean;calculationCashCutoff?:string;calculationEvidenceCutoff?:string};if(snapshot.cutoffStable===false)return deny("CONFLICT");const cash=snapshot.calculationCashCutoff?BigInt(snapshot.calculationCashCutoff):big(c.cash_cutoff),evidence=snapshot.calculationEvidenceCutoff?BigInt(snapshot.calculationEvidenceCutoff):big(c.evidence_cutoff);
 for(const r of await physicalRows(tx)){
  if(r.kind==="COUNTER_RECONCILIATION"){if(big(r.ordinal)<=cash)continue;const bridge=await tx.get("SELECT count_id,observed_at_ms FROM cash_reconciliations WHERE id=?",[r.reconciliation_id]);if(bridge&&bridge.count_id!==c.id&&big(bridge.observed_at_ms)<=big(c.started_at_ms))return deny("CONFLICT");continue;}
  const timingChanged=!!r.evidence_id&&big((await tx.get("SELECT rowid AS n FROM cash_flow_evidence WHERE id=?",[r.evidence_id]))?.n)>evidence,changed=big(r.ordinal)>cash||timingChanged;if(timingChanged&&big(r.ordinal)<=cash||changed&&interval(r)!.earliest<=big(c.started_at_ms))return deny("CONFLICT");
 }
}
export async function appendClosingLinks(tx:Tx,kind:"FINANCIAL"|"CASH"|"EVIDENCE"|"RECONCILIATION",sourceId:string,dates:string[],effect:unknown,at:bigint){
 const payload=canonical(asStrings(effect));for(const date of new Set(dates)){calendar(date);const c=await tx.get("SELECT id FROM daily_closings WHERE business_date=?",[date]);if(!c||await tx.get("SELECT id FROM closing_adjustments WHERE closing_id=? AND source_kind=? AND source_id=?",[c.id,kind,sourceId]))continue;await tx.run("INSERT INTO closing_adjustments VALUES(?,?,?,?,?,?,?)",[randomUUID(),c.id,kind,sourceId,payload,digest(JSON.parse(payload)),at]);}
}
export function evidence(v:unknown){return text(v,160);}
