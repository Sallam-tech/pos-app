import {beforeAll,afterEach,expect,test,vi} from "vitest";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {ready,seed,cashDay,passwords} from "../helpers/cash-ready";
import {assertCashLedgers} from "../../src/server/cash/source";
import {createNativeInputJournal,type NativeInputFacts} from "../../src/server/auth/native-input-journal";
import type {SqlValue} from "../../src/server/db/connection";
interface Raw{prepare(s:string):{run(...v:unknown[]):unknown;get(...v:unknown[]):Record<string,SqlValue>|undefined;all(...v:unknown[]):Record<string,SqlValue>[]}}
const Driver=createRequire(import.meta.url)("better-sqlite3") as {prototype:Raw};
beforeAll(seed);afterEach(()=>vi.restoreAllMocks());
test("complete source-relation dependency inventory excludes every written count metadata table",()=>{
 const source=readFileSync("src/server/cash/source.ts","utf8").split("async function assertCashSourceRelations")[1],journal=readFileSync("src/server/auth/native-input-journal.ts","utf8"),deps=journal.match(/CASH_SOURCE_RELATIONS:new Set\(\[(.*?)\]\)/)![1];
 const tables=["counter_cash_admissions","counter_cash_admission_resolutions","sale_operations","sale_cancellations","return_operations","return_cancellations","expense_operations","expense_cancellations","invoice_correction_operations","invoice_correction_cancellations","cash_reconciliations","cash_movements","cash_flow_evidence"];
 expect(tables.every(t=>deps.includes('"'+t+'"'))).toBe(true);
 expect([...source.matchAll(/\b(?:FROM|JOIN)\s+([a-z][a-z0-9_]*)/g)].every(m=>tables.includes(m[1]))).toBe(true);
 for(const changed of ["cash_action_requests","cash_action_authorizations","cash_action_operations","cash_count_sessions","cash_counts","cash_anchors","daily_closings","closing_backup_jobs"])expect(deps).not.toContain('"'+changed+'"');
});
test("new source proof fails closed on any unknown source write, hidden mutation, generation or WAL identity change",()=>{
 for(const mutation of ["UPDATE cash_flow_evidence SET actual_date=actual_date","DELETE FROM sale_cancellations","INSERT INTO cash_reconciliations VALUES(1)"]){let facts:NativeInputFacts={changes:BigInt(0),schema:BigInt(41),tempSchema:BigInt(0),identity:"old",generation:{}};
 const j=createNativeInputJournal(()=>facts,()=>true),point=j.capture("CASH_SOURCE_RELATIONS")!;j.mutate(mutation,()=>{facts={...facts,changes:BigInt(1)};return {changes:BigInt(1)};},()=>true);expect(j.unchanged(point,"CASH_SOURCE_RELATIONS")).toBe(false);}
 for(const key of ["changes","schema","tempSchema","identity","generation"] as const){let facts:NativeInputFacts={changes:BigInt(0),schema:BigInt(41),tempSchema:BigInt(0),identity:"old",generation:{}};const j=createNativeInputJournal(()=>facts,()=>true),p=j.capture("CASH_SOURCE_RELATIONS")!;facts={...facts,...(key==="identity"?{identity:"new"}:key==="generation"?{generation:{}}:{[key]:BigInt(999)})};expect(j.unchanged(p,"CASH_SOURCE_RELATIONS")).toBe(false);}
});
test("real atomic metadata writes reuse source predicates only; affected operation effects remain fresh",async()=>{
 const f=await ready();try{const prepare=Driver.prototype.prepare;let sources=0,effects=0;vi.spyOn(Driver.prototype,"prepare").mockImplementation(function(this:Raw,s:string){if(s.startsWith("SELECT e.id FROM cash_flow_evidence e WHERE e.admission_id"))sources++;if(s.startsWith("SELECT o.id FROM cash_action_operations o JOIN cash_action_requests q ON")&&!s.includes("JOIN cash_action_authorizations"))effects++;return prepare.call(this,s);});
 expect((await f.cash.commitCount(f.admin,passwords.ADMIN,randomUUID(),f.context,"START_COUNT",{businessDate:cashDay(),evidence:"TEST exact source guard reuse; all effects checked"}, "ADMIN_VERIFIED_CASH_FACTS")).state).toBe("COMMITTED");expect(sources).toBe(1);expect(effects).toBe(2);
 }finally{vi.restoreAllMocks();await f.g.close();}
});
test("real unknown zero-effect native write invalidates source proof and forces the complete predicates again",async()=>{
 const f=await ready();try{const prepare=Driver.prototype.prepare;let n=0;vi.spyOn(Driver.prototype,"prepare").mockImplementation(function(this:Raw,s:string){if(s.startsWith("SELECT e.id FROM cash_flow_evidence e WHERE e.admission_id"))n++;return prepare.call(this,s);});await f.g.withAdminTransaction(f.admin,async tx=>{await assertCashLedgers(tx);await tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id='missing'");await assertCashLedgers(tx);});expect(n).toBe(2);
 }finally{vi.restoreAllMocks();await f.g.close();}
});
