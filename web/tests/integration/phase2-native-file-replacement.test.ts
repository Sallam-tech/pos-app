import {test,expect,beforeAll} from "vitest";
import {renameSync,copyFileSync,existsSync,lstatSync,mkdirSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import path from "node:path";
import {seed,gateway} from "../helpers/cash-fixture";
import {captureGuardInputs,guardInputsUnchanged} from "../../src/server/auth/database";
beforeAll(seed);
test("real disposable native MAIN/WAL replacement cannot preserve a guard proof; all original and substituted files retained",async()=>{
 const result:{file:string;outcome:string}[]=[],evidence=path.resolve("test-results/phase2-integration-20261115/native-file-fence-"+randomUUID());mkdirSync(evidence);
 for(const suffix of ["","-wal"]){
  const f=await gateway();try{
   const directory=path.resolve(f.config.database.directory),root=path.resolve("test-results/sqlite-b1b-part1");
   if(!directory.startsWith(root+path.sep))throw Error("Confined fresh disposable native fixture required");
   const filename=path.join(directory,"test.sqlite3"+suffix),original=filename+".original-"+randomUUID(),substituted=filename+".substituted-"+randomUUID();
   if(path.dirname(original)!==directory||path.dirname(substituted)!==directory||existsSync(original)||existsSync(substituted))throw Error("Exact fresh file destinations required");
   await f.g.withAdminTransaction(f.admin,async tx=>{
    const point=captureGuardInputs(tx,"RETURN")!;expect(point).toBeDefined();const identity=lstatSync(filename,{bigint:true});let moved=false,replaced=false;
    try{
     try{renameSync(filename,original);moved=true;}catch(error){if(!["EPERM","EACCES","EBUSY"].includes(String((error as NodeJS.ErrnoException).code)))throw error;expect(guardInputsUnchanged(tx,"RETURN",point)).toBe(true);result.push({file:suffix?"WAL":"MAIN",outcome:"OS_REFUSED"});return;}
     copyFileSync(original,filename);replaced=true;expect(lstatSync(filename,{bigint:true}).ino).not.toBe(identity.ino);
     let refused=false;try{refused=!guardInputsUnchanged(tx,"RETURN",point);}catch{refused=true;}expect(refused).toBe(true);result.push({file:suffix?"WAL":"MAIN",outcome:"NATIVE_FENCE_REFUSED"});
    }finally{
     // Never overwrite/delete either copy. Restore only the original inode to
     // its exact original path before SQLite rollback/close; retain substitution.
     if(replaced){if(!existsSync(filename)||existsSync(substituted))throw Error("Unexpected replacement state retained for review");renameSync(filename,substituted);}
     if(moved){if(existsSync(filename)||!existsSync(original))throw Error("Unexpected original state retained for review");renameSync(original,filename);expect(lstatSync(filename,{bigint:true}).ino).toBe(identity.ino);}
    }
    expect(guardInputsUnchanged(tx,"RETURN",point)).toBe(false);expect(captureGuardInputs(tx,"RETURN")).toBeUndefined();
   });
  }finally{await f.g.close();}
 }
 writeFileSync(path.join(evidence,"result.json"),JSON.stringify({productionActivation:false,checks:result},null,2));expect(result).toHaveLength(2);
},120000);
