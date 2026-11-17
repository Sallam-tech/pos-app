import "server-only";
// A local proof inside ONE already reserved SQLite transaction. This module owns
// no handle, session, registration or authorization. The native owner alone binds
// it to its private scope registry and supplies freshly observed native facts.
export type NativeInputFacts=Readonly<{changes:bigint;schema:bigint;tempSchema:bigint;identity:string;generation:object}>;
export type GuardInputs="RETURN"|"EXPENSE"|"SALE_CASH_BINDINGS"|"SETTINGS"|"CASH_EVIDENCE"|"CASH_SOURCE_RELATIONS";
const dependencies:Readonly<Record<GuardInputs,ReadonlySet<string>>>={
 RETURN:new Set(["sale_lines","sales","sale_payments","sale_operations","financial_events","cash_movements","returns","return_lines","return_dispositions","refund_payments","stock_movements","return_requests","return_operations","return_authorizations","return_cancellations","invoice_revisions","invoice_revision_lines","invoice_settlements","invoice_cash_adjustments","invoice_correction_requests","invoice_correction_operations","invoice_correction_authorizations","invoice_correction_cancellations"]),
 EXPENSE:new Set(["expense_revisions","expenses","financial_events","cash_movements","expense_operations","expense_requests","expense_authorizations","expense_cancellations"]),
 CASH_SOURCE_RELATIONS:new Set(["counter_cash_admissions","counter_cash_admission_resolutions","sale_operations","sale_cancellations","return_operations","return_cancellations","expense_operations","expense_cancellations","invoice_correction_operations","invoice_correction_cancellations","cash_reconciliations","cash_movements","cash_flow_evidence"]),
 CASH_EVIDENCE:new Set(["cash_flow_evidence"]),
 SETTINGS:new Set(["auth_provisioning","schema_migrations","shop_settings_revisions","shop_settings_operations","shop_settings_cancellations","shop_password_operations","auth_principals","invoice_shop_snapshots","sales","sale_operations","invoice_snapshots","counter_cash_admissions","counter_cash_admission_resolutions"]),
 SALE_CASH_BINDINGS:new Set(["counter_cash_admissions","counter_cash_admission_resolutions","sale_operations"])
};
// Exact immutable application SQL; no prefix/parser/client table classification.
const mutations:ReadonlyMap<string,string>=new Map([
 ["INSERT INTO cash_action_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?)","cash_action_requests"],
 ["INSERT INTO cash_action_authorizations VALUES(?,?,?,?,?,?,?,?)","cash_action_authorizations"],
 ["INSERT INTO cash_action_operations VALUES(?,?,?,?,?,?,?,?,?)","cash_action_operations"],
 ["INSERT INTO cash_count_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)","cash_count_sessions"],
 ["INSERT INTO cash_counts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)","cash_counts"],
 ["INSERT INTO cash_anchors VALUES(?,?,?,?,?,?,?,?,?,?)","cash_anchors"],
 ["INSERT INTO daily_closings VALUES(?,?,?,?,?,?,?,?,?,?)","daily_closings"],
 ["INSERT INTO closing_backup_jobs VALUES(?,?,?,?)","closing_backup_jobs"]
]);
export const reviewedMetadataTarget=(sql:string)=>mutations.get(sql);
export function createNativeInputJournal(observe:()=>NativeInputFacts,reviewInsert:(table:string)=>boolean){
 const points=new WeakMap<object,{guard:GuardInputs;offset:number}>();
 const writes:{table:string;changes:bigint}[]=[];
 let last:NativeInputFacts|undefined,unsafe=false;
 function synchronized(){
  let now:NativeInputFacts;try{now=observe();}catch(error){unsafe=true;throw error;}
  if(last&&(now.changes!==last.changes||now.schema!==last.schema||now.tempSchema!==last.tempSchema||now.identity!==last.identity||now.generation!==last.generation))unsafe=true;
  last=now;return now;
 }
 return Object.freeze({
  capture(guard:GuardInputs){synchronized();if(unsafe)return;const point=Object.freeze({});points.set(point,{guard,offset:writes.length});return point;},
  unchanged(point:object,guard:GuardInputs,noWrites=false){
   synchronized();const p=points.get(point);if(unsafe||!p||p.guard!==guard||noWrites&&p.offset!==writes.length)return false;
   // Check EVERY recorded table against THIS guard's full dependency set.
   return writes.slice(p.offset).every(w=>mutationsHasTable(w.table)&&!dependencies[guard].has(w.table));
  },
  mutate<T extends {changes:bigint}>(sql:string,execute:()=>T,verifyEffect:(table:string,result:T)=>boolean):T{
   const before=synchronized(),table=mutations.get(sql);
   try{
    if(!table||!reviewInsert(table))unsafe=true;
    const result=execute(),after=observe();
    // SQLite total_changes includes triggers/FK effects; changes excludes them.
    // A silent driver result or unjournalled mutation cannot supply a proof.
    if(typeof result.changes!=="bigint"||result.changes<BigInt(0)||after.changes-before.changes!==result.changes||
      after.schema!==before.schema||after.tempSchema!==before.tempSchema||after.identity!==before.identity||after.generation!==before.generation)unsafe=true;
    if(table){if(!verifyEffect(table,result))unsafe=true;writes.push({table,changes:result.changes});}else unsafe=true;
    last=after;return result;
   }catch(error){unsafe=true;throw error;}
  }
 });
}
function mutationsHasTable(table:string){return [...mutations.values()].includes(table);}
