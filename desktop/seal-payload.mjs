import {readFileSync,writeFileSync,readdirSync,lstatSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
const out=path.resolve(process.argv[2]),resources=path.join(out,"resources"),payload=path.join(resources,"payload");
if(!existsSync(path.join(payload,"node_modules/better-sqlite3/prebuilds/win32-x64.node")))throw Error("Reviewed native SQLite module missing.");
const hash=p=>createHash("sha256").update(readFileSync(p)).digest("hex");
const executable=path.join(out,"Shop POS TEST.exe"),bytes=readFileSync(executable),sentinel=Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX"),at=bytes.indexOf(sentinel);
if(at<0||bytes.indexOf(sentinel,at+1)!==-1)throw Error("Ambiguous Electron fuse wire.");
const start=at+sentinel.length,version=bytes[start],length=bytes[start+1];
if(version!==1||length!==9)throw Error("Reviewed Electron45 fuse schema mismatch.");
const changes={0:0,1:1,2:0,3:0,7:0};let changed=false;
for(const [index,value]of Object.entries(changes)){if(![48,49].includes(bytes[start+2+Number(index)]))throw Error("Unexpected fuse value.");if(bytes[start+2+Number(index)]!==48+value){changed=true;bytes[start+2+Number(index)]=48+value;}}
if(changed)writeFileSync(executable,bytes);
const fuses=readFileSync(executable).subarray(start+2,start+2+length).toString("ascii");
const files=[],licenses=[];
function scan(directory){
 for(const name of readdirSync(directory).sort()){
  const file=path.join(directory,name),stat=lstatSync(file);
  if(stat.isSymbolicLink()||!stat.isDirectory()&&!stat.isFile()||stat.isFile()&&stat.nlink!==1)throw Error("Redirected/hard-linked artifact.");
  if(stat.isDirectory())scan(file);
  else if(file!==path.join(payload,"manifest.json"))files.push({path:path.relative(resources,file).replaceAll("\\","/"),sha256:hash(file),bytes:stat.size});
 }
}
for(const directory of ["app","payload","runtime"])scan(path.join(resources,directory));
function packages(directory){
 for(const name of readdirSync(directory)){
  if(name.startsWith("."))continue;const p=path.join(directory,name);
  if(name.startsWith("@")){packages(p);continue;}
  const metadata=path.join(p,"package.json");if(!existsSync(metadata))continue;
  const value=JSON.parse(readFileSync(metadata,"utf8"));licenses.push({name:value.name,version:value.version,license:value.license??value.licenses??"NOT_RECORDED"});
  if(existsSync(path.join(p,"node_modules")))packages(path.join(p,"node_modules"));
 }
}
packages(path.join(payload,"node_modules"));
const manifest={format:"SHOP_POS_TEST_PAYLOAD_V1",schema:41,node:"24.22.3",electron:"45.3.3",productionActivation:false,fuses,files};
writeFileSync(path.join(payload,"manifest.json"),JSON.stringify(manifest));
writeFileSync(path.join(out,"runtime-package-inventory.json"),JSON.stringify({packages:licenses,productionActivation:false},null,2));
writeFileSync(path.join(out,"artifact-verification.json"),JSON.stringify({executableSha256:hash(executable),manifestSha256:hash(path.join(payload,"manifest.json")),files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),fuses,unsignedTestBuild:true,productionActivation:false},null,2));
console.log(JSON.stringify({out,files:files.length,packages:licenses.length,fuses,productionActivation:false}));
