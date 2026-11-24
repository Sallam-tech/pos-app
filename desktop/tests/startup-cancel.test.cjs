const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),path=require("node:path"),{EventEmitter}=require("node:events");
const source=fs.readFileSync("desktop/main.cjs","utf8"),start=source.indexOf("async function boot(){"),end=source.indexOf("\nvoid boot().catch",start),boot=source.slice(start,end);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(stage){const gate=deferred(),calls={verify:0,spawn:0,start:0};const child=new EventEmitter();child.send=m=>{if(m.type==="start")calls.start++;};const context={process:{platform:"win32",arch:"x64",argv:["app.exe"],env:{}},path:path.win32,app:{getVersion:()=>"0.2.0-test.21r2",getPath:()=>"C:\\test",setPath(){},requestSingleInstanceLock:()=>true,quit(){},whenReady:async()=>{}},resolveInstalledDataRoot:()=>({mode:"test",dataRoot:"C:\\test\\ShopPOSTestData"}),prepareNormalDataRootParent(){},protectData(){},showStartupWindow(){},installerGuard:()=>stage==="guard"?gate.promise:Promise.resolve(),verifyPayload:()=>{calls.verify++;return stage==="verify"?gate.promise:Promise.resolve();},Menu:{buildFromTemplate:v=>v,setApplicationMenu(){}},spawn:()=>{calls.spawn++;return child;},root:"C:\\resources",payload:"C:\\resources\\payload",__dirname:"C:\\app",shutdownStarted:false,quitting:false,roleWindows:new Map(),sharedLoginRequests:new Map(),markerRequests:new Map(),diagnostic(){},unavailable(){throw Error("Unexpected error");}};vm.createContext(context);vm.runInContext(boot,context);return {context,calls,gate};}
const tick=()=>new Promise(setImmediate);
test("normal admitted startup still verifies payload before starting one backend",async()=>{const f=fixture("verify"),pending=f.context.boot();await tick();assert.equal(f.calls.spawn,0);f.gate.resolve();await pending;assert.deepEqual(f.calls,{verify:1,spawn:1,start:1});});
test("closing during payload verification never starts a hidden backend afterwards",async()=>{const f=fixture("verify"),pending=f.context.boot();await tick();f.context.shutdownStarted=true;f.context.quitting=true;f.gate.resolve();await pending;assert.equal(f.calls.spawn,0);assert.equal(f.calls.start,0);});
test("closing during installer admission does not continue into payload or backend startup",async()=>{const f=fixture("guard"),pending=f.context.boot();await tick();f.context.shutdownStarted=true;f.context.quitting=true;f.gate.resolve();await pending;assert.equal(f.calls.verify,0);assert.equal(f.calls.spawn,0);});

test("installer admission and payload verification overlap Electron readiness, but backend waits",async()=>{
 const f=fixture("verify"),electron=deferred();f.context.app.whenReady=()=>electron.promise;
 const pending=f.context.boot();await tick();assert.equal(f.calls.verify,1);assert.equal(f.calls.spawn,0);
 f.gate.resolve();await tick();assert.equal(f.calls.spawn,0);electron.resolve();await pending;assert.equal(f.calls.start,1);
});
test("installer rejection fails closed even when Electron is not ready",async()=>{
 const f=fixture("guard"),electron=deferred();f.context.app.whenReady=()=>electron.promise;
 f.context.installerGuard=()=>Promise.reject(Error("denied"));
 await assert.rejects(f.context.boot(),/denied/);assert.equal(f.calls.verify,0);assert.equal(f.calls.spawn,0);
 f.context.shutdownStarted=true;electron.resolve();await tick();
});
test("payload rejection never starts backend after Electron becomes ready",async()=>{
 const f=fixture("verify"),electron=deferred();f.context.app.whenReady=()=>electron.promise;
 f.context.verifyPayload=()=>Promise.reject(Error("invalid payload"));
 await assert.rejects(f.context.boot(),/invalid payload/);assert.equal(f.calls.spawn,0);
 f.context.shutdownStarted=true;electron.resolve();await tick();assert.equal(f.calls.start,0);
});
test("production identity cannot enter the TEST backend before production admission exists",async()=>{
 const f=fixture("verify");let touched=false;
 f.context.resolveInstalledDataRoot=()=>({mode:"production",dataRoot:"C:\\production"});
 f.context.protectData=()=>{touched=true;};
 await assert.rejects(f.context.boot(),/Production runtime admission unavailable/);
 assert.equal(touched,false);assert.equal(f.calls.spawn,0);
});
