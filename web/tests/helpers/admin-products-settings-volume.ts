import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,readdirSync,existsSync,mkdtempSync} from "node:fs";
import path from "node:path";
import type {LocalRuntimeConfiguration} from "../../src/server/hosting/runtime";
import type {Raw} from "./reports-volume";
export const Driver=createRequire(import.meta.url)("better-sqlite3") as new(p:string,o?:{readonly:boolean;fileMustExist:boolean})=>Raw;
export const evidence=readFileSync("test-results/products-settings41-current.txt","utf8").trim();
export const hash=(p:string)=>createHash("sha256").update(readFileSync(p)).digest("hex");
type Saved={config:LocalRuntimeConfiguration;adminPassword:string;staffPassword:string;date:string};
export async function retainedBook(kind:"expense"|"invoice",n:number){
 const old=readFileSync("test-results/reports40-current.txt","utf8").trim(),saved=JSON.parse(readFileSync(path.join(old,kind+"-volume-"+n+"-v2-private.json"),"utf8")) as Saved;
 let source:string|undefined;
 if(kind==="invoice")source=path.join(saved.config.authorization.database.directory,"test.sqlite3");
 else {const base=path.resolve("test-results/sqlite-b1b-part1");for(const parent of readdirSync(base).filter(x=>x.startsWith("inventory-http5-"))){for(const name of readdirSync(path.join(base,parent)).filter(x=>x.startsWith("cash40-volume-"+n+"-"))){const candidate=path.join(base,parent,name,"test.sqlite3");if(!existsSync(candidate))continue;const db=new Driver(candidate,{readonly:true,fileMustExist:true});try{db.defaultSafeIntegers(true);if(db.prepare("SELECT user_version AS v FROM pragma_user_version").get()?.v===BigInt(40)&&db.prepare("SELECT count(*) AS n FROM expenses").get()?.n===BigInt(n))source=candidate;}finally{db.close();}}if(source)break;}}
 if(!source)throw Error("Retained admitted TEST volume source unavailable");
 const before=hash(source),directory=mkdtempSync(path.join(path.resolve("test-results/sqlite-b1b-part1"),"products-settings41-"+kind+"-"+n+"-")),db=new Driver(source,{readonly:true,fileMustExist:true});try{await db.backup(path.join(directory,"test.sqlite3"));}finally{db.close();}
 if(hash(source)!==before)throw Error("Original TEST source changed");
 const config={...saved.config,authorization:{...saved.config.authorization,sessionLifetimeSeconds:1800,database:{...saved.config.authorization.database,directory:path.resolve(directory)}}};
 return {config,adminPassword:saved.adminPassword,staffPassword:saved.staffPassword,date:saved.date,source,sourceHash:before};
}
export function save(name:string,value:unknown){writeFileSync(path.join(evidence,name+".json"),JSON.stringify(value,null,2));}
