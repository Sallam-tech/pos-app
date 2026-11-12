import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { getAuthTables } from "@better-auth/core/db";
import { openDatabase, type SqliteConnection } from "../../src/server/db/connection";
import type { DatabaseOptions } from "../../src/server/db/location";
import { applyMigrations, loadMigrations } from "../../src/server/db/migrate";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import { AuthorizationDenied, type AuthorizationConfiguration, type AuthorizationGateway, type AuthorizedTransaction, type Role } from "../../src/server/auth/types";

const observed = vi.hoisted(() => ({ instances: [] as { $context: Promise<unknown> }[] }));
// Instrumentation adds only the official TEST plugin. The actual framework,
// official adapter, native driver, storage and gateway execute unchanged.
vi.mock("better-auth", async importOriginal => {
  const original = await importOriginal<typeof import("better-auth")>();
  const { testUtils } = await import("better-auth/plugins");
  return { ...original, betterAuth: (options: import("@better-auth/core").BetterAuthOptions) => {
    const instance = original.betterAuth({ ...options, plugins: [...(options.plugins ?? []), testUtils()] });
    observed.instances.push(instance); return instance;
  } };
});
interface Login {
  token: string; headers: Headers;
  cookies: { name: string; value: string; secure?: boolean; httpOnly?: boolean; sameSite?: string }[];
  session: { id: string; expiresAt: Date; bootGeneration: string; roleBinding: string };
}
interface Context {
  adapter: DBAdapter;
  options: import("@better-auth/core").BetterAuthOptions;
  password: { hash(value: string): Promise<string> };
  test: { login(input: { userId: string; session: Record<string, string> }): Promise<Login> };
  internalAdapter: { findSession(token: string): Promise<unknown> };
}
const root = path.resolve("test-results/sqlite-b1b-part1");
mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "auth3-"));
const productionMigrations = path.resolve("src/server/db/migrations");
const sources = path.resolve("src/server/auth");
const gateways: AuthorizationGateway[] = [], connections: SqliteConnection[] = [];
const secrets = new Set<string>();
const remember = (value: string) => { secrets.add(value); secrets.add(encodeURIComponent(value)); return value; };
const containsSecret = (text: string) => [...secrets].some(value => text.includes(value));
const jsonResults: string[] = [];
const fixtureAudits: (() => boolean)[] = [];
const roles = ["ADMIN", "SALESPERSON"] as const;
const zero = BigInt(0), one = BigInt(1);

