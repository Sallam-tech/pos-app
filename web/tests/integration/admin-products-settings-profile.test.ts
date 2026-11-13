import {test,expect,vi} from "vitest";
import {retainedBook,Driver,hash,save} from "../helpers/admin-products-settings-volume";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {createCashService} from "../../src/server/cash/service";
import {createInvoicesService} from "../../src/server/invoices/service";
import type {Raw} from "../helpers/reports-volume";
test("profile full cash and invoice validation on retained1k/10k/50k TEST copies; preserve sources",async()=>{
 const label=process.env.SHOP_POS_PROFILE_PASS??"before",metrics:unknown[]=[];
 for(const n of [1000,10000,50000])for(const kind of ["expense","invoice"] as const){
  const f=await retainedBook(kind,n),schema=kind==="expense"?40:39,g=await openAuthorizationGateway(f.config.authorization,schema);
  try{const role="ADMIN" as const,password=f.adminPassword,proof=await(role==="ADMIN"?g.verifyAdminPassword(password):g.verifySalespersonPassword(password)),session=await(role==="ADMIN"?g.issueAdminSession(proof):g.issueSalespersonSession(proof)),request=new Request(f.config.authorization.origins[role]+"/profile",{headers:{cookie:session.headers.getSetCookie().map(v=>v.split(";")[0]).join("; "),origin:f.config.authorization.origins[role]}});
   const stats=new Map<string,{sql:string;calls:number;ms:number}>(),prototype=Driver.prototype as Raw,prepare=prototype.prepare;
   vi.spyOn(prototype,"prepare").mockImplementation(function(this:Raw,sql:string){const statement=prepare.call(this,sql),methods=statement as unknown as Record<"get"|"all",(...values:unknown[])=>unknown>;for(const method of ["get","all"] as const){const original=methods[method].bind(statement);methods[method]=((...values:unknown[])=>{const t=performance.now();try{return original(...values);}finally{const item=stats.get(sql)??{sql,calls:0,ms:0};item.calls++;item.ms+=performance.now()-t;stats.set(sql,item);}});}return statement;});
   const t=performance.now();if(kind==="expense"){const v=await createCashService(g).summary(request,f.date);expect(v.financial.expensesPaisa).toBe((BigInt(n)*BigInt(10000)).toString());expect(v.currentExpectedPaisa).toBeNull();}else{const v=await createInvoicesService(g).history(request,{from:"2000-01-01",to:"2099-12-31",query:""});expect(v.items.length).toBeGreaterThan(0);}const elapsedMs=performance.now()-t,queries=[...stats.values()].sort((a,b)=>b.ms-a.ms);metrics.push({records:n,kind,elapsedMs,sqlMs:queries.reduce((v,q)=>v+q.ms,0),sqlCalls:queries.reduce((v,q)=>v+q.calls,0),top:queries.slice(0,16)});save("profile-"+label,metrics);vi.restoreAllMocks();
  }finally{vi.restoreAllMocks();await g.close();}expect(hash(f.source)).toBe(f.sourceHash);
 }
},900000);
