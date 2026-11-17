import {beforeAll,test,expect} from "vitest";
import {createRequire} from "node:module";
import {readFileSync,readdirSync} from "node:fs";
import path from "node:path";
import ts from "typescript";
import {createReadStatements} from "../../src/server/auth/read-statements";
import {schemaTokens} from "../../src/server/db/schema-sql";
import {seed,gateway} from "../helpers/cash-fixture";
import type {AuthorizedTransaction} from "../../src/server/auth/types";
const pointer=JSON.parse(readFileSync(path.resolve("test-results/phase2-integration-20261115/test16-source-before.json"),"utf8").replace(/^\uFEFF/,""));
const original=readFileSync(path.join(pointer.archive,"web/src/server/db/schema-sql.ts"),"utf8").replace('import "server-only";',"");
const oldTokens=new Function(ts.transpileModule(original.replace("export function schemaTokens","function schemaTokens")+"\nreturn schemaTokens;",{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText)() as typeof schemaTokens;
const outcome=(fn:typeof schemaTokens,sql:string)=>{try{return [true,fn(sql)];}catch(e){return [false,(e as Error).message];}};
test("pure lexer retains exact original token and rejection outcomes for every migration and adversarial input",()=>{
 const directory=path.resolve("src/server/db/migrations"),input=readdirSync(directory).filter(f=>f.endsWith(".sql")).map(f=>readFileSync(path.join(directory,f),"utf8"));
 input.push("", " ","\0", "a; b", "a;", "a$b", "$a", "CREATE TABLE [a b](\"x\" TEXT DEFAULT 'a''b');", "'unterminated", "/*unfinished", "--comment", "a\u00a0b", "a\v b", "é", "变量", "a😀b", "'😀'", '"a""b"', "`a``b`", "[a]]", "-/*x*/-", "a".repeat(65537), "a ".repeat(16385));
 const chars="abcXYZ09_$ ;(),+-*/%~&|.<>!=\t\n\r\f\v\"'`[]é中😀";let state=731;for(let i=0;i<2048;i++){let sql="";for(let j=0;j<i%97;j++){state=(Math.imul(state,1664525)+1013904223)>>>0;sql+=chars[state%chars.length];}input.push(sql);}
 for(const sql of input)expect(outcome(schemaTokens,sql)).toEqual(outcome(oldTokens,sql));
});
test("compiled reads retain fresh bound results and no .bind while reserved eligibility and explicit invalidation control reuse",()=>{
 const Driver=createRequire(import.meta.url)("better-sqlite3"),db=new Driver(":memory:");let reserved=true,compiled=0;db.defaultSafeIntegers(true);db.exec("CREATE TABLE t(id INTEGER PRIMARY KEY,v TEXT);INSERT INTO t VALUES(1,'first')");const c=createReadStatements(sql=>{compiled++;return db.prepare(sql);},()=>reserved);
 try{const sql="SELECT v FROM t WHERE id=?";expect(c.read(sql).get(BigInt(1)).v).toBe("first");expect(c.read(sql).get(BigInt(2))).toBeUndefined();expect(compiled).toBe(1);c.clear();db.exec("UPDATE t SET v='second'");expect(c.read(sql).get(BigInt(1)).v).toBe("second");expect(compiled).toBe(2);reserved=false;c.read(sql).get(BigInt(1));c.read(sql).get(BigInt(1));expect(compiled).toBe(4);reserved=true;c.read(sql);expect(compiled).toBe(5);c.clear();db.exec("ALTER TABLE t ADD COLUMN extra TEXT");expect(c.read("SELECT * FROM t").get().extra).toBe(null);}finally{c.clear();db.close();}
});
test("compiled programs are bounded and failed compilation discards all retained statements",()=>{let n=0;const c=createReadStatements(sql=>{if(sql==="bad")throw Error("refused");return {n:++n};},()=>true);const first=c.read("first");for(let i=0;i<128;i++)c.read("q"+i);expect(c.read("first")).not.toBe(first);const next=c.read("first");expect(()=>c.read("bad")).toThrow();expect(c.read("first")).not.toBe(next);const huge="x".repeat(524289);expect(c.read(huge)).not.toBe(c.read(huge));});
beforeAll(seed);
test("genuine authorized native transaction sees current rows after writes/rollback and refuses an expired scope",async()=>{const f=await gateway();let expired:AuthorizedTransaction|undefined;try{await expect(f.g.withAdminTransaction(f.admin,async tx=>{expired=tx;expect((await tx.get("SELECT count(*) AS n FROM cash_count_sessions"))?.n).toBe(BigInt(0));for(let i=0;i<4;i++)expect((await tx.get("SELECT ? AS n",[BigInt(i)]))?.n).toBe(BigInt(i));await tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id='ADMIN'");expect((await tx.get("SELECT count(*) AS n FROM cash_count_sessions"))?.n).toBe(BigInt(0));throw Error("intentional rollback");})).rejects.toThrow();await expect(expired!.get("SELECT 1")).rejects.toThrow();await f.g.withAdminTransaction(f.admin,async tx=>{expect((await tx.get("SELECT count(*) AS n FROM cash_count_sessions"))?.n).toBe(BigInt(0));});}finally{await f.g.close();}},120000);
