import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";import vm from "node:vm";import {correctedManifestSource,patchNextWindowsManifests,patchedSha256} from "../patch-next-windows-manifests.mjs";
const file="D:/pos/desktop/test-results/app-test11-setup-a9d652b7-1cbe-469a-88d4-4df01ffee5f3/resources/payload/node_modules/next/dist/server/load-manifest.external.js",source=fs.readFileSync(file,"utf8");
function loader(text){const reads=[],module={exports:{}},context={exports:module.exports,Map,Object,console,process:{env:{}},require(n){if(n==="path")return path.win32;if(n==="fs")return{readFileSync(p){reads.push(p);return p.endsWith(".js")?"globalThis.value = 1;":"{}";}};if(n==="vm")return vm;if(n==="../shared/lib/deep-freeze")return{deepFreeze:v=>v};throw Error(n);}};vm.runInNewContext(text,context);return{api:context.exports,reads};}
test("original owner cross-volume failure reproduced; both corrected manifest loaders use exact absolute build",()=>{
 const options={projectDir:"C:\\Users\\Owner\\AppData\\D:\\Installed\\app",distDir:"D:\\Installed\\app\\.next",manifest:"routes-manifest.json",shouldCache:false};
 const old=loader(source);old.api.loadManifestFromRelativePath(options);assert.notEqual(old.reads[0],"D:\\Installed\\app\\.next\\routes-manifest.json");
 const current=loader(correctedManifestSource(source));current.api.loadManifestFromRelativePath(options);current.api.evalManifestFromRelativePath({...options,manifest:"server\\middleware.js"});assert.equal(current.reads[0],"D:\\Installed\\app\\.next\\routes-manifest.json");assert.equal(current.reads[1],"D:\\Installed\\app\\.next\\server\\middleware.js");
});
test("same-volume paths preserve caching; unreviewed dependency changes fail closed",()=>{
 const current=loader(correctedManifestSource(source));const options={projectDir:"D:\\Installed\\app",distDir:".next",manifest:"routes-manifest.json"};const a=current.api.loadManifestFromRelativePath(options),b=current.api.loadManifestFromRelativePath(options);assert.equal(a,b);assert.equal(current.reads.length,1);assert.equal(current.reads[0],"D:\\Installed\\app\\.next\\routes-manifest.json");
 assert.throws(()=>correctedManifestSource(source+" "),/Unreviewed/);
});

test("build correction accepts only exact original or reviewed corrected bytes, including reused corrected dependencies",()=>{
 const root=fs.mkdtempSync('D:/pos/desktop/test-results/test16-manifest-'),dir=path.join(root,'node_modules/next');fs.mkdirSync(path.join(dir,'dist/server'),{recursive:true});const pkg=path.join(dir,'package.json'),file=path.join(dir,'dist/server/load-manifest.external.js');fs.writeFileSync(pkg,JSON.stringify({version:'16.4.6'}));fs.writeFileSync(file,source);
 assert.equal(patchNextWindowsManifests(root).operation,'APPLIED_REVIEWED_PATCH');assert.equal(patchNextWindowsManifests(root).operation,'VERIFIED_ALREADY_PATCHED');assert.equal(patchNextWindowsManifests(root).afterSha256,patchedSha256);
 fs.appendFileSync(file,' ');assert.throws(()=>patchNextWindowsManifests(root),/Unreviewed/);fs.writeFileSync(pkg,JSON.stringify({version:'16.4.7'}));assert.throws(()=>patchNextWindowsManifests(root),/Pinned Next version/);
});
