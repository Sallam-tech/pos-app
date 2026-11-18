import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync,rmSync,existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {verifyPayload} from "../payload-integrity.cjs";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"..","test-results","payload-reuse-"+Date.now());
try{
 mkdirSync(path.join(root,"app"),{recursive:true});
 mkdirSync(path.join(root,"payload","server","desktop"),{recursive:true});
 mkdirSync(path.join(root,"runtime"),{recursive:true});
 writeFileSync(path.join(root,"runtime","node.exe"),Buffer.from("NODE"));
 writeFileSync(path.join(root,"payload","server","desktop","test-entry.js"),"export{};");
 mkdirSync(path.join(root,"payload","app",".next"),{recursive:true});
 writeFileSync(path.join(root,"payload","app",".next","BUILD_ID"),"test");
 const files=[
  {path:"runtime/node.exe",bytes:4,sha256:createHash("sha256").update("NODE").digest("hex")},
  {path:"payload/server/desktop/test-entry.js",bytes:Buffer.byteLength("export{};"),sha256:createHash("sha256").update("export{};").digest("hex")},
  {path:"payload/app/.next/BUILD_ID",bytes:4,sha256:createHash("sha256").update("test").digest("hex")},
 ];
 const manifest={format:"SHOP_POS_TEST_PAYLOAD_V1",productionActivation:false,schema:41,node:"24.22.3",electron:"45.3.3",fuses:"010000001",files};
 writeFileSync(path.join(root,"payload","manifest.json"),JSON.stringify(manifest));

 const first=await verifyPayload(root);
 assert.equal(first.reused,false);
 assert.ok(first.hashMs>0);
 assert.ok(existsSync(path.join(root,"payload-verify-cache.json")));
 const second=await verifyPayload(root);
 assert.equal(second.reused,true);
 assert.equal(second.hashMs,0);

 writeFileSync(path.join(root,"runtime","node.exe"),Buffer.from("NOPE"));
 await assert.rejects(()=>verifyPayload(root));

 // Restore bytes then touch mtime → must miss cache and rehash.
 writeFileSync(path.join(root,"runtime","node.exe"),Buffer.from("NODE"));
 const {utimesSync}=await import("node:fs");
 const now=Date.now()/1000;
 utimesSync(path.join(root,"runtime","node.exe"),now+5,now+5);
 const third=await verifyPayload(root);
 assert.equal(third.reused,false);
 assert.ok(third.hashMs>0);

 // Delete cache → full hash again.
 rmSync(path.join(root,"payload-verify-cache.json"),{force:true});
 const fourth=await verifyPayload(root);
 assert.equal(fourth.reused,false);
 console.log("payload-integrity-reuse PASS",{firstHashMs:Math.round(first.hashMs),reuseHashMs:second.hashMs,touchHashMs:Math.round(third.hashMs)});
}finally{
 try{rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:50});}catch{/* best-effort */}
}
