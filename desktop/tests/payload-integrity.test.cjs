"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{randomUUID,createHash}=require("node:crypto"),{verifyPayload}=require("../payload-integrity.cjs");
function fixture(){const root=path.resolve(__dirname,"../test-results/integrity-"+randomUUID());fs.mkdirSync(root,{recursive:true});for(const name of ["app/main.cjs","runtime/node.exe","payload/server/desktop/test-entry.js","payload/app/.next/BUILD_ID"]){const target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,"TEST "+name);}const files=["app/main.cjs","runtime/node.exe","payload/server/desktop/test-entry.js","payload/app/.next/BUILD_ID"].map(name=>({path:name,bytes:fs.statSync(path.join(root,name)).size,sha256:createHash("sha256").update(fs.readFileSync(path.join(root,name))).digest("hex")}));const manifest={format:"SHOP_POS_TEST_PAYLOAD_V1",schema:41,node:"24.22.3",electron:"45.4.1",fuses:"010000001",productionActivation:false,files};const save=()=>fs.writeFileSync(path.join(root,"payload/manifest.json"),JSON.stringify(manifest));save();return {root,manifest,save};}
test("actual shipped integrity verifier accepts exact TEST byte inventory",async()=>{const f=fixture();const result=await verifyPayload(f.root);assert.equal(result.files,4);assert.equal(result.productionActivation,false);});
test("changed bytes and unlisted code both fail closed",async()=>{let f=fixture();fs.appendFileSync(path.join(f.root,"app/main.cjs"),"changed");await assert.rejects(()=>verifyPayload(f.root));f=fixture();fs.writeFileSync(path.join(f.root,"app/extra.cjs"),"unlisted");await assert.rejects(()=>verifyPayload(f.root));});
test("traversal, ambiguous case/duplicate, missing required member and production flag reject",async()=>{for(const alter of [f=>f.manifest.files[0].path="../outside",f=>f.manifest.files.push({...f.manifest.files[0],path:"APP/main.cjs"}),f=>{f.manifest.files.pop();},f=>{f.manifest.productionActivation=true;}]){const f=fixture();alter(f);f.save();await assert.rejects(()=>verifyPayload(f.root));}});
test("real Windows NTFS hard-linked code cannot pass integrity admission",async()=>{const f=fixture();fs.linkSync(path.join(f.root,"app/main.cjs"),path.join(f.root,"outside-copy.cjs"));await assert.rejects(()=>verifyPayload(f.root));});

test("a locally forged metadata cache cannot authorize modified executable bytes",async()=>{
 const f=fixture();await verifyPayload(f.root);
 const target=path.join(f.root,"runtime/node.exe"),bytes=fs.readFileSync(target);bytes[0]^=1;fs.writeFileSync(target,bytes);
 const rows=f.manifest.files.map(item=>{const s=fs.lstatSync(path.join(f.root,item.path));return [item.path.toLowerCase(),s.size,s.mtimeMs,s.ctimeMs,String(s.dev),String(s.ino)];}).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 fs.writeFileSync(path.join(f.root,"payload-verify-cache.json"),JSON.stringify({format:"SHOP_POS_PAYLOAD_VERIFY_V1",productionActivation:false,manifestSha256:createHash("sha256").update(fs.readFileSync(path.join(f.root,"payload/manifest.json"))).digest("hex"),inventoryFingerprint:createHash("sha256").update(JSON.stringify(rows)).digest("hex"),files:rows.length}));
 await assert.rejects(()=>verifyPayload(f.root));
});
test("normal admission rejects the prior runtime pin; exact-hash upgrade inspection can verify it explicitly",async()=>{
 const f=fixture();f.manifest.electron="45.3.3";f.save();await assert.rejects(()=>verifyPayload(f.root));
 const result=await verifyPayload(f.root,"45.3.3");assert.equal(result.reused,false);assert.equal(result.manifestSha256,createHash("sha256").update(fs.readFileSync(path.join(f.root,"payload/manifest.json"))).digest("hex"));
});
test("an unreviewed runtime cannot be admitted through a version override",async()=>{
 const f=fixture();f.manifest.electron="45.4.2";f.save();await assert.rejects(()=>verifyPayload(f.root));await assert.rejects(()=>verifyPayload(f.root,"45.4.2"));
});