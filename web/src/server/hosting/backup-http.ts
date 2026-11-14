import "server-only";
import type {IncomingMessage,ServerResponse} from "node:http";
import type {AuthorizationGateway} from "../auth/types";
import type {DatabaseOptions} from "../db/location";
import type {LocalRequestContext} from "./https";
import {inventoryRequestHeaders,inventorySessionRequest} from "./inventory-http";
import {readSalesBody} from "./sales-http";
import {object,uuid} from "../inventory/validation";
import {inspectTestSchema41Readiness} from "../backup/readiness";
import {createTestIsolatedRestore,type TestBackupWorker,type TestBackupConfiguration} from "../backup/worker";
const id="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const job=new RegExp("^/api/admin/backups/jobs/("+id+")$");
const paths=["/api/admin/backups/status","/api/admin/backups/manual","/api/admin/backups/export","/api/admin/backups/readiness","/api/admin/backups/restore"];
export const isBackupApiPath=(raw:string)=>paths.includes(raw.split("?")[0])||job.test(raw.split("?")[0]);
export function createBackupDispatcher(g:AuthorizationGateway,database:DatabaseOptions,worker?:TestBackupWorker,configuration?:TestBackupConfiguration){return async(req:IncomingMessage,res:ServerResponse,c:LocalRequestContext)=>{
 const send=(status:number,value:unknown)=>{if(res.destroyed||res.headersSent)return;res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",Connection:"close"});res.end(JSON.stringify(value));};
 if(!req.url||req.url.length>200||req.url.includes("?")||req.url.includes("#")||!isBackupApiPath(req.url)){send(404,{error:"Backup unavailable."});return;}
 const p=req.url,post=p.endsWith("/manual")||p.endsWith("/export")||p.endsWith("/restore");
 if(req.method!==(post?"POST":"GET")){res.setHeader("Allow",post?"POST":"GET");send(405,{error:"Backup unavailable."});return;}
 const bad=inventoryRequestHeaders(req,c,post,false,"ADMIN",2048);if(bad){send(bad,{error:"Backup unavailable."});return;}
 const request=inventorySessionRequest(req,c),live=()=>{if(!c.isLive()||req.aborted||res.destroyed)throw Error();};
 try{
  live();await g.authorizeAdmin(request);live();
  if(p.endsWith("/readiness")){const value=await inspectTestSchema41Readiness(database);live();send(200,value);return;}
  if(p.endsWith("/status")){send(200,worker?worker.status():{configured:false,productionActivation:false,cloud:"NOT_CONFIGURED"});return;}
  if(!worker)throw Error();
  if(job.test(p)){send(200,worker.job(uuid(job.exec(p)![1])));return;}
  const b=object(await readSalesBody(req,2048),!p.endsWith("/manual")?["key","archiveId","password"]:["key","password"]);
  const key=uuid(b.key),archiveId=!p.endsWith("/manual")?uuid(b.archiveId):undefined,proof=await g.verifyAdminPassword(b.password);
  await g.withFreshAdminTransaction(request,proof,async()=>{live();});
  live();if(p.endsWith("/restore")){if(!configuration||!archiveId)throw Error();const value=await createTestIsolatedRestore(configuration,worker,g,request,b.password,key,archiveId);live();send(200,value);return;}
  const result=archiveId?await worker.export(key,archiveId):await worker.manual(key);
  live();send(202,result);
 }catch(e){send((e as {code?:string})?.code==="AUTHORIZATION_DENIED"?403:(e as {code?:string})?.code==="INVALID_INPUT"?400:503,{error:"Backup unavailable."});}
};}
