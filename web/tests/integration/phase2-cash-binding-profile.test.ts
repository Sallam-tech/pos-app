import {test} from "vitest";
import {createRequire} from "node:module";
import {writeFileSync} from "node:fs";
import path from "node:path";
import {baselineCashSaleBindings} from "../helpers/cash-sale-binding-baseline";
import {assertSaleCashBindings} from "../../src/server/cash/sale-bindings";
import type {AuthorizedTransaction} from "../../src/server/auth/types";
import type {SqlRow,SqlValue} from "../../src/server/db/connection";
const Driver=createRequire(import.meta.url)("better-sqlite3") as new(p:string,o:{readonly:true;fileMustExist:true})=>{defaultSafeIntegers(v:boolean):void;pragma(s:string):unknown;exec(s:string):void;prepare(s:string):{readonly:boolean;get(...v:readonly SqlValue[]):SqlRow|undefined;all(...v:readonly SqlValue[]):SqlRow[]};close():void};
test.skipIf(!process.env.SHOP_POS_PROFILE_CASH_BOOK)("diagnostic only: same-book original versus bounded fresh cash bindings",async()=>{
 const book=path.resolve(process.env.SHOP_POS_PROFILE_CASH_BOOK!);if(!book.startsWith(path.resolve("test-results/sqlite-b1b-part1")+path.sep))throw Error("Confined TEST book required");
 const db=new Driver(book,{readonly:true,fileMustExist:true});db.defaultSafeIntegers(true);db.pragma("query_only=ON");db.pragma("cache_size=-65536");db.exec("BEGIN");const tx:AuthorizedTransaction={get:async(q,v=[])=>db.prepare(q).get(...v),all:async(q,v=[])=>db.prepare(q).all(...v),run:async()=>{throw Error("No writes");}},result:{diagnosticOnly:true;runs:{name:string;ms:number}[]}={diagnosticOnly:true,runs:[]};
 try{for(const [name,f]of [["original",baselineCashSaleBindings],["bounded",assertSaleCashBindings],["bounded",assertSaleCashBindings],["original",baselineCashSaleBindings]] as const){const start=performance.now();await f(tx);result.runs.push({name,ms:performance.now()-start});writeFileSync(path.resolve("test-results/phase2-integration-20261115/cash-binding-same-book-profile.json"),JSON.stringify(result,null,2));}}finally{db.exec("ROLLBACK");db.close();}
},180000);