function schema(effect = false) {
  const directory = mkdtempSync(path.join(run, "migrations-"));
  for (const name of readdirSync(productionMigrations).filter(n => n.endsWith(".sql"))) copyFileSync(path.join(productionMigrations,name),path.join(directory,name));
  if (effect) writeFileSync(path.join(directory,"0009_test_auth_effects.sql"),
    "CREATE TABLE test_auth_effects(id INTEGER PRIMARY KEY,note TEXT NOT NULL,principal_id TEXT REFERENCES auth_users(id) DEFERRABLE INITIALLY DEFERRED) STRICT;");
  return directory;
}
function database() {
  const options: DatabaseOptions = { directory: mkdtempSync(path.join(run,"db-")), filename:"test.sqlite3",mode:"test",create:true,busyTimeoutMs:75 };
  const db = openDatabase(options); connections.push(db); return { db, options };
}
async function fixture({ seed = true, effect = false } = {}) {
  const { db, options } = database(), directory = schema(effect);
  applyMigrations(db,directory);
  const configuration: AuthorizationConfiguration = {
    database: { ...options, create:false }, migrationsDirectory:directory,
    origins: { ADMIN:"https://admin.auth-proof.invalid",SALESPERSON:"https://staff.auth-proof.invalid" },
    signingSecrets: { ADMIN:remember(randomBytes(48).toString("base64url")),SALESPERSON:remember(randomBytes(48).toString("base64url")) },
    sessionLifetimeSeconds:120
  };
  const start = observed.instances.length;
  const gateway = await openAuthorizationGateway(configuration); gateways.push(gateway);
  const contexts = { ADMIN:await observed.instances[start].$context as Context, SALESPERSON:await observed.instances[start+1].$context as Context };
  if (seed) {
    const provisionedAt = BigInt(Date.now());
    for (const role of roles) {
      const a = contexts[role].adapter, now = new Date();
      await a.create({ model:"user",forceAllowId:true,data:{
        id:role,role,name:"TEST "+role,email:role.toLowerCase()+"@shop-pos.invalid",emailVerified:false,createdAt:now,updatedAt:now
      } });
      const password = remember("TEST-only-"+randomBytes(24).toString("hex"));
      const hash = await contexts[role].password.hash(password);
      await a.create({ model:"account",forceAllowId:true,data:{id:role,userId:role,accountId:role,providerId:"credential",password:hash,createdAt:now,updatedAt:now} });
      db.transaction(tx=>tx.run("INSERT INTO auth_principals(id,credential_version,auth_epoch,active,provisioned_at_ms) VALUES(?,?,?,?,?)",
        [role,one,one,one,provisionedAt]));
    }
    db.transaction(tx=>tx.run("INSERT INTO auth_provisioning VALUES(?,?,?,?,?)",[one,one,"ADMIN","SALESPERSON",provisionedAt]));
  }
  const issue = async (role: Role, overrides: Record<string,string> = {}) => {
    const state = db.get("SELECT credential_version,auth_epoch FROM auth_principals WHERE id=?",[role]);
    const login = await contexts[role].test.login({userId:role,session:{credentialVersion:String(state?.credential_version),authEpoch:String(state?.auth_epoch),...overrides}});
    remember(login.token); remember(login.headers.get("cookie")!); for(const c of login.cookies)remember(c.value);
    const created = BigInt(Date.now()-1);
    db.transaction(tx=>tx.run("INSERT INTO auth_session_authorizations VALUES(?,?,?,?,?,?,?,NULL)",[
      login.session.id,role,state!.credential_version,state!.auth_epoch,login.session.bootGeneration,created,BigInt(login.session.expiresAt.getTime())
    ]));
    return login;
  };
  const request = (role: Role, login?: Login) => new Request(configuration.origins[role]+"/protected-test",{headers:login?.headers});
  const files = [path.join(options.directory,options.filename),path.join(options.directory,options.filename)+"-wal",path.join(options.directory,options.filename)+"-shm"];
  const diskHasSecret = () => files.some((file,index)=>{if(index>0&&!existsSync(file))return false;return containsSecret(readFileSync(file).toString("latin1"));});
  fixtureAudits.push(diskHasSecret);
  return { db,options,directory,configuration,gateway,contexts,issue,request,diskHasSecret };
}
afterEach(async () => {
  for (const gateway of gateways.splice(0)) await gateway.close();
  for (const db of connections.splice(0)) db.close();
  for (const audit of fixtureAudits.splice(0)) expect(audit()).toBe(false);
});
const reject = async (work: Promise<unknown>) => {
  try { await work; throw new Error("TEST_EXPECTED_DENIAL"); }
  catch(error) {
    expect(error instanceof AuthorizationDenied).toBe(true);
    expect((error as Error).message).toBe("Access denied.");
    expect(Object.hasOwn(error as object,"cause")).toBe(false);
  }
};
describe("bounded production authentication schema and private gateway",()=>{
  it("installs eight checksummed STRICT migrations, repeats safely and inserts no accounts",()=>{
    const {db}=database(),directory=schema();
    expect(applyMigrations(db,directory)).toEqual({applied:8,version:BigInt(8)});
    expect(applyMigrations(db,directory)).toEqual({applied:0,version:BigInt(8)});
    expect(db.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(zero);
    expect(db.get("SELECT count(*) AS n FROM auth_credentials")?.n).toBe(zero);
    const tables=db.all("SELECT name,strict FROM pragma_table_list WHERE schema='main' AND name LIKE 'auth_%'");
    expect(tables.length).toBe(7);expect(tables.every(t=>t.strict===one)).toBe(true);
    const history=db.all("SELECT checksum FROM schema_migrations");
    expect(history.every(h=>typeof h.checksum==="string"&&h.checksum.length===64)).toBe(true);
    expect(loadMigrations(directory).length).toBe(8);
  });
  it("rolls back an entire failed fresh migration batch including history and version",()=>{
    const {db}=database(),directory=schema();
    writeFileSync(path.join(directory,"0009_test_not_strict.sql"),"CREATE TABLE test_not_strict(v INTEGER); -- ) STRICT");
    expect(()=>applyMigrations(db,directory)).toThrow();
    expect(db.all("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").length).toBe(0);
    expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(zero);
  });
  it("preserves committed migrations/data when a later migration fails",async()=>{
    const {db,directory}=await fixture();
    const accounts=db.all("SELECT id,name FROM auth_users ORDER BY id");
    const before=db.all("SELECT * FROM schema_migrations");
    writeFileSync(path.join(directory,"0009_test_failed.sql"),"CREATE TABLE test_failed(v INTEGER); -- ) STRICT");
    expect(()=>applyMigrations(db,directory)).toThrow();
    expect(db.all("SELECT * FROM schema_migrations")).toEqual(before);
    expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(8));
    expect(db.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(BigInt(2));
    expect(db.all("SELECT id,name FROM auth_users ORDER BY id")).toEqual(accounts);
  });
  it("uses the pinned official adapter against the real user/credential schema",async()=>{
    const f=await fixture();
    for(const role of roles) {
      const user=await f.contexts[role].adapter.findOne<{id:string;emailVerified:boolean}>({model:"user",where:[{field:"id",value:role}]});
      const account=await f.contexts[role].adapter.findOne<{password:string}>({model:"account",where:[{field:"userId",value:role}]});
      expect(user?.id).toBe(role);expect(user?.emailVerified).toBe(false);
      expect(typeof account?.password==="string"&&account.password.length===161).toBe(true);
      const tables=getAuthTables(f.contexts[role].options);
      expect(Object.hasOwn(tables,"session")).toBe(false);expect(Object.hasOwn(tables,"verification")).toBe(false);
      for(const model of ["user","account"]as const){
        const columns=f.db.all("SELECT name FROM pragma_table_info(?)",[tables[model].modelName]).map(r=>r.name);
        expect(Object.entries(tables[model].fields).every(([key,field])=>columns.includes(field.fieldName??key))).toBe(true);
      }
    }
  });
  it("enforces only the two fixed identities, credential uniqueness, hash format and no OAuth token storage",async()=>{
    const f=await fixture();
    expect(()=>f.db.transaction(tx=>tx.run("INSERT INTO auth_users VALUES('THIRD','THIRD','TEST','third@example.invalid',0,NULL,'x','x')"))).toThrow();
    expect(()=>f.db.transaction(tx=>tx.run("UPDATE auth_users SET role='ADMIN' WHERE id='SALESPERSON'"))).toThrow();
    expect(()=>f.db.transaction(tx=>tx.run("UPDATE auth_credentials SET password='plaintext' WHERE id='ADMIN'"))).toThrow();
    expect(()=>f.db.transaction(tx=>tx.run("UPDATE auth_credentials SET accessToken='TEST-disallowed' WHERE id='ADMIN'"))).toThrow();
    expect(()=>f.db.transaction(tx=>tx.run("UPDATE auth_credentials SET userId='ADMIN' WHERE id='SALESPERSON'"))).toThrow();
    expect(f.db.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(BigInt(2));
  });
  it("enforces foreign keys, STRICT versions, int64 overflow and explicit provisioning",async()=>{
    const f=await fixture({seed:false});
    expect(()=>f.db.transaction(tx=>tx.run("INSERT INTO auth_principals VALUES('ADMIN',1,1,0,NULL)"))).toThrow();
    expect(()=>f.db.transaction(tx=>tx.run("INSERT INTO auth_session_authorizations VALUES('x','MISSING',1,1,?,1,2,NULL)",["x".repeat(36)]))).toThrow();
    const live=await fixtureAfterClose(f);
    expect(()=>live.db.transaction(tx=>tx.run("UPDATE auth_principals SET credential_version='invalid' WHERE id='ADMIN'"))).toThrow();
    expect(()=>live.db.transaction(tx=>tx.run("UPDATE auth_principals SET active=0 WHERE id='ADMIN'"))).toThrow();
    expect(()=>live.db.transaction(tx=>tx.run("UPDATE auth_principals SET credential_version=?+1 WHERE id='ADMIN'",[BigInt("9223372036854775807")]))).toThrow();
  });
  it("defaults to deny without configuration, accounts, credentials or session",async()=>{
    const empty=await openAuthorizationGateway();gateways.push(empty);
    await reject(empty.authorizeAdmin(new Request("https://admin.auth-proof.invalid/test")));
    const f=await fixture({seed:false});await reject(f.gateway.authorizeAdmin(f.request("ADMIN")));
    expect(f.db.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(zero);
  });
  it("accepts actual role-bound framework sessions and requires the completed provisioning latch",async()=>{
    const f=await fixture();
    for(const role of roles){
      const login=await f.issue(role),actor=await(role==="ADMIN"?f.gateway.authorizeAdmin(f.request(role,login)):f.gateway.authorizeSalesperson(f.request(role,login)));
      expect(actor.role).toBe(role);expect(actor.principalId).toBe(role);
      jsonResults.push(JSON.stringify(actor));expect(containsSecret(JSON.stringify(actor))).toBe(false);
      expect(login.cookies[0].secure).toBe(true);expect(login.cookies[0].httpOnly).toBe(true);expect(login.cookies[0].sameSite).toBe("Strict");
    }
    const admin=await f.issue("ADMIN");
    f.db.transaction(tx=>tx.run("DELETE FROM auth_provisioning"));
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN",admin)));
  });
  it("denies missing, altered and unsigned cookies",async()=>{
    const f=await fixture(),login=await f.issue("ADMIN");
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN")));
    const h=new Headers(login.headers),cookie=h.get("cookie")!;h.set("cookie",cookie.slice(0,-1)+(cookie.endsWith("A")?"B":"A"));
    await reject(f.gateway.authorizeAdmin(new Request(f.configuration.origins.ADMIN+"/x",{headers:h})));
    await reject(f.gateway.authorizeAdmin(new Request(f.configuration.origins.ADMIN+"/x",{headers:{cookie:login.cookies[0].name+"="+login.token}})));
  });
  it("denies disabled Salesperson and any incomplete two-account provisioning state",async()=>{
    const f=await fixture(),staff=await f.issue("SALESPERSON"),admin=await f.issue("ADMIN");
    f.db.transaction(tx=>tx.run("UPDATE auth_principals SET active=0 WHERE id='SALESPERSON'"));
    await reject(f.gateway.authorizeSalesperson(f.request("SALESPERSON",staff)));
    expect((await f.gateway.authorizeAdmin(f.request("ADMIN",admin))).role).toBe("ADMIN");
    f.db.transaction(tx=>tx.run("DELETE FROM auth_credentials WHERE id='SALESPERSON'"));
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN",admin)));
  });
  it("rejects expired and revoked registry rows even when the real RAM session survives",async()=>{
    const f=await fixture(),a=await f.issue("ADMIN"),b=await f.issue("ADMIN");
    f.db.transaction(tx=>{tx.run("UPDATE auth_session_authorizations SET expires_at_ms=created_at_ms+1 WHERE session_id=?",[a.session.id]);tx.run("UPDATE auth_session_authorizations SET revoked_at_ms=? WHERE session_id=?",[BigInt(Date.now()),b.session.id]);});
    expect(await f.contexts.ADMIN.internalAdapter.findSession(b.token)!==null).toBe(true);
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN",a)));await reject(f.gateway.authorizeAdmin(f.request("ADMIN",b)));
  });
  it("checks authoritative credential version and authorization epoch on every operation",async()=>{
    const f=await fixture(),a=await f.issue("ADMIN");
    await f.gateway.authorizeAdmin(f.request("ADMIN",a));
    f.db.transaction(tx=>tx.run("UPDATE auth_principals SET credential_version=credential_version+1 WHERE id='ADMIN'"));
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN",a)));
    const b=await f.issue("ADMIN");await f.gateway.authorizeAdmin(f.request("ADMIN",b));
    f.db.transaction(tx=>tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'"));
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN",b)));
  });
  it("rejects forged session epoch/boot metadata and future-dated registry authorization",async()=>{
    const f=await fixture(),wrong=await f.issue("ADMIN",{authEpoch:"999"}),a=await f.issue("ADMIN");
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN",wrong)));
    f.db.transaction(tx=>tx.run("UPDATE auth_session_authorizations SET boot_generation=? WHERE session_id=?",["0".repeat(36),a.session.id]));
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN",a)));
    const b=await f.issue("ADMIN");
    f.db.transaction(tx=>tx.run("UPDATE auth_session_authorizations SET created_at_ms=?,expires_at_ms=? WHERE session_id=?",[BigInt(Date.now()+10000),BigInt(Date.now()+20000),b.session.id]));
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN",b)));
  });
  it("prevents Staff credentials or crafted role/cookie names from obtaining Admin access",async()=>{
    const f=await fixture(),staff=await f.issue("SALESPERSON"),admin=await f.issue("ADMIN");
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN",staff)));
    const h=new Headers(staff.headers);h.set("cookie",admin.cookies[0].name+"="+staff.cookies[0].value);
    await reject(f.gateway.authorizeAdmin(new Request(f.configuration.origins.ADMIN+"/admin-only",{headers:h})));
    await reject(f.gateway.authorizeAdmin(f.request("SALESPERSON",admin)));
    await reject(f.gateway.authorizeSalesperson(f.request("SALESPERSON",admin)));
  });
  it("rejects stale cookies after owner reopen without resetting committed records",async()=>{
    const f=await fixture(),a=await f.issue("ADMIN"),count=f.db.get("SELECT count(*) AS n FROM auth_users")?.n;
    await f.gateway.close();
    const reopened=await openAuthorizationGateway(f.configuration);gateways.push(reopened);
    await reject(reopened.authorizeAdmin(f.request("ADMIN",a)));
    expect(f.db.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(count);
    expect(f.db.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n).toBe(one);
  });
  it("denies changed migration history and never migrates on gateway opening",async()=>{
    const f=await fixture();await f.gateway.close();
    const name=readdirSync(f.directory).find(n=>n.startsWith("0001"))!;
    writeFileSync(path.join(f.directory,name),readFileSync(path.join(f.directory,name),"utf8")+"\n-- changed");
    await reject(openAuthorizationGateway(f.configuration));
    expect(f.db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(8));
  });
  it("fails closed on real SQL schema unavailability without exposing its cause",async()=>{
    const f=await fixture(),a=await f.issue("ADMIN"),require=createRequire(import.meta.url);
    const Native=require("better-sqlite3") as new(filename:string)=>{exec(sql:string):void;close():void};
    const broken=new Native(path.join(f.options.directory,f.options.filename));try{broken.exec("DROP TABLE auth_session_authorizations");}finally{broken.close();}
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN",a)));
  });
  it("has no raw handler/API or issuance surface and imports server-only markers",async()=>{
    const f=await fixture();
    expect(containsSecret(JSON.stringify(f.gateway))).toBe(false);
    expect(Object.keys(f.gateway).sort()).toEqual(["authorizeAdmin","authorizeSalesperson","close","withAdminTransaction","withSalespersonTransaction","verifyAdminPassword","verifySalespersonPassword", "issueAdminSession", "issueSalespersonSession", "logoutAdmin", "logoutSalesperson", "rotateAdminPassword", "rotateSalespersonPassword"].sort());
    for(const file of readdirSync(sources).filter(n=>n.endsWith(".ts"))){
      const text=readFileSync(path.join(sources,file),"utf8");
      expect(text.includes('import "server-only"')).toBe(true);
      expect(/testUtils|ctx\.test|\.test\.login/.test(text)).toBe(false);
    }
  });
  it("authorizes mutations and commits their awaited effects under one writer reservation",async()=>{
    const f=await fixture({effect:true}),a=await f.issue("ADMIN");
    await f.gateway.withAdminTransaction(f.request("ADMIN",a),async(tx,actor)=>{
      expect(actor.role).toBe("ADMIN");
      await tx.run("INSERT INTO test_auth_effects(note,principal_id) VALUES(?,?)",["TEST-success","ADMIN"]);
      await new Promise(resolve=>setImmediate(resolve));
      await tx.run("INSERT INTO test_auth_effects(note,principal_id) VALUES(?,?)",["TEST-success-2","ADMIN"]);
    });
    expect(f.db.get("SELECT count(*) AS n FROM test_auth_effects")?.n).toBe(BigInt(2));
  });
  it("rolls back callback and COMMIT failures; the next operation remains functional",async()=>{
    const f=await fixture({effect:true}),a=await f.issue("ADMIN");
    await reject(f.gateway.withAdminTransaction(f.request("ADMIN",a),async tx=>{
      await tx.run("INSERT INTO test_auth_effects(note) VALUES(?)",["TEST-rollback"]);await new Promise(resolve=>setImmediate(resolve));throw new Error("TEST-failure");
    }));
    await reject(f.gateway.withAdminTransaction(f.request("ADMIN",a),async tx=>{await tx.run("INSERT INTO test_auth_effects(note,principal_id) VALUES(?,?)",["TEST-deferred-fk","MISSING"]);}));
    expect(f.db.get("SELECT count(*) AS n FROM test_auth_effects")?.n).toBe(zero);
    expect((await f.gateway.authorizeAdmin(f.request("ADMIN",a))).role).toBe("ADMIN");
  });
  it("expires transaction capabilities and prevents nested authorization/deferred writes",async()=>{
    const f=await fixture({effect:true}),a=await f.issue("ADMIN");let captured:AuthorizedTransaction|undefined;
    await f.gateway.withAdminTransaction(f.request("ADMIN",a),async tx=>{captured=tx;});
    await reject(captured!.run("INSERT INTO test_auth_effects(note) VALUES(?)",["TEST-late"]));
    await reject(f.gateway.withAdminTransaction(f.request("ADMIN",a),async()=>{await f.gateway.authorizeAdmin(f.request("ADMIN",a));}));
    await f.gateway.withAdminTransaction(f.request("ADMIN",a),async()=>{
      await reject(f.gateway.verifyAdminPassword(undefined));
      await reject(f.gateway.verifySalespersonPassword(undefined));
    });
    expect(f.db.get("SELECT count(*) AS n FROM test_auth_effects")?.n).toBe(zero);
  });
  it("rejects SQL configuration/unsafe-number escapes and reads int64 exactly in the async scope",async()=>{
    const f=await fixture(),a=await f.issue("ADMIN");
    await f.gateway.withAdminTransaction(f.request("ADMIN",a),async tx=>{
      expect((await tx.get("SELECT 9007199254740993 AS exact"))?.exact).toBe(BigInt("9007199254740993"));
      await reject(tx.get("PRAGMA foreign_keys=OFF"));
      await reject(tx.get("SELECT ? AS n",[1 as unknown as bigint]));
      await reject(tx.get("SELECT 1.5 AS n"));
    });
  });
  it("keeps concurrent callback rollback separate from the following committed mutation",async()=>{
    const f=await fixture({effect:true}),a=await f.issue("ADMIN");
    const first=f.gateway.withAdminTransaction(f.request("ADMIN",a),async tx=>{
      await tx.run("INSERT INTO test_auth_effects(note) VALUES(?)",["TEST-concurrent-rollback"]);await new Promise(resolve=>setImmediate(resolve));throw new Error("TEST-rollback");
    });
    const second=f.gateway.withAdminTransaction(f.request("ADMIN",a),async tx=>{await tx.run("INSERT INTO test_auth_effects(note) VALUES(?)",["TEST-concurrent-commit"]);});
    const results=await Promise.allSettled([first,second]);
    expect(results.map(r=>r.status)).toEqual(["rejected","fulfilled"]);
    expect(f.db.get("SELECT count(*) AS n FROM test_auth_effects")?.n).toBe(one);
    expect(f.db.get("SELECT note FROM test_auth_effects")?.note).toBe("TEST-concurrent-commit");
  });
  it("excludes independent SQLite revocation between the authorization check and mutation commit",async()=>{
    const f=await fixture({effect:true}),a=await f.issue("ADMIN");let blocked=false;
    await f.gateway.withAdminTransaction(f.request("ADMIN",a),async tx=>{
      try{f.db.transaction(t=>t.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'"));}catch{blocked=true;}
      await tx.run("INSERT INTO test_auth_effects(note) VALUES(?)",["TEST-atomic-authorized"]);
    });
    expect(blocked).toBe(true);
    f.db.transaction(t=>t.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'"));
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN",a)));
    expect(f.db.get("SELECT count(*) AS n FROM test_auth_effects")?.n).toBe(one);
  });
  it("waits for admitted mutations on close and rejects subsequent requests",async()=>{
    const f=await fixture({effect:true}),a=await f.issue("ADMIN");
    const pending=f.gateway.withAdminTransaction(f.request("ADMIN",a),async tx=>{await new Promise(resolve=>setImmediate(resolve));await tx.run("INSERT INTO test_auth_effects(note) VALUES(?)",["TEST-close-commit"]);});
    const closing=f.gateway.close();
    await reject(f.gateway.authorizeAdmin(f.request("ADMIN",a)));
    await pending;await closing;
    expect(f.db.get("SELECT count(*) AS n FROM test_auth_effects")?.n).toBe(one);
  });
  it("rejects duplicate process owners, same-host portals and shared signing keys",async()=>{
    const f=await fixture();await reject(openAuthorizationGateway(f.configuration));await f.gateway.close();
    await reject(openAuthorizationGateway({...f.configuration,origins:{ADMIN:f.configuration.origins.ADMIN,SALESPERSON:f.configuration.origins.ADMIN}}));
    await reject(openAuthorizationGateway({...f.configuration,signingSecrets:{ADMIN:f.configuration.signingSecrets.ADMIN,SALESPERSON:f.configuration.signingSecrets.ADMIN}}));
  });
  it("never persists active tokens/keys/passwords or returns them in actors",async()=>{
    const f=await fixture();for(const role of roles){const a=await f.issue(role);jsonResults.push(JSON.stringify(await(role==="ADMIN"?f.gateway.authorizeAdmin(f.request(role,a)):f.gateway.authorizeSalesperson(f.request(role,a)))));}
    expect(f.diskHasSecret()).toBe(false);expect(containsSecret(JSON.stringify(jsonResults))).toBe(false);
    const names=f.db.all("SELECT name FROM sqlite_schema WHERE type='table'").map(r=>r.name);
    expect(names.includes("session")).toBe(false);expect(names.includes("auth_session")).toBe(false);
  });
});
async function fixtureAfterClose(f:Awaited<ReturnType<typeof fixture>>) {await f.gateway.close();return fixture();}
