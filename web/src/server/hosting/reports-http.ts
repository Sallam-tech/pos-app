import "server-only";
import type {IncomingMessage,ServerResponse} from "node:http";
import type {AuthorizationGateway} from "../auth/types";
import type {LocalRequestContext} from "./https";
import {inventoryRequestHeaders,inventorySessionRequest} from "./inventory-http";
import {createReportsService,ReportError} from "../reports/service";
const detail=/^\/api\/admin\/reports\/products\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
const paths=["/api/admin/reports/overview","/api/admin/reports/products","/api/admin/reports/stock","/api/admin/reports/expenses"];
export const isReportsApiPath=(raw:string)=>paths.includes(raw.split("?")[0])||detail.test(raw.split("?")[0]);
export function createReportsDispatcher(gateway:AuthorizationGateway,schema:39|40=39){return async(req:IncomingMessage,res:ServerResponse,c:LocalRequestContext)=>{
 const send=(status:number,value:unknown)=>{if(res.headersSent||res.destroyed)return;res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",Connection:"close"});res.end(JSON.stringify(value));};
 if(!req.url||req.url.length>1024||req.url.includes("#")||!isReportsApiPath(req.url)){send(404,{error:"Report unavailable."});return;}
 if(req.method!=="GET"){res.setHeader("Allow","GET");send(405,{error:"Report unavailable."});return;}
 const bad=inventoryRequestHeaders(req,c,false,false,"ADMIN");if(bad){send(bad,{error:"Report unavailable."});return;}
 const request=inventorySessionRequest(req,c),live=()=>{if(!c.isLive()||req.aborted||res.destroyed)throw Error();};
 try{await gateway.authorizeAdmin(request);}catch{send(403,{error:"Report unavailable."});return;}
 const guarded:AuthorizationGateway={...gateway,withAdminTransaction:(r,w)=>gateway.withAdminTransaction(r,async(tx,a)=>{live();const v=await w(tx,a);live();return v;})};
 try{const url=new URL(req.url,c.origin),p=url.pathname,keys=["from","to","asOf","snapshot","query","cursor","catalog",...(detail.test(p)?["tab"]:[])],seen=new Set<string>();for(const key of url.searchParams.keys()){if(!keys.includes(key)||seen.has(key))throw new ReportError();seen.add(key);}const input=Object.fromEntries(url.searchParams),tab=input.tab;delete input.tab;const api=createReportsService(guarded,schema);let result:unknown;
 if(p==="/api/admin/reports/overview")result=await api.overview(request,input);
 else if(p==="/api/admin/reports/products")result=await api.products(request,input);
 else if(p==="/api/admin/reports/stock")result=await api.stock(request,input);
 else if(p==="/api/admin/reports/expenses")result=await api.expenses(request,input);
 else if(detail.test(p))result=await api.product(request,detail.exec(p)![1],input,tab);else throw new ReportError();
 live();send(200,result);
 }catch(e){const code=e instanceof ReportError?e.code:(e as {code?:string})?.code==="INVALID_INPUT"?"INVALID_INPUT":"UNAVAILABLE";send(code==="INVALID_INPUT"?400:code==="CONFLICT"?409:code==="NOT_FOUND"?404:503,{error:"Report unavailable.",code});}
};}
