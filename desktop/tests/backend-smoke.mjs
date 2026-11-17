import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import https from "node:https";
import path from "node:path";
const bundle=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]);
mkdirSync(evidence,{recursive:true});
const dataRoot=path.resolve("web/test-results/posdt-"+randomUUID());
const passwords={ADMIN:"Test-A9!"+randomBytes(20).toString("hex"),SALESPERSON:"Test-S9!"+randomBytes(20).toString("hex")};
const node=path.join(bundle,"resources/runtime/node.exe"),payload=path.join(bundle,"resources/payload");
const result={format:"SHOP_POS_DESKTOP_BACKEND_CHECK_V1",dataRoot,bundle,productionActivation:false,checks:[]};
writeFileSync(path.join(evidence,"backend-attempt.json"),JSON.stringify(result,null,2));
async function protect(){
 const job=spawn(path.join(process.env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoProfile","-NonInteractive","-File",path.resolve("desktop/private-data.ps1")],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
 let output="";job.stdout.on("data",b=>output+=b);job.stdin.end(JSON.stringify({directory:dataRoot}));
 const [code]=await once(job,"exit");assert.equal(code,0);assert.equal(output,"true");
}
async function boot(enroll){
 const env={...process.env,NODE_ENV:"test",NEXT_TELEMETRY_DISABLED:"1"};for(const key of ["NODE_OPTIONS","NODE_PATH","NODE_EXTRA_CA_CERTS","NODE_V8_COVERAGE"])delete env[key];
 const child=spawn(node,[path.join(payload,"server/desktop/test-entry.js")],{cwd:dataRoot,env,windowsHide:true,stdio:["ignore","ignore","pipe","ipc"]});
 let diagnostic="";child.stderr.on("data",b=>{diagnostic+=b.toString();if(diagnostic.length>32000)diagnostic=diagnostic.slice(-32000);});
 const ready=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error("Backend startup timeout; data retained.")),240000);
  child.once("error",reject);child.once("exit",code=>{clearTimeout(timer);reject(Error("Backend exited "+code+"; "+diagnostic));});
  child.on("message",m=>{
   if(m?.type==="confirm-enrollment"){assert.equal(enroll,true,"Restart must not repeat account enrollment");child.send({type:"reply",id:m.id,value:"CONFIRM_FIRST_ENROLLMENT"});}
   if(m?.type==="read-passwords")child.send({type:"reply",id:m.id,value:passwords});
   if(m?.type==="ready"){clearTimeout(timer);resolve(m.value);}
   if(m?.type==="fatal"){clearTimeout(timer);reject(Error("Backend rejected at "+(m.stage??"UNCLASSIFIED")+"; data retained."));child.send({type:"stop"});}
  });
  child.send({type:"start",dataRoot,applicationDirectory:path.join(payload,"app")});
 });
 assert.equal(ready.productionActivation,false);
 return {child,ready,async close(){const exited=once(child,"exit");child.send({type:"stop"});const [code]=await exited;assert.equal(code,0);}};
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
 const oldStaff=staff;await live.close();live=await boot(false);admin=await login("ADMIN");staff=await login("SALESPERSON");
 assert.equal((await request(live,"SALESPERSON","/api/pos/sales/"+sold.value.id,oldStaff)).status,403);
 assert.deepEqual((await request(live,"SALESPERSON","/api/pos/sales/"+sold.value.id,staff)).value,sold.value);
 const saved=await request(live,"SALESPERSON","/api/pos/sales?query="+encodeURIComponent("äpfel"),staff);assert.equal(saved.status,200);assert.equal(saved.value.items.length,1);check("real process restart retains protected keys/accounts/financial history and revokes old session without sale replay");
 const backup=await request(live,"ADMIN","/api/admin/backups/status",admin);assert.equal(backup.status,200);assert.equal(backup.value.configured,true);check("protected backup configuration reopens after restart");
 const manualId=randomUUID(),manual=await request(live,"ADMIN","/api/admin/backups/manual",admin,{key:manualId,password:passwords.ADMIN});assert.equal(manual.status,202,JSON.stringify(manual.value));
 async function finished(id,expected){const until=Date.now()+120000;while(Date.now()<until){const r=await request(live,"ADMIN","/api/admin/backups/jobs/"+id,admin);assert.equal(r.status,200);if(r.value.state===expected)return r.value;if(r.value.state==="FAILED")throw Error("Original backup job failed; retained "+id);await delay(500);}throw Error("Original backup job unconfirmed; retained "+id);}
 await finished(manualId,"SNAPSHOT_VERIFIED");
 const exportId=randomUUID(),exported=await request(live,"ADMIN","/api/admin/backups/export",admin,{key:exportId,archiveId:manualId,password:passwords.ADMIN});assert.equal(exported.status,202,JSON.stringify(exported.value));await finished(exportId,"EXPORTED");
 const restoreId=randomUUID(),restored=await request(live,"ADMIN","/api/admin/backups/restore",admin,{key:restoreId,archiveId:manualId,password:passwords.ADMIN});assert.equal(restored.status,200,JSON.stringify(restored.value));assert.equal(restored.value.state,"ISOLATED_RESTORE_VERIFIED_LOGIN_PENDING");
 check("actual packaged protected backup, ciphertext export and isolated restore APIs commit original jobs without overwrite");
 const originalChild=live.child,killed=once(originalChild,"exit");originalChild.kill();await killed;live=undefined;await delay(750);live=await boot(false);admin=await login("ADMIN");staff=await login("SALESPERSON");assert.deepEqual((await request(live,"SALESPERSON","/api/pos/sales/"+sold.value.id,staff)).value,sold.value);
 check("actual owned backend process kill after known COMMIT; original protected shop reopens with unchanged saved receipt");
 await live.close();live=undefined;
 const marker=JSON.parse(readFileSync(path.join(dataRoot,"desktop-test.json"),"utf8"));result.databaseId=marker.id;result.status="PASS";result.runtimeSha256=createHash("sha256").update(readFileSync(node)).digest("hex");
 writeFileSync(path.join(evidence,"backend-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){result.status="FAIL";result.error=String(error);writeFileSync(path.join(evidence,"backend-result.json"),JSON.stringify(result,null,2));if(live)await live.close().catch(()=>{});throw error;}
