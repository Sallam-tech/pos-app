"use strict";
const {app,BrowserWindow,Menu,ipcMain,dialog,session}=require("electron");
const {spawn,spawnSync}=require("node:child_process");
const {createHash,X509Certificate,randomUUID}=require("node:crypto");
const {verifyPayload}=require("./payload-integrity.cjs");
const {resolveInstalledDataRoot}=require("./data-root-policy.cjs");
const {passwordInput,cookiesForRole}=require("./shared-login.cjs");
const fs=require("node:fs"),path=require("node:path"),{pathToFileURL}=require("node:url");
const payload=path.join(process.resourcesPath,"payload"),root=process.resourcesPath;
const roleWindows=new Map(),roleOrigins=new Map();let startupWindow,child,setupWindow,pendingSetup,setupValues,ready,quitting=false,shutdownStarted=false,initializing=true;
app.enableSandbox();
let ownerWindow,ownerRequest,recoveryBusy=false,recoveryCompleted=false;
let sharedLoginBusy=false;const sharedLoginRequests=new Map();
const diagnosticHarness=process.argv.includes("--disposable-harness");let diagnosticPath,diagnosticStreamOpen=true;if(diagnosticHarness)process.stderr.on("error",()=>{diagnosticStreamOpen=false;});
let evaluationMode=false,shopMode=false;
app.on("browser-window-created",(_event,window)=>{if(shopMode||evaluationMode){window.setTitle("Shop POS");window.on("page-title-updated",event=>{event.preventDefault();window.setTitle("Shop POS");});}});
function productTitle(){return shopMode?"Shop POS":"Shop POS TEST";}
function safeErrorMessage(){return shopMode?"Shop POS could not open. Saved shop data has been retained. Nothing was reset.":"Shop POS TEST unavailable. Existing data has been retained. No production activation or automatic reset was performed.";}
function diagnostic(value){if(diagnosticHarness){if(diagnosticPath)try{fs.appendFileSync(diagnosticPath,value+"\n");}catch{}if(diagnosticStreamOpen)try{process.stderr.write("SHOP_POS_TEST_LIFECYCLE "+value+"\n",error=>{if(error)diagnosticStreamOpen=false;});}catch{diagnosticStreamOpen=false;}}}
function protectData(directory){
 // These tiny native helpers are pinned before first execution. The complete
 // inventory is still verified before any backend/database/account startup.
 const helpers={"private-data.ps1":"e2bbc7ab94d42931f542ab576b5e4328c3908b68c11f7885896b699087aca2af","lifecycle.ps1":"c60f5ce8c095948068d027517c8232d16cd8d9409ae9235e0813b8797275c8f7"};
 for(const [name,expected]of Object.entries(helpers)){const file=path.join(__dirname,name),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||createHash("sha256").update(fs.readFileSync(file)).digest("hex")!==expected)throw Error();}
 const result=spawnSync(path.join(process.env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoLogo","-NoProfile","-NonInteractive","-File",path.join(__dirname,"private-data.ps1")],{windowsHide:true,input:JSON.stringify({directory}),encoding:"utf8",maxBuffer:8192,timeout:15000});
 if(result.error||result.status!==0||result.stderr||result.stdout!=="true")throw Error();
}
function prepareNormalDataRootParent(dataRoot,mode){
 const base=path.join(process.env.LOCALAPPDATA,"Programs","SalamTech");
 const parts=mode==="production"?["ShopPOSData"]:mode==="evaluation"?["0.2.0-eval.3"]:["0.2.0-test.21r2"];
 const parent=path.join(base,...parts);
 if(path.resolve(path.dirname(dataRoot))!==path.resolve(parent))throw Error();
 const baseStat=fs.lstatSync(base);if(!baseStat.isDirectory()||baseStat.isSymbolicLink())throw Error();
 let current=base;
 for(const part of parts){
  current=path.join(current,part);
  try{const stat=fs.lstatSync(current);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error();}
  catch(error){if(error?.code!=="ENOENT")throw error;fs.mkdirSync(current);const stat=fs.lstatSync(current);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error();}
 }
}
function harden(window,allowed){
 window.webContents.setWindowOpenHandler(()=>({action:"deny"}));
 window.webContents.on("will-navigate",(event,url)=>{if(!allowed(url))event.preventDefault();});
 window.webContents.on("will-frame-navigate",(event)=>{if(!allowed(event.url))event.preventDefault();});
 window.webContents.on("will-attach-webview",event=>event.preventDefault());
 window.webContents.on("devtools-opened",()=>window.webContents.closeDevTools());
 window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 window.webContents.session.setPermissionCheckHandler(()=>false);
 window.webContents.session.on("will-download",event=>event.preventDefault());
}
const appIcon=path.join(__dirname,"shop-logo.ico");
function preferences(partition,preload){return {nodeIntegration:false,nodeIntegrationInWorker:false,nodeIntegrationInSubFrames:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,devTools:false,partition,...(preload?{preload}:{})};}
function closeStartupWindow(){if(startupWindow&&!startupWindow.isDestroyed())startupWindow.destroy();startupWindow=undefined;}
function showStartupWindow(){
 startupWindow=new BrowserWindow({width:500,height:260,resizable:false,title:"Opening Shop POS",icon:appIcon,webPreferences:preferences("startup-"+Date.now())});
 const html=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Opening Shop POS</title></head><body style="font:18px Segoe UI,sans-serif;background:#f0f7f4;color:#102b3e;padding:32px"><h2>Opening Shop POS</h2><p>Checking your protected database and backups.</p><p style="font-size:14px">Please wait. Your saved data is being kept safe.</p></body></html>`;
 const target="data:text/html;charset=utf-8,"+encodeURIComponent(html);harden(startupWindow,url=>url===target);
 startupWindow.on("close",event=>{if(!quitting&&!shutdownStarted){event.preventDefault();void close();}});void startupWindow.loadURL(target);
}
function setupPage(){return shopMode?"shop-setup.html":"setup.html";}
function setup(message){
 closeStartupWindow();
 if(setupWindow||pendingSetup)throw Error();pendingSetup=message;
 setupWindow=new BrowserWindow({width:650,height:720,title:shopMode?"Shop POS setup":"Disposable TEST setup",icon:appIcon,webPreferences:preferences("setup-"+message.id,path.join(__dirname,"setup-preload.cjs"))});
 const expected=pathToFileURL(path.join(__dirname,setupPage())).href;harden(setupWindow,url=>url===expected);
 setupWindow.on("closed",()=>{setupWindow=undefined;if(pendingSetup){child?.send({type:"reply",id:pendingSetup.id,value:"CANCELLED"});pendingSetup=undefined;setupValues=undefined;void close();}});
 void setupWindow.loadFile(path.join(__dirname,setupPage()));
}
async function validSetupPasswords(value){
 if(value.ADMIN===value.SALESPERSON)return false;
 try{const {assertOfflinePassword}=await import(pathToFileURL(path.join(payload,"server/auth/offline-password.js")).href);assertOfflinePassword(value.ADMIN);assertOfflinePassword(value.SALESPERSON);return true;}catch{return false;}
}
ipcMain.handle("shop-pos:trusted-test-setup",async(event,value)=>{
 const expected=pathToFileURL(path.join(__dirname,setupPage())).href;
 if(!setupWindow||!pendingSetup||event.sender!==setupWindow.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!==expected||!value||Object.keys(value).sort().join(",")!=="ADMIN,SALESPERSON,confirmed"||value.confirmed!==true||["ADMIN","SALESPERSON"].some(k=>typeof value[k]!=="string"||value[k].length<8||value[k].length>128))return {ok:false};
 // Preflight only: the unchanged sole account provisioner still performs every policy/KDF/ownership check.
 const submittedWindow=setupWindow,submittedRequest=pendingSetup;
 if(submittedRequest.value.action==="FIRST_ENROLLMENT"&&!await validSetupPasswords(value)){diagnostic("SETUP_POLICY_REJECTED");return {ok:false,code:"PASSWORD_POLICY"};}
 // Revalidate the exact original window/request after asynchronous module loading; close/cancel wins.
 if(!setupWindow||setupWindow!==submittedWindow||pendingSetup!==submittedRequest||event.sender!==setupWindow.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!==expected||shutdownStarted)return {ok:false};
 const request=pendingSetup;pendingSetup=undefined;setupValues={ADMIN:value.ADMIN,SALESPERSON:value.SALESPERSON};
 child.send({type:"reply",id:request.id,value:request.value.action==="FIRST_ENROLLMENT"?"CONFIRM_FIRST_ENROLLMENT":"CONFIRM_MATCHING_COMMITTED_ENROLLMENT"});
 setupWindow.destroy();setupWindow=undefined;return {ok:true};
});

function recoveryPage(){return shopMode?"shop-recovery.html":"recovery.html";}
function ownerSender(event){const expected=pathToFileURL(path.join(__dirname,recoveryPage())).href;return !!ownerWindow&&!!ownerRequest&&event.sender===ownerWindow.webContents&&event.senderFrame===event.sender.mainFrame&&event.senderFrame.url===expected;}
function ownerForm(request){
 if(ownerWindow||ownerRequest||setupWindow||pendingSetup||shutdownStarted)throw Error();ownerRequest=request;
 ownerWindow=new BrowserWindow({width:740,height:850,title:shopMode?"Shop POS recovery":"Shop POS TEST owner recovery",icon:appIcon,webPreferences:preferences("owner-"+Date.now(),path.join(__dirname,"recovery-preload.cjs"))});const expected=pathToFileURL(path.join(__dirname,recoveryPage())).href;harden(ownerWindow,url=>url===expected);
 ownerWindow.on("closed",()=>{ownerWindow=undefined;const r=ownerRequest;ownerRequest=undefined;if(r?.id)child?.send({type:"reply",id:r.id,value:"CANCELLED"});if(["RECOVERY","RECOVERY_REVIEW","QUARANTINE"].includes(r?.mode))recoveryBusy=false;});void ownerWindow.loadFile(path.join(__dirname,recoveryPage()));
}
ipcMain.handle("shop-pos:native-owner-context",async event=>ownerSender(event)?{mode:ownerRequest.mode,description:ownerRequest.description??(ownerRequest.mode==="RECOVERY"?"Archive: "+path.basename(ownerRequest.archive)+"; SHA256: "+ownerRequest.archiveSha256:"Native CURRENT generation "+ownerRequest.generation+". A fresh backup namespace will retain the original custody and all prior archives.")}:undefined);
ipcMain.handle("shop-pos:native-owner-submit",async(event,value)=>{
 if(!ownerSender(event)||!value||value.confirmed!==true)return {ok:false};const r=ownerRequest,keys=["RECOVERY","RECOVERY_REVIEW"].includes(r.mode)?["ADMIN","SALESPERSON","confirmed","sourceAdmin"]:r.mode==="QUARANTINE"?["sourceAdmin","confirmed"]:["ADMIN","confirmed"];
 if(Object.keys(value).sort().join(",")!==keys.sort().join(",")||keys.filter(k=>k!=="confirmed").some(k=>typeof value[k]!=="string"||value[k].length<8||value[k].length>128))return {ok:false};
 ownerRequest=undefined;ownerWindow.destroy();ownerWindow=undefined;
 if(["RECOVERY_REVIEW","QUARANTINE"].includes(r.mode)){const reply={sourceAdmin:value.sourceAdmin,...(r.mode==="RECOVERY_REVIEW"?{ADMIN:value.ADMIN,SALESPERSON:value.SALESPERSON}:{})};child.send({type:"reply",id:r.id,value:reply});}
 else if(r.mode==="BACKUP_HANDOFF")child.send({type:"reply",id:r.id,value:value.ADMIN});
 else{for(const window of roleWindows.values())if(!window.isDestroyed())window.hide();child.send({type:"recover",value:{archive:r.archive,archiveSha256:r.archiveSha256,sourceAdmin:value.sourceAdmin,ADMIN:value.ADMIN,SALESPERSON:value.SALESPERSON}});}
 return {ok:true};
});
async function chooseRecovery(){
 if(!ready||recoveryBusy||sharedLoginBusy||shutdownStarted||ownerWindow)return;recoveryBusy=true;
 try{const selected=await dialog.showOpenDialog({title:shopMode?"Choose protected shop archive":"Choose existing protected TEST archive",properties:["openFile"],filters:[{name:"Protected encrypted snapshot",extensions:["age"]}]});if(selected.canceled||selected.filePaths.length!==1){recoveryBusy=false;return;}const archive=selected.filePaths[0],stat=fs.lstatSync(archive);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size<1||stat.size>2147483648)throw Error();const digest=createHash("sha256");for await(const bytes of fs.createReadStream(archive))digest.update(bytes);ownerForm({mode:"RECOVERY",archive,archiveSha256:digest.digest("hex")});}catch{recoveryBusy=false;unavailable();}
}
async function ownerConfirmation(message){
 const r=message.value,selection=message.type==="confirm-writer-selection",quarantine=message.type==="confirm-quarantine",fields=selection?["action","operationId","destinationFileIdentity","targetStateDigest","targetVaultDigest","productionActivation"]:quarantine?["action","operationId","destinationFileIdentity","sourceStateDigest","intentDigest","sqlOutcome","productionActivation"]:["action","operationId","archiveSha256","sourceFileIdentity","productionActivation"];
 const action=selection?"SELECT_KNOWN_COMPLETED_WRITER":quarantine?"QUARANTINE_NEVER_ADMITTED":"RESTORE_SEPARATE_PROTECTED41";
 if(!recoveryBusy||!r||Object.keys(r).sort().join(",")!==fields.sort().join(",")||r.productionActivation!==false||r.action!==action||! /^[a-f0-9-]{36}$/.test(r.operationId)||quarantine&&r.sqlOutcome!=="UNKNOWN"||fields.filter(k=>!["action","operationId","productionActivation","sqlOutcome"].includes(k)).some(k=>!(quarantine&&k==="intentDigest"&&r[k]===null)&&! /^[a-f0-9]{64}$/.test(r[k])))throw Error();
 const result=await dialog.showMessageBox({type:"warning",title:shopMode?"Confirm exact shop recovery operation":"Confirm exact TEST recovery operation",message:selection?"Select this exact known completed database and retire the prior writer?":quarantine?"Permanently deny this never-admitted candidate? Its SQL outcome remains UNKNOWN. All original data will be retained.":"Create this separate restore candidate?",detail:fields.filter(k=>k!=="action").map(k=>k+": "+r[k]).join("\n"),buttons:["Cancel",shopMode?"Confirm exact shop operation":"Confirm exact TEST operation"],defaultId:0,cancelId:0,noLink:true});
 child?.send({type:"reply",id:message.id,value:result.response===1?(selection?"CONFIRM_TEST_WRITER_SELECTION":quarantine?"CONFIRM_PERMANENT_NO_ADMISSION":"CONFIRM_SEPARATE_TEST_RESTORE41"):"CANCELLED"});
}

function roleWindow(role,initialPath="/login"){
 if(!ready||quitting)return;
 const existing=roleWindows.get(role);if(existing&&!existing.isDestroyed()){existing.show();existing.focus();return existing;}
 const origin=ready.origins[role],partition="role-"+role+"-"+Date.now(),ses=session.fromPartition(partition,{cache:false});
 ses.setCertificateVerifyProc((request,callback)=>{
  try{
   if(!["localhost","127.0.0.1"].includes(request.hostname))return callback(-2);
   const actual=new X509Certificate(request.certificate.data),expected=new X509Certificate(ready.certificate),ca=new X509Certificate(ready.trustAnchor),now=Date.now();
   const valid=actual.fingerprint256===expected.fingerprint256&&actual.verify(ca.publicKey)&&actual.checkIssued(ca)&&!actual.ca&&ca.ca&&now>=Math.max(Date.parse(actual.validFrom),Date.parse(ca.validFrom))&&now<Math.min(Date.parse(actual.validTo),Date.parse(ca.validTo))&&(request.hostname==="localhost"?actual.checkHost("localhost",{subject:"never",wildcards:false}):actual.checkIP("127.0.0.1"));
   callback(valid?0:-2);
  }catch{callback(-2);}
 });
 ses.webRequest.onBeforeRequest((details,callback)=>{try{callback({cancel:new URL(details.url).origin!==origin});}catch{callback({cancel:true});}});
 const window=new BrowserWindow({width:1280,height:900,title:"Shop POS TEST - "+role,icon:appIcon,webPreferences:preferences(partition,path.join(__dirname,"operation-key-preload.cjs"))});
 window.webContents.once("did-finish-load",closeStartupWindow);
 const contentsId=window.webContents.id;roleWindows.set(role,window);roleOrigins.set(contentsId,origin);
 harden(window,url=>{try{return new URL(url).origin===origin;}catch{return false;}});
 window.webContents.on("preload-error",()=>diagnostic("OPERATION_KEYS_PRELOAD_ERROR"));
 window.on("close",event=>{if(!quitting&&roleWindows.size===1){event.preventDefault();void close();}});
 window.on("closed",()=>{roleOrigins.delete(contentsId);roleWindows.delete(role);void ses.clearStorageData();});
 if(initialPath!==null)void window.loadURL(origin+initialPath);
 return window;
}

function sharedLoginSender(event,source,role){
 try{return !shutdownStarted&&!recoveryBusy&&!!ready&&!!source&&!source.isDestroyed()&&roleWindows.get(role)===source&&event.sender===source.webContents&&event.senderFrame===event.sender.mainFrame&&event.senderFrame.url===ready.origins[role]+"/login"&&event.sender.getURL()===event.senderFrame.url&&roleOrigins.get(event.sender.id)===ready.origins[role];}catch{return false;}
}
ipcMain.handle("shop-pos:shared-login",async(event,password)=>{
 const sourceRole=[...roleWindows].find(([,w])=>!w.isDestroyed()&&w.webContents===event.sender)?.[0],source=roleWindows.get(sourceRole);
 if(sharedLoginBusy||!child?.connected||!passwordInput(password)||!sharedLoginSender(event,source,sourceRole))return{ok:false};
 sharedLoginBusy=true;let issued=false;
 try{
  const id=randomUUID(),value=await new Promise(resolve=>{
   const finish=value=>{clearTimeout(timer);sharedLoginRequests.delete(id);resolve(value);};
   const timer=setTimeout(()=>{finish({ok:false});void close();},45000);
   sharedLoginRequests.set(id,{finish});child.send({type:"shared-login",id,value:{password}},error=>{if(error)finish({ok:false});});
  });
  password=undefined;
  if(!value||value.ok!==true)return{ok:false};
  issued=true;
  if(Object.keys(value).sort().join(",")!=="cookies,ok,role"||!sharedLoginSender(event,source,sourceRole))throw Error();
  const records=cookiesForRole(value.cookies,value.role,ready.origins[value.role]);
  const target=roleWindow(value.role,null);if(!target||target.isDestroyed())throw Error();
  for(const record of records){if(!sharedLoginSender(event,source,sourceRole)||target.isDestroyed())throw Error();await target.webContents.session.cookies.set(record);}
  if(!sharedLoginSender(event,source,sourceRole)||target.isDestroyed())throw Error();
  await target.loadURL(ready.origins[value.role]+(value.role==="ADMIN"?"/admin/dashboard":"/pos"));
  if(shutdownStarted||target.isDestroyed()||(source!==target&&!sharedLoginSender(event,source,sourceRole)))throw Error();
  if(source!==target&&!source.isDestroyed())source.destroy();
  target.show();target.focus();return{ok:true};
 }catch{if(issued)void close();return{ok:false};}
 finally{password=undefined;sharedLoginBusy=false;}
});

const markerRequests=new Map(),markerBusy=new Map();let markerTotal=0;
ipcMain.handle("shop-pos:operation-keys",async(event,command)=>{
 const denied={ok:false};let role,markerStage="ADMISSION";
 try{
  if(!ready||shutdownStarted||recoveryBusy||!child?.connected||!command||typeof command!=="object"||Array.isArray(command)||JSON.stringify(command).length>1600||event.senderFrame!==event.sender.mainFrame){diagnostic("OPERATION_KEYS_DENIED_"+markerStage);return denied;}
  markerStage="SENDER";role=[...roleWindows].find(([,w])=>!w.isDestroyed()&&w.webContents===event.sender)?.[0];
  if(!role||event.senderFrame.url!==event.sender.getURL()||new URL(event.senderFrame.url).origin!==ready.origins[role]||roleOrigins.get(event.sender.id)!==ready.origins[role]){diagnostic("OPERATION_KEYS_DENIED_"+markerStage);return denied;}
  if(markerTotal>=16||(markerBusy.get(event.sender.id)??0)>=8){diagnostic("OPERATION_KEYS_DENIED_BUSY");return denied;}
  const contentsId=event.sender.id;markerBusy.set(contentsId,(markerBusy.get(contentsId)??0)+1);markerTotal++;let reserved=true,backendPending=false;
  const release=()=>{if(!reserved)return;reserved=false;markerTotal--;const pending=(markerBusy.get(contentsId)??1)-1;if(pending)markerBusy.set(contentsId,pending);else markerBusy.delete(contentsId);};
  try{
   markerStage="COOKIES";const cookies=await event.sender.session.cookies.get({url:ready.origins[role]});
   const selected=cookies.filter(c=>c.secure&&c.httpOnly&&c.path==="/"&&(!c.expirationDate||c.expirationDate>Date.now()/1000));
   if(!selected.length||selected.length>8||new Set(selected.map(c=>c.name)).size!==selected.length){diagnostic("OPERATION_KEYS_DENIED_COOKIES");return denied;}
   const cookie=selected.map(c=>c.name+"="+c.value).join("; ");if(cookie.length>4096||/[\r\n\x00]/.test(cookie)||shutdownStarted||recoveryBusy)return denied;
   markerStage="BACKEND";const id=randomUUID();return await new Promise(resolve=>{
    // An ACK timeout is uncertain: retain the reservation until the original backend reply.
    const timer=setTimeout(()=>{diagnostic("OPERATION_KEYS_TIMEOUT");resolve(denied);},20000);
    markerRequests.set(id,{finish:value=>{clearTimeout(timer);markerRequests.delete(id);release();if(value?.ok!==true)diagnostic("OPERATION_KEYS_DENIED_BACKEND");resolve(value?.ok===true?value:denied);}});
    backendPending=true;try{child.send({type:"operation-keys",id,value:{role,cookie,command}},error=>{if(error)markerRequests.get(id)?.finish(denied);});}catch{markerRequests.get(id)?.finish(denied);}
   });
  }finally{if(!backendPending)release();}
 }catch{diagnostic("OPERATION_KEYS_EXCEPTION_"+markerStage);return denied;}
});
function validReady(value){
 if(!value||value.productionActivation!==false||!value.origins||Object.keys(value.origins).sort().join(",")!=="ADMIN,SALESPERSON"||typeof value.certificate!=="string"||typeof value.trustAnchor!=="string"||value.certificate.length>16384||value.trustAnchor.length>16384)return false;
 try{const admin=new URL(value.origins.ADMIN),staff=new URL(value.origins.SALESPERSON);return admin.protocol==="https:"&&staff.protocol==="https:"&&admin.hostname==="localhost"&&staff.hostname==="127.0.0.1"&&admin.port!==""&&admin.port===staff.port&&admin.origin===value.origins.ADMIN&&staff.origin===value.origins.SALESPERSON&&new X509Certificate(value.certificate).verify(new X509Certificate(value.trustAnchor).publicKey);}catch{return false;}
}
const reportedFailures=new Set();
function unavailable(){
 setupValues=undefined;const kind=shutdownStarted?"SHUTDOWN":"STARTUP";if(reportedFailures.has(kind))return;reportedFailures.add(kind);
 void dialog.showMessageBox({type:"error",title:productTitle(),message:shutdownStarted?"Safe shutdown could not be confirmed. Data and ownership are retained. Keep the application open for recovery review.":safeErrorMessage()}).then(()=>{if(kind==="STARTUP")return close();for(const window of roleWindows.values())if(!window.isDestroyed())window.show();});
}
async function close(){
 diagnostic("CLOSE_REQUESTED");
 if(shutdownStarted)return;shutdownStarted=true;setupValues=undefined;
 for(const window of roleWindows.values())if(!window.isDestroyed())window.hide();
 if(child?.connected){diagnostic("NODE_STOP_SENT");child.send({type:"stop"},error=>{if(error){quitting=true;app.quit();}});return;}
 quitting=true;app.quit();
}
app.on("before-quit",event=>{if(!quitting){event.preventDefault();void close();}});
app.on("window-all-closed",()=>{if(!initializing&&!startupWindow&&!setupWindow&&!pendingSetup&&!ownerWindow)void close();});
app.on("second-instance",()=>{for(const window of roleWindows.values()){window.show();window.focus();break;}});
app.on("web-contents-created",(_event,contents)=>{contents.on("will-attach-webview",event=>event.preventDefault());});
function installerGuard(){return new Promise((resolve,reject)=>{
 const guard=spawn(path.join(process.env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoLogo","-NoProfile","-NonInteractive","-File",path.join(__dirname,"lifecycle.ps1")],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
 let message="",ready=false;const timer=setTimeout(()=>{guard.kill();reject(Error());},15000);
 guard.stdout.on("data",value=>{message+=value.toString();if(message==="READY\r\n"||message==="READY\n"){ready=true;clearTimeout(timer);resolve();}else if(message.length>32){guard.kill();reject(Error());}});
 guard.stderr.on("data",()=>{if(!ready)reject(Error());else void close();});guard.once("error",reject);guard.once("exit",()=>{if(!ready)reject(Error());else if(!quitting)void close();});guard.stdin.end(JSON.stringify({parentId:process.pid}));
});}
async function boot(){
 const allowedArguments=new Set(["--disposable-harness","--force-renderer-accessibility"]);
 if(process.platform!=="win32"||process.arch!=="x64"||process.argv.slice(1).some(v=>!allowedArguments.has(v))||process.argv.includes("--force-renderer-accessibility")&&!process.argv.includes("--disposable-harness"))throw Error();
 const harness=process.argv.includes("--disposable-harness");
 const installation=resolveInstalledDataRoot(process.argv.slice(1),process.env,{version:app.getVersion(),executablePath:app.getPath("exe"),appDataPath:app.getPath("appData")});
 shopMode=installation.mode==="production";evaluationMode=installation.mode==="evaluation";if(shopMode||evaluationMode)app.setName("Shop POS");
 // Shop 1.0.0 uses the reviewed desktop runtime and its own durable data root.
 // The payload activation flag stays false until a signed release trust anchor exists.
 if(installation.mode!=="test"&&installation.mode!=="evaluation"&&installation.mode!=="production")throw Error("Production runtime admission unavailable.");
 const dataRoot=installation.dataRoot;
 if(!harness)prepareNormalDataRootParent(dataRoot,installation.mode);
 protectData(dataRoot);if(harness)diagnosticPath=path.join(dataRoot,"desktop-harness-lifecycle.log");app.setPath("userData",path.join(dataRoot,"browser"));
 if(!app.requestSingleInstanceLock()){quitting=true;app.quit();return;}
 // Admit and verify in parallel with Electron initialization, never with installer replacement.
 // Promise.all attaches both rejection handlers immediately; neither failure can start a backend.
 await Promise.all([
  app.whenReady().then(()=>{if(!shutdownStarted&&!quitting)showStartupWindow();}),
  installerGuard().then(()=>{if(!shutdownStarted&&!quitting)return verifyPayload(root);})
 ]);if(shutdownStarted||quitting)return;
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:shopMode||evaluationMode?"Shop POS":"Shop POS TEST",submenu:[{label:"Salesperson",click:()=>roleWindow("SALESPERSON")},{label:"Admin",click:()=>roleWindow("ADMIN")},{label:shopMode?"Recover protected archive...":"Recover disposable TEST archive...",click:()=>void chooseRecovery()},{type:"separator"},{label:"Exit",click:()=>void close()}]}]));
 const environment={...process.env,NODE_ENV:"test",NEXT_TELEMETRY_DISABLED:"1"};for(const key of Object.keys(environment))if(/^(?:NODE_OPTIONS|NODE_PATH|NODE_EXTRA_CA_CERTS|NODE_V8_COVERAGE|ELECTRON_RUN_AS_NODE|ELECTRON_EXTRA_LAUNCH_ARGS)$/i.test(key))delete environment[key];
 environment.PATH=path.join(root,"runtime")+path.delimiter+(environment.PATH??"");
 child=spawn(path.join(root,"runtime/node.exe"),[path.join(payload,"server/desktop/test-entry.js")],{env:environment,cwd:dataRoot,windowsHide:true,stdio:["ignore","ignore","ignore","ipc"]});
 child.on("message",message=>{
  if(!message||typeof message!=="object")return;
  if(message.type==="confirm-enrollment"){try{setup(message);}catch{unavailable();}}
  else if(message.type==="read-passwords"){const values=setupValues;setupValues=undefined;child.send({type:"reply",id:message.id,value:values});}
  else if(message.type==="backup-handoff-password"){try{ownerForm({mode:"BACKUP_HANDOFF",id:message.id,generation:message.value?.generation});}catch{unavailable();}}
  else if(message.type==="recovery-review"){try{const r=message.value;if(!r||r.productionActivation!==false||!["INTENT","COMMITTED"].includes(r.kind))throw Error();recoveryBusy=true;ownerForm({mode:r.kind==="COMMITTED"?"RECOVERY_REVIEW":"QUARANTINE",id:message.id,description:(shopMode?"Interrupted shop operation ":"Interrupted TEST operation ")+r.operationId+"; state "+r.kind+"; target file identity "+r.destinationFileIdentity+"; source state "+r.sourceStateDigest+". No automatic replay or promotion."});}catch{unavailable();}}
  else if(["confirm-protected-restore","confirm-writer-selection","confirm-quarantine"].includes(message.type))void ownerConfirmation(message).catch(unavailable);
  else if(message.type==="recovery-completed"){if(message.value?.status==="TEST_RECOVERY_SELECTED_BACKUP_CONFIGURED"&&message.value.productionActivation===false&&!recoveryCompleted){recoveryCompleted=true;void dialog.showMessageBox({type:"info",title:shopMode?"Shop POS recovery":"Shop POS TEST recovery",message:shopMode?"The selected shop database is ready and a new backup folder is configured. Original data was kept. Close this application, restart, and sign in with the same passwords.":"Exact TEST writer selected and new backup namespace configured. Original data retained. Close this application, restart and log in with the inherited passwords. Production remains disabled."}).then(()=>close());}else unavailable();}
  else if(message.type==="shared-login-result"&&typeof message.id==="string"){sharedLoginRequests.get(message.id)?.finish(message.value);}
  else if(message.type==="operation-keys-result"&&typeof message.id==="string"){const pending=markerRequests.get(message.id);if(pending)pending.finish(message.value);else diagnostic("OPERATION_KEYS_RESULT_LATE");}
  else if(message.type==="ready"){recoveryBusy=false;if(!validReady(message.value)){unavailable();return;}if(shutdownStarted)return;ready=message.value;initializing=false;roleWindow("SALESPERSON");}
  else if(message.type==="lifecycle"&&["STOP_RECEIVED","STARTUP_DRAINED","RUNTIME_CLOSED","TRANSPORT","BACKUPS","AUTHORIZATION","FRAMEWORK","OWNERSHIP","DRAINED","HTTP_STOPPED","HTTP_AUTH_PENDING","HTTP_BUSINESS_PENDING","HTTP_PAGE_PENDING","HTTP_HEALTH_PENDING","HTTP_HANDLERS_DRAINED","HTTP_SOCKETS_CLOSED","HTTP_LISTENER_CLOSED"].includes(message.value)){diagnostic(message.value);}
  else if(message.type==="startup-stage"&&typeof message.value==="string"&&Number.isSafeInteger(message.elapsedMs)){diagnostic("STARTUP_STAGE "+message.value.slice(0,40)+" +"+message.elapsedMs+"ms");}
  else if(message.type==="stopped"){diagnostic("NODE_STOPPED");quitting=true;app.quit();}
  else if(message.type==="fatal"){diagnostic("NODE_FATAL");unavailable();}
 });
 child.once("error",unavailable);
 child.once("exit",()=>{for(const pending of sharedLoginRequests.values())pending.finish({ok:false});for(const pending of markerRequests.values())pending.finish({ok:false});diagnostic("NODE_EXIT");child=undefined;ready=undefined;if(!shutdownStarted)unavailable();for(const window of roleWindows.values())if(!window.isDestroyed())window.destroy();if(shutdownStarted){quitting=true;app.quit();}});
 child.send({type:"start",dataRoot,applicationDirectory:path.join(payload,"app")});
}
void boot().catch(async()=>{
 try{await app.whenReady();await dialog.showMessageBox({type:"error",title:productTitle(),message:safeErrorMessage()});}
 catch{/* App never became ready; fail closed without a second crash. */}
 quitting=true;app.quit();
});
