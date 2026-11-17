import {beforeAll,test,expect} from "vitest";
import https from "node:https";
import net from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {initialize,material} from "../helpers/inventory-http-fixture";
import {createLocalHttpsHost} from "../../src/server/hosting/https";
import {renderReadOnlyResponse} from "../../src/server/hosting/read-only-response";
beforeAll(initialize);
async function unusedPort(){const server=net.createServer();await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const port=(server.address() as net.AddressInfo).port;await new Promise<void>(resolve=>server.close(()=>resolve()));return port;}
function incoming(port:number,url:string,method="GET"){const request=https.request({hostname:"localhost",family:4,servername:"localhost",port,path:url,method,agent:false,ca:material.trustAnchor,rejectUnauthorized:true,headers:{host:"localhost:"+port,origin:"https://localhost:"+port}});request.on("error",()=>{});request.end();return request;}
test("real TLS aborted public health render drains without retaining an unsettled Next read promise",async()=>{
 const port=await unusedPort(),origins={ADMIN:"https://localhost:"+port,SALESPERSON:"https://127.0.0.1:"+port};let entered!:()=>void,release!:()=>void;
 const admitted=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
 const host=createLocalHttpsHost(port,origins,material,(req,res)=>renderReadOnlyResponse(req,res,async()=>{entered();await held;}));await host.listen();
 const request=incoming(port,"/api/health");
 try{await admitted;request.destroy();await Promise.race([host.close(),delay(3000).then(()=>{throw Error("Dead read retained transport");})]);}
 finally{release();request.destroy();await host.close();}
});
test("real TLS aborted mutation transport still waits for the entire admitted business handler",async()=>{
 const port=await unusedPort(),origins={ADMIN:"https://localhost:"+port,SALESPERSON:"https://127.0.0.1:"+port};let entered!:()=>void,release!:()=>void,effect=false;
 const admitted=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
 const host=createLocalHttpsHost(port,origins,material,async()=>{},undefined,async(_req,res)=>{entered();await held;effect=true;if(!res.destroyed)res.end();});await host.listen();
 const request=incoming(port,"/api/admin/products","POST");
 try{await admitted;request.destroy();let closed=false;const closing=host.close().then(()=>{closed=true;});await delay(75);expect(closed).toBe(false);expect(effect).toBe(false);release();await closing;expect(effect).toBe(true);}
 finally{release();request.destroy();await host.close();}
});
test("real TLS open health response drains normally before host close resolves; repeated close is idempotent",async()=>{
 const port=await unusedPort(),origins={ADMIN:"https://localhost:"+port,SALESPERSON:"https://127.0.0.1:"+port};let entered!:()=>void,release!:()=>void;
 const admitted=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
 const host=createLocalHttpsHost(port,origins,material,(req,res)=>renderReadOnlyResponse(req,res,async()=>{entered();await held;res.end('{"ok":true}');}));await host.listen();
 const request=https.request({hostname:"localhost",family:4,servername:"localhost",port,path:"/api/health",agent:false,ca:material.trustAnchor,rejectUnauthorized:true});
 const response=new Promise<number>((resolve,reject)=>{request.on("response",res=>{res.resume();res.on("end",()=>resolve(res.statusCode!));});request.on("error",reject);});request.end();
 try{await admitted;let closed=false;const closing=host.close().then(()=>{closed=true;});await delay(75);expect(closed).toBe(false);release();expect(await response).toBe(200);await closing;await host.close();expect(closed).toBe(true);}
 finally{release();request.destroy();await host.close();}
});