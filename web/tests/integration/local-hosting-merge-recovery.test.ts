import {beforeAll,expect,test,vi} from "vitest";
import {createServer} from "node:net";
import {once} from "node:events";
import path from "node:path";
import type {AuthorizationGateway} from "../../src/server/auth/types";
import {seed,gateway,passwords} from "../helpers/admin-products-settings-fixture";
import {wire} from "../helpers/inventory-http-fixture";
import {startLocalRuntime} from "../../src/server/hosting/runtime";
import {fingerprint,openProofDatabase} from "../../src/server/backup/snapshot";

const observed=vi.hoisted(()=>({failPrepare:false,gateways:[] as AuthorizationGateway[]}));
vi.mock("../../src/server/auth/gateway",async original=>{
 const actual=await original<typeof import("../../src/server/auth/gateway")>();
 return {...actual,openAuthorizationGateway:async(...args:Parameters<typeof actual.openAuthorizationGateway>)=>{
  const g=await actual.openAuthorizationGateway(...args);observed.gateways.push(g);return g;
 }};
});
vi.mock("next",async original=>{
 const actual=await original<typeof import("next")>();
 return {...actual,default:(options:Parameters<typeof actual.default>[0])=>{
  const app=actual.default(options),prepare=app.prepare.bind(app);
  app.prepare=async()=>{await prepare();if(observed.failPrepare)throw Error("TEST injected preparation failure");};
  return app;
 }};
});
beforeAll(seed);

test("parallel Next startup failures close authorization, retain SQLite, and release ownership for a verified HTTPS restart",async()=>{
 const f=await gateway();await f.g.close();
 const filename=path.join(f.config.database.directory,f.config.database.filename);
 const snapshot=()=>{const db=openProofDatabase(filename);try{return fingerprint(db);}finally{db.close();}};
 const before=snapshot(),listeners=process.listeners("uncaughtException");
 const clean=()=>expect(process.listeners("uncaughtException")).toEqual(listeners);
 const deny=async()=>{
  const count=observed.gateways.length;
  await expect(startLocalRuntime(f.runtime)).rejects.toThrow();
  expect(observed.gateways.length).toBeGreaterThan(count);
  await expect(observed.gateways.at(-1)!.verifyAdminPassword(passwords.ADMIN)).rejects.toThrow();
  clean();expect(snapshot()).toEqual(before);
 };
 observed.failPrepare=true;
 try{await deny();}finally{observed.failPrepare=false;}
 const blocker=createServer(socket=>socket.destroy());
 blocker.listen(f.runtime.port,"127.0.0.1");await once(blocker,"listening");
 try{await deny();}finally{await new Promise<void>((resolve,reject)=>blocker.close(e=>e?reject(e):resolve()));}
 const runtime=await startLocalRuntime(f.runtime);
 try{expect((await wire(f.runtime,"/api/health")).status).toBe(200);}finally{await runtime.close();}
 clean();expect(snapshot()).toEqual(before);
},120000);
