import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from "node:fs";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import https from "node:https";
import path from "node:path";
const bundle=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]);
mkdirSync(evidence,{recursive:true});
const dataRoot=path.resolve("web/test-results/posdt-"+randomUUID());
const passwords={ADMIN:"Test-A9!"+randomBytes(20).toString("hex"),SALESPERSON:"Test-S9!"+randomBytes(20).toString("hex")};
const node=path.join(bundle,"resources/runtime/node.exe"),payload=path.join(bundle,"resources/payload");
const sourceMode=process.argv.includes("--source");
let recoveryPlan;
const result={format:"SHOP_POS_NATIVE_OPERATION_KEY_LIFECYCLE_V1",sourceMode,dataRoot,bundle,productionActivation:false,checks:[]};
writeFileSync(path.join(evidence,"backend-attempt.json"),JSON.stringify(result,null,2));
async function protect(){
 const job=spawn(path.join(process.env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoProfile","-NonInteractive","-File",path.resolve("desktop/private-data.ps1")],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
 let output="";job.stdout.on("data",b=>output+=b);job.stdin.end(JSON.stringify({directory:dataRoot}));
 const [code]=await once(job,"exit");assert.equal(code,0);assert.equal(output,"true");
}

async function boot(enroll){
 const env={...process.env,NODE_ENV:"test",NEXT_TELEMETRY_DISABLED:"1"};for(const key of ["NODE_OPTIONS","NODE_PATH","NODE_EXTRA_CA_CERTS","NODE_V8_COVERAGE"])delete env[key];
 const args=sourceMode?["--experimental-transform-types","--disable-warning=ExperimentalWarning","--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",path.resolve("web/tests/helpers/desktop-recovery-probe.mjs")]:[path.join(payload,"server/desktop/test-entry.js")];
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
   else if(m?.type==="fatal"){clearTimeout(timer);reject(Error("Backend rejected at "+(m.stage??"UNCLASSIFIED")+"; original operation retained."));child.send({type:"stop"});}
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
function keys(live,role,cookies,command){return new Promise((resolve,reject)=>{
 const id=randomUUID(),timer=setTimeout(()=>{live.child.off("message",receive);reject(Error("Native marker acknowledgement unconfirmed."));},25000);
 function receive(m){if(m?.type!=="operation-keys-result"||m.id!==id)return;clearTimeout(timer);live.child.off("message",receive);resolve(m.value);}
 live.child.on("message",receive);live.child.send({type:"operation-keys",id,value:{role,cookie:cookies.map(c=>c.split(";")[0]).join("; "),command}});
 });}
let live;
try{
 await protect();live=await boot(true);check("fresh protected runtime with metadata checkpoint, no persistent browser/auth profile");
 const login=async role=>{const r=await request(live,role,"/api/auth/login",[],{password:passwords[role]});assert.equal(r.status,200);return r.headers["set-cookie"];};
 let admin=await login("ADMIN"),staff=await login("SALESPERSON");
 const readCommand={module:"sales",action:"read"};
 assert.equal((await keys(live,"SALESPERSON",[],readCommand)).ok,false);
 assert.equal((await keys(live,"SALESPERSON",admin,readCommand)).ok,false);
 assert.equal((await keys(live,"ADMIN",staff,{module:"inventory",action:"read"})).ok,false);
 assert.equal((await keys(live,"SALESPERSON",staff,{module:"inventory",action:"read"})).ok,false);
 assert.equal((await keys(live,"ADMIN",admin,readCommand)).ok,false);
 check("genuine gateway denies guest, cross-role cookies and foreign module; URL and client role do not authorize");
 const staffMarkers={returns:{v:1,context:"d".repeat(64),key:randomUUID(),kind:"REFUND",state:"PENDING"},expenses:{v:1,context:"e".repeat(64),key:randomUUID(),kind:"CREATE",state:"PENDING"}};
 for(const [module,marker]of Object.entries(staffMarkers)){
  let snap=await keys(live,"SALESPERSON",staff,{module,action:"read"});assert.equal(snap.ok,true);assert.equal(snap.value.marker,null);
  if(module==="returns")assert.equal((await keys(live,"SALESPERSON",staff,{module,action:"cas",revision:snap.value.revision,expected:null,next:{...marker,kind:"DISPOSITION"}})).ok,false);
  snap=await keys(live,"SALESPERSON",staff,{module,action:"cas",revision:snap.value.revision,expected:null,next:marker});assert.equal(snap.ok,true);
  const other=await keys(live,"ADMIN",admin,{module,action:"read"});assert.equal(other.ok,true);assert.equal(other.value.marker,null);
 }
 const context=await request(live,"ADMIN","/api/admin/inventory/recovery-context",admin);
 const made=await request(live,"ADMIN","/api/admin/products",admin,{requestKey:randomUUID(),name:"TEST original key fixture",unit:"PACK",buyingPricePaisa:"10000",sellingPricePaisa:"11000",sellingActive:true,openingQuantity:"12",lowStockThreshold:"2"},{"x-inventory-context":context.value.context});assert.equal(made.status,200);const product=made.value.product;
 const saleContext=await request(live,"SALESPERSON","/api/pos/sales/context",staff);assert.equal(saleContext.status,200);
 const pending={v:1,context:saleContext.value.context,key:randomUUID(),kind:"SALE",state:"PENDING"};
 let read=await keys(live,"SALESPERSON",staff,readCommand);assert.equal(read.ok,true);assert.equal(read.value.marker,null);
 const claim={module:"sales",action:"cas",revision:read.value.revision,expected:null,next:pending};
 read=await keys(live,"SALESPERSON",staff,claim);assert.equal(read.ok,true);assert.deepEqual(read.value.marker,pending);assert.equal((await keys(live,"SALESPERSON",staff,claim)).ok,false);
 const attempted={...pending,state:"ATTEMPTED"};read=await keys(live,"SALESPERSON",staff,{module:"sales",action:"cas",revision:read.value.revision,expected:pending,next:attempted});assert.equal(read.ok,true);
 const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const command={requestKey:pending.key,context:pending.context,lines:[{productId:product.id,quantity:"3",unitPricePaisa:"11000",discountPercent:"5"}],cashPaisa:"32000",cashDate:date};
 const admission=await request(live,"SALESPERSON","/api/counter-cash/admissions",staff,{kind:"SALE",key:command.requestKey,input:command});assert.equal(admission.status,200);
 const sold=await request(live,"SALESPERSON","/api/pos/sales",staff,command);assert.equal(sold.status,200);assert.equal(sold.value.totalPaisa,"31500");
 // Deliberately do not publish client CONFIRMED. This is a real backend kill,
 // with an uncertain client marker; it is not an Electron renderer test.
 const oldStaff=staff,oldChild=live.child,exited=once(oldChild,"exit");oldChild.kill();await exited;live=undefined;await delay(1000);
 check("durable original key precedes actual financial POST; owned backend killed with ATTEMPTED marker after real COMMIT");
 live=await boot(false);assert.equal((await keys(live,"SALESPERSON",oldStaff,readCommand)).ok,false);assert.equal((await keys(live,"SALESPERSON",[],readCommand)).ok,false);
 admin=await login("ADMIN");staff=await login("SALESPERSON");read=await keys(live,"SALESPERSON",staff,readCommand);assert.equal(read.ok,true);assert.deepEqual(read.value.marker,attempted);
 const outcome=await request(live,"SALESPERSON","/api/pos/sale-operations/"+pending.key,staff,undefined,{"x-sales-context":pending.context});assert.equal(outcome.status,200);assert.equal(outcome.value.state,"COMMITTED");assert.deepEqual(outcome.value.receipt,sold.value);
 assert.equal((await request(live,"ADMIN","/api/admin/products/"+product.id,admin)).value.quantity,"9");
 const confirmed={...pending,state:"CONFIRMED"};read=await keys(live,"SALESPERSON",staff,{module:"sales",action:"cas",revision:read.value.revision,expected:attempted,next:confirmed});assert.equal(read.ok,true);
 read=await keys(live,"SALESPERSON",staff,{module:"sales",action:"cas",revision:read.value.revision,expected:confirmed,next:null});assert.equal(read.ok,true);
 check("restart rejects old sessions, fresh login restores exact original key/context/state and retrieves the sole committed receipt without financial replay");
 for(const [module,marker]of Object.entries(staffMarkers)){
  let snap=await keys(live,"SALESPERSON",staff,{module,action:"read"});assert.equal(snap.ok,true);assert.deepEqual(snap.value.marker,marker);
  const next={...marker,state:"CONFIRMED"};snap=await keys(live,"SALESPERSON",staff,{module,action:"cas",revision:snap.value.revision,expected:marker,next});assert.equal(snap.ok,true);
  assert.equal((await keys(live,"SALESPERSON",staff,{module,action:"cas",revision:snap.value.revision,expected:next,next:null})).ok,true);
 }
 check("Staff refund/expense original markers survive restart in separate role slots; Admin cannot see them and Staff disposition metadata is refused");

 if(process.argv.includes("--atomic-count")){
  let countSession;
  for(const [index,action]of ["START_COUNT","START_COUNT","RECORD_COUNT"].entries()){
   const ctx=await request(live,"ADMIN","/api/admin/cash/context",admin);assert.equal(ctx.status,200);
   const marker={v:1,context:ctx.value.context,key:randomUUID(),kind:"CASH",state:"PENDING"};
   let snap=await keys(live,"ADMIN",admin,{module:"cash",action:"read"});assert.equal(snap.ok,true);assert.equal(snap.value.marker,null);
   snap=await keys(live,"ADMIN",admin,{module:"cash",action:"cas",revision:snap.value.revision,expected:null,next:marker});assert.equal(snap.ok,true);
   const armed={...marker,state:"ATTEMPTED"};snap=await keys(live,"ADMIN",admin,{module:"cash",action:"cas",revision:snap.value.revision,expected:marker,next:armed});assert.equal(snap.ok,true);
   const input=action==="START_COUNT"?{businessDate:date,evidence:"TEST genuine atomic physical count crash acceptance"}:{sessionId:countSession,actualPaisa:"31500",evidence:"TEST physical observed banknotes; historical opening remains unknown"};
   const done=await request(live,"ADMIN","/api/admin/cash-actions/"+marker.key+"/execute",admin,{context:marker.context,confirmation:"ADMIN_VERIFIED_CASH_FACTS",action,input,password:passwords.ADMIN});assert.equal(done.status,200);assert.equal(done.value.state,"COMMITTED");if(action==="START_COUNT")countSession=done.value.result.sessionId;
   if(index!==1){
    const stale=admin,child=live.child,ended=once(child,"exit");child.kill();await ended;live=undefined;await delay(1000);live=await boot(false);
    assert.equal((await keys(live,"ADMIN",stale,{module:"cash",action:"read"})).ok,false);admin=await login("ADMIN");staff=await login("SALESPERSON");
    snap=await keys(live,"ADMIN",admin,{module:"cash",action:"read"});assert.equal(snap.ok,true);assert.deepEqual(snap.value.marker,armed);
    const recovered=await request(live,"ADMIN","/api/admin/cash-operations/"+marker.key,admin,undefined,{"x-cash-context":marker.context});assert.equal(recovered.status,200);assert.deepEqual(recovered.value,done.value);
    assert.equal((await request(live,"ADMIN","/api/admin/products/"+product.id,admin)).value.quantity,"9");
    check("actual backend crash after atomic "+action+" COMMIT preserves DPAPI original key, exact sole outcome and stock; stale session refused; no replay");
   }
   const confirmed={...marker,state:"CONFIRMED"};snap=await keys(live,"ADMIN",admin,{module:"cash",action:"cas",revision:snap.value.revision,expected:armed,next:confirmed});assert.equal(snap.ok,true);
   assert.equal((await keys(live,"ADMIN",admin,{module:"cash",action:"cas",revision:snap.value.revision,expected:confirmed,next:null})).ok,true);
  }
  const history=await request(live,"ADMIN","/api/admin/cash/history?from="+date+"&to="+date+"&kind=COUNTS",admin);assert.equal(history.status,200);assert.equal(history.value.items.length,1);
 }
 const kinds={inventory:"ADJUST",returns:"REFUND",expenses:"CREATE",invoices:"CORRECT",cash:"CASH",settings:"SETTINGS",backup:"manual"};
 for(const [module,kind]of Object.entries(kinds)){
  const marker=module==="backup"?{key:randomUUID(),kind}:{v:1,context:"a".repeat(64),key:randomUUID(),kind,state:"PENDING"};
  let snap=await keys(live,"ADMIN",admin,{module,action:"read"});assert.equal(snap.ok,true);snap=await keys(live,"ADMIN",admin,{module,action:"cas",revision:snap.value.revision,expected:null,next:marker});assert.equal(snap.ok,true);
  if(module!=="backup"){const next={...marker,state:"CONFIRMED"};snap=await keys(live,"ADMIN",admin,{module,action:"cas",revision:snap.value.revision,expected:marker,next});assert.equal(snap.ok,true);}
  const cleared=await keys(live,"ADMIN",admin,{module,action:"cas",revision:snap.value.revision,expected:snap.value.marker,next:null});assert.equal(cleared.ok,true);
 }
 check("all eight typed marker families use authenticated exact CAS, with original UI admission/acknowledgement semantics");
 await live.close();live=undefined;result.status="PASS";writeFileSync(path.join(evidence,"operation-key-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){result.status="FAIL";result.error=String(error);writeFileSync(path.join(evidence,"operation-key-result.json"),JSON.stringify(result,null,2));if(live)await live.close().catch(()=>{});throw error;}