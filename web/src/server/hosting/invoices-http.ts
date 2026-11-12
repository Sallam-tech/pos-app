import "server-only";
import type {IncomingMessage,ServerResponse} from "node:http";
import type {AuthorizationGateway} from "../auth/types";
import type {LocalRequestContext} from "./https";
import {inventoryRequestHeaders,inventorySessionRequest} from "./inventory-http";
import {readSalesBody} from "./sales-http";
import {object,text,uuid} from "../inventory/validation";
import {createInvoicesService,InvoiceError} from "../invoices/service";
const id="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",detail=new RegExp("^/api/admin/invoices/("+id+")$"),receipt=new RegExp("^/api/invoices/("+id+")/receipts$"),operation=new RegExp("^/api/admin/invoice-operations/("+id+")$"),execute=new RegExp("^/api/admin/invoice-requests/("+id+")/execute$"),recovery=new RegExp("^/api/admin/invoice-operations/("+id+")/recovery$");
const paths=["/api/admin/invoices/context","/api/admin/invoices/history","/api/admin/invoices/quote","/api/admin/invoice-requests"];
export const isInvoicesApiPath=(raw:string)=>{const p=raw.split("?")[0];return paths.includes(p)||[detail,receipt,operation,execute,recovery].some(x=>x.test(p));};
export function createInvoicesDispatcher(gateway:AuthorizationGateway){return async(req:IncomingMessage,res:ServerResponse,c:LocalRequestContext)=>{
 const send=(code:number,value:unknown)=>{if(res.destroyed||res.headersSent)return;res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",Connection:"close"});res.end(JSON.stringify(value));};
 if(!req.url||req.url.length>1024||req.url.includes("#")||!isInvoicesApiPath(req.url)){send(404,{error:"Invoice unavailable."});return;}
 const url=new URL(req.url,c.origin),p=url.pathname,role=receipt.test(p)?c.role:"ADMIN",mutate=req.method==="POST",methods=p==="/api/admin/invoice-requests"?"GET, POST":execute.test(p)||recovery.test(p)||p==="/api/admin/invoices/quote"?"POST":"GET";
 if(!methods.split(", ").includes(req.method??"")){res.setHeader("Allow",methods);send(405,{error:"Invoice unavailable."});return;}
 const bad=inventoryRequestHeaders(req,c,mutate,false,role,65536);if(bad){send(bad,{error:"Invoice unavailable."});return;}
 const request=inventorySessionRequest(req,c),live=()=>{if(!c.isLive()||req.aborted||res.destroyed)throw Error();};
 const guarded:AuthorizationGateway={...gateway,withAdminTransaction:(r,w)=>gateway.withAdminTransaction(r,async(t,a)=>{live();const v=await w(t,a);live();return v;}),withSalespersonTransaction:(r,w)=>gateway.withSalespersonTransaction(r,async(t,a)=>{live();const v=await w(t,a);live();return v;}),withFreshAdminTransaction:(r,proof,w)=>gateway.withFreshAdminTransaction(r,proof,async(t,a)=>{live();const v=await w(t,a);live();return v;})};
 const api=createInvoicesService(guarded),ctx=()=>{const v=req.headers["x-invoice-context"];if(typeof v!=="string"||!/^[0-9a-f]{64}$/.test(v))throw new InvoiceError();return v;};
 try{try{await (role==="ADMIN"?gateway.authorizeAdmin(request):gateway.authorizeSalesperson(request));}catch{send(403,{error:"Invoice unavailable."});return;}const allowed=p==="/api/admin/invoices/history"?["from","to","query","cursor"]:detail.test(p)?["before"]:[];const seen=new Set<string>();for(const k of url.searchParams.keys()){if(!allowed.includes(k)||seen.has(k))throw new InvoiceError();seen.add(k);}let result:unknown;
 if(p==="/api/admin/invoices/context")result=await api.context(request);
 else if(p==="/api/admin/invoices/history")result=await api.history(request,{from:url.searchParams.get("from"),to:url.searchParams.get("to"),query:url.searchParams.get("query")??"",...(url.searchParams.has("cursor")?{cursor:url.searchParams.get("cursor")}: {})});
 else if(detail.test(p))result=await api.detail(request,detail.exec(p)![1],url.searchParams.get("before")??undefined);
 else if(receipt.test(p))result=await api.receipt(request,role,receipt.exec(p)![1]);
 else if(p==="/api/admin/invoices/quote"){const b=object(await readSalesBody(req),["input"]);result=await api.quote(request,b.input);}
 else if(p==="/api/admin/invoice-requests"){if(!mutate)result=await api.requests(request);else{const b=object(await readSalesBody(req),["key","context","password","input"]);result=await api.prepare(request,b.password,uuid(b.key),text(b.context,64),b.input);}}
 else if(operation.test(p))result=await api.status(request,operation.exec(p)![1],ctx());
 else if(execute.test(p)){const b=object(await readSalesBody(req),["context","confirmation","effectiveDate"]);result=await api.execute(request,execute.exec(p)![1],text(b.context,64),text(b.confirmation,40),text(b.effectiveDate,10));}
 else if(recovery.test(p)){const b=object(await readSalesBody(req),["password","resolution","evidence"],["facts"]);result=await api.recover(request,b.password,recovery.exec(p)![1],ctx(),text(b.resolution,32),text(b.evidence,160),b.facts);}
 else throw new InvoiceError();live();send((result as {state?:string})?.state==="UNKNOWN"?404:200,result);
 }catch(e){const code=e instanceof InvoiceError?e.code:(e as {code?:string})?.code==="INVALID_INPUT"?"INVALID_INPUT":"UNAVAILABLE";send(code==="INVALID_INPUT"?400:code==="CONFLICT"?409:code==="NOT_FOUND"?404:503,{error:"Invoice unavailable.",code});}
};}
