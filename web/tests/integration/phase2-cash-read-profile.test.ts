import {test} from "vitest";
import {createRequire} from "node:module";
import {writeFileSync} from "node:fs";
import path from "node:path";
import {Session} from "node:inspector";
import type {AuthorizedTransaction,} from "../../src/server/auth/types";
import type {SqlRow,SqlValue} from "../../src/server/db/connection";
import {assertCashLedgers} from "../../src/server/cash/source";
import {assertReturnLedgers} from "../../src/server/returns/ledgers";
type Statement={readonly:boolean;get(...v:readonly SqlValue[]):SqlRow|undefined;all(...v:readonly SqlValue[]):SqlRow[]};
const Driver=createRequire(import.meta.url)("better-sqlite3") as new(p:string,o:{readonly:true;fileMustExist:true})=>{defaultSafeIntegers(v:boolean):void;pragma(s:string):unknown;exec(s:string):void;prepare(s:string):Statement;close():void};
test.skipIf(!process.env.SHOP_POS_PROFILE_CASH_BOOK)("diagnostic only: read-only source guards with native SQL timings and CPU samples",async()=>{
 const book=path.resolve(process.env.SHOP_POS_PROFILE_CASH_BOOK!);if(!book.startsWith(path.resolve("test-results/sqlite-b1b-part1")+path.sep))throw Error("Confined disposable book required");
 const db=new Driver(book,{readonly:true,fileMustExist:true});db.defaultSafeIntegers(true);db.pragma("cache_size=-65536");db.pragma("trusted_schema=OFF");db.exec("BEGIN");
 const sql=new Map<string,{count:number;ms:number}>(),profile=new Session(),post=(method:string)=>new Promise<Record<string,unknown>>((resolve,reject)=>profile.post(method,(error,value)=>error?reject(error):resolve(value as Record<string,unknown>)));
 const read=<T>(query:string,work:(s:Statement)=>T)=>{const statement=db.prepare(query);if(!statement.readonly)throw Error("Read only");const start=performance.now();try{return work(statement);}finally{const value=sql.get(query)??{count:0,ms:0};value.count++;value.ms+=performance.now()-start;sql.set(query,value);}};
 const tx:AuthorizedTransaction={get:async(q,v=[])=>read(q,s=>s.get(...v)),all:async(q,v=[])=>read(q,s=>s.all(...v)),run:async()=>{throw Error("No writes");}};
 try{const capture=process.env.SHOP_POS_PROFILE_CASH_CPU!=="0";if(capture){profile.connect();await post("Profiler.enable");await post("Profiler.start");}const a=performance.now();await assertReturnLedgers(tx);const returnsMs=performance.now()-a,b=performance.now();await assertCashLedgers(tx);const cashMs=performance.now()-b,cpu=capture?await post("Profiler.stop"):null,base=path.resolve("test-results/phase2-integration-20261115");if(cpu)writeFileSync(path.join(base,"cash-read-cpu-profile.json"),JSON.stringify(cpu.profile));writeFileSync(path.join(base,"cash-read-profile.json"),JSON.stringify({diagnosticOnly:true,returnsMs,cashMs,sql:[...sql].map(([query,v])=>({query,...v})).sort((a,b)=>b.ms-a.ms)},null,2));}finally{profile.disconnect();db.exec("ROLLBACK");db.close();}
},120000);