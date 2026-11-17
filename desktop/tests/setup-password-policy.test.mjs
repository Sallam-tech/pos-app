import test from"node:test";import assert from"node:assert/strict";import fs from"node:fs";import path from"node:path";import{pathToFileURL}from"node:url";import{randomBytes}from"node:crypto";
const source=fs.readFileSync(new URL("../main.cjs",import.meta.url),"utf8"),start=source.indexOf("async function validSetupPasswords(value){"),end=source.indexOf('\nipcMain.handle("shop-pos:trusted-test-setup"',start);assert.ok(start>0&&end>start);
const payload=path.resolve("desktop/test-results/app-test10-final-360b4f2e-af37-41c6-b6c1-b8330afda56f/resources/payload");
const valid=new Function("payload","path","pathToFileURL","return ("+source.slice(start,end)+")")(payload,path,pathToFileURL);
test("actual native setup preflight uses unchanged compiled policy: common, repeated, equal refused; distinct valid accepted",async()=>{const strong=()=>"Disposable-"+randomBytes(24).toString("hex");assert.equal(await valid({ADMIN:String(12345678),SALESPERSON:String(87654321)}),false);assert.equal(await valid({ADMIN:"abababab",SALESPERSON:strong()}),false);const same=strong();assert.equal(await valid({ADMIN:same,SALESPERSON:same}),false);assert.equal(await valid({ADMIN:"short",SALESPERSON:strong()}),false);assert.equal(await valid({ADMIN:"\ud800abcdefg",SALESPERSON:strong()}),false);assert.equal(await valid({ADMIN:strong(),SALESPERSON:strong()}),true);const missing=new Function("payload","path","pathToFileURL","return ("+source.slice(start,end)+")")(payload+"-missing",path,pathToFileURL);assert.equal(await missing({ADMIN:strong(),SALESPERSON:strong()}),false);});

const ipcStart=source.indexOf('ipcMain.handle("shop-pos:trusted-test-setup"'),ipcEnd=source.indexOf("\nfunction ownerSender",ipcStart),ipcSource=source.slice(ipcStart,ipcEnd),arrow=ipcSource.slice(ipcSource.indexOf("async("),ipcSource.lastIndexOf("});")+1);
function ipcFixture(){
 const frame={url:pathToFileURL(path.resolve("desktop/setup.html")).href},contents={mainFrame:frame},sent=[];
 const state={__dirname:path.resolve("desktop"),path,pathToFileURL,setupWindow:{webContents:contents,destroy(){state.destroyed++;}},pendingSetup:{id:"test-original-request",value:{action:"FIRST_ENROLLMENT"}},setupValues:undefined,shutdownStarted:false,destroyed:0,child:{send:v=>sent.push(v)},diagnostic(){},validSetupPasswords:async()=>true};
 const invoke=new Function("state","with(state){return ("+arrow+");}")(state);
 return{state,sent,frame,event:{sender:contents,senderFrame:frame},input:{ADMIN:"Isolated-"+randomBytes(20).toString("hex"),SALESPERSON:"Distinct-"+randomBytes(20).toString("hex"),confirmed:true},invoke};
}
test("IPC rejects untrusted sender, subframe and extra properties before preflight",async()=>{
 for(const mode of["sender","frame","extra"]){const f=ipcFixture();let calls=0;f.state.validSetupPasswords=async()=>{calls++;return true;};if(mode==="sender")f.event.sender={};if(mode==="frame")f.event.senderFrame={url:f.frame.url};if(mode==="extra")f.input.extra=true;assert.deepEqual(await f.invoke(f.event,f.input),{ok:false});assert.equal(calls,0);assert.equal(f.sent.length,0);assert.equal(f.state.destroyed,0);}
});
test("IPC close during asynchronous password preflight cannot confirm enrollment",async()=>{
 const f=ipcFixture();let release;f.state.validSetupPasswords=()=>new Promise(r=>release=r);const pending=f.invoke(f.event,f.input);f.state.setupWindow=undefined;f.state.pendingSetup=undefined;release(true);assert.deepEqual(await pending,{ok:false});assert.equal(f.sent.length,0);assert.equal(f.state.setupValues,undefined);
});
test("IPC changed request, replaced window or navigated frame during preflight fail closed",async()=>{
 for(const mode of["request","window","navigation"]){const f=ipcFixture();let release;f.state.validSetupPasswords=()=>new Promise(r=>release=r);const pending=f.invoke(f.event,f.input);if(mode==="request")f.state.pendingSetup={id:"other",value:{action:"FIRST_ENROLLMENT"}};if(mode==="window")f.state.setupWindow={webContents:f.event.sender,destroy(){}};if(mode==="navigation")f.frame.url="https://untrusted.invalid/";release(true);assert.deepEqual(await pending,{ok:false});assert.equal(f.sent.length,0);assert.equal(f.state.setupValues,undefined);}
});
test("IPC exact original request confirms once; repeated submission has no second effect",async()=>{
 const f=ipcFixture();assert.deepEqual(await f.invoke(f.event,f.input),{ok:true});assert.equal(f.sent.length,1);assert.equal(f.sent[0].id,"test-original-request");assert.equal(f.sent[0].value,"CONFIRM_FIRST_ENROLLMENT");assert.equal(f.state.destroyed,1);assert.deepEqual(await f.invoke(f.event,f.input),{ok:false});assert.equal(f.sent.length,1);
});
