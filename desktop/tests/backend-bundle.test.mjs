import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {bundleBackend} from "../bundle-backend.mjs";

// A small fake payload with the same shapes the real backend uses: files read relative to their own
// module, createRequire(import.meta.url), a bundled ESM dependency, an external "next" and a dynamic import.
function fixture(entryExtra=""){
 const root=path.resolve("desktop/test-results/bundle-"+randomUUID()),payload=path.join(root,"payload");
 const file=(relative,content)=>{const p=path.join(payload,relative);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,content);};
 file("server/package.json",JSON.stringify({private:true,type:"module"}));
 file("server/bootstrap/helper-script.txt","helper text beside its module");
 file("server/bootstrap/helper.js",`import {readFileSync} from "node:fs";import {fileURLToPath} from "node:url";import {createRequire} from "node:module";
export const besideText=readFileSync(fileURLToPath(new URL("./helper-script.txt",import.meta.url)),"utf8");
export const cjsValue=createRequire(import.meta.url)("dep-cjs").value;`);
 file("server/desktop/lazy.js","export const lazy=\"lazy loaded\";");
 file("server/desktop/test-entry.js",`import {besideText,cjsValue} from "../bootstrap/helper.js";import {esmValue} from "dep-esm";import {marker} from "next";${entryExtra}
const {lazy}=await import("./lazy.js");
process.stdout.write(JSON.stringify({besideText,cjsValue,esmValue,marker,lazy}));`);
 file("node_modules/dep-esm/package.json",JSON.stringify({name:"dep-esm",version:"1.0.0",type:"module",exports:"./index.js"}));
 file("node_modules/dep-esm/index.js","export const esmValue=\"bundled esm dependency\";");
 file("node_modules/dep-cjs/package.json",JSON.stringify({name:"dep-cjs",version:"1.0.0",main:"index.js"}));
 file("node_modules/dep-cjs/index.js","module.exports={value:\"cjs via createRequire\"};");
 file("node_modules/next/package.json",JSON.stringify({name:"next",version:"1.0.0",type:"module",exports:"./index.js"}));
 file("node_modules/next/index.js","export const marker=\"external next\";");
 return {root,payload,clean:()=>rmSync(root,{recursive:true,force:true})};
}
const run=entry=>{const r=spawnSync(process.execPath,[entry],{encoding:"utf8"});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};

test("the bundled entry behaves exactly like the original module graph",async()=>{
 const f=fixture();try{
  const entry=path.join(f.payload,"server/desktop/test-entry.js"),before=run(entry);
  const report=await bundleBackend(f.payload);
  assert.equal(report.entry,"server/desktop/test-entry.js");assert.ok(report.bundledModules>=4);
  const text=readFileSync(entry,"utf8");
  assert.ok(text.startsWith("// SHOP_POS_BACKEND_BUNDLE_V1"));
  assert.match(text,/from "next"|import\("next"\)/,"next stays an external package");
  assert.doesNotMatch(text,/(?:\bfrom\s*|\bimport\s*\(\s*)["']\.\.\/bootstrap\/helper\.js["']/,"original app modules are inside the bundle, not imported");
  assert.match(text,/new URL\(\s*"\.\.\/bootstrap\/helper\.js"\s*,\s*import\.meta\.url\s*\)/,"the helper's own location is preserved for its relative lookups");
  assert.deepEqual(run(entry),before);
  assert.deepEqual(before,{besideText:"helper text beside its module",cjsValue:"cjs via createRequire",esmValue:"bundled esm dependency",marker:"external next",lazy:"lazy loaded"});
  assert.ok(existsSync(path.join(f.payload,"server/bootstrap/helper.js")),"original compiled files stay in place");
  assert.ok(existsSync(path.join(f.payload,"backend-bundle.json")));
  assert.equal(existsSync(path.join(f.payload,"server/desktop/.bundle-tmp")),false);
  await assert.rejects(()=>bundleBackend(f.payload),/already bundled/);
 }finally{f.clean();}
});

test("an import.meta use the bundle cannot preserve stops the build instead of misbehaving later",async()=>{
 const f=fixture("const here=import.meta.dirname;");try{
  await assert.rejects(()=>bundleBackend(f.payload),/Unsupported import\.meta/);
  assert.doesNotMatch(readFileSync(path.join(f.payload,"server/desktop/test-entry.js"),"utf8"),/SHOP_POS_BACKEND_BUNDLE_V1/);
 }finally{f.clean();}
});

test("every build script bundles after the reviewed runtime dependencies and before sealing",()=>{
 for(const name of ["build-shop.ps1","build-test.ps1","build-evaluation.ps1","build-reviewed-update.ps1"]){
  const text=readFileSync(path.resolve("desktop",name),"utf8");
  const dependencies=text.indexOf("runtime-dependencies.mjs"),bundle=text.indexOf("bundle-backend.mjs"),seal=text.indexOf("seal-payload.mjs");
  assert.ok(dependencies>=0&&bundle>dependencies&&seal>bundle,name);
 }
});
