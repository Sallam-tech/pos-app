// Disposable TEST crash helper: controlled native-write barrier, then parent terminates this process.
import {registerHooks,syncBuiltinESMExports,createRequire} from "node:module";
registerHooks({resolve(specifier,context,next){if(specifier==="server-only")return next(new URL("../../node_modules/next/dist/compiled/server-only/empty.js",import.meta.url).href,context);try{return next(specifier,context);}catch(e){if(e.code==="ERR_MODULE_NOT_FOUND"&&specifier.startsWith(".")&&!/\.[a-z]+$/i.test(specifier))return next(specifier+".ts",context);throw e;}}});
const require=createRequire(import.meta.url),fsp=require("node:fs/promises"),originalOpen=fsp.open;
const chunks=[];let count=0;
try{
 for await(const b of process.stdin){count+=b.length;if(count>32768)throw Error();chunks.push(b);}
 const data=Buffer.concat(chunks),m=JSON.parse(data.toString("utf8"));data.fill(0);
 const {createTestArchive,authorizeTestRestore,restoreTestArchive}=await import("../../src/server/backup/service.ts");
 const {openTestCustody}=await import("../../src/server/backup/crypto.ts");
 const {resolveDatabaseLocation}=await import("../../src/server/db/location.ts");
 const {acquireRuntimeOwnership}=await import("../../src/server/hosting/ownership.ts");
 const lease=await acquireRuntimeOwnership(resolveDatabaseLocation(m.config.database).filename),custody=await openTestCustody(m.vault);
 const suffix=m.operation!=="RESTORE"?"archive.pending":"restored.pending";
 fsp.open=async function(...args){const h=await originalOpen(...args);if(String(args[0]).endsWith(suffix)&&(m.operation!=="WORKER"||String(args[0]).replaceAll("\\","/").includes("/job-"+m.key+"/")))return new Proxy(h,{get(t,p){if(p==="write")return async(...v)=>{await t.write(...v);process.stdout.write("PARTIAL_WRITTEN\n");await new Promise(()=>{setInterval(()=>{},1000);});};const v=Reflect.get(t,p,t);return typeof v==="function"?v.bind(t):v;}});return h;};syncBuiltinESMExports();
 if(m.operation==="WORKER"){const {reopenTestBackupConfiguration,startTestBackupWorker}=await import("../../src/server/backup/worker.ts");const configuration=await reopenTestBackupConfiguration(custody,m.config.database,m.root),worker=await startTestBackupWorker(configuration,lease,m.config.database);await worker.manual(m.key);await worker.idle();await worker.stop();}
 else if(m.operation==="BACKUP")await createTestArchive(custody,m.config.database,m.directory);
 else{
  const {openAuthorizationGateway}=await import("../../src/server/auth/gateway.ts"),g=await openAuthorizationGateway(m.config,41);
  const pw=m.password;m.password=undefined;const response=await g.issueAdminSession(await g.verifyAdminPassword(pw));
  const request=new Request(m.config.origins.ADMIN+"/admin",{headers:{origin:m.config.origins.ADMIN,cookie:response.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")}});
  const authority=await authorizeTestRestore(g,request,pw,m.archive,m.directory);
  await restoreTestArchive(custody,authority,m.archive,m.directory);await g.close();
 }
 await lease.close();process.stdout.write("UNEXPECTED_COMPLETION\n");process.exitCode=1;
}catch{process.stdout.write("DENIED\n");process.exitCode=1;}
finally{for(const b of chunks)b.fill(0);}
