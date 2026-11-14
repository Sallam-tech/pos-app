// TEST-only source loader and private stdin; not a deployment bootstrap.
import {registerHooks} from "node:module";
registerHooks({resolve(specifier,context,next){
 if(specifier==="server-only")return next(new URL("../../node_modules/next/dist/compiled/server-only/empty.js",import.meta.url).href,context);
 try{return next(specifier,context);}catch(error){if(error.code==="ERR_MODULE_NOT_FOUND"&&specifier.startsWith(".")&&!/\.[a-z]+$/i.test(specifier))return next(specifier+".ts",context);throw error;}
}});
const chunks=[];let bytes=0;
try{
 for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>16384)throw Error("Denied");chunks.push(chunk);}
 const input=Buffer.concat(chunks),m=JSON.parse(input.toString("utf8"));input.fill(0);
 const {importTestPortableRecovery}=await import("../../src/server/backup/crypto.ts");
 const {inspectTestPortableArchive}=await import("../../src/server/backup/service.ts");
 const custody=await importTestPortableRecovery(m.identity,m.trust);
 m.identity=undefined;
 const result=await inspectTestPortableArchive(custody,m.archive,m.directory);
 process.stdout.write(JSON.stringify({state:result.state,schema:result.schema,fingerprint:result.fingerprint,productionActivation:false,physicalHardware:"NOT_VERIFIED"}));
}catch{process.stdout.write('{"state":"DENIED"}');process.exitCode=1;}
finally{for(const b of chunks)b.fill(0);}
