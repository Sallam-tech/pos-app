import "server-only";
import type {IncomingMessage,ServerResponse} from "node:http";
import type {AuthorizationGateway} from "../auth/types";
import type {LocalRequestContext} from "./https";
import {inventoryRequestHeaders,inventorySessionRequest} from "./inventory-http";
import {createSalesService} from "../sales/service";
import {SaleError} from "../sales/calculations";
const id="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const invoice=new RegExp("^/api/pos/sales/("+id+")$"),operation=new RegExp("^/api/pos/sale-operations/("+id+")$"),recovery=new RegExp("^/api/admin/sale-operations/("+id+")/recovery$");
export const isSalesApiPath=(raw:string)=>{const p=raw.split("?")[0];return ["/api/pos/products","/api/pos/sales/context","/api/pos/sales"].includes(p)||invoice.test(p)||operation.test(p)||recovery.test(p);};
// Bounded strict JSON: text/null/arrays/objects only. Duplicate or escaped keys,
// numbers, booleans, dangerous nesting and extra members cannot disappear in JSON.parse.
export function salesJson(raw:string):unknown{
 let i=0,nodes=0;const ws=()=>{while(/[ \t\r\n]/.test(raw[i]??"")&&i<raw.length)i++;};
 const string=()=>{const start=i++;while(i<raw.length){const c=raw[i++];if(c==="\\"){i++;continue;}if(c==='"')return JSON.parse(raw.slice(start,i)) as string;}throw Error();};
 const value=(depth:number):unknown=>{
  ws();if(depth>4||++nodes>600)throw Error();
  if(raw[i]==='"')return string();
  if(raw.startsWith("null",i)){i+=4;return null;}
  const array=raw[i]==="[",object=raw[i]==="{";
  if(!array&&!object)throw Error();i++;ws();const a:unknown[]=[],o:Record<string,unknown>=Object.create(null),keys=new Set<string>();
  if(raw[i]===(array?"]":"}")){i++;return array?a:o;}
  for(;;){if(array){a.push(value(depth+1));if(a.length>50)throw Error();}
   else{ws();const start=i;if(raw[i]!=='"')throw Error();const k=string();if(raw.slice(start,i).includes("\\")||!/^[A-Za-z][A-Za-z0-9]*$/.test(k)||keys.has(k)||keys.size>=16)throw Error();keys.add(k);ws();if(raw[i++]!==":")throw Error();o[k]=value(depth+1);}
   ws();if(raw[i]===(array?"]":"}")){i++;return array?a:o;}if(raw[i++]!==",")throw Error();
  }
 };const result=value(0);ws();if(i!==raw.length)throw Error();return result;
}
export function readSalesBody(req:IncomingMessage,limit=65536):Promise<unknown>{
 return new Promise((resolve,reject)=>{let bytes=0,done=false;const chunks:Buffer[]=[];
  const finish=(bad=false)=>{if(done)return;done=true;clearTimeout(timer);req.removeListener("data",data);req.removeListener("end",end);req.removeListener("aborted",abort);req.removeListener("error",abort);let b:Buffer|undefined;try{if(bad){req.pause();throw Error();}b=Buffer.concat(chunks,bytes);resolve(salesJson(new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(b)));}catch{reject(new SaleError("INVALID_INPUT"));}finally{b?.fill(0);chunks.forEach(c=>c.fill(0));}};
  const data=(c:Buffer)=>{bytes+=c.length;if(bytes>limit)finish(true);else chunks.push(Buffer.from(c));},end=()=>finish(),abort=()=>finish(true),timer=setTimeout(abort,5000);timer.unref();
  req.on("data",data);req.once("end",end);req.once("aborted",abort);req.once("error",abort);if(req.aborted)abort();
 });
}
export function createSalesDispatcher(gateway:AuthorizationGateway,shopName:string,schema:36|37|38|39|40=36){
 return async(req:IncomingMessage,res:ServerResponse,context:LocalRequestContext)=>{
  const send=(status:number,data:unknown)=>{if(res.destroyed||res.headersSent)return;res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",Connection:"close"});res.end(JSON.stringify(data));};
  if(!req.url||req.url.length>1024||req.url.includes("#")||!isSalesApiPath(req.url)){send(404,{error:"Sale unavailable."});return;}
  const url=new URL(req.url,context.origin),admin=recovery.exec(url.pathname),mutate=req.method==="POST",allowed=url.pathname==="/api/pos/sales"?"GET, POST":admin?"GET, POST":"GET";
  if(!allowed.split(", ").includes(req.method??"")){res.setHeader("Allow",allowed);send(405,{error:"Sale unavailable."});return;}
  const bad=inventoryRequestHeaders(req,context,mutate,false,admin?"ADMIN":"SALESPERSON",65536);if(bad){send(bad,{error:"Sale unavailable."});return;}
  const session=inventorySessionRequest(req,context);
  const live=()=>{if(!context.isLive()||req.aborted||res.destroyed)throw Error();};
  // Recheck liveness inside the SAME admitted business transaction, before and after work.
  const guarded:AuthorizationGateway={...gateway,
   withAdminTransaction:(r,w)=>gateway.withAdminTransaction(r,async(tx,a)=>{live();const v=await w(tx,a);live();return v;}),
   withSalespersonTransaction:(r,w)=>gateway.withSalespersonTransaction(r,async(tx,a)=>{live();const v=await w(tx,a);live();return v;})};
  const api=createSalesService(guarded,shopName,schema);
  try{live();await(admin?gateway.authorizeAdmin(session):gateway.authorizeSalesperson(session));}catch{send(403,{error:"Sale unavailable."});return;}
  try{
   let result:unknown;
   const key=admin?.[1]??operation.exec(url.pathname)?.[1],inv=invoice.exec(url.pathname)?.[1];
   if(key){const expected=req.headers["x-sales-context"];if(typeof expected!=="string"||!/^[0-9a-f]{64}$/.test(expected)||req.rawHeaders.filter((x,i)=>i%2===0&&x.toLowerCase()==="x-sales-context").length!==1||url.search)throw new SaleError();
    if(mutate){const v=salesJson(JSON.stringify(await readSalesBody(req)));if(!v||typeof v!=="object"||Array.isArray(v)||Object.keys(v).length)throw new SaleError();}
    result=admin?await api.recovery(session,key,expected,mutate):await api.operation(session,key,expected);
   }else if(inv){if(url.search)throw new SaleError();result=await api.get(session,inv);}
   else if(url.pathname==="/api/pos/sales/context"){if(url.search)throw new SaleError();result=await api.context(session);}
   else if(url.pathname==="/api/pos/products"){if([...url.searchParams.keys()].some(k=>k!=="query")||url.searchParams.getAll("query").length>1)throw new SaleError();result=await api.catalog(session,url.searchParams.get("query")??"");}
   else if(mutate){if(url.search)throw new SaleError();result=await api.create(session,await readSalesBody(req));}
   else{if([...url.searchParams.keys()].some(k=>!["cursor","query"].includes(k))||url.searchParams.getAll("cursor").length>1||url.searchParams.getAll("query").length>1)throw new SaleError();result=await api.history(session,url.searchParams.get("cursor")??undefined,url.searchParams.get("query")??"");}
   live();send((result as {state?:string})?.state==="UNKNOWN"?404:200,result);
  }catch(e){const code=e instanceof SaleError?e.code:"UNAVAILABLE";send(code==="NOT_FOUND"?404:code==="CONFLICT"||code==="PRICE_NOT_ALLOWED"?409:code==="INVALID_INPUT"?400:503,{error:"Sale unavailable.",code});}
 };
}
