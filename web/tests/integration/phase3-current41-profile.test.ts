import {test} from "vitest";
import {createRequire} from "node:module";
import {writeFileSync,readFileSync,copyFileSync,mkdirSync} from "node:fs";
import path from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {cashDigest,countSnapshot,cutoffs,observedCount,countStillCurrent} from "../../src/server/cash/model";
import type {AuthorizedTransaction} from "../../src/server/auth/types";
import type {Raw} from "../helpers/reports-volume";
import {assertStoredSettingsLedgers} from "../../src/server/settings/model";
import {assertReturnLedgersFull} from "../../src/server/returns/ledgers";
import {assertExpenseLedgersFull} from "../../src/server/expenses/ledgers";
import {assertCashLedgersFull} from "../../src/server/cash/source";
const Driver=createRequire(import.meta.url)("better-sqlite3") as new(p:string,o:{readonly:boolean;fileMustExist:true})=>Raw;
test("diagnostic only: current41 native and pure validation stage costs, no authorization or write",async()=>{
 const metrics=JSON.parse(readFileSync(path.resolve("test-results/phase2-integration-20261115/https-sales-capacity-da56eb4a-480c-4c69-bdc9-7fd1804346d5/result.json"),"utf8")),diagnosticDirectory=path.resolve("test-results/phase2-integration-20261115/profile-clone-"+randomUUID()),source=path.join(metrics.directory,"test.sqlite3");mkdirSync(diagnosticDirectory);const copied=path.join(diagnosticDirectory,"diagnostic.sqlite3");copyFileSync(source,copied);const repair=new Driver(copied,{readonly:false,fileMustExist:true});try{const trigger=repair.prepare("SELECT sql FROM sqlite_schema WHERE name=\'counter_cash_admissions_no_update\'").get()!,row=repair.prepare("SELECT id,payload_json FROM counter_cash_admissions ORDER BY rowid DESC LIMIT 1").get()!;repair.exec("BEGIN IMMEDIATE");repair.exec("DROP TRIGGER counter_cash_admissions_no_update");repair.prepare("UPDATE counter_cash_admissions SET payload_digest=? WHERE id=?").run(createHash("sha256").update(String(row.payload_json)).digest("hex"),row.id);repair.exec(String(trigger.sql));repair.exec("COMMIT");}finally{repair.close();}const db=new Driver(copied,{readonly:true,fileMustExist:true}),queries=new Map<string,{query:string;ms:number;count:number}>(),stages:Record<string,number>={};
 db.defaultSafeIntegers(true);db.pragma("query_only=ON");db.pragma("mmap_size=536870912");db.pragma("cache_size=-65536");db.exec("BEGIN");
 const read=<T>(q:string,work:()=>T)=>{const t=performance.now();try{return work();}finally{const v=queries.get(q)??{query:q,ms:0,count:0};v.ms+=performance.now()-t;v.count++;queries.set(q,v);}},tx:AuthorizedTransaction={get:async(q,v=[])=>read(q,()=>db.prepare(q).get(...v)),all:async(q,v=[])=>read(q,()=>db.prepare(q).all(...v)),run:async()=>{throw Error("Read-only diagnostic");}};
 try{
 // This retained completed book has an intentional final admission fault. Read
 // Settings before that fault is not available; profile only to the genuine refusal,
 // then collect original independent Return/Expense scans without altering it.
 const current=String(db.prepare("SELECT context FROM shop_settings_operations LIMIT 1").get()?.context);
 for(const [name,work] of [["settings",()=>assertStoredSettingsLedgers(tx,current)],["returns",()=>assertReturnLedgersFull(tx)],["expenses",()=>assertExpenseLedgersFull(tx)],["cash",()=>assertCashLedgersFull(tx)],["cashDigest",async()=>{const c=await cutoffs(tx);await cashDigest(tx,c.cash,c.evidence);}],["countSnapshot",async()=>{const row=await tx.get("SELECT * FROM cash_count_sessions ORDER BY rowid LIMIT 1");if(row)await countSnapshot(tx,row,BigInt(0));}],["countCurrent",async()=>{const row=await tx.get("SELECT id FROM cash_counts WHERE outcome=\'RECORDED\' ORDER BY rowid LIMIT 1");if(row)await countStillCurrent(tx,await observedCount(tx,String(row.id)));}]] as const){const at=performance.now();try{await work();stages[name]=performance.now()-at;}catch{stages[name+"Refused"]=performance.now()-at;}}
 writeFileSync(path.resolve("test-results/phase2-integration-20261115/phase3-current41-complete-profile.json"),JSON.stringify({diagnosticOnly:true,noAuthority:true,repairedDiagnosticCopyOnly:diagnosticDirectory,originalFaultFixtureUntouched:true,notAcceptance:true,stages,queries:[...queries.values()].sort((a,b)=>b.ms-a.ms)},null,2));
 }finally{db.exec("ROLLBACK");db.close();}
},180000);