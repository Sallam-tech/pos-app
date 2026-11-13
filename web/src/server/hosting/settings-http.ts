import "server-only";
import type {IncomingMessage,ServerResponse} from "node:http";
import type {AuthorizationGateway} from "../auth/types";
import type {LocalRequestContext} from "./https";
import {inventoryRequestHeaders,inventorySessionRequest} from "./inventory-http";
import {readSalesBody} from "./sales-http";
import {object,text,uuid} from "../inventory/validation";
import {createSettingsService,settingsKind} from "../settings/service";
const id="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const op=new RegExp("^/api/admin/settings/operations/("+id+")$"),recover=new RegExp("^/api/admin/settings/operations/("+id+")/recovery$");
const paths=["/api/shop/name","/api/shop/settings","/api/admin/settings","/api/admin/settings/history","/api/admin/settings/password/ADMIN","/api/admin/settings/password/SALESPERSON"];
export const isSettingsApiPath=(raw:string)=>paths.includes(raw.split("?")[0])||op.test(raw.split("?")[0])||recover.test(raw.split("?")[0]);
export function createSettingsDispatcher(g:AuthorizationGateway,fallback:string){return async(req:IncomingMessage,res:ServerResponse,c:LocalRequestContext)=>{
 const send=(n:number,v:unknown)=>{if(res.destroyed||res.headersSent)return;res.writeHead(n,{"Content-Type":"application/json","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",Connection:"close"});res.end(JSON.stringify(v));};
 if(!req.url||req.url.length>1024||req.url.includes("#")||!isSettingsApiPath(req.url)){send(404,{error:"Settings unavailable."});return;}
 const url=new URL(req.url,c.origin),p=url.pathname,post=(p==="/api/admin/settings"&&req.method!=="GET")||p.includes("/password/")||recover.test(p),method=post?"POST":"GET";
 if(req.method!==method){res.setHeader("Allow",p==="/api/admin/settings"?"GET, POST":method);send(405,{error:"Settings unavailable."});return;}
 const role=p.startsWith("/api/admin/")?"ADMIN":c.role,bad=inventoryRequestHeaders(req,c,post,false,role,8192);if(bad){send(bad,{error:"Settings unavailable."});return;}
 const live=()=>{if(!c.isLive()||req.aborted||res.destroyed)throw Error();},request=inventorySessionRequest(req,c);
 try{
 const allowed=p==="/api/admin/settings/history"?["cursor"]:op.test(p)?["context","kind"]:[],seen=new Set<string>();for(const k of url.searchParams.keys()){if(!allowed.includes(k)||seen.has(k))throw Error();seen.add(k);}
 if(p==="/api/shop/name"){live();const name=await g.publicShopName();live();send(200,{shopName:name??fallback});return;}
 await(role==="ADMIN"?g.authorizeAdmin(request):g.authorizeSalesperson(request));
 const guarded:AuthorizationGateway={...g,withAdminTransaction:(r,w)=>g.withAdminTransaction(r,async(tx,a)=>{live();const v=await w(tx,a);live();return v;}),withSalespersonTransaction:(r,w)=>g.withSalespersonTransaction(r,async(tx,a)=>{live();const v=await w(tx,a);live();return v;}),withFreshAdminTransaction:(r,proof,w)=>g.withFreshAdminTransaction(r,proof,async(tx,a)=>{live();const v=await w(tx,a);live();return v;}),
 rotateAdminPassword:async(r,proof,pw,key)=>{live();await g.rotateAdminPassword(r,proof,pw,key);live();},rotateSalespersonPassword:async(r,proof,pw,key)=>{live();await g.rotateSalespersonPassword(r,proof,pw,key);live();}};
 const api=createSettingsService(guarded,fallback);let value:unknown;
 if(p==="/api/shop/settings"||p==="/api/admin/settings"&&!post)value=await api.current(request,role);
 else if(p==="/api/admin/settings/history")value=await api.history(request,url.searchParams.get("cursor")??undefined);
 else if(op.test(p))value=await api.operation(request,uuid(op.exec(p)![1]),text(url.searchParams.get("context"),64),settingsKind(url.searchParams.get("kind")));
 else if(recover.test(p)){const b=object(await readSalesBody(req,8192),["password","context","kind","evidence"]);value=await api.cancel(request,b.password,recover.exec(p)![1],text(b.context,64),settingsKind(b.kind),text(b.evidence,160));}
 else if(p==="/api/admin/settings"){const b=object(await readSalesBody(req,8192),["key","context","password","input"]);value=await api.save(request,b.password,uuid(b.key),text(b.context,64),b.input);}
 else if(p.includes("/password/")){const b=object(await readSalesBody(req,8192),["key","context","password","newPassword"]);value=await api.password(request,b.password,uuid(b.key),text(b.context,64),p.endsWith("/ADMIN")?"ADMIN":"SALESPERSON",b.newPassword);}
 else throw Error();live();send(200,value);
 }catch(e){send((e as {code?:string})?.code==="AUTHORIZATION_DENIED"?403:(e as {code?:string})?.code==="INVALID_INPUT"?400:503,{error:"Settings unavailable."});}
};}
