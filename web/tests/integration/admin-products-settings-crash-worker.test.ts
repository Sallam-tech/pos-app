import {test,vi} from "vitest";
import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {createSettingsService} from "../../src/server/settings/service";
import type {AuthorizationConfiguration} from "../../src/server/auth/types";
interface Raw{prepare(s:string):unknown}
const Driver=createRequire(import.meta.url)("better-sqlite3") as {prototype:Raw};
test.skipIf(!process.env.TEST41_CRASH_INPUT)("isolated TEST41 writer killed after partial native effects before COMMIT",async()=>{
 const x=JSON.parse(readFileSync(process.env.TEST41_CRASH_INPUT!,"utf8")) as {config:AuthorizationConfiguration;password:string;key:string;context:string;kind:"SETTINGS"|"PASSWORD_SALESPERSON";input:unknown;newPassword:string;observed:string;cleanup:string},g=await openAuthorizationGateway(x.config,41);
 try{const session=await g.issueAdminSession(await g.verifyAdminPassword(x.password)),r=new Request(x.config.origins.ADMIN+"/private",{headers:{origin:x.config.origins.ADMIN,cookie:session.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ")}}),api=createSettingsService(g,"TEST SHOP"),prepare=Driver.prototype.prepare;
 vi.spyOn(Driver.prototype,"prepare").mockImplementation(function(this:Raw,s:string){if(s.startsWith(x.kind==="SETTINGS"?"INSERT INTO shop_settings_revisions":"INSERT INTO shop_password_operations")){writeFileSync(x.observed,JSON.stringify({pid:process.pid,after:x.kind==="SETTINGS"?"settings operation":"credential update/revocation",before:"effect audit/COMMIT"}),{flag:"wx"});process.kill(process.pid,"SIGKILL");throw Error("TEST kill missed");}return prepare.call(this,s);});
 if(x.kind==="SETTINGS")await api.save(r,x.password,x.key,x.context,x.input);else await api.password(r,x.password,x.key,x.context,"SALESPERSON",x.newPassword);throw Error("TEST writer survived");
 }finally{writeFileSync(x.cleanup,"Unexpected graceful cleanup");await g.close();}
});
