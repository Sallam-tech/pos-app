import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync,existsSync,readFileSync,rmSync} from "node:fs";
import {randomUUID} from "node:crypto";
import path from "node:path";
import {copyRuntimeDependencies} from "../runtime-dependencies.mjs";

// Files the installed app never loads are left out, so the per-launch integrity check hashes fewer bytes.
function fixture(){
 const source=path.resolve("desktop/test-results/slim-"+randomUUID()),out=source+"-output";
 const packages={"":{name:"TEST",dependencies:{next:"1.0.0","better-sqlite3":"1.0.0"}},
  "node_modules/next":{version:"1.0.0",optionalDependencies:{"@next/swc-win32-x64-msvc":"1.0.0",sharp:"1.0.0"}},
  "node_modules/@next/swc-win32-x64-msvc":{version:"1.0.0",optional:true,os:["win32"],cpu:["x64"]},
  "node_modules/sharp":{version:"1.0.0",optional:true},
  "node_modules/better-sqlite3":{version:"1.0.0"}};
 const file=(relative,content="x")=>{const p=path.join(source,relative);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,content);};
 file("package.json",JSON.stringify(packages[""]));file("package-lock.json",JSON.stringify({lockfileVersion:3,packages}));
 for(const [location,item] of Object.entries(packages))if(location)file(location+"/package.json",JSON.stringify({name:location.replace(/^node_modules\//,""),version:item.version}));
 file("node_modules/next/dist/server.js");file("node_modules/@next/swc-win32-x64-msvc/next-swc.win32-x64-msvc.node");file("node_modules/sharp/lib/index.js");
 for(const f of ["lib/binding.js","lib/database.js","prebuilds/win32-x64.node","prebuilds/linux-x64.node","prebuilds/win32-arm64.node","deps/sqlite3/sqlite3.c","src/better_sqlite3.cpp","binding.gyp"])file("node_modules/better-sqlite3/"+f);
 mkdirSync(out);return {source,out,clean(){rmSync(source,{recursive:true,force:true});rmSync(out,{recursive:true,force:true});}};
}

test("Next.js's build-time SWC compiler is not shipped, while its runtime optional sharp still is",()=>{
 const f=fixture();try{
  const result=copyRuntimeDependencies(f.source,f.out,f.source);
  assert.equal(existsSync(path.join(f.out,"node_modules/@next/swc-win32-x64-msvc")),false);
  assert.ok(result.omittedOptional.some(x=>x.name==="@next/swc-win32-x64-msvc"&&x.reason==="BUILD_TIME_ONLY"));
  assert.ok(existsSync(path.join(f.out,"node_modules/sharp/lib/index.js")));
  assert.ok(existsSync(path.join(f.out,"node_modules/next/dist/server.js")));
 }finally{f.clean();}
});

test("better-sqlite3 keeps only its loader and the Windows x64 native module",()=>{
 const f=fixture();try{
  copyRuntimeDependencies(f.source,f.out,f.source);const dir=path.join(f.out,"node_modules/better-sqlite3");
  for(const kept of ["package.json","lib/binding.js","lib/database.js","prebuilds/win32-x64.node"])assert.ok(existsSync(path.join(dir,kept)),kept);
  for(const gone of ["prebuilds/linux-x64.node","prebuilds/win32-arm64.node","deps","src","binding.gyp"])assert.equal(existsSync(path.join(dir,gone)),false,gone);
 }finally{f.clean();}
});

test("the payload builder leaves out the Next dev and cache folders",()=>{
 const builder=readFileSync(path.resolve("desktop/build-payload.mjs"),"utf8");
 assert.match(builder,/\.next\/cache"\)\)&&!p\.startsWith\(path\.join\(builtApp,"\.next\/dev"\)\)/);
});
