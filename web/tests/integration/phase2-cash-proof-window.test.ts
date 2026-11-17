import {Driver} from "../helpers/admin-products-settings-volume";
import type {Raw} from "../helpers/reports-volume";
import {beforeAll,test,expect,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import {seed,passwords,credentials} from "../helpers/cash-fixture";
import {importRetainedPaidSales} from "../helpers/retained-paid-sales";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {createCashService} from "../../src/server/cash/service";
import type {AuthorizationGateway} from "../../src/server/auth/types";
beforeAll(seed);
test.skipIf(!process.env.SHOP_POS_RETAINED_SALES_SOURCE)("diagnostic only: genuine50002-sale cash proof window, no altered authorization or automatic retry",async()=>{
 const evidence=path.resolve("test-results/phase2-integration-20261115/cash-proof-window-"+randomUUID());mkdirSync(evidence);
 const result:Record<string,unknown>={diagnosticOnly:true,productionActivation:false,evidence,stages:[]};const save=()=>writeFileSync(path.join(evidence,"result.json"),JSON.stringify(result,null,2));save();
 const imported=await importRetainedPaidSales(process.env.SHOP_POS_RETAINED_SALES_SOURCE!);result.directory=imported.config.database.directory;const g=await openAuthorizationGateway(imported.config,40);
 try{
 const admin=await credentials(g,imported.config,"ADMIN");let issued=0;
 const nativeSql=new Map<string,{count:number;ms:number}>();let measuring=false;const prototype=Driver.prototype as Raw,prepare=prototype.prepare;const probe=vi.spyOn(prototype,"prepare").mockImplementation(function(this:Raw,q:string){const statement=prepare.call(this,q);let proxy:typeof statement;proxy=new Proxy(statement,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=="function")return value;return(...args:unknown[])=>{const at=performance.now();try{const out=Reflect.apply(value,target,args);return out===target?proxy:out;}finally{if(measuring&&["get","all","run"].includes(String(key))){const t=nativeSql.get(q)??{count:0,ms:0};t.count++;t.ms+=performance.now()-at;nativeSql.set(q,t);}}};}});return proxy;});
 const traced:AuthorizationGateway={...g,async verifyAdminPassword(password){const at=performance.now(),proof=await g.verifyAdminPassword(password);issued=performance.now();result.passwordVerificationMs=issued-at;return proof;},async withFreshAdminTransaction(request,proof,work){return g.withFreshAdminTransaction(request,proof,async(tx,actor)=>{result.callbackEnteredAfterProofMs=performance.now()-issued;save();measuring=true;try{const value=await work(tx,actor);result.callbackCompletedAfterProofMs=performance.now()-issued;result.callbackCompleted=true;save();return value;}catch(error){result.callbackFailedAfterProofMs=performance.now()-issued;result.callbackCompleted=false;save();throw error;}finally{measuring=false;}});}};
 const api=createCashService(traced),context=(await api.context(admin)).context,key=randomUUID();result.originalKey=key;result.windowMs=5000;
 try{const value=await api.prepare(admin,passwords.ADMIN,key,context,"START_COUNT",{businessDate:"2026-10-06",evidence:"SYNTHETIC diagnostic only; original proof and guards unchanged"});result.outcome=value.state;}catch(error){result.outcome="REFUSED";result.errorCode=String((error as {code?:unknown}).code);}
 probe.mockRestore();result.nativeSql=[...nativeSql].map(([query,value])=>({query,...value})).sort((a,b)=>b.ms-a.ms);result.completedAfterProofMs=performance.now()-issued;
 result.requestDurablyPresent=!!await g.withAdminTransaction(admin,tx=>tx.get("SELECT id FROM cash_action_requests WHERE request_key=?",[key]));
 if(result.callbackCompleted===true&&Number(result.callbackCompletedAfterProofMs)>=5000){expect(result.outcome).toBe("REFUSED");expect(result.requestDurablyPresent).toBe(false);result.requiredWorkExceedsOriginalWindow=true;}
 save();
 }finally{await g.close();result.drained=true;save();writeFileSync(path.resolve("test-results/phase2-integration-20261115/cash-proof-window-latest.json"),JSON.stringify({evidence,result:path.join(evidence,"result.json")},null,2));}
},1200000);
