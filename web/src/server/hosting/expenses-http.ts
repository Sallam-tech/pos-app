import "server-only";
import type {IncomingMessage,ServerResponse} from "node:http";
import type {AuthorizationGateway} from "../auth/types";
import type {LocalRequestContext} from "./https";
import {inventoryRequestHeaders,inventorySessionRequest} from "./inventory-http";
import {readSalesBody} from "./sales-http";
import {object,uuid,text} from "../inventory/validation";
import {createExpensesService,ExpenseError,type ExpenseKind} from "../expenses/service";
const id="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const detail=new RegExp("^/api/expenses/("+id+")$"),execute=new RegExp("^/api/(pos|admin)/expense-requests/("+id+")/execute$"),approve=new RegExp("^/api/admin/expense-requests/("+id+")/approve$"),status=new RegExp("^/api/expense-operations/("+id+")$"),recover=new RegExp("^/api/admin/expense-operations/("+id+")/recovery$");
const paths=["/api/expenses/context","/api/expenses/history","/api/expenses/summary","/api/pos/expense-requests","/api/admin/expense-requests","/api/admin/financial-summary"];
export const isExpensesApiPath=(raw:string)=>{const p=raw.split("?")[0];return paths.includes(p)||[detail,execute,approve,status,recover].some(x=>x.test(p));};
export function createExpensesDispatcher(gateway:AuthorizationGateway,schema:38|39=38){return async(req:IncomingMessage,res:ServerResponse,c:LocalRequestContext)=>{
 const send=(code:number,value:unknown)=>{if(res.destroyed||res.headersSent)return;res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",Connection:"close"});res.end(JSON.stringify(value));};
 if(!req.url||req.url.length>1024||req.url.includes("#")||!isExpensesApiPath(req.url)){send(404,{error:"Expense unavailable."});return;}
 const url=new URL(req.url,c.origin),p=url.pathname,role=p.startsWith("/api/admin/")?"ADMIN":p.startsWith("/api/pos/")?"SALESPERSON":c.role,mutate=req.method==="POST",methods=recover.test(p)||p==="/api/admin/expense-requests"?"GET, POST":execute.test(p)||approve.test(p)||p==="/api/pos/expense-requests"?"POST":"GET";
 if(!methods.split(", ").includes(req.method??"")){res.setHeader("Allow",methods);send(405,{error:"Expense unavailable."});return;}
 const bad=inventoryRequestHeaders(req,c,mutate,false,role,8192);if(bad){send(bad,{error:"Expense unavailable."});return;}
 const request=inventorySessionRequest(req,c),live=()=>{if(!c.isLive()||req.aborted||res.destroyed)throw Error();};
 const guarded:AuthorizationGateway={...gateway,withAdminTransaction:(r,w)=>gateway.withAdminTransaction(r,async(t,a)=>{live();const v=await w(t,a);live();return v;}),withSalespersonTransaction:(r,w)=>gateway.withSalespersonTransaction(r,async(t,a)=>{live();const v=await w(t,a);live();return v;}),withFreshAdminTransaction:(r,proof,w)=>gateway.withFreshAdminTransaction(r,proof,async(t,a)=>{live();const v=await w(t,a);live();return v;})};
 try{await(role==="ADMIN"?gateway.authorizeAdmin(request):gateway.authorizeSalesperson(request));}catch{send(403,{error:"Expense unavailable."});return;}
 const api=createExpensesService(guarded,schema);
 try{live();let result:unknown;const q=(keys:string[])=>{if([...url.searchParams.keys()].some(k=>!keys.includes(k)||url.searchParams.getAll(k).length!==1))throw new ExpenseError();return Object.fromEntries(url.searchParams);};const ctx=()=>{const h=req.headers["x-expense-context"];if(typeof h!=="string"||!/^[0-9a-f]{64}$/.test(h)||req.rawHeaders.filter((v,i)=>i%2===0&&v.toLowerCase()==="x-expense-context").length!==1)throw new ExpenseError();return h;};
 if(p==="/api/expenses/history"){const o=q(["from","to","query","cursor"]);result=await api.history(request,role,{...o,query:o.query??""});}
 else if(p==="/api/expenses/summary"){const o=q(["from","to"]);result=await api.summary(request,role,o.from,o.to);}
 else if(p==="/api/admin/financial-summary"){const o=q(["from","to","asOf"]);result=await api.financial(request,o.from,o.to,o.asOf);}
 else if(detail.test(p)){const o=q(["beforeRevision"]);result=await api.detail(request,role,detail.exec(p)![1],o.beforeRevision);}
 else{if(url.search)throw new ExpenseError();
 if(p==="/api/expenses/context")result=await api.context(request,role);
 else if(p==="/api/admin/expense-requests"&&!mutate)result=await api.requests(request);
 else if(["/api/admin/expense-requests","/api/pos/expense-requests"].includes(p)){const b=object(await readSalesBody(req,8192),["key","context","kind","input"],role==="ADMIN"?["password"]:[]);if(b.context!==(await api.context(request,role)).context)throw new ExpenseError("CONFLICT");result=await api.prepare(request,role,uuid(b.key),text(b.kind,8) as ExpenseKind,b.input,b.password);}
 else if(execute.test(p)){const b=object(await readSalesBody(req,8192),["context","confirmation","cashDate"]);if(b.context!==(await api.context(request,role)).context)throw new ExpenseError("CONFLICT");result=await api.execute(request,role,execute.exec(p)![2],text(b.confirmation,32),text(b.cashDate,10,true));}
 else if(approve.test(p)){const b=object(await readSalesBody(req,8192),["password"]);result=await api.approve(request,b.password,approve.exec(p)![1]);}
 else if(status.test(p))result=await api.status(request,role,status.exec(p)![1],ctx());
 else if(recover.test(p)){const key=recover.exec(p)![1],context=ctx();if(!mutate)result=await api.status(request,role,key,context);else{const b=object(await readSalesBody(req,8192),["password","resolution","evidence"],["cashDate","historicalAcknowledged"]);result=await api.recover(request,b.password,key,context,text(b.resolution,32),text(b.evidence,160),b.cashDate===undefined?"":text(b.cashDate,10,true),b.historicalAcknowledged===undefined?"NO":text(b.historicalAcknowledged,3));}}
 else throw new ExpenseError();}
 live();send((result as {state?:string})?.state==="UNKNOWN"?404:200,result);
 }catch(e){const code=e instanceof ExpenseError?e.code:(e as {code?:string})?.code==="INVALID_INPUT"?"INVALID_INPUT":"UNAVAILABLE";send(code==="INVALID_INPUT"?400:code==="CONFLICT"?409:code==="NOT_FOUND"?404:503,{error:"Expense unavailable.",code});}
};}