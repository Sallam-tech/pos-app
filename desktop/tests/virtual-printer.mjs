import {createRequire} from "node:module";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from "node:fs";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import https from "node:https";
import {pathToFileURL} from "node:url";
import path from "node:path";
const bundle=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]);
mkdirSync(evidence,{recursive:true});
const dataRoot=path.resolve("web/test-results/posdt-"+randomUUID());
const passwords={ADMIN:"Test-A9!"+randomBytes(20).toString("hex"),SALESPERSON:"Test-S9!"+randomBytes(20).toString("hex")};
const node=path.join(bundle,"resources/runtime/node.exe"),payload=path.join(bundle,"resources/payload");
const sourceMode=process.argv.includes("--source");
let recoveryPlan;
const result={format:"SHOP_POS_WINDOWS_VIRTUAL_PRINT_V1",sourceMode,dataRoot,bundle,productionActivation:false,checks:[]};
writeFileSync(path.join(evidence,"backend-attempt.json"),JSON.stringify(result,null,2));
async function protect(){
 const job=spawn(path.join(process.env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoProfile","-NonInteractive","-File",path.resolve("desktop/private-data.ps1")],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
 let output="";job.stdout.on("data",b=>output+=b);job.stdin.end(JSON.stringify({directory:dataRoot}));
 const [code]=await once(job,"exit");assert.equal(code,0);assert.equal(output,"true");
}

async function boot(enroll){
 const env={...process.env,NODE_ENV:"test",NEXT_TELEMETRY_DISABLED:"1"};for(const key of ["NODE_OPTIONS","NODE_PATH","NODE_EXTRA_CA_CERTS","NODE_V8_COVERAGE"])delete env[key];
 const args=sourceMode?["--experimental-transform-types","--disable-warning=ExperimentalWarning","--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",path.resolve("web/tests/helpers/desktop-recovery-probe.mjs")]:[path.join(payload,"server/desktop/test-entry.js")];
 if(process.env.SHOP_POS_QA_RECOVERY_DIAGNOSTICS)args.unshift("--import",pathToFileURL(path.resolve(process.env.SHOP_POS_QA_RECOVERY_DIAGNOSTICS)).href);
 const child=spawn(node,args,{cwd:dataRoot,env,windowsHide:true,stdio:["ignore","ignore","pipe","ipc"]});let diagnostic="";child.stderr.on("data",b=>{diagnostic+=b.toString();if(diagnostic.length>32000)diagnostic=diagnostic.slice(-32000);});
 let confirmed=false;const ready=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{writeFileSync(path.join(evidence,"source-probe-startup-stderr.log"),diagnostic);reject(Error("Original startup/recovery unconfirmed; data retained."));child.send({type:"stop"});},recoveryPlan?.mode==="RESUME"?360000:180000);
  child.once("error",reject);child.once("exit",code=>{clearTimeout(timer);if(!confirmed)reject(Error("Owned backend exited before confirmation."));});
  child.on("message",m=>{try{
   if(m?.type==="startup-stage"&&/^[A-Z_]{1,40}$/.test(m.value)){writeFileSync(path.join(evidence,"startup-stage.json"),JSON.stringify({stage:m.value,at:new Date().toISOString()}));}
   else if(m?.type==="source-probe-ready"&&sourceMode)child.send({type:"start",dataRoot,applicationDirectory:path.join(payload,"app")});
   else if(m?.type==="confirm-enrollment"){assert.ok(enroll,"No repeated enrollment allowed");child.send({type:"reply",id:m.id,value:"CONFIRM_FIRST_ENROLLMENT"});}
   else if(m?.type==="read-passwords")child.send({type:"reply",id:m.id,value:passwords});
   else if(m?.type==="recovery-review"){assert.equal(recoveryPlan.mode,"RESUME");assert.equal(m.value.kind,"COMMITTED");assert.equal(m.value.operationId,recoveryPlan.selection.operationId);check("restart recognizes original known COMMITTED operation without recopy or automatic promotion");child.send({type:"reply",id:m.id,value:{sourceAdmin:passwords.ADMIN,...passwords}});}
   else if(m?.type==="confirm-protected-restore"){assert.equal(m.value.archiveSha256,recoveryPlan.archiveSha256);child.send({type:"reply",id:m.id,value:"CONFIRM_SEPARATE_TEST_RESTORE41"});}
   else if(m?.type==="confirm-writer-selection"){assert.equal(m.value.productionActivation,false);if(recoveryPlan.mode==="RESUME")assert.deepEqual(m.value,recoveryPlan.selection);else{recoveryPlan.selection=m.value;recoveryPlan.reached();}child.send({type:"reply",id:m.id,value:"CONFIRM_TEST_WRITER_SELECTION"});}
   else if(m?.type==="backup-handoff-password"){assert.equal(m.value.generation,"1");child.send({type:"reply",id:m.id,value:passwords.ADMIN});}
   else if(m?.type==="ready"){confirmed=true;clearTimeout(timer);resolve(m.value);}
   else if(m?.type==="fatal"){writeFileSync(path.join(evidence,"fatal-startup-stderr.log"),diagnostic);clearTimeout(timer);reject(Error("Backend rejected at "+(m.stage??"UNCLASSIFIED")+"; original operation retained."));child.send({type:"stop"});}
  }catch(error){clearTimeout(timer);reject(error);child.send({type:"stop"});}});
  if(!sourceMode)child.send({type:"start",dataRoot,applicationDirectory:path.join(payload,"app")});
 });
 return {child,ready,async close(){if(child.exitCode!==null||child.signalCode!==null)return;const exited=once(child,"exit");child.send({type:"stop"});const [code]=await exited;assert.equal(code,0);}};
}

