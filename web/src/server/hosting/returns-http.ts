import "server-only";
import type {IncomingMessage,ServerResponse} from "node:http";
import type {AuthorizationGateway} from "../auth/types";
import type {LocalRequestContext} from "./https";
import {inventoryRequestHeaders,inventorySessionRequest} from "./inventory-http";
import {readSalesBody} from "./sales-http";
import {object,uuid,text} from "../inventory/validation";
import {createReturnsService,ReturnError} from "../returns/service";
const id="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const execution=new RegExp("^/api/pos/returns/("+id+")/execute$"),status=new RegExp("^/api/pos/return-operations/("+id+")$"),approval=new RegExp("^/api/admin/returns/requests/("+id+")/approve$"),detail=new RegExp("^/api/admin/returns/("+id+")$"),disposition=new RegExp("^/api/admin/returns/("+id+")/dispositions$"),recovery=new RegExp("^/api/admin/return-operations/("+id+")/recovery$");
const paths=["/api/returns/context","/api/returns/invoices","/api/returns/quote","/api/pos/returns/requests","/api/admin/returns/requests","/api/admin/returns"];
export const isReturnsApiPath=(raw:string)=>{const p=raw.split("?")[0];return paths.includes(p)||[execution,status,approval,detail,disposition,recovery].some(x=>x.test(p));};
export function createReturnsDispatcher(gateway:AuthorizationGateway,schema:37|38|39|40=37){
 return async(req:IncomingMessage,res:ServerResponse,c:LocalRequestContext)=>{
  const send=(code:number,value:unknown)=>{if(res.destroyed||res.headersSent)return;res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",Connection:"close"});res.end(JSON.stringify(value));};
  if(!req.url||req.url.length>1024||req.url.includes("#")||!isReturnsApiPath(req.url)){send(404,{error:"Return unavailable."});return;}
  const url=new URL(req.url,c.origin),p=url.pathname,isAdmin=p.startsWith("/api/admin/"),role=isAdmin?"ADMIN":p.startsWith("/api/pos/")?"SALESPERSON":c.role,mutate=req.method==="POST";
  const methods=recovery.test(p)||p==="/api/admin/returns"?"GET, POST":execution.test(p)||approval.test(p)||disposition.test(p)||p==="/api/returns/quote"||p==="/api/pos/returns/requests"?"POST":"GET";
  if(!methods.split(", ").includes(req.method??"")){res.setHeader("Allow",methods);send(405,{error:"Return unavailable."});return;}
  const bad=inventoryRequestHeaders(req,c,mutate,false,role,65536);if(bad){send(bad,{error:"Return unavailable."});return;}
  const request=inventorySessionRequest(req,c),live=()=>{if(!c.isLive()||req.aborted||res.destroyed)throw Error();};
  const guarded:AuthorizationGateway={...gateway,
   withAdminTransaction:(r,w)=>gateway.withAdminTransaction(r,async(t,a)=>{live();const v=await w(t,a);live();return v;}),
   withSalespersonTransaction:(r,w)=>gateway.withSalespersonTransaction(r,async(t,a)=>{live();const v=await w(t,a);live();return v;}),
   withFreshAdminTransaction:(r,proof,w)=>gateway.withFreshAdminTransaction(r,proof,async(t,a)=>{live();const v=await w(t,a);live();return v;})};
  const api=createReturnsService(guarded,schema);
  try{live();await(role==="ADMIN"?gateway.authorizeAdmin(request):gateway.authorizeSalesperson(request));}catch{send(403,{error:"Return unavailable."});return;}
  try{
   const getContext=()=>{const h=req.headers["x-return-context"];if(typeof h!=="string"||!/^[0-9a-f]{64}$/.test(h)||req.rawHeaders.filter((v,i)=>i%2===0&&v.toLowerCase()==="x-return-context").length!==1)throw new ReturnError();return h;};
   if(p!=="/api/returns/invoices"&&!(p==="/api/admin/returns"&&!mutate)&&url.search)throw new ReturnError();let result:unknown;
   if(p==="/api/returns/context")result=await api.context(request,role);
   else if(p==="/api/returns/invoices"){if([...url.searchParams.keys()].some(k=>!["query","cursor"].includes(k))||url.searchParams.getAll("query").length>1||url.searchParams.getAll("cursor").length>1)throw new ReturnError();result=await api.invoices(request,role,url.searchParams.get("query")??"",url.searchParams.get("cursor")??undefined);}
   else if(p==="/api/returns/quote")result=await api.quote(request,role,await readSalesBody(req));
   else if(p==="/api/pos/returns/requests"){const b=object(await readSalesBody(req),["requestKey","context","input"]);if(b.context!==(await api.context(request,role)).context)throw new ReturnError("CONFLICT");result=await api.prepareSalesperson(request,uuid(b.requestKey),b.input);}
   else if(execution.test(p)){const b=object(await readSalesBody(req),["confirmation","cashDate"]);result=await api.executeSalesperson(request,execution.exec(p)![1],String(b.confirmation),String(b.cashDate));}
   else if(status.test(p))result=await api.status(request,role,status.exec(p)![1],getContext());
   else if(p==="/api/admin/returns/requests")result=await api.requests(request);
   else if(approval.test(p)){const b=object(await readSalesBody(req),["password","decision"]);result=await api.approve(request,b.password,approval.exec(p)![1],String(b.decision));}
   else if(p==="/api/admin/returns"&&mutate){const b=object(await readSalesBody(req),["action","requestKey"],["password","input","confirmation","cashDate","context"]);if(b.action==="PREPARE"){if(b.context!==(await api.context(request,"ADMIN")).context)throw new ReturnError("CONFLICT");result=await api.prepareAdmin(request,b.password,uuid(b.requestKey),b.input);}else if(b.action==="EXECUTE")result=await api.executeAdmin(request,uuid(b.requestKey),String(b.confirmation),String(b.cashDate));else throw new ReturnError();}
   else if(p==="/api/admin/returns"){if([...url.searchParams.keys()].some(k=>k!=="cursor")||url.searchParams.getAll("cursor").length>1)throw new ReturnError();result=await api.list(request,url.searchParams.get("cursor")??undefined);}
   else if(detail.test(p))result=await api.detail(request,detail.exec(p)![1]);
   else if(disposition.test(p)){const b=object(await readSalesBody(req),["password","requestKey","lines","context"]);if(b.context!==(await api.context(request,"ADMIN")).context)throw new ReturnError("CONFLICT");result=await api.dispose(request,b.password,uuid(b.requestKey),{returnId:disposition.exec(p)![1],lines:b.lines});}
   else if(recovery.test(p)){const key=recovery.exec(p)![1],ctx=getContext();if(!mutate)result=await api.status(request,"ADMIN",key,ctx);else{const b=object(await readSalesBody(req),["password","resolution"],["cashDate","kind"]);if(b.kind!==undefined&&b.kind!=="REFUND"&&b.kind!=="DISPOSITION")throw new ReturnError();result=await api.recover(request,b.password,key,ctx,text(b.resolution,32),b.cashDate===undefined?"":text(b.cashDate,10),b.kind as "REFUND"|"DISPOSITION"|undefined);}}
   else throw new ReturnError();
   live();send((result as {state?:string})?.state==="UNKNOWN"?404:200,result);
  }catch(e){const code=e instanceof ReturnError?e.code:(e as {code?:string})?.code==="INVALID_INPUT"?"INVALID_INPUT":"UNAVAILABLE";send(code==="INVALID_INPUT"?400:code==="CONFLICT"?409:code==="NOT_FOUND"?404:503,{error:"Return unavailable.",code});}
 };
}
