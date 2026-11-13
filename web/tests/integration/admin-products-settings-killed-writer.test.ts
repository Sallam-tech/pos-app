import {beforeAll,test,expect} from "vitest";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createWriteStream,existsSync,writeFileSync} from "node:fs";
import path from "node:path";
import {seed,gateway,passwords,credentials,settings} from "../helpers/admin-products-settings-fixture";
import {evidence} from "../helpers/admin-products-settings-volume";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {createSettingsService} from "../../src/server/settings/service";
beforeAll(seed);
test.each(["SETTINGS","PASSWORD_SALESPERSON"] as const)("actual killed %s writer rolls back partial native effects; fresh Admin fences original key",async kind=>{
 const f=await gateway(),c=await createSettingsService(f.g,"TEST SHOP").current(f.admin,"ADMIN");if(!c.context)throw Error();const context=c.context,key=randomUUID(),stem=path.join(evidence,"killed-"+randomUUID()),observed=stem+"-observed.json",cleanup=stem+"-cleanup.txt",input=stem+"-private-input.json",newPassword=randomUUID()+"Staff";await f.g.close();
 writeFileSync(input,JSON.stringify({config:f.config,password:passwords.ADMIN,key,context,kind,input:{expectedRevision:"0",settings:settings(),reason:"SYNTHETIC TEST killed writer"},newPassword,observed,cleanup}),{flag:"wx"});
 const log=createWriteStream(stem+"-child.log",{flags:"wx"}),child=spawn(process.execPath,["node_modules/vitest/vitest.mjs","run","--config","vitest.admin-products-settings.config.mts","--maxWorkers=1","tests/integration/admin-products-settings-crash-worker.test.ts"],{windowsHide:true,env:{...process.env,TEST41_CRASH_INPUT:input},stdio:["ignore","pipe","pipe"]});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});const code=await new Promise<number|null>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill("SIGKILL");reject(Error("TEST killed-writer timeout"));},90000);child.once("error",e=>{clearTimeout(timer);reject(e);});child.once("close",n=>{clearTimeout(timer);resolve(n);});});log.end();expect(code).not.toBe(0);expect(existsSync(observed)).toBe(true);expect(existsSync(cleanup)).toBe(false);
 const g=await openAuthorizationGateway(f.config,41);try{const admin=await credentials(g,f.config,"ADMIN"),api=createSettingsService(g,"TEST SHOP");expect((await api.operation(admin,key,context,kind)).state).toBe("UNKNOWN");expect((await api.current(admin,"ADMIN")).saved).toBeNull();expect(await g.verifySalespersonPassword(passwords.SALESPERSON)).toHaveProperty("signal");expect((await api.cancel(admin,passwords.ADMIN,key,context,kind,"SYNTHETIC TEST fresh Admin verified no committed effect after killed writer")).state).toBe("CANCELLED");const counts=await g.withAdminTransaction(admin,async tx=>({settings:await tx.get("SELECT count(*) AS n FROM shop_settings_operations"),password:await tx.get("SELECT count(*) AS n FROM shop_password_operations")}));expect(counts).toEqual({settings:{n:BigInt(0)},password:{n:BigInt(0)}});
 }finally{await g.close();}
},180000);
