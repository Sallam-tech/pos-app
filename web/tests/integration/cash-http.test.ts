import {beforeAll,afterAll,expect,test} from "vitest";
import {randomUUID} from "node:crypto";
import {seed,ready,cashDay,passwords} from "../helpers/cash-ready";
import {productId} from "../helpers/invoices-fixture";
import {wire,login} from "../helpers/inventory-http-fixture";
import {startLocalRuntime,type LocalRuntime,type LocalRuntimeConfiguration} from "../../src/server/hosting/runtime";
let config:LocalRuntimeConfiguration,runtime:LocalRuntime,admin:string[],staff:string[],context:string,savedId:string;
const call=(p:string,role:"ADMIN"|"SALESPERSON"="ADMIN",body?:unknown)=>wire(config,p,role,role==="ADMIN"?admin:staff,body);
async function action(action:string,input:unknown){const key=randomUUID(),prepared=await call("/api/admin/cash-actions","ADMIN",{key,context,action,input,password:passwords.ADMIN});expect(prepared.status).toBe(200);const result=await call("/api/admin/cash-actions/"+key+"/execute","ADMIN",{context,confirmation:"ADMIN_VERIFIED_CASH_FACTS"});expect(result.status).toBe(200);return {key,result:JSON.parse(result.body).result};}
beforeAll(async()=>{await seed();const f=await ready();try{await f.opening("100000");const date="2026-11-01",review=await f.cash.summary(f.admin,date),saved=await f.act("CLOSE_DAY",{businessDate:date,countId:null,sourceDigest:review.sourceDigest,allowUnreconciled:"YES",evidence:"TEST missing historical opening/count explicitly unresolved"});savedId=String(saved.result.closingId);config=f.runtime;}finally{await f.g.close();}runtime=await startLocalRuntime(config);admin=await login(config);staff=await login(config,"SALESPERSON");context=JSON.parse((await call("/api/admin/cash/context")).body).context;},120000);
afterAll(async()=>{await runtime?.close();});
test("real CA-validated HTTPS cash admission, exact paid sale, count/cancel and private immutable history",async()=>{
 const saleContext=JSON.parse((await call("/api/pos/sales/context","SALESPERSON")).body).context,key=randomUUID(),input={requestKey:key,context:saleContext,lines:[{productId,quantity:"1",unitPricePaisa:"11000",discountPercent:"0"}],cashPaisa:"11000",cashDate:cashDay(),customerName:"",customerPhone:""};
 const a=await call("/api/counter-cash/admissions","SALESPERSON",{kind:"SALE",key,input});expect(a.status).toBe(200);expect(a.body).not.toMatch(/cost|stock|profit|balance|expected|actual/i);
 expect((await call("/api/pos/sales","SALESPERSON",input)).status).toBe(200);expect(JSON.parse((await call("/api/admin/cash/summary?date="+cashDay())).body).currentExpectedPaisa).toBe("111000");
 const s=await action("START_COUNT",{businessDate:cashDay(),evidence:"TEST no unposted physical movements at counter"});expect(JSON.parse((await call("/api/counter-cash/status","SALESPERSON")).body)).toEqual({physicalAdmissionPaused:true});
 const other=randomUUID();expect((await call("/api/counter-cash/admissions","SALESPERSON",{kind:"SALE",key:other,input:{...input,requestKey:other}})).status).toBe(409);
 await action("ABORT_COUNT",{sessionId:s.result.sessionId,evidence:"TEST count cancelled before accepting observed amount"});expect(JSON.parse((await call("/api/counter-cash/status","SALESPERSON")).body)).toEqual({physicalAdmissionPaused:false});
 const history=await call("/api/admin/closings/"+savedId);expect(history.status).toBe(200);const saved=JSON.parse(history.body);expect(saved.snapshot.status).toBe("UNRECONCILED");expect(saved.backup).toBe("BLOCKED_NOT_CONFIGURED");expect(history.headers["cache-control"]).toContain("no-store");
});
test("all Admin cash routes/pages reject Salesperson and unauthenticated reads; safe status leaks no drawer data",async()=>{const paths=["/api/admin/cash/context","/api/admin/cash/summary?date="+cashDay(),"/api/admin/cash/history?from=2000-01-01&to="+cashDay(),"/api/admin/closings?from=2000-01-01&to="+cashDay(),"/api/admin/closings/"+savedId,"/admin/daily-closing"];for(const p of paths){const denied=await call(p,"SALESPERSON");expect(denied.status).toBe(403);expect(denied.body).not.toMatch(/100000|111000|grossProfit|openingPaisa|actualPaisa|counter_cash|password|snapshot_json/);expect((await wire(config,p,"ADMIN",[])).status).toBe(403);}const status=await call("/api/counter-cash/status","SALESPERSON");expect(status.body).not.toMatch(/opening|profit|amount|balance|expected|actual|evidence/i);});
test("cash methods, duplicate/unknown filters, malformed values, unsafe origins and extra privileges fail closed",async()=>{
 for(const path of ["/api/admin/cash/summary?date=2026-02-30","/api/admin/cash/summary?date="+cashDay()+"&date="+cashDay(),"/api/admin/cash/summary?date="+cashDay()+"&role=ADMIN","/api/admin/cash/history?from=2000-01-01&to="+cashDay()+"&cursor=bad"]){expect((await call(path)).status).toBe(400);}
 for(const method of ["HEAD","OPTIONS","POST"]){expect((await wire(config,"/api/admin/cash/context","ADMIN",admin,undefined,{method})).status).toBe(405);}
 for(const headers of [{origin:"https://invalid.example"},{"x-forwarded-host":"localhost"}])expect((await wire(config,"/api/admin/cash/context","ADMIN",admin,undefined,{headers})).status).toBe(403);
 const key=randomUUID();expect((await call("/api/admin/cash-actions","SALESPERSON",{key,context,action:"START_COUNT",input:{businessDate:cashDay(),evidence:"TEST invalid privilege escalation"},password:passwords.ADMIN})).status).toBe(403);
 expect((await call("/api/admin/cash-actions","ADMIN",{key,context,action:"ARBITRARY_CASH_ADJUSTMENT",input:{amount:"999999"},password:passwords.ADMIN})).status).toBe(400);
});
test("real HTTPS restart releases interrupted count, preserves original outcomes/history, and never enables40 without explicit TEST cash flag",async()=>{
 const started=await action("START_COUNT",{businessDate:cashDay(),evidence:"TEST simulate counter interrupted before physical count recorded"}),before=(await call("/api/admin/closings/"+savedId)).body;await runtime.close();runtime=await startLocalRuntime(config);admin=await login(config);staff=await login(config,"SALESPERSON");
 expect(JSON.parse((await call("/api/counter-cash/status","SALESPERSON")).body)).toEqual({physicalAdmissionPaused:false});
 const outcome=await wire(config,"/api/admin/cash-operations/"+started.key,"ADMIN",admin,undefined,{headers:{"x-cash-context":context}});expect(outcome.status).toBe(200);expect(JSON.parse(outcome.body).state).toBe("COMMITTED");expect((await call("/api/admin/closings/"+savedId)).body).toBe(before);
 const key=randomUUID();expect((await call("/api/admin/cash-actions","ADMIN",{key,context,action:"RECORD_COUNT",input:{sessionId:started.result.sessionId,actualPaisa:"111000",evidence:"TEST invalid observation after restart"},password:passwords.ADMIN})).status).toBe(200);
 expect((await call("/api/admin/cash-actions/"+key+"/execute","ADMIN",{context,confirmation:"ADMIN_VERIFIED_CASH_FACTS"})).status).toBe(409);
 await action("ABORT_COUNT",{sessionId:started.result.sessionId,evidence:"TEST old boot invalidates unrecorded count; recount required"});
 await runtime.close();await expect(startLocalRuntime({...config,testCash:undefined})).rejects.toThrow();
},120000);