function request(live,role,endpoint,cookie=[],body,headers={}){
 const origin=live.ready.origins[role],url=new URL(origin+endpoint),text=body===undefined?undefined:JSON.stringify(body);
 return new Promise((resolve,reject)=>{
  const req=https.request({hostname:url.hostname,family:4,agent:false,port:url.port,servername:role==="ADMIN"?"localhost":"",ca:live.ready.trustAnchor,rejectUnauthorized:true,method:text===undefined?"GET":"POST",path:endpoint,headers:{host:url.host,origin,cookie:cookie.map(v=>v.split(";")[0]).join("; "),...(text===undefined?{}:{"content-type":"application/json","content-length":Buffer.byteLength(text)}),...headers}},res=>{const chunks=[];res.on("data",b=>chunks.push(b));res.on("end",()=>{const text=Buffer.concat(chunks).toString();let value;try{value=JSON.parse(text);}catch{value=text;}resolve({status:res.statusCode,headers:res.headers,value});});});
  req.on("error",reject);req.setTimeout(90000,()=>req.destroy(Error("HTTPS timeout; original operation retained.")));req.end(text);
 });
}
const check=(name)=>{result.checks.push(name);writeFileSync(path.join(evidence,"backend-progress.json"),JSON.stringify(result,null,2));};
let live;
try{
 await protect();live=await boot(true);check("actual bundled patched Node + native SQLite + private enrollment + protected HTTPS startup");
 const login=async role=>{const r=await request(live,role,"/api/auth/login",[],{password:passwords[role]});assert.equal(r.status,200);assert.ok(r.headers["set-cookie"]?.every(c=>c.includes("Secure")&&c.includes("HttpOnly")&&c.includes("SameSite=Strict")));return r.headers["set-cookie"];};
 let admin=await login("ADMIN"),staff=await login("SALESPERSON");
 assert.equal((await request(live,"SALESPERSON","/api/admin/products",staff)).status,403);
 assert.equal((await request(live,"ADMIN","/api/admin/products",[])).status,403);
 assert.equal((await request(live,"ADMIN","/api/admin/products",admin,undefined,{origin:"https://foreign.invalid"})).status,403);check("fresh both-role login, role boundary, guest and foreign-Origin denial");
 const context=await request(live,"ADMIN","/api/admin/inventory/recovery-context",admin);assert.equal(context.status,200);
 const create={requestKey:randomUUID(),name:"TEST desktop ÄPFEL دودھ",unit:"PACK",buyingPricePaisa:"10000",sellingPricePaisa:"11000",sellingActive:true,openingQuantity:"12",lowStockThreshold:"2"};
 const made=await request(live,"ADMIN","/api/admin/products",admin,create,{"x-inventory-context":context.value.context});assert.equal(made.status,200,JSON.stringify(made.value));const product=made.value.product;
 const saleContext=await request(live,"SALESPERSON","/api/pos/sales/context",staff);assert.equal(saleContext.status,200);
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const part=k=>parts.find(p=>p.type===k).value;const day=part("year")+"-"+part("month")+"-"+part("day");
 const command={requestKey:randomUUID(),context:saleContext.value.context,lines:[{productId:product.id,quantity:"3",unitPricePaisa:"11000",discountPercent:"5"}],cashPaisa:"32000",cashDate:day};
 const admission=await request(live,"SALESPERSON","/api/counter-cash/admissions",staff,{kind:"SALE",key:command.requestKey,input:command});assert.equal(admission.status,200,JSON.stringify(admission.value));
 const sold=await request(live,"SALESPERSON","/api/pos/sales",staff,command);assert.equal(sold.status,200,JSON.stringify(sold.value));assert.equal(sold.value.totalPaisa,"31500");
 const duplicate=await request(live,"SALESPERSON","/api/pos/sales",staff,command);assert.equal(duplicate.status,200);assert.deepEqual(duplicate.value,sold.value);
 const get=await request(live,"ADMIN","/api/admin/products/"+product.id,admin);assert.equal(get.value.quantity,"9");
 const catalog=await request(live,"SALESPERSON","/api/pos/products?query="+encodeURIComponent("äpfel"),staff);assert.equal(catalog.status,200);assert.doesNotMatch(JSON.stringify(catalog.value),/buyingPrice|stockValue|grossProfit|quantity|lowStock/i);check("real HTTPS product/sale, exact discount and cash, atomic stock9, duplicate sale returns original receipt and safe Staff DTO");

 await live.close();live=undefined;
 const before=financialFingerprint(),pdf=path.join(evidence,"windows-original-invoice.pdf");
 const gui=spawn(path.join(process.env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoLogo","-NoProfile","-NonInteractive","-File",path.resolve("desktop/tests/virtual-printer-ui.ps1")],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
 let errors="",output="";gui.stderr.on("data",b=>errors=(errors+b).slice(-32000));gui.stdout.on("data",b=>output=(output+b).slice(-32000));
 gui.stdin.end(JSON.stringify({closedStderrProbe:process.argv.includes("--closed-stderr"),bundle,evidence,dataRoot,pdf,staffPassword:passwords.SALESPERSON,invoiceNumber:sold.value.number}));
 const [code]=await once(gui,"exit");writeFileSync(path.join(evidence,"windows-ui-stderr.log"),errors);writeFileSync(path.join(evidence,"windows-ui-stdout.log"),output);assert.equal(code,0,"Native virtual-print GUI did not confirm its original job; retained without retry");
 const ui=JSON.parse(readFileSync(path.join(evidence,"windows-print-result.json"),"utf8").replace(/^\uFEFF/,""));assert.equal(ui.status,"PASS");assert.equal(ui.drainedExitObserved,true);assert.equal(ui.exitCode,0);
 const until=Date.now()+60000;let bytes;while(Date.now()<until){if(existsSync(pdf)){const value=readFileSync(pdf);if(value.length>1024&&value.subarray(-2048).includes(Buffer.from("%%EOF"))){bytes=value;break;}}await delay(250);}assert.ok(bytes,"Original PDF completion unconfirmed; no second submission");assert.ok(bytes.length<16*1024*1024);assert.equal(bytes.subarray(0,5).toString(),"%PDF-");
 const text=bytes.toString("latin1"),pages=(text.match(/\/Type\s*\/Page\b/g)||[]).length;assert.ok(pages>0);assert.match(text,/\/MediaBox\s*\[/);
 assert.equal(financialFingerprint(),before,"Printing must not change any original stock, money, receipt, admission or source ledger");
 result.pdf={filename:pdf,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),pages};result.windowsGui=ui;check("actual fused EXE native Microsoft Print to PDF output completes; original financial/stock/receipt/admission digest unchanged");
 result.status="PASS";writeFileSync(path.join(evidence,"virtual-print-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){result.status="FAIL";result.error=String(error);writeFileSync(path.join(evidence,"virtual-print-result.json"),JSON.stringify(result,null,2));if(live)await live.close().catch(()=>{});throw error;}
function financialFingerprint(){
 const marker=JSON.parse(readFileSync(path.join(dataRoot,"desktop-test.json"),"utf8")),filename=path.join(dataRoot,"test-results/sqlite-b1b-part1",marker.id,"d/shop.sqlite3"),Driver=createRequire(path.join(payload,"package.json"))("better-sqlite3"),db=new Driver(filename,{readonly:true,fileMustExist:true});db.defaultSafeIntegers(true);db.pragma("query_only=ON");db.exec("BEGIN");try{const tables=["products","stock_balances","stock_movements","sale_operations","sales","sale_lines","sale_payments","invoice_snapshots","financial_events","cash_movements","counter_cash_admissions","counter_cash_admission_resolutions","cash_flow_evidence"],h=createHash("sha256");for(const table of tables){h.update(table);h.update(JSON.stringify(db.prepare("SELECT rowid AS ordinal,* FROM "+table+" ORDER BY rowid").all(),(_,v)=>typeof v==="bigint"?v.toString():v));}return h.digest("hex");}finally{db.exec("ROLLBACK");db.close();}
}
