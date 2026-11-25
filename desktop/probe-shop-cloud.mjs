import {readFileSync} from "node:fs";
const config=JSON.parse(readFileSync(process.argv[2],"utf8"));
if(!config||typeof config.url!=="string"||typeof config.publishableKey!=="string"||Object.keys(config).sort().join(",")!=="publishableKey,url")process.exit(1);
const response=await fetch(config.url+"/auth/v1/health",{headers:{apikey:config.publishableKey},signal:AbortSignal.timeout(15000)});
if(!response.ok)process.exit(1);
console.log("production-cloud-ok");
