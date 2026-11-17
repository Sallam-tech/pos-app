import {cpSync,existsSync,lstatSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
const hash=p=>createHash("sha256").update(readFileSync(p)).digest("hex");
export function copyRuntimeDependencies(sourceInstall,destination,originalRoot){
 sourceInstall=path.resolve(sourceInstall);destination=path.resolve(destination);originalRoot=path.resolve(originalRoot);
 const sourceLock=path.join(sourceInstall,"package-lock.json"),originalLock=path.join(originalRoot,"package-lock.json");
 if(hash(sourceLock)!==hash(originalLock)||hash(path.join(sourceInstall,"package.json"))!==hash(path.join(originalRoot,"package.json")))throw Error("Dependency source must match the original reviewed package/lock bytes.");
 if(existsSync(path.join(destination,"node_modules")))throw Error("New runtime dependency destination required; old attempts retained.");
 const lock=JSON.parse(readFileSync(originalLock,"utf8")),metadata=JSON.parse(readFileSync(path.join(originalRoot,"package.json"),"utf8"));
 if(lock.lockfileVersion!==3||!lock.packages?.[""])throw Error("Reviewed lock format required.");
 const selected=new Set(),omittedOptional=[],resolve=(from,name)=>{
  let current=from;
  for(;;){const candidate=(current?current+"/":"")+"node_modules/"+name;if(lock.packages[candidate])return candidate;if(!current)break;current=path.posix.dirname(current);if(current===".")current="";}
 };
 const matches=(list,target)=>!list||!list.includes("!"+target)&&(list.every(v=>v.startsWith("!"))||list.includes(target)||list.includes("any"));
 const supported=item=>matches(item.os,"win32")&&matches(item.cpu,"x64");
 function visit(from,name,optional=false){
  const location=resolve(from,name),item=location&&lock.packages[location];
  if(!item||!supported(item)||!existsSync(path.join(sourceInstall,location,"package.json"))){if(optional){omittedOptional.push({from,name,reason:!item?"NOT_LOCKED":!supported(item)?"OTHER_PLATFORM":"NOT_INSTALLED"});return;}throw Error("Required locked runtime dependency missing: "+name);}
  if(selected.has(location))return;
  const actual=JSON.parse(readFileSync(path.join(sourceInstall,location,"package.json"),"utf8"));if(actual.version!==item.version||actual.name!==name)throw Error("Installed dependency metadata differs from reviewed lock: "+name);
  selected.add(location);
  for(const dependency of Object.keys(item.dependencies??{}))visit(location,dependency,Object.hasOwn(item.optionalDependencies??{},dependency));
  for(const dependency of Object.keys(item.optionalDependencies??{}))if(!Object.hasOwn(item.dependencies??{},dependency))visit(location,dependency,true);
  for(const peer of Object.keys(item.peerDependencies??{}))if(item.peerDependenciesMeta?.[peer]?.optional!==true)visit(location,peer);
 }
 for(const name of Object.keys(metadata.dependencies))visit("",name);
 const banned=/^(?:typescript|vitest|playwright(?:-core)?|eslint|@playwright\/test|@vitejs\/.*|@vitest\/.*|vite|tsx)$/;
 for(const location of selected){const m=JSON.parse(readFileSync(path.join(sourceInstall,location,"package.json"),"utf8"));if(banned.test(m.name))throw Error("Development tool is a required runtime dependency; review before packaging: "+m.name);}
 mkdirSync(path.join(destination,"node_modules"));
 for(const location of [...selected].sort()){
  const source=path.join(sourceInstall,location),target=path.join(destination,location),nested=path.join(source,"node_modules");mkdirSync(path.dirname(target),{recursive:true});
  cpSync(source,target,{recursive:true,force:false,errorOnExist:true,filter:file=>file!==nested&&!file.startsWith(nested+path.sep)&&(!/\.(?:map|d\.ts|d\.mts|d\.cts)$/.test(file)||!lstatSync(file).isFile())});
 }
 const runtimePackage={name:"shop-pos-disposable-test-runtime",version:"0.2.0-test.1",private:true,dependencies:metadata.dependencies,engines:metadata.engines},packages={"":runtimePackage};
 for(const location of [...selected].sort()){const item={...lock.packages[location]};delete item.dev;delete item.devOptional;delete item.peer;packages[location]=item;}
 writeFileSync(path.join(destination,"package.json"),JSON.stringify(runtimePackage,null,2));
 writeFileSync(path.join(destination,"package-lock.json"),JSON.stringify({name:runtimePackage.name,version:runtimePackage.version,lockfileVersion:3,requires:true,packages},null,2));
 const provenance={format:"SHOP_POS_REACHABLE_RUNTIME_V1",sourcePackageSha256:hash(path.join(originalRoot,"package.json")),sourceLockSha256:hash(originalLock),target:{os:"win32",arch:"x64"},optionalPeersOmitted:true,excludedNonRuntimePatterns:["*.map","*.d.ts","*.d.mts","*.d.cts"],packages:[...selected].sort().map(location=>({location,version:lock.packages[location].version,integrity:lock.packages[location].integrity})),omittedOptional,productionActivation:false};
 writeFileSync(path.join(destination,"runtime-dependency-provenance.json"),JSON.stringify(provenance,null,2));return provenance;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(copyRuntimeDependencies(...process.argv.slice(2))));
