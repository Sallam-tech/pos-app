import {test} from "vitest";
import {createRequire} from "node:module";
import {writeFileSync} from "node:fs";
import path from "node:path";
import {performance} from "node:perf_hooks";
import type {AuthorizedTransaction} from "../../src/server/auth/types";
import type {Raw} from "../helpers/reports-volume";
import {assertStoredSettingsLedgers} from "../../src/server/settings/model";
import {assertReturnLedgersFull} from "../../src/server/returns/ledgers";
import {assertExpenseLedgersFull} from "../../src/server/expenses/ledgers";
import {assertCashLedgersFull} from "../../src/server/cash/source";
import {cashDigest,cutoffs,countSnapshot} from "../../src/server/cash/model";
const Driver=createRequire(import.meta.url)("better-sqlite3") as new(p:string,o:{readonly:true;fileMustExist:true})=>Raw;
test("diagnostic only: fresh read-only atomic refusal fixture costs; no credentials, authority or repair",async()=>{
 const file=path.resolve("test-results/sqlite-b1b-part1/inventory-http5-o44TZF/db-yrFeLH/test.sqlite3"),db=new Driver(file,{readonly:true,fileMustExist:true}),queries=new Map<string,{query:string;ms:number;count:number}>(),stages:Record<string,number>={};db.defaultSafeIntegers(true);db.pragma("query_only=ON");db.pragma("mmap_size=536870912");db.pragma("cache_size=-65536");db.exec("BEGIN");
 const read=<T>(q:string,w:()=>T)=>{const t=performance.now();try{return w();}finally{const v=queries.get(q)??{query:q,ms:0,count:0};v.ms+=performance.now()-t;v.count++;queries.set(q,v);}},tx:AuthorizedTransaction={get:async(q,v=[])=>read(q,()=>db.prepare(q).get(...v)),all:async(q,v=[])=>read(q,()=>db.prepare(q).all(...v)),run:async()=>{throw Error("readonly");}};
 try{const context=String(db.prepare("SELECT context FROM shop_settings_operations LIMIT 1").get()?.context);for(const [name,w]of [["settings",()=>assertStoredSettingsLedgers(tx,context)],["return",()=>assertReturnLedgersFull(tx)],["expense",()=>assertExpenseLedgersFull(tx)],["cash",()=>assertCashLedgersFull(tx)],["digest",async()=>{const c=await cutoffs(tx);await cashDigest(tx,c.cash,c.evidence);}],["snapshot",async()=>{const s=await tx.get("SELECT * FROM cash_count_sessions LIMIT 1");if(s)await countSnapshot(tx,s,BigInt(0));}]] as const){const t=performance.now();await w();stages[name]=performance.now()-t;}writeFileSync(path.resolve("test-results/phase2-integration-20261115/phase3-atomic-refusal-profile.json"),JSON.stringify({diagnosticOnly:true,noWrites:true,stages,queries:[...queries.values()].sort((a,b)=>b.ms-a.ms)},null,2));}finally{db.exec("ROLLBACK");db.close();}
},180000);
