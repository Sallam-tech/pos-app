import {cashSaleIntentHash} from "./sale-intent";
import "server-only";
import {randomUUID} from "node:crypto";
import type {Actor} from "../auth/types";
import {canonical,digest} from "../inventory/validation";
import {expenseBinding} from "../expenses/authority";
import {expenseDay} from "../expenses/calendar";
import {karachiStart,nextDay} from "../reports/period";
import {verifiedJson} from "../db/verified-json";
import {activeCount,appendClosingLinks,big,cutoffs,deny,type Row,type Tx,z} from "./model";
export type SourceKind="SALE"|"REFUND"|"EXPENSE"|"INVOICE_CORRECTION";
const specs=[
 {kind:"REFUND",table:"return_requests",operations:"return_operations"},
 {kind:"EXPENSE",table:"expense_requests",operations:"expense_operations"},
 {kind:"INVOICE_CORRECTION",table:"invoice_correction_requests",operations:"invoice_correction_operations"}
] as const;
export async function admitSource(tx:Tx,a:Actor,kind:SourceKind,key:string,hash:string,payload?:unknown){
 const old=await tx.get("SELECT * FROM counter_cash_admissions WHERE source_kind=? AND source_key=?",[kind,key]);
 if(old){if(old.payload_hash!==hash||old.actor_id!==a.role&&a.role!=="ADMIN")return deny("CONFLICT");return old;}
 const b=await expenseBinding(tx,a);if(await activeCount(tx,b.now,b.boot))return deny("CONFLICT");
 if(kind==="SALE"&&!payload)return deny("UNAVAILABLE");const id=randomUUID();await tx.run("INSERT INTO counter_cash_admissions VALUES(?,?,?,?,?,?,?,?,?,?)",[id,kind,key,hash,a.role,a.sessionId,b.boot,b.now,payload?canonical(payload):null,payload?digest(payload):null]);return (await tx.get("SELECT * FROM counter_cash_admissions WHERE id=?",[id]))!;
}
export async function beforeSource(tx:Tx){
 if((await tx.get("SELECT user_version FROM pragma_user_version"))?.user_version!==BigInt(40))return null;
 const c=await cutoffs(tx),requests:Record<string,bigint>={};
 for(const s of specs)requests[s.kind]=big((await tx.get("SELECT coalesce(max(rowid),0) AS n FROM "+s.table))?.n);
 return {...c,requests};
}
async function sourceFor(tx:Tx,r:Row){
 if(r.kind==="SALE")return tx.get("SELECT o.request_key,o.payload_hash,o.payload_json,o.id AS operation_id FROM sale_payments p JOIN sales s ON s.id=p.invoice_id JOIN sale_operations o ON o.id=s.operation_id WHERE p.id=?",[r.sale_payment_id]);
 if(r.kind==="REFUND")return tx.get("SELECT o.request_key,q.payload_hash,o.id AS operation_id FROM refund_payments p JOIN return_operations o ON o.return_id=p.return_id JOIN return_requests q ON q.id=o.request_id WHERE p.id=?",[r.refund_payment_id]);
 if(r.kind==="EXPENSE")return tx.get("SELECT o.request_key,q.payload_hash,o.id AS operation_id FROM expense_revisions v JOIN expense_operations o ON o.id=v.operation_id JOIN expense_requests q ON q.id=o.request_id WHERE v.id=?",[r.expense_revision_id]);
 if(r.kind==="INVOICE_CORRECTION")return tx.get("SELECT o.request_key,q.payload_hash,o.id AS operation_id FROM invoice_cash_adjustments v JOIN invoice_correction_operations o ON o.id=v.operation_id JOIN invoice_correction_requests q ON q.id=o.request_id WHERE v.id=?",[r.correction_adjustment_id]);
 return undefined;
}
export async function afterSource(tx:Tx,a:Actor,mark:Awaited<ReturnType<typeof beforeSource>>,recoveryOperationId?:string){
 if(!mark)return;
 const b=await expenseBinding(tx,a);
 for(const s of specs)for(const q of await tx.all("SELECT * FROM "+s.table+" WHERE rowid>? ORDER BY rowid",[mark.requests[s.kind]])){
  if(s.kind==="REFUND"&&q.kind!=="REFUND")continue;
  await admitSource(tx,a,s.kind,String(q.request_key),String(q.payload_hash));
 }
 for(const r of await tx.all("SELECT rowid AS ordinal,* FROM cash_movements WHERE rowid>? AND kind<>'COUNTER_RECONCILIATION' ORDER BY rowid",[mark.cash])){
  if(await activeCount(tx,b.now,b.boot))return deny("CONFLICT");
  let s=await sourceFor(tx,r);if(!s)return deny("UNAVAILABLE");if(r.kind==="SALE"){s={...s,payload_hash:cashSaleIntentHash(JSON.parse(String(s.payload_json)))};}
  let admission=await tx.get("SELECT * FROM counter_cash_admissions WHERE source_kind=? AND source_key=?",[r.kind,s.request_key]);
  // Old unresolved intents may be recovered by the existing fresh Admin prior-facts workflow;
  // this records evidence only and never permits a second physical handover.
  const recovered=!admission&&a.role==="ADMIN"&&r.provenance==="ADMIN_ATTESTED";
  if(recovered)admission=await admitSource(tx,a,r.kind as SourceKind,String(s.request_key),String(s.payload_hash));
  if(!admission||admission.payload_hash!==s.payload_hash||admission.actor_id!==a.role&&a.role!=="ADMIN"||await tx.get("SELECT id FROM counter_cash_admission_resolutions WHERE admission_id=?",[admission.id]))return deny("CONFLICT");
  const date=String(r.cash_date),dayStart=karachiStart(date),dayEnd=karachiStart(nextDay(date))-BigInt(1);
  const earliest=recovered?dayStart:(big(admission.admitted_at_ms)>dayStart?big(admission.admitted_at_ms):dayStart),latest=b.now<dayEnd?b.now:dayEnd;
  if(earliest>latest||date>expenseDay(Number(b.now)))return deny("CONFLICT");
  await tx.run("INSERT INTO counter_cash_admission_resolutions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",[randomUUID(),admission.id,"POSTED",s.operation_id,a.role,a.sessionId,recovered?"Admin verified prior source facts; no second handover":"Source committed; operator confirmed actual cash date",b.now,r.kind==="SALE"?s.operation_id:null,r.kind==="REFUND"?s.operation_id:null,r.kind==="EXPENSE"?s.operation_id:null,r.kind==="INVOICE_CORRECTION"?s.operation_id:null,recoveryOperationId??null]);
  await tx.run("INSERT INTO cash_flow_evidence VALUES(?,?,?,?,?,?,?,?,?,?,?)",[randomUUID(),r.id,null,admission.id,date,earliest,latest,recovered?"Prior verified actual date; intraday timing remains unknown":"Source-bound admitted interval; no invented handover instant",a.role,a.sessionId,b.now]);
  await appendClosingLinks(tx,"CASH",String(r.id),[date],r,b.now);
 }
 // Zero-cash completed revisions consume their admission without creating a movement.
 for(const s of specs)for(const admission of await tx.all("SELECT a.* FROM counter_cash_admissions a WHERE a.source_kind=? AND NOT EXISTS(SELECT 1 FROM counter_cash_admission_resolutions r WHERE r.admission_id=a.id)",[s.kind])){
  const op=await tx.get("SELECT id FROM "+s.operations+" WHERE request_key=?",[admission.source_key]);
  if(op)await tx.run("INSERT INTO counter_cash_admission_resolutions(id,admission_id,outcome,source_id,actor_id,session_ref,evidence,recorded_at_ms) VALUES(?,?,?,?,?,?,?,?)",[randomUUID(),admission.id,"NO_EFFECT",null,a.role,a.sessionId,"Committed source has no cash effect",b.now]);
 }
 for(const f of await tx.all("SELECT rowid AS ordinal,* FROM financial_events WHERE rowid>? ORDER BY rowid",[mark.financial])){const dates=[String(f.effective_date)];let parent:Row|undefined;if(f.kind==="INVOICE_CORRECTION")parent=await tx.get("SELECT s.business_date FROM invoice_revision_lines l JOIN sales s ON s.id=l.invoice_id WHERE l.id=?",[f.correction_line_id]);else if(f.kind==="REFUND")parent=await tx.get("SELECT s.business_date FROM return_lines l JOIN sales s ON s.id=l.invoice_id WHERE l.id=?",[f.return_line_id]);if(parent)dates.push(String(parent.business_date));await appendClosingLinks(tx,"FINANCIAL",String(f.id),dates,{...f,economicPostingDate:String(f.effective_date),originalReferenceDate:parent?.business_date??null,historicalSnapshotUnchanged:true},b.now);}
 if(!recoveryOperationId)await assertCashLedgers(tx);
}
export async function assertCashLedgers(tx:Tx){
 const bad=async(sql:string)=>{if(await tx.get(sql))return deny("UNAVAILABLE");};
 // A committed action must retain its source effect, including silent driver failures.
 await bad("SELECT o.id FROM cash_action_operations o JOIN cash_action_requests q ON q.id=o.request_id WHERE (q.action='START_COUNT' AND NOT EXISTS(SELECT 1 FROM cash_count_sessions s WHERE s.operation_id=o.id AND s.id=json_extract(o.result_json,'$.sessionId'))) OR (q.action IN('RECORD_COUNT','ABORT_COUNT') AND NOT EXISTS(SELECT 1 FROM cash_counts c WHERE c.operation_id=o.id AND c.id=json_extract(o.result_json,'$.countId'))) OR (q.action='OPEN_ANCHOR' AND NOT EXISTS(SELECT 1 FROM cash_anchors a WHERE a.operation_id=o.id)) OR (q.action='ACCEPT_VARIANCE' AND NOT EXISTS(SELECT 1 FROM cash_reconciliations r WHERE r.operation_id=o.id)) OR (q.action='CLOSE_DAY' AND NOT EXISTS(SELECT 1 FROM daily_closings c WHERE c.operation_id=o.id)) OR (q.action='RESOLVE_EVIDENCE' AND NOT EXISTS(SELECT 1 FROM cash_flow_evidence e WHERE e.id=json_extract(o.result_json,'$.evidenceId') AND e.movement_id=json_extract(q.payload_json,'$.movementId') AND e.evidence=json_extract(q.payload_json,'$.evidence'))) OR (q.action='RESOLVE_ADMISSION' AND json_extract(q.payload_json,'$.admissionId') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM counter_cash_admission_resolutions r WHERE r.admission_id=json_extract(q.payload_json,'$.admissionId'))) OR (q.action='RESOLVE_ADMISSION' AND json_extract(q.payload_json,'$.admissionId') IS NULL AND NOT EXISTS(SELECT 1 FROM sale_cancellations c WHERE c.request_key=json_extract(q.payload_json,'$.sourceKey') AND c.context_fingerprint=json_extract(q.payload_json,'$.sourceContext'))) LIMIT 1");
 await bad("SELECT s.id FROM cash_count_sessions s JOIN cash_action_operations o ON o.id=s.operation_id JOIN cash_action_requests q ON q.id=o.request_id WHERE q.action<>'START_COUNT' OR s.target_date IS NOT json_extract(q.payload_json,'$.businessDate') OR s.id IS NOT json_extract(o.result_json,'$.sessionId') OR s.session_ref<>o.session_ref LIMIT 1");
 for(const [kind,ops,cancels]of [["SALE","sale_operations","sale_cancellations"],["REFUND","return_operations","return_cancellations"],["EXPENSE","expense_operations","expense_cancellations"],["INVOICE_CORRECTION","invoice_correction_operations","invoice_correction_cancellations"]] as const){
  await bad("SELECT r.id FROM counter_cash_admission_resolutions r JOIN counter_cash_admissions a ON a.id=r.admission_id WHERE a.source_kind='"+kind+"' AND r.outcome='NO_EFFECT' AND NOT EXISTS(SELECT 1 FROM "+ops+" o WHERE o.request_key=a.source_key) AND NOT EXISTS(SELECT 1 FROM "+cancels+" c WHERE c.request_key=a.source_key) LIMIT 1");
 }

 await bad("SELECT c.id FROM cash_counts c JOIN cash_action_operations o ON o.id=c.operation_id JOIN cash_action_requests q ON q.id=o.request_id JOIN cash_count_sessions s ON s.id=c.session_id WHERE json_extract(o.result_json,'$.countId') IS NOT c.id OR json_extract(q.payload_json,'$.sessionId') IS NOT c.session_id OR c.session_ref<>o.session_ref OR c.recorded_at_ms>o.recorded_at_ms OR (c.outcome='RECORDED' AND (q.action<>'RECORD_COUNT' OR CAST(c.actual_m AS TEXT) IS NOT json_extract(q.payload_json,'$.actualPaisa') OR CAST(c.actual_m AS TEXT) IS NOT json_extract(c.snapshot_json,'$.actualPaisa') OR CAST(c.counted_at_ms AS TEXT) IS NOT json_extract(c.snapshot_json,'$.countTimeMs') OR s.target_date IS NOT json_extract(c.snapshot_json,'$.businessDate'))) OR (c.outcome<>'RECORDED' AND q.action<>'ABORT_COUNT') LIMIT 1");
 await bad("SELECT a.id FROM cash_anchors a JOIN cash_counts c ON c.id=a.count_id JOIN cash_count_sessions s ON s.id=c.session_id JOIN cash_action_operations o ON o.id=a.operation_id JOIN cash_action_requests q ON q.id=o.request_id WHERE q.action<>'OPEN_ANCHOR' OR json_extract(q.payload_json,'$.countId') IS NOT a.count_id OR json_extract(o.result_json,'$.anchorId') IS NOT a.id OR json_extract(a.basis_json,'$.actualPaisa') IS NOT CAST(c.actual_m AS TEXT) OR json_extract(a.basis_json,'$.sourceDigest') IS NOT s.source_digest OR json_extract(a.basis_json,'$.evidence') IS NOT json_extract(q.payload_json,'$.evidence') LIMIT 1");
 await bad("SELECT r.id FROM cash_reconciliations r JOIN cash_action_operations o ON o.id=r.operation_id JOIN cash_action_requests q ON q.id=o.request_id WHERE q.action<>'ACCEPT_VARIANCE' OR json_extract(q.payload_json,'$.countId') IS NOT r.count_id OR json_extract(o.result_json,'$.reconciliationId') IS NOT r.id OR r.evidence IS NOT json_extract(q.payload_json,'$.evidence') LIMIT 1");
 await bad("SELECT c.id FROM daily_closings c JOIN cash_action_operations o ON o.id=c.operation_id JOIN cash_action_requests q ON q.id=o.request_id WHERE q.action<>'CLOSE_DAY' OR json_extract(q.payload_json,'$.businessDate') IS NOT c.business_date OR json_extract(o.result_json,'$.closingId') IS NOT c.id OR json_extract(c.snapshot_json,'$.status') IS NOT c.status OR json_extract(q.payload_json,'$.countId') IS NOT c.count_id OR (c.status='UNRECONCILED' AND json_extract(q.payload_json,'$.allowUnreconciled') IS NOT 'YES') LIMIT 1");
 for(const [kind,column,table]of [["SALE","sale_operation_id","sale_operations"],["REFUND","return_operation_id","return_operations"],["EXPENSE","expense_operation_id","expense_operations"],["INVOICE_CORRECTION","invoice_operation_id","invoice_correction_operations"]] as const){
  await bad("SELECT r.id FROM counter_cash_admission_resolutions r JOIN counter_cash_admissions a ON a.id=r.admission_id LEFT JOIN "+table+" o ON o.id=r."+column+" WHERE a.source_kind='"+kind+"' AND r.outcome='POSTED' AND (o.id IS NULL OR o.request_key<>a.source_key) LIMIT 1");
 }
 for(const r of await tx.all("SELECT a.payload_hash,o.payload_json FROM counter_cash_admission_resolutions r JOIN counter_cash_admissions a ON a.id=r.admission_id JOIN sale_operations o ON o.id=r.sale_operation_id WHERE r.outcome='POSTED'")){
  if(cashSaleIntentHash(JSON.parse(String(r.payload_json)))!==r.payload_hash)return deny("UNAVAILABLE");
 }

 await bad("SELECT r.id FROM cash_reconciliations r LEFT JOIN cash_movements m ON m.reconciliation_id=r.id WHERE m.id IS NULL OR m.kind<>'COUNTER_RECONCILIATION' OR m.amount_m<>r.delta_m OR m.recorded_at_ms<>r.recorded_at_ms OR m.sale_payment_id IS NOT NULL OR m.refund_payment_id IS NOT NULL LIMIT 1");
 await bad("SELECT e.id FROM cash_flow_evidence e WHERE e.admission_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM counter_cash_admission_resolutions r WHERE r.admission_id=e.admission_id AND r.outcome=\'POSTED\') LIMIT 1");
 await bad("SELECT e.id FROM cash_flow_evidence e LEFT JOIN cash_flow_evidence p ON p.id=e.previous_id WHERE (e.previous_id IS NOT NULL AND (p.id IS NULL OR p.movement_id<>e.movement_id OR p.rowid>=e.rowid)) OR (e.previous_id IS NULL AND EXISTS(SELECT 1 FROM cash_flow_evidence x WHERE x.movement_id=e.movement_id AND x.previous_id IS NULL AND x.rowid<e.rowid)) LIMIT 1");
 await bad("SELECT o.id FROM cash_action_operations o JOIN cash_action_requests q ON q.id=o.request_id JOIN cash_action_authorizations a ON a.id=o.authorization_id WHERE o.request_key<>q.request_key OR o.session_ref<>a.session_ref OR o.recorded_at_ms<a.issued_at_ms OR o.recorded_at_ms>=a.expires_at_ms OR EXISTS(SELECT 1 FROM cash_action_cancellations c WHERE c.request_key=o.request_key) LIMIT 1");
 await bad("SELECT c.id FROM cash_counts c JOIN cash_count_sessions s ON s.id=c.session_id WHERE c.outcome='RECORDED' AND (c.counted_at_ms<s.started_at_ms OR c.counted_at_ms>=s.lease_until_ms OR c.counted_at_ms<>c.recorded_at_ms) LIMIT 1");
 await bad("SELECT a.id FROM cash_anchors a JOIN cash_counts c ON c.id=a.count_id JOIN cash_count_sessions s ON s.id=c.session_id WHERE c.outcome<>'RECORDED' OR a.activated_at_ms<>c.counted_at_ms OR a.cutoff<>s.cash_cutoff LIMIT 1");
 await bad("SELECT c.id FROM daily_closings c WHERE NOT EXISTS(SELECT 1 FROM closing_backup_jobs b WHERE b.closing_id=c.id) LIMIT 1");
 for(const a of await tx.all("SELECT * FROM counter_cash_admissions WHERE source_kind=\'SALE\'")){const saved=verifiedJson(a.payload_json,a.payload_digest,true) as {intent:Record<string,unknown>;shopName:string};if(typeof saved.shopName!=="string"||saved.shopName.length<1||saved.shopName.length>80||saved.intent.requestKey!==a.source_key||cashSaleIntentHash(saved.intent)!==a.payload_hash)return deny("UNAVAILABLE");}
 await bad("SELECT r.id FROM counter_cash_admission_resolutions r JOIN counter_cash_admissions a ON a.id=r.admission_id LEFT JOIN cash_action_operations o ON o.id=r.recovery_operation_id LEFT JOIN cash_action_requests q ON q.id=o.request_id LEFT JOIN sale_operations s ON s.id=r.sale_operation_id WHERE (a.source_kind=\'SALE\' AND r.actor_id=\'ADMIN\' AND r.outcome=\'POSTED\' AND r.recovery_operation_id IS NULL) OR (r.recovery_operation_id IS NOT NULL AND (a.source_kind<>\'SALE\' OR o.id IS NULL OR q.action<>\'RESOLVE_ADMISSION\' OR json_extract(q.payload_json,\'$.resolution\') IS NOT \'RECORD_PRIOR_SALE\' OR json_extract(q.payload_json,\'$.admissionId\') IS NOT a.id OR json_extract(o.result_json,\'$.invoiceId\') IS NOT s.invoice_id)) LIMIT 1");
 for(const [table,prefix]of [["cash_action_requests","payload"],["cash_action_operations","result"],["cash_counts","snapshot"],["daily_closings","snapshot"],["closing_adjustments","effect"]] as const){
  let cursor=z;for(;;){const rows=await tx.all("SELECT rowid AS ordinal,"+prefix+"_json,"+prefix+"_hash FROM "+table+" WHERE rowid>? ORDER BY rowid LIMIT 100",[cursor]);if(!rows.length)break;for(const r of rows){const value=verifiedJson(r[prefix+"_json"],r[prefix+"_hash"],true);if(!value||typeof value!=="object"||Array.isArray(value))return deny("UNAVAILABLE");}cursor=big(rows.at(-1)!.ordinal);}
 }
 for(const r of await tx.all("SELECT r.*,m.cash_date,c.snapshot_json,c.snapshot_hash FROM cash_reconciliations r JOIN cash_movements m ON m.reconciliation_id=r.id JOIN cash_counts c ON c.id=r.count_id")){
  const s=verifiedJson(r.snapshot_json,r.snapshot_hash) as {variancePaisa:string|null;expectedAtCountPaisa:string|null};if(s.variancePaisa!==String(r.delta_m)||s.expectedAtCountPaisa!==String(r.expected_m)||r.cash_date!==expenseDay(Number(r.observed_at_ms)))return deny("UNAVAILABLE");
 }
 for(const e of await tx.all("SELECT actual_date,earliest_at_ms,latest_at_ms FROM cash_flow_evidence")){if(expenseDay(Number(e.earliest_at_ms))!==e.actual_date||expenseDay(Number(e.latest_at_ms))!==e.actual_date)return deny("UNAVAILABLE");}
}
