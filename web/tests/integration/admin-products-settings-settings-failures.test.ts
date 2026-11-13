import {beforeAll,afterEach,test,expect,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {seed,gateway,passwords,credentials,settings} from "../helpers/admin-products-settings-fixture";
import {createSettingsService} from "../../src/server/settings/service";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {Driver,type Raw} from "../helpers/reports-volume";
beforeAll(seed);afterEach(()=>vi.restoreAllMocks());
test("concurrent Settings writes cannot duplicate a revision; mismatched context and kind cannot fence or disclose an operation",async()=>{
 const f=await gateway();try{const api=createSettingsService(f.g,"TEST SHOP"),c=await api.current(f.admin,"ADMIN"),ctx=c.context;if(!ctx)throw Error();const key=randomUUID(),input={expectedRevision:"0",settings:settings(),reason:"TEST concurrent exact request"},both=await Promise.allSettled([api.save(f.admin,passwords.ADMIN,key,ctx,input),api.save(f.admin,passwords.ADMIN,key,ctx,input)]);expect(both.some(x=>x.status==="fulfilled")).toBe(true);expect((await api.history(f.admin)).items).toHaveLength(1);await expect(api.operation(f.admin,key,ctx,"PASSWORD_ADMIN")).rejects.toThrow();await expect(api.cancel(f.admin,passwords.ADMIN,randomUUID(),"0".repeat(64),"SETTINGS","TEST invalid context")).rejects.toThrow();
 }finally{await f.g.close();}
},180000);
test("silent missing password audit rolls back both credential effect and revocations",async()=>{
 const f=await gateway();try{const api=createSettingsService(f.g,"TEST SHOP"),c=await api.current(f.admin,"ADMIN");if(!c.context)throw Error();const key=randomUUID(),prototype=Driver.prototype as Raw,prepare=prototype.prepare;let hit=false;
 vi.spyOn(prototype,"prepare").mockImplementation(function(this:Raw,s:string){const st=prepare.call(this,s);if(s.startsWith("INSERT INTO shop_password_operations"))st.run=()=>{hit=true;return {changes:1,lastInsertRowid:BigInt(0)};};return st;});
 await expect(api.password(f.admin,passwords.ADMIN,key,c.context,"SALESPERSON",randomUUID()+"staff")).rejects.toThrow();vi.restoreAllMocks();expect(hit).toBe(true);expect((await api.operation(f.admin,key,c.context,"PASSWORD_SALESPERSON")).state).toBe("UNKNOWN");expect((await f.g.authorizeSalesperson(f.staff)).role).toBe("SALESPERSON");expect(await f.g.verifySalespersonPassword(passwords.SALESPERSON)).toHaveProperty("signal");
 }finally{vi.restoreAllMocks();await f.g.close();}
},180000);
test.each([false,true])("password uncertain native COMMIT (committed=%s) recovers exact original audit after restart without resubmission",async committed=>{
 const f=await gateway();let g=f.g;try{let api=createSettingsService(g,"TEST SHOP");const c=await api.current(f.admin,"ADMIN");if(!c.context)throw Error();const ctx=c.context,key=randomUUID(),newPassword=randomUUID()+"Staff",prototype=Driver.prototype as Raw,prepare=prototype.prepare;let armed=false,hit=false;
 vi.spyOn(prototype,"prepare").mockImplementation(function(this:Raw,s:string){const st=prepare.call(this,s);if(s.startsWith("INSERT INTO shop_password_operations"))armed=true;if(armed&&!hit&&/^commit$/i.test(s.trim())){const run=st.run.bind(st);st.run=(...v:unknown[])=>{hit=true;if(committed)run(...v);throw Error("TEST uncertain credential COMMIT acknowledgment");};}return st;});
 await expect(api.password(f.admin,passwords.ADMIN,key,ctx,"SALESPERSON",newPassword)).rejects.toThrow();vi.restoreAllMocks();expect(hit).toBe(true);await g.close();g=await openAuthorizationGateway(f.config,41);const admin=await credentials(g,f.config,"ADMIN");api=createSettingsService(g,"TEST SHOP");expect((await api.operation(admin,key,ctx,"PASSWORD_SALESPERSON")).state).toBe(committed?"COMMITTED":"UNKNOWN");expect(await g.verifySalespersonPassword(committed?newPassword:passwords.SALESPERSON)).toHaveProperty("signal");const rows=await g.withAdminTransaction(admin,tx=>tx.all("SELECT * FROM shop_password_operations WHERE request_key=?",[key]));expect(rows).toHaveLength(committed?1:0);if(!committed)expect((await api.cancel(admin,passwords.ADMIN,key,ctx,"PASSWORD_SALESPERSON","TEST fresh Admin verified absent credential operation")).state).toBe("CANCELLED");
 }finally{vi.restoreAllMocks();await g.close();}
},180000);

test.each([false,true])("Settings uncertain native COMMIT (committed=%s) resolves original revision once after restart",async committed=>{
 const f=await gateway();let g=f.g;try{let api=createSettingsService(g,"TEST SHOP");const c=await api.current(f.admin,"ADMIN");if(!c.context)throw Error();const ctx=c.context,key=randomUUID(),prototype=Driver.prototype as Raw,prepare=prototype.prepare;let armed=false,hit=false;
 vi.spyOn(prototype,"prepare").mockImplementation(function(this:Raw,s:string){const st=prepare.call(this,s);if(s.startsWith("INSERT INTO shop_settings_revisions"))armed=true;if(armed&&!hit&&/^commit$/i.test(s.trim())){const run=st.run.bind(st);st.run=(...v:unknown[])=>{hit=true;if(committed)run(...v);throw Error("TEST uncertain Settings COMMIT acknowledgment");};}return st;});
 await expect(api.save(f.admin,passwords.ADMIN,key,ctx,{expectedRevision:"0",settings:settings(),reason:"SYNTHETIC TEST original Settings COMMIT uncertainty"})).rejects.toThrow();vi.restoreAllMocks();expect(hit).toBe(true);await g.close();g=await openAuthorizationGateway(f.config,41);const admin=await credentials(g,f.config,"ADMIN");api=createSettingsService(g,"TEST SHOP");expect((await api.operation(admin,key,ctx,"SETTINGS")).state).toBe(committed?"COMMITTED":"UNKNOWN");expect((await api.history(admin)).items).toHaveLength(committed?1:0);if(!committed)expect((await api.cancel(admin,passwords.ADMIN,key,ctx,"SETTINGS","SYNTHETIC TEST fresh Admin verified absent Settings write")).state).toBe("CANCELLED");
 }finally{vi.restoreAllMocks();await g.close();}
},180000);
