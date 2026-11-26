import test from "node:test";
import assert from "node:assert/strict";
import fs,{readFileSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,statSync,rmSync,existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import path from "node:path";
import vm from "node:vm";

// A new Windows computer defaults to the Restricted PowerShell policy, which refuses every "-File" helper
// script the desktop app and its backend start. Developer computers usually allow local scripts, which is
// why the failure only appeared on a clean client laptop. These tests keep that from coming back.
const main=new URL("../main.cjs",import.meta.url);
const serverRoot=new URL("../../web/src/server/",import.meta.url);

function sourceFiles(directory){
 const found=[];
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  const full=new URL(entry.name+(entry.isDirectory()?"/":""),directory);
  if(entry.isDirectory())found.push(...sourceFiles(full));
  else if(/\.(?:ts|tsx|cjs|mjs|js)$/.test(entry.name))found.push(full);
 }
 return found;
}

test("every production PowerShell -File launch sets a process-only RemoteSigned policy",()=>{
 const files=[main,...sourceFiles(serverRoot)];
 let launches=0;
 for(const file of files){
  const text=readFileSync(file,"utf8");
  for(const match of text.matchAll(/"-File"/g)){
   launches++;
   const before=text.slice(Math.max(0,match.index-90),match.index);
   assert.match(before,/"-ExecutionPolicy",\s*"RemoteSigned",\s*$/,"PowerShell -File launch without -ExecutionPolicy RemoteSigned in "+file.pathname+" near: "+before.slice(-60));
  }
 }
 // main.cjs (2) + windows.ts + tls.ts + operation-keys.ts + storage.ts: a lower count means a launch was missed.
 assert.ok(launches>=6,"expected at least 6 PowerShell -File launches, found "+launches);
});

test("the policy flag is never the unrestricted Bypass setting",()=>{
 for(const file of [main,...sourceFiles(serverRoot)])assert.doesNotMatch(readFileSync(file,"utf8"),/"-ExecutionPolicy",\s*"(?:Bypass|Unrestricted)"/i,file.pathname);
});

test("a Restricted default blocks a local script, and the RemoteSigned flag lets it run",{skip:process.platform!=="win32"},()=>{
 const powershell=path.join(process.env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe");
 const policy=spawnSync(powershell,["-NoLogo","-NoProfile","-NonInteractive","-Command","(Get-ExecutionPolicy -Scope MachinePolicy),(Get-ExecutionPolicy -Scope UserPolicy) -join ','"],{encoding:"utf8",timeout:60000});
 if(policy.stdout.trim()!=="Undefined,Undefined")return; // A Group Policy owns the policy here; the flag cannot be proven on this machine.
 const directory=mkdtempSync(path.join(tmpdir(),"shop-pos-policy-"));
 try{
  const script=path.join(directory,"probe.ps1");
  writeFileSync(script,"[Console]::Out.Write('ran')");
  const env={...process.env,PSExecutionPolicyPreference:"Restricted"};
  const blocked=spawnSync(powershell,["-NoLogo","-NoProfile","-NonInteractive","-File",script],{encoding:"utf8",env,timeout:60000});
  assert.notEqual(blocked.stdout,"ran");
  assert.match(blocked.stderr.replace(/\s+/g," "),/running scripts is disabled/i); // PowerShell wraps its message at console width.
  const allowed=spawnSync(powershell,["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","RemoteSigned","-File",script],{encoding:"utf8",env,timeout:60000});
  assert.equal(allowed.status,0);
  assert.equal(allowed.stdout,"ran");
  assert.equal(allowed.stderr,"");
 }finally{rmSync(directory,{recursive:true,force:true});}
});

function startupLogFixture(options={}){
 const source=readFileSync(main,"utf8"),start=source.indexOf("let lastBackendStage="),end=source.indexOf("function diagnostic(",start);
 assert.ok(start>=0&&end>start,"startup log helpers not found in main.cjs");
 const local=mkdtempSync(path.join(tmpdir(),"shop-pos-log-"));
 mkdirSync(path.join(local,"Programs","SalamTech"),{recursive:true});
 const context={diagnosticHarness:options.harness===true,fs,path,app:{getVersion:()=>"1.0.0"},process:{env:{LOCALAPPDATA:local}},String,Date};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 return {context,local,log:path.join(local,"Programs","SalamTech","shop-pos-startup.log")};
}

test("startup failure log records the stage and a short reason, outside the protected data root",()=>{
 const {context,local,log}=startupLogFixture();
 try{
  const reference=context.failureReference("PROTECT_DATA","exit 1\r\nFile C:\\x cannot be loaded because running scripts is disabled");
  assert.match(reference,/^Reference: PROTECT_DATA\nDiagnostic file: .*shop-pos-startup\.log$/);
  const text=readFileSync(log,"utf8");
  assert.match(text,/^\d{4}-\d\d-\d\dT[\d:.]+Z v1\.0\.0 PROTECT_DATA \| exit 1 File C:\\x cannot be loaded/);
  assert.equal(text.split("\n").length,2,"one record per failure, newlines in details flattened");
  assert.ok(!log.includes("ShopPOSData"),"the log must not live inside the protected data root");
 }finally{rmSync(local,{recursive:true,force:true});}
});

test("startup failure log is capped, truncates long details, and never throws",()=>{
 const {context,local,log}=startupLogFixture();
 try{
  context.recordStartupFailure("INSTALL_GUARD","x".repeat(5000));
  assert.ok(readFileSync(log,"utf8").length<400);
  writeFileSync(log,"y".repeat(70000));
  context.recordStartupFailure("PAYLOAD_CHECK","");
  assert.ok(existsSync(log+".1"),"an oversized log is rotated once");
  assert.ok(statSync(log).size<400);
  // A missing parent folder must not turn a startup failure into a second crash.
  rmSync(path.join(local,"Programs"),{recursive:true,force:true});
  assert.equal(context.failureReference("DATA_FOLDER","denied"),"Reference: DATA_FOLDER");
 }finally{rmSync(local,{recursive:true,force:true});}
});

test("the disposable test harness never writes the shop startup log",()=>{
 const {context,local,log}=startupLogFixture({harness:true});
 try{
  assert.equal(context.recordStartupFailure("PROTECT_DATA","x"),undefined);
  assert.equal(existsSync(log),false);
 }finally{rmSync(local,{recursive:true,force:true});}
});

test("the owner-facing dialog wording is unchanged and gains only a reference line",()=>{
 const source=readFileSync(main,"utf8");
 assert.ok(source.includes('"Shop POS could not open. Saved shop data has been retained. Nothing was reset."'));
 assert.equal(source.split("detail:failureReference(").length-1,1,"backend failure dialog");
 assert.ok(source.includes("detail:reference"),"startup failure dialog");
 for(const stage of ["PROTECT_DATA","INSTALL_GUARD","PAYLOAD_CHECK","INSTALL_IDENTITY","DATA_FOLDER","HELPER_INTEGRITY","BACKEND_EXIT","BACKEND_FATAL"])assert.ok(source.includes('"'+stage+'"'),stage+" stage is reported");
});
