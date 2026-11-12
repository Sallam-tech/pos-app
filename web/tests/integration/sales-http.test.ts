import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {beforeAll,afterAll,afterEach,it,expect,vi} from "vitest";
import {initialize,fixture,wire,login,passwords,sensitive,credentialHashes} from "../helpers/inventory-http-fixture";
import {applySalesMigration36} from "../../src/server/db/sales-migrate";
import {startLocalRuntime,type LocalRuntime,type LocalRuntimeConfiguration} from "../../src/server/hosting/runtime";
let runtime:LocalRuntime,config:LocalRuntimeConfiguration,f:Awaited<ReturnType<typeof fixture>>,admin:string[],staff:string[],context:string,ids:string[];
const replies:string[]=[];
const call=async(path:string,role:"ADMIN"|"SALESPERSON"="SALESPERSON",cookies=staff,value?:unknown,overrides:Parameters<typeof wire>[5]={})=>{const r=await wire(config,path,role,cookies,value,overrides);replies.push(r.body);return r;};
const cmd=()=>({requestKey:randomUUID(),context,lines:[{productId:ids[0],quantity:"3",unitPricePaisa:"11000",discountPercent:"5"},{productId:ids[1],quantity:"2",unitPricePaisa:"50000",discountPercent:"0"},{productId:ids[2],quantity:"4",unitPricePaisa:"10300",discountPercent:"20"}],cashPaisa:null});
beforeAll(async()=>{
 await initialize();f=await fixture();f.inspect(db=>applySalesMigration36(db));config={...f.config,testSales:{shopName:"TEST SHOP"}};runtime=await startLocalRuntime(config);admin=await login(config,"ADMIN");
 const binding=JSON.parse((await wire(config,"/api/admin/inventory/recovery-context","ADMIN",admin)).body).context;ids=[];
 for(const [name,cost,price]of [["A","10000","11000"],["B","40000","50000"],["C","8000","10300"]]){
 const r=await wire(config,"/api/admin/products","ADMIN",admin,{requestKey:randomUUID(),name:"TEST "+name,unit:"PACK",buyingPricePaisa:cost,sellingPricePaisa:price,sellingActive:true,openingQuantity:"2000",lowStockThreshold:"1"},{headers:{"x-inventory-context":binding}});expect(r.status).toBe(200);ids.push(JSON.parse(r.body).product.id);
 }staff=await login(config,"SALESPERSON");context=JSON.parse((await call("/api/pos/sales/context")).body).context;
});
afterEach(()=>vi.restoreAllMocks());afterAll(async()=>{await runtime?.close();});
it("real HTTPS role-safe catalog, signed status and protected POS render",async()=>{
 const r=await call("/api/pos/products");expect(r.status).toBe(200);expect(JSON.parse(r.body).items).toHaveLength(3);expect(r.body).not.toMatch(/cost|profit|quantity|stock|hash|password|token|secret/i);
 expect((await call("/pos")).status).toBe(200);expect((await call("/pos","ADMIN",admin)).status).toBe(403);expect((await call("/api/pos/products","ADMIN",admin)).status).toBe(403);expect((await call("/api/pos/products","SALESPERSON",admin)).status).toBe(403);
});
it("POST mixed invoice1643 commits before HTTP success; receipt/history/replay are actual SQL",async()=>{
 const c=cmd(),r=await call("/api/pos/sales","SALESPERSON",staff,c);expect(r.status).toBe(200);const receipt=JSON.parse(r.body);expect(receipt.totalPaisa).toBe("164300");expect(receipt.payment).toBeNull();expect(r.cookies).toEqual([]);expect(r.headers["cache-control"]).toContain("no-store");
 expect((await call("/api/pos/sales/"+receipt.id)).body).toBe(r.body);expect(JSON.parse((await call("/api/pos/sales")).body).items.some((x:{id:string})=>x.id===receipt.id)).toBe(true);
 expect((await call("/api/pos/sales","SALESPERSON",staff,c)).body).toBe(r.body);expect((await call("/api/pos/sales","SALESPERSON",staff,{...c,cashPaisa:"200000"})).status).toBe(409);
});
it("origin/Host/SNI/forwarding/method/content-type/duplicate-cookie attacks deny",async()=>{
 for(const headers of [{origin:"https://untrusted.invalid"},{origin:""},{host:"localhost:"+config.port},{"x-forwarded-host":"localhost"},{cookie:staff.map(c=>c.split(";")[0]).join("; ")+"; "+staff[0].split(";")[0]}])expect((await call("/api/pos/sales","SALESPERSON",staff,cmd(),{headers})).status).toBeGreaterThanOrEqual(400);
 expect((await call("/api/pos/products","SALESPERSON",staff,undefined,{method:"POST"})).status).toBe(405);
 expect((await call("/api/pos/sales","SALESPERSON",staff,cmd(),{headers:{"content-type":"text/plain"}})).status).toBe(415);
});
it("duplicate/escaped JSON keys, numeric money, nested input, malformed percentages, overlarge bodies and query passwords deny",async()=>{
 for(const v of ['{"requestKey":"x","requestKey":"y"}','{"\\u0072equestKey":"x"}','{"lines":[[[[[[]]]]]]}',{...cmd(),lines:[{...cmd().lines[0],unitPricePaisa:110}]},{...cmd(),lines:[{...cmd().lines[0],discountPercent:"5.5"}]}," ".repeat(65537)])expect((await call("/api/pos/sales","SALESPERSON",staff,v)).status).toBe(400);
 expect((await call("/api/pos/sales?password=TEST","SALESPERSON",staff,cmd())).status).toBe(400);
});
it("UNKNOWN is not failure; only genuine Admin resolves/cancels, then delayed POST remains fenced",async()=>{
 const c=cmd(),get="/api/pos/sale-operations/"+c.requestKey,endpoint="/api/admin/sale-operations/"+c.requestKey+"/recovery",headers={"x-sales-context":context};
 expect((await call(get,"SALESPERSON",staff,undefined,{headers})).status).toBe(404);expect((await call(endpoint,"SALESPERSON",staff,{}, {headers})).status).toBe(403);
 expect(JSON.parse((await call(endpoint,"ADMIN",admin,{}, {headers})).body).state).toBe("CANCELLED");expect((await call("/api/pos/sales","SALESPERSON",staff,c)).status).toBe(409);expect(JSON.parse((await call(get,"SALESPERSON",staff,undefined,{headers})).body).state).toBe("CANCELLED");
});
it("SQL unavailability denies without details or partially written sale",async()=>{
 const Driver=createRequire(import.meta.url)("better-sqlite3") as {prototype:{prepare(s:string):unknown}},prepare=Driver.prototype.prepare;
 vi.spyOn(Driver.prototype,"prepare").mockImplementation(function(this:unknown,sql:string){if(sql.includes("FROM sale_operations WHERE request_key"))throw Error("TEST private SQL");return prepare.call(this,sql);});
 const r=await call("/api/pos/sales","SALESPERSON",staff,cmd());expect(r.status).toBe(503);expect(r.body).not.toMatch(/SELECT|private|SQL|sqlite|password/i);
});
it("no raw auth/Next/business bypass or unapproved role becomes reachable",async()=>{
 for(const role of ["ADMIN","SALESPERSON"]as const)for(const endpoint of ["/api/auth/get-session","/api/auth/sign-up/email","/admin/dashboard","/pos/expenses","/pos/returns","/api/pos/sales/../products/","/api/pos/sales?role=ADMIN"])expect((await call(endpoint,role,role==="ADMIN"?admin:staff)).status).toBeGreaterThanOrEqual(400);
});
it("HTTP never acknowledges uncertain COMMIT; durable original-key lookup recovers the committed invoice",async()=>{
 interface Native{inTransaction:boolean;prepare(sql:string):{run(...v:unknown[]):unknown}}
 const Driver=createRequire(import.meta.url)("better-sqlite3") as {prototype:Native},prepare=Driver.prototype.prepare,c=cmd();let armed=false,lost=false;
 vi.spyOn(Driver.prototype,"prepare").mockImplementation(function(this:Native,sql:string){
  if(sql.startsWith("INSERT INTO sale_operations"))armed=true;const s=prepare.call(this,sql);
  if(armed&&!lost&&/^commit$/i.test(sql.trim())&&this.inTransaction){const run=s.run.bind(s);s.run=(...v)=>{const result=run(...v);if(!lost){lost=true;throw Error("TEST lost commit acknowledgement");}return result;};}return s;
 });
 const reply=await call("/api/pos/sales","SALESPERSON",staff,c);expect(lost).toBe(true);expect(reply.status).toBe(503);expect(reply.cookies).toEqual([]);vi.restoreAllMocks();
 const recovered=await call("/api/pos/sale-operations/"+c.requestKey,"SALESPERSON",staff,undefined,{headers:{"x-sales-context":context}});expect(recovered.status).toBe(200);expect(JSON.parse(recovered.body).state).toBe("COMMITTED");
 expect(JSON.parse((await call("/api/pos/sales","SALESPERSON",staff,c)).body).id).toBe(JSON.parse(recovered.body).receipt.id);
});
it("five wrong passwords enforce30 seconds over real HTTPS; correct password cannot bypass",async()=>{
 for(let i=0;i<5;i++)expect((await wire(config,"/api/auth/login","SALESPERSON",[],{password:"TEST wrong credential"})).status).not.toBe(200);
 expect((await wire(config,"/api/auth/login","SALESPERSON",[],{password:passwords.SALESPERSON})).status).not.toBe(200);
 await new Promise(resolve=>setTimeout(resolve,30050));const response=await wire(config,"/api/auth/login","SALESPERSON",[],{password:passwords.SALESPERSON});expect(response.status).toBe(200);staff=response.cookies;
});
it("logout denies stale signed cookie and restart preserves invoices but invalidates RAM sessions",async()=>{
 const r=await call("/api/pos/sales");expect(r.status).toBe(200);const count=JSON.parse(r.body).items.length,old=staff;expect((await wire(config,"/api/auth/logout","SALESPERSON",staff,{})).status).toBe(200);expect((await call("/api/pos/products","SALESPERSON",old)).status).toBe(403);
 staff=await login(config,"SALESPERSON");const prior=staff;await runtime.close();runtime=await startLocalRuntime(config);expect((await call("/api/pos/sales","SALESPERSON",prior)).status).toBe(403);staff=await login(config,"SALESPERSON");expect(JSON.parse((await call("/api/pos/sales")).body).items.length).toBe(count);
});
it("no generated credentials,cookies,signing keys or credential hashes in normal JSON",()=>{
 for(const value of [...sensitive,...credentialHashes])for(const r of replies)expect(r.includes(value)).toBe(false);
});
