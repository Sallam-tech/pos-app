import {test} from "vitest";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import path from "node:path";
import {assertReturnLedgersFull} from "../../src/server/returns/ledgers";
import {assertCashLedgersFull} from "../../src/server/cash/source";
import type {AuthorizedTransaction} from "../../src/server/auth/types";
import type {SqlRow,SqlValue} from "../../src/server/db/connection";
type Db={defaultSafeIntegers(v:boolean):void;pragma(s:string):unknown;exec(s:string):void;prepare(s:string):{readonly:boolean;get(...v:readonly SqlValue[]):SqlRow|undefined;all(...v:readonly SqlValue[]):SqlRow[]};close():void};
const Driver=createRequire(import.meta.url)("better-sqlite3") as new(p:string,o:{readonly:true;fileMustExist:true})=>Db;
test.skipIf(!process.env.SHOP_POS_PROFILE_CASH_BOOK)("diagnostic only: bounded native page storage, every financial guard fresh, source read-only",async()=>{
 const book=path.resolve(process.env.SHOP_POS_PROFILE_CASH_BOOK!);if(!book.startsWith(path.resolve("test-results/sqlite-b1b-part1")+path.sep))throw Error("Confined TEST source required");
 const hash=()=>createHash("sha256").update(readFileSync(book)).digest("hex"),before=hash(),runs:{cacheMiB:number;returnsMs:number;cashMs:number}[]=[];
 for(const cacheMiB of [64,384,64,384]){
 const db=new Driver(book,{readonly:true,fileMustExist:true});db.defaultSafeIntegers(true);db.pragma("query_only=ON");db.pragma("cache_size=-"+cacheMiB*1024);db.exec("BEGIN");
 const tx:AuthorizedTransaction={get:async(q,v=[])=>{const s=db.prepare(q);if(!s.readonly)throw Error("Read-only");return s.get(...v);},all:async(q,v=[])=>{const s=db.prepare(q);if(!s.readonly)throw Error("Read-only");return s.all(...v);},run:async()=>{throw Error("No writer");}};
 try{const at=performance.now();await assertReturnLedgersFull(tx);const returnsMs=performance.now()-at,start=performance.now();await assertCashLedgersFull(tx);runs.push({cacheMiB,returnsMs,cashMs:performance.now()-start});}finally{db.exec("ROLLBACK");db.close();}
 writeFileSync(path.resolve("test-results/phase2-integration-20261115/bounded-page-cache-feasibility.json"),JSON.stringify({diagnosticOnly:true,verdictCache:false,runs,sourceUnchanged:hash()===before},null,2));
 }
 if(hash()!==before)throw Error("Read-only source changed");
},180000);
