import {test,vi} from "vitest";
import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {createInvoicesService} from "../../src/server/invoices/service";
import type {AuthorizationConfiguration} from "../../src/server/auth/types";
import type {CorrectionCommand} from "../../src/server/invoices/service";
interface Raw{prepare(s:string):unknown}
const Driver=createRequire(import.meta.url)("better-sqlite3") as {prototype:Raw};
test.skipIf(!process.env.TEST39_CRASH_INPUT)("isolated native child abruptly dies during the correction writer transaction",async()=>{const input=JSON.parse(readFileSync(process.env.TEST39_CRASH_INPUT!,"utf8")) as {config:AuthorizationConfiguration;password:string;key:string;context:string;facts:CorrectionCommand;observed:string;cleanup:string},g=await openAuthorizationGateway(input.config,39);try{const response=await g.issueAdminSession(await g.verifyAdminPassword(input.password)),request=new Request(input.config.origins.ADMIN+"/private",{headers:{origin:input.config.origins.ADMIN,cookie:response.headers.getSetCookie().map(x=>x.split(";")[0]).join("; ")}}),prepare=Driver.prototype.prepare;vi.spyOn(Driver.prototype,"prepare").mockImplementation(function(this:Raw,s:string){if(s.startsWith("INSERT INTO financial_events")){writeFileSync(input.observed,JSON.stringify({pid:process.pid,point:"after stock writer, before financial posting/COMMIT"}),{flag:"wx"});process.kill(process.pid,"SIGKILL");throw Error("TEST termination did not occur");}return prepare.call(this,s);});await createInvoicesService(g).recover(request,input.password,input.key,input.context,"RECORD_PRIOR_FACTS","SYNTHETIC TEST original cash facts and current actual count verified",input.facts);throw Error("TEST crash hook missed");}finally{writeFileSync(input.cleanup,"unexpected graceful cleanup");await g.close();}});
