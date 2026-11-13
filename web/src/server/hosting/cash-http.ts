import "server-only";
import type {IncomingMessage,ServerResponse} from "node:http";
import type {AuthorizationGateway} from "../auth/types";
import type {LocalRequestContext} from "./https";
import {inventoryRequestHeaders,inventorySessionRequest} from "./inventory-http";
import {readSalesBody} from "./sales-http";
import {object,text,uuid} from "../inventory/validation";
import {createCashService,CashError,type CashAction} from "../cash/service";
const id="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const admission=new RegExp("^/api/counter-cash/admissions/("+id+")$"),closing=new RegExp("^/api/admin/closings/("+id+")$"),execute=new RegExp("^/api/admin/cash-actions/("+id+")/execute$"),operation=new RegExp("^/api/admin/cash-operations/("+id+")$"),recovery=new RegExp("^/api/admin/cash-operations/("+id+")/recovery$");
const paths=["/api/counter-cash/status","/api/counter-cash/admissions","/api/admin/cash/context","/api/admin/cash/overview","/api/admin/cash/summary","/api/admin/cash/history","/api/admin/closings","/api/admin/cash-actions"];
export const isCashApiPath=(raw:string)=>paths.includes(raw.split("?")[0])||[admission,closing,execute,operation,recovery].some(x=>x.test(raw.split("?")[0]));
export function createCashDispatcher(gateway:AuthorizationGateway,shopName?:string,schema:40|41=40){return async(req:IncomingMessage,res:ServerResponse,c:LocalRequestContext)=>{
 const send=(status:number,value:unknown)=>{if(res.destroyed||res.headersSent)return;res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",Connection:"close"});res.end(JSON.stringify(value));};
 if(!req.url||req.url.length>1024||req.url.includes("#")||!isCashApiPath(req.url)){send(404,{error:"Counter cash unavailable."});return;}
 const url=new URL(req.url,c.origin),p=url.pathname,role=p.startsWith("/api/admin/")?"ADMIN":c.role,post=["/api/counter-cash/admissions","/api/admin/cash-actions"].includes(p)||execute.test(p)||recovery.test(p);
 if(req.method!==(post?"POST":"GET")){res.setHeader("Allow",post?"POST":"GET");send(405,{error:"Counter cash unavailable."});return;}
 const bad=inventoryRequestHeaders(req,c,post,false,role,8192);if(bad){send(bad,{error:"Counter cash unavailable."});return;}
 const request=inventorySessionRequest(req,c),live=()=>{if(!c.isLive()||req.aborted||res.destroyed)throw Error();};
 try{await(role==="ADMIN"?gateway.authorizeAdmin(request):gateway.authorizeSalesperson(request));}catch{send(403,{error:"Counter cash unavailable."});return;}
 const guarded:AuthorizationGateway={...gateway,withAdminTransaction:(r,w)=>gateway.withAdminTransaction(r,async(tx,a)=>{live();const v=await w(tx,a);live();return v;}),withSalespersonTransaction:(r,w)=>gateway.withSalespersonTransaction(r,async(tx,a)=>{live();const v=await w(tx,a);live();return v;}),withFreshAdminTransaction:(r,proof,w)=>gateway.withFreshAdminTransaction(r,proof,async(tx,a)=>{live();const v=await w(tx,a);live();return v;})};
 try{
 const allowed=(p==="/api/admin/cash/summary"||p==="/api/admin/cash/overview")?["date","countId"]:p==="/api/admin/cash/history"?["from","to","cursor","kind","movementId"]:p==="/api/admin/closings"?["from","to","cursor"]:closing.test(p)?["before"]:admission.test(p)?["kind"]:[],seen=new Set<string>();
 for(const key of url.searchParams.keys()){if(!allowed.includes(key)||seen.has(key))throw new CashError();seen.add(key);}
 const api=createCashService(guarded,shopName,schema),param=(k:string)=>url.searchParams.get(k)??undefined,ctx=()=>{const v=req.headers["x-cash-context"];if(typeof v!=="string"||!/^[0-9a-f]{64}$/.test(v)||req.rawHeaders.filter((h,i)=>i%2===0&&h.toLowerCase()==="x-cash-context").length!==1)throw new CashError();return v;};
 let value:unknown;
 if(p==="/api/admin/cash/overview")value=await api.overview(request,param("date")??"",param("countId"));
 else if(p==="/api/counter-cash/status")value=await api.status(request,role);
 else if(p==="/api/counter-cash/admissions")value=await api.admit(request,role,await readSalesBody(req,8192));
 else if(admission.test(p))value=await api.admission(request,role,admission.exec(p)![1],param("kind"));
 else if(p==="/api/admin/cash/context")value=await api.context(request);
 else if(p==="/api/admin/cash/summary")value=await api.summary(request,param("date")??"",param("countId"));
 else if(p==="/api/admin/cash/history")value=await api.history(request,param("from")??"",param("to")??"",param("cursor"),param("kind"),param("movementId"));
 else if(p==="/api/admin/closings")value=await api.closings(request,param("from")??"",param("to")??"",param("cursor"));
 else if(closing.test(p))value=await api.closing(request,closing.exec(p)![1],param("before"));
 else if(p==="/api/admin/cash-actions"){const b=object(await readSalesBody(req,8192),["key","context","action","input","password"]);value=await api.prepare(request,b.password,uuid(b.key),text(b.context,64),text(b.action,24) as CashAction,b.input);}
 else if(execute.test(p)){const b=object(await readSalesBody(req,8192),["context","confirmation"]);value=await api.execute(request,execute.exec(p)![1],text(b.context,64),text(b.confirmation,40));}
 else if(operation.test(p))value=await api.operation(request,operation.exec(p)![1],ctx());
 else if(recovery.test(p)){const b=object(await readSalesBody(req,8192),["password","resolution","evidence"]);value=await api.recover(request,b.password,recovery.exec(p)![1],ctx(),text(b.resolution,32),text(b.evidence,160));}
 else throw new CashError();live();send((value as {state?:string})?.state==="UNKNOWN"?404:200,value);
 }catch(e){const code=e instanceof CashError?e.code:(e as {code?:string})?.code==="INVALID_INPUT"?"INVALID_INPUT":"UNAVAILABLE";send(code==="INVALID_INPUT"?400:code==="CONFLICT"?409:code==="NOT_FOUND"?404:503,{error:"Counter cash unavailable.",code});}
};}
