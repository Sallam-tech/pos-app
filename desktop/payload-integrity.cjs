"use strict";
const fs=require("node:fs"),path=require("node:path"),{createHash}=require("node:crypto");
function inventoryFingerprint(entries){
 const rows=entries.map(e=>[e.key,e.size,e.mtimeMs,e.ctimeMs,String(e.dev),String(e.ino)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
async function verifyPayload(root){
 const started=performance.now();
 root=path.resolve(root);
 for(let current=root;;current=path.dirname(current)){const s=fs.lstatSync(current);if(!s.isDirectory()||s.isSymbolicLink())throw Error("Redirected payload rejected.");if(path.dirname(current)===current)break;}
 const manifestPath=path.join(root,"payload/manifest.json"),stat=fs.lstatSync(manifestPath);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>4*1024*1024)throw Error("Invalid payload manifest.");
 const manifestBytes=fs.readFileSync(manifestPath);
 const manifestSha256=createHash("sha256").update(manifestBytes).digest("hex");
 const manifest=JSON.parse(manifestBytes.toString("utf8"));
 if(manifest.format!=="SHOP_POS_TEST_PAYLOAD_V1"||manifest.productionActivation!==false||manifest.schema!==41||manifest.node!=="24.22.3"||manifest.electron!=="45.3.3"||manifest.fuses!=="010000001"||!Array.isArray(manifest.files)||manifest.files.length>30000)throw Error("Unreviewed TEST payload.");
 const actual=new Map();let members=0,active=0;const waiting=[];
 async function io(work){if(active>=8)await new Promise(resolve=>waiting.push(resolve));else active++;try{return await work();}finally{const next=waiting.shift();if(next)next();else active--;}}
 async function scan(directory,depth=0){
  if(depth>40)throw Error("Payload nesting exceeds bound.");
  const names=await io(()=>fs.promises.readdir(directory));if(names.length>30000)throw Error("Payload directory exceeds bound.");
  await Promise.all(names.map(async name=>{
   if(++members>60000)throw Error("Payload inventory exceeds bound.");
   const target=path.join(directory,name),s=await io(()=>fs.promises.lstat(target));
   if(s.isSymbolicLink()||!s.isFile()&&!s.isDirectory()||s.isFile()&&s.nlink!==1)throw Error("Redirected payload member.");
   if(s.isDirectory())await scan(target,depth+1);else if(target!==manifestPath){const key=path.relative(root,target).replaceAll("\\","/");if(actual.has(key.toLowerCase()))throw Error("Ambiguous payload member.");if(actual.size>=30000)throw Error("Payload inventory exceeds bound.");actual.set(key.toLowerCase(),{target,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,dev:s.dev,ino:s.ino});}
  }));
 }
 await Promise.all(["app","payload","runtime"].map(name=>scan(path.join(root,name))));
 const scanMs=performance.now()-started,queue=[],fingerprintEntries=[];
 const seen=new Set();
 for(const item of manifest.files){
  if(!item||typeof item.path!=="string"||!/^[a-zA-Z0-9_()[\].@+~ /-]+$/.test(item.path)||item.path.split("/").some(v=>v==="."||v===".."||v==="")||!/^[a-f0-9]{64}$/.test(item.sha256)||!Number.isSafeInteger(item.bytes)||item.bytes<0||item.bytes>512*1024*1024||seen.has(item.path.toLowerCase()))throw Error("Invalid payload member.");
  const key=item.path.toLowerCase(),file=actual.get(key);seen.add(key);
  if(!file||file.size!==item.bytes)throw Error("Payload bytes differ.");
  queue.push({target:file.target,sha256:item.sha256,bytes:item.bytes});
  fingerprintEntries.push({key,size:file.size,mtimeMs:file.mtimeMs,ctimeMs:file.ctimeMs,dev:file.dev,ino:file.ino});
 }
 if(seen.size!==actual.size)throw Error("Unlisted payload content.");
 for(const name of ["runtime/node.exe","payload/server/desktop/test-entry.js","payload/app/.next/BUILD_ID"])if(!seen.has(name.toLowerCase()))throw Error("Required payload member missing.");
 const fingerprint=inventoryFingerprint(fingerprintEntries);
 const cachePath=path.join(root,"payload-verify-cache.json");
 try{
  const cacheStat=fs.lstatSync(cachePath);
  if(cacheStat.isFile()&&!cacheStat.isSymbolicLink()&&cacheStat.nlink===1&&cacheStat.size>0&&cacheStat.size<=4096){
   const cache=JSON.parse(fs.readFileSync(cachePath,"utf8"));
   if(cache&&cache.format==="SHOP_POS_PAYLOAD_VERIFY_V1"&&cache.productionActivation===false&&cache.manifestSha256===manifestSha256&&cache.inventoryFingerprint===fingerprint&&cache.files===seen.size){
    return {files:seen.size,productionActivation:false,scanMs,hashMs:0,reused:true};
   }
  }
 }catch{/* Missing/invalid cache falls through to full hash. */}
 let at=0,failed=false;
 async function verify(){while(!failed&&at<queue.length){const file=queue[at++],hash=createHash("sha256");try{if(file.bytes<=65536){
 const handle=await fs.promises.open(file.target,"r");const bytes=Buffer.alloc(file.bytes+1);
 try{
  const before=await handle.stat();if(!before.isFile()||before.nlink!==1||before.size!==file.bytes)throw Error("Payload bytes differ.");
  let count=0;for(;;){const read=await handle.read(bytes,count,bytes.length-count,null);count+=read.bytesRead;if(count>file.bytes)throw Error("Payload bytes differ.");if(read.bytesRead===0)break;}
  if(count!==file.bytes)throw Error("Payload bytes differ.");hash.update(bytes.subarray(0,count));
  const after=await handle.stat();if(after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error("Payload changed during verification.");
 }finally{bytes.fill(0);await handle.close();}
}else{for await(const chunk of fs.createReadStream(file.target,{highWaterMark:256*1024}))hash.update(chunk);}if(hash.digest("hex")!==file.sha256)throw Error("Payload bytes differ.");}catch(error){failed=true;throw error;}}}
 await Promise.all(Array.from({length:4},()=>verify()));
 const hashMs=performance.now()-started-scanMs;
 try{
  const payload=JSON.stringify({format:"SHOP_POS_PAYLOAD_VERIFY_V1",productionActivation:false,manifestSha256,inventoryFingerprint:fingerprint,files:seen.size});
  const fd=fs.openSync(cachePath,"w");try{fs.writeSync(fd,payload);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 }catch{/* Cache write failure does not invalidate a verified payload. */}
 return {files:seen.size,productionActivation:false,scanMs,hashMs,reused:false};
}
module.exports={verifyPayload};
