import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,lstatSync,renameSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
const project=path.resolve(fileURLToPath(new URL("..",import.meta.url))),web=path.join(project,"web");
const [builtApp,electronDirectory,nodeFile,out]=process.argv.slice(2).map(p=>path.resolve(p));
if(!builtApp||!electronDirectory||!nodeFile||!out||!out.startsWith(project+path.sep)||existsSync(out))throw Error("A new isolated workspace output directory is required.");
const hash=p=>createHash("sha256").update(readFileSync(p)).digest("hex");
if(hash(nodeFile)!=="86fc4785327db5f5c7558dc6156c543b433c313e813a222e088086222ab4afa6")throw Error("Reviewed patched runtime hash mismatch.");
if(readFileSync(path.join(electronDirectory,"version"),"utf8").trim()!=="45.4.1")throw Error("Pinned Electron version mismatch.");
if(hash(path.join(electronDirectory,"electron.exe"))!=="a547b53fbee4dd4adca1a88e215270d06f7cb1e7d333ee402fb3dd677392a87a")throw Error("Verified original Electron executable mismatch.");
if(!existsSync(path.join(builtApp,".next/BUILD_ID")))throw Error("Verified Next build required.");
cpSync(electronDirectory,out,{recursive:true,force:false,errorOnExist:true});
renameSync(path.join(out,"electron.exe"),path.join(out,"Shop POS TEST.exe"));
const resources=path.join(out,"resources"),payload=path.join(resources,"payload"),app=path.join(payload,"app"),server=path.join(payload,"server"),runtime=path.join(resources,"runtime");
mkdirSync(payload);mkdirSync(app);mkdirSync(server);mkdirSync(runtime);
cpSync(nodeFile,path.join(runtime,"node.exe"),{errorOnExist:true});
for(const name of ["main.cjs","data-root-policy.cjs","production-data-root.cjs","shared-login.cjs","payload-integrity.cjs","package.json","private-data.ps1","lifecycle.ps1","setup.html","shop-setup.html","setup.css","setup.js","setup-preload.cjs","operation-key-preload.cjs","recovery.html","shop-recovery.html","recovery.js","recovery-preload.cjs","shop-logo.ico"]) {
 mkdirSync(path.join(resources,"app"),{recursive:true});cpSync(path.join(project,"desktop",name),path.join(resources,"app",name),{errorOnExist:true});
}
// .next/cache and .next/dev (the `next dev` Turbopack cache, ~65 MB) are never read by the
// packaged production server; leaving them out also shortens the per-launch integrity check.
cpSync(path.join(builtApp,".next"),path.join(app,".next"),{recursive:true,filter:p=>!p.startsWith(path.join(builtApp,".next/cache"))&&!p.startsWith(path.join(builtApp,".next/dev"))&&(!/\.(?:map|d\.ts|d\.mts|d\.cts)$/.test(p)||!lstatSync(p).isFile())});
if(existsSync(path.join(builtApp,"public")))cpSync(path.join(builtApp,"public"),path.join(app,"public"),{recursive:true});
// runtime-dependencies.mjs writes a derived lock with only the reviewed production dependency closure.
writeFileSync(path.join(server,"package.json"),JSON.stringify({private:true,type:"module"}));
const require=createRequire(path.join(web,"package.json")),ts=require("typescript");
const sources=[];
function emit(directory,target){
 for(const name of readdirSync(directory)){
  const input=path.join(directory,name),destination=path.join(target,name),stat=lstatSync(input);
  if(stat.isSymbolicLink())throw Error("Redirected source rejected.");
  if(stat.isDirectory()){mkdirSync(destination);emit(input,destination);}
  else if(name.endsWith(".ts")){
   const original=readFileSync(input,"utf8"),compiled=ts.transpileModule(original,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,esModuleInterop:true},fileName:name,reportDiagnostics:true});
   if(compiled.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error("Desktop source transpilation failed.");
   const specifier=p=>/\.(?:js|mjs|cjs|json|node)$/.test(p)?p:p+".js";
   const body=compiled.outputText.replace(/\bimport\s*["']server-only["'];?\s*/g,"")
    .replace(/(\bfrom\s*|\bimport\s*)(["'])(\.[^"']+)\2/g,(_,prefix,quote,p)=>prefix+quote+specifier(p)+quote)
    .replace(/(\bimport\s*\(\s*)(["'])(\.[^"']+)\2/g,(_,prefix,quote,p)=>prefix+quote+specifier(p)+quote);
   writeFileSync(destination.slice(0,-3)+".js",body);sources.push({path:path.relative(web,input).replaceAll("\\","/"),sha256:hash(input)});
  }else cpSync(input,destination,{errorOnExist:true});
 }
}
emit(path.join(web,"src/server"),server);
// One explicit pure shared date helper is also consumed by the compiled backend.
// Keep it inside its own ESM boundary; never package arbitrary client modules.
const sharedSource=path.join(web,"src/lib/sales/history-range.ts"),sharedTarget=path.join(payload,"lib/sales");
const sharedStat=lstatSync(sharedSource);if(!sharedStat.isFile()||sharedStat.isSymbolicLink()||sharedStat.nlink!==1)throw Error("Redirected shared source rejected.");
const sharedCompiled=ts.transpileModule(readFileSync(sharedSource,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:"history-range.ts",reportDiagnostics:true});
if(sharedCompiled.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error("Shared helper transpilation failed.");
mkdirSync(sharedTarget,{recursive:true});writeFileSync(path.join(payload,"lib/package.json"),JSON.stringify({private:true,type:"module"}));writeFileSync(path.join(sharedTarget,"history-range.js"),sharedCompiled.outputText);
sources.push({path:path.relative(web,sharedSource).replaceAll("\\","/"),sha256:hash(sharedSource)});
writeFileSync(path.join(payload,"source-manifest.json"),JSON.stringify({format:"SHOP_POS_DESKTOP_SOURCE_V1",sources,productionActivation:false},null,2));
writeFileSync(path.join(out,"TEST-README.txt"),"Shop POS TEST.21r2. Production disabled.\r\nThe versioned Desktop or Start Menu shortcut opens this installed TEST application directly. Its protected persistent data root is %LOCALAPPDATA%\\Programs\\SalamTech\\0.2.0-test.21r2\\ShopPOSTestData; it is separate from TEST.17, TEST.18, TEST.19 and TEST.20. TEST.18 remains harness-only.\r\nThe same password screen opens Admin Dashboard or Salesperson POS using the matching TEST.21r2 password. Set separate passwords during first enrollment. No reusable passwords/keys are distributed.\r\nUninstall retains TEST.21r2 data. Do not use for real business.\r\n");
console.log(JSON.stringify({out,payload,serverSources:sources.length,nextBuild:readFileSync(path.join(app,".next/BUILD_ID"),"utf8").trim(),productionActivation:false}));
