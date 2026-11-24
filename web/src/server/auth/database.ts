import "server-only";
import {createReadStatements} from "./read-statements";
import {createNativeInputJournal,reviewedMetadataTarget,type GuardInputs} from "./native-input-journal";
import {cashObjects} from "../db/cash-program";
import {storedTriggerSql} from "../db/inventory-trigger-policy";
import {schemaTokens} from "../db/schema-sql";
import { protectedRestoredHistory } from "../backup/protected-history";
import { assertProtectedWriterAdmission } from "../bootstrap/writer-admission";
import {restoredHistory,verifyHistoricalPrefixes,type HistoricalSettings} from "../backup/service";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstatSync } from "node:fs";
import { hasActiveBootstrapLease, type BootstrapLease } from "../bootstrap/ownership";
import { Kysely, SqliteDialect, type SqliteDatabase, type SqliteStatement } from "kysely";
import { openDatabase, type SqlRow, type SqlValue } from "../db/connection";
import { int64 } from "../db/integers";
import { resolveDatabaseLocation, type DatabaseOptions } from "../db/location";
import { loadMigrations } from "../db/migrate";
import { AuthorizationDenied, type AuthorizationConfiguration, type AuthorizedTransaction } from "./types";

interface NativeStatement extends SqliteStatement {
  readonly readonly: boolean;
  get(parameters: readonly unknown[]): unknown;
  safeIntegers(enabled: boolean): NativeStatement;
}
interface NativeDatabase extends SqliteDatabase {
  readonly inTransaction: boolean;
  readonly open: boolean;
  prepare(sql: string): NativeStatement;
  exec(sql: string): void;
  pragma(sql: string, options?: { simple: boolean }): unknown;
  defaultSafeIntegers(enabled: boolean): void;
  function(name:string,options:{deterministic:true;directOnly:true},fn:(value:unknown)=>string|null):void;
}
type Driver = new (filename: string, options: { timeout: number; fileMustExist: boolean }) => NativeDatabase;
const deny = (): never => { throw new AuthorizationDenied(); };
const bindings = (values: readonly SqlValue[]) => {
  if (!Array.isArray(values)) return deny();
  return values.map(v => {
    if (typeof v === "bigint") return int64(v);
    if (typeof v === "string" || v === null) return v;
    if (v instanceof Uint8Array) return Buffer.from(v);
    return deny();
  });
};
const asRow = (value: unknown): SqlRow => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return deny();
  for (const v of Object.values(value)) {
    if (typeof v === "bigint") int64(v);
    else if (v !== null && typeof v !== "string" && !(v instanceof Uint8Array)) return deny();
  }
  return value as SqlRow;
};

// Genuine read capabilities are private, read-only, and bound to one native owner,
// lease and callback lifetime. A structural get/all object never establishes ownership.
export interface BootstrapReadScope extends Pick<AuthorizedTransaction, "get" | "all"> { readonly __bootstrapReadScope: unique symbol }
const bootstrapScopes = new WeakMap<object, { lease: BootstrapLease; filename: string; guard(): void }>();
const leaseOwners = new WeakMap<object, object>();
// Internal, non-bearer file namespace. Only genuine live scopes minted by this
// native owner can supply it; structural readers and expired scopes fail closed.
const fileScopes = new WeakMap<object, () => string>();
const restoredScopes = new WeakMap<object, () => Promise<readonly HistoricalSettings[]>>();
// Registration stays private to the native owner. These receipts confer NO
// authorization; only a guard's private WeakMap retains one after its full scan.
declare const guardInputsBrand:unique symbol;
export interface GuardInputPoint {readonly [guardInputsBrand]:true}
const inputScopes=new WeakMap<object,{capture(kind:GuardInputs):object|undefined;unchanged(point:object,kind:GuardInputs,noWrites:boolean):boolean;resume(kind:GuardInputs,owner:object):boolean;retain(point:object,kind:GuardInputs,owner:object):void}>();
const inputPoints=new WeakMap<object,{scope:object;kind:GuardInputs;point:object}>();
export function captureGuardInputs(scope:object,kind:GuardInputs):GuardInputPoint|undefined{
 const point=inputScopes.get(scope)?.capture(kind);if(!point)return;
 const proof=Object.freeze({}) as GuardInputPoint;inputPoints.set(proof,{scope,kind,point});return proof;
}
export function guardInputsUnchanged(scope:object,kind:GuardInputs,proof:GuardInputPoint,noWrites=false):boolean{
 const saved=inputPoints.get(proof);return !!saved&&saved.scope===scope&&saved.kind===kind&&!!inputScopes.get(scope)?.unchanged(saved.point,kind,noWrites);
}
// Guard-only continuation; no callback, data, Actor, session or proof is extended.
export function resumeGuardInputs(scope:object,kind:GuardInputs,owner:object):boolean{return inputScopes.get(scope)?.resume(kind,owner)??false;}
export function retainGuardInputs(scope:object,kind:GuardInputs,proof:GuardInputPoint,owner:object):void{const p=inputPoints.get(proof);if(p?.scope===scope&&p.kind===kind)inputScopes.get(scope)?.retain(p.point,kind,owner);}
export async function restoredSettingsHistory(scope:AuthorizedTransaction):Promise<readonly HistoricalSettings[]>{const read=restoredScopes.get(scope);if(!read)return deny();return read();}
export function authorizedFileNamespace(scope: AuthorizedTransaction): string {
  const read = fileScopes.get(scope); if (!read) return deny(); return read();
}
export function assertBootstrapReadScope(value: unknown, lease: BootstrapLease, database: DatabaseOptions): asserts value is BootstrapReadScope {
  const saved = value && typeof value === "object" ? bootstrapScopes.get(value) : undefined;
  if (!saved || saved.lease !== lease || saved.filename !== resolveDatabaseLocation({ ...database, create: false }).filename.toLowerCase()) return deny();
  saved.guard();
}

// Internal module, not a connection exported by the authorization gateway.
// Kysely owns its ONLY native handle; it never receives Part 1's private handle.
export function openAsyncOwner(config: Pick<AuthorizationConfiguration, "database" | "migrationsDirectory" | "restoreProof" | "protectedHistory" | "protectedAdmission">) {
  const options = { ...config.database, create: false };
  // Issuer/consumer both reject persistent mode and wrong target identities.
  if(config.restoreProof !== undefined && config.protectedHistory !== undefined) return deny();
  const historical:readonly HistoricalSettings[]=config.protectedHistory === undefined ? restoredHistory(config.restoreProof,options) : protectedRestoredHistory(config.protectedHistory,options);
  const preflight = openDatabase(options);
  try {
    const manifest = loadMigrations(config.migrationsDirectory);
    const marker=preflight.get("SELECT user_version FROM pragma_user_version")?.user_version;
    if(typeof marker!=="bigint"||![BigInt(8),BigInt(18),BigInt(35),BigInt(36),BigInt(37),BigInt(38),BigInt(39),BigInt(40),BigInt(41)].includes(marker))deny();
    const expected=config.database.mode==="test"?manifest.slice(0,Number(marker)):manifest;
    const history = preflight.all("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
    if (history.length !== expected.length ||
        preflight.get("SELECT user_version FROM pragma_user_version")?.user_version !== expected.at(-1)?.version ||
        history.some((r,i) => r.version !== expected[i].version || r.name !== expected[i].name || r.checksum !== expected[i].checksum)) deny();
  } finally { preflight.close(); }
  // Validate the path again immediately before the independently owned open.
  const location = resolveDatabaseLocation(options);
  const require = createRequire(import.meta.url);
  const Constructor = require("better-sqlite3") as Driver;
  const identity = lstatSync(location.filename, { bigint: true });
  const native = new Constructor(location.filename, { timeout: location.busyTimeoutMs, fileMustExist: true });
  let generation = {}, closingReads = false, boundLease: BootstrapLease | undefined;
  const ownerIdentity = {};
  let reservedGeneration:object|undefined;
  let journal:ReturnType<typeof createNativeInputJournal>|undefined;let continuations=new WeakMap<object,{kind:GuardInputs;point:object}>();
  const preparedReads=createReadStatements((sql:string)=>native.prepare(sql).safeIntegers(true),()=>native.open&&native.inTransaction&&reservedGeneration===generation&&!closingReads);
  const invalidate = () => { preparedReads.clear();generation = {}; journal=undefined;continuations=new WeakMap(); };
  const releaseLeaseOwner = () => { if (boundLease && leaseOwners.get(boundLease) === ownerIdentity) leaseOwners.delete(boundLease); };
  const sameFile = () => {
    const current = lstatSync(resolveDatabaseLocation(options).filename, { bigint: true });
    if (current.dev !== identity.dev || current.ino !== identity.ino) return deny();
  };
  let db: Kysely<Record<string, never>> | undefined;
  try {
    native.pragma("foreign_keys=ON"); native.pragma("journal_mode=WAL");
    native.pragma("synchronous=FULL"); native.pragma(`busy_timeout=${location.busyTimeoutMs}`);
    native.pragma("trusted_schema=OFF");
    if (native.pragma("foreign_keys", { simple: true }) !== 1 ||
        native.pragma("journal_mode", { simple: true }) !== "wal" ||
        native.pragma("synchronous", { simple: true }) !== 2 ||
        native.pragma("busy_timeout", { simple: true }) !== location.busyTimeoutMs ||
        native.pragma("quick_check", { simple: true }) !== "ok") deny();
    // Bounded64MiB SQLite page cache for the approved TEST38/39 report books. This is native
    // coherent page storage, never a cache of authorization/validation results.
    if((options.mode==="test"||!!config.protectedAdmission)&&[38,39,40,41].includes(native.pragma("user_version",{simple:true}) as number)){native.pragma("cache_size=-131072");if(native.pragma("cache_size",{simple:true})!==-131072)deny();
      // Native read-only page mapping avoids redundant OS/page-cache copies.
      // SQLite still reads the current snapshot/WAL and writes through FULL WAL;
      // every authorization, row/hash guard and native file fence remains fresh.
      native.pragma("mmap_size=536870912");const mapped=native.pragma("mmap_size",{simple:true});
      // Unsupported VFS/builds may retain zero; that is the original safe I/O path.
      if(typeof mapped!=="number"||!Number.isSafeInteger(mapped)||mapped<0||mapped>536870912)deny();}
    // Pure, direct-only Unicode text folding for admitted TEST report/history
    // searches. No SQL, I/O, authorization or persisted schema capability.
    if((options.mode==="test"||!!config.protectedAdmission)&&[36,37,38,39,40,41].includes(native.pragma("user_version",{simple:true}) as number))native.function("pos_lower",{deterministic:true,directOnly:true},value=>typeof value==="string"?value.toLowerCase():null);
    // Pinned adapter converts boolean columns only when they are JS Numbers.
    // Its tables contain only 0/1 numeric fields. All authorization/business SQL
    // below opts into safeIntegers per statement; no financial Number reads.
    native.defaultSafeIntegers(false);
    sameFile();
    // Supported Kysely SqliteDatabase interface. Observe non-result statements AND
    // writes. SQLite marks transaction controls readonly; reader=false still
    // identifies their execution, including commented BEGIN/COMMIT/ROLLBACK. No SQL regex
    // claims transaction identity. Conservative invalidation also covers SQL writes.
    const dialectDatabase: SqliteDatabase = {
      close() { closingReads = true; invalidate(); native.close(); releaseLeaseOwner(); },
      prepare(text) {
        const statement = native.prepare(text);
        const changing = () => { if (!statement.reader || !statement.readonly) invalidate(); };
        return {
          get reader() { return statement.reader; },
          all(values) { changing(); return statement.all(values); },
          run(values) { changing(); return statement.run(values); },
          iterate(values) { changing(); return statement.iterate(values); },
        };
      },
    };
    db = new Kysely({ dialect: new SqliteDialect({ database: dialectDatabase }) });
    const get = (sql: string, values: readonly SqlValue[] = []): SqlRow | undefined => {
      if (!/^\s*(?:SELECT|WITH)\b/i.test(sql)) return deny();
      const s = preparedReads.read(sql);
      if (!s.readonly) return deny();
      try{const row = s.get(bindings(values)); return row === undefined ? undefined : asRow(row);}catch(error){preparedReads.clear();throw error;}
    };
    const all = (sql: string, values: readonly SqlValue[] = []): SqlRow[] => {
      if (!/^\s*(?:SELECT|WITH)\b/i.test(sql)) return deny();
      const s = preparedReads.read(sql);
      if (!s.readonly) return deny();
      try{return s.all(bindings(values)).map(asRow);}catch(error){preparedReads.clear();throw error;}
    };
    const rawRun = (sql: string, values: readonly SqlValue[] = []) => {
      preparedReads.clear(); // Every attempted write, including failures/no-effect writes.
      if (!/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql)) return deny();
      const before=get("SELECT total_changes() AS n")?.n,result = native.prepare(sql).safeIntegers(true).run(bindings(values));
      if (typeof result.changes !== "number" || !Number.isSafeInteger(result.changes) || result.changes < 0) return deny();
      const after=get("SELECT total_changes() AS n")?.n;
      // A real write on THIS handle inside this generation proves SQLite's
      // writer reservation; transaction controls invalidate the generation.
      if(native.inTransaction&&result.changes>0&&typeof before==="bigint"&&typeof after==="bigint"&&after-before>=BigInt(result.changes))reservedGeneration=generation;
      return { changes: BigInt(result.changes) };
    };
      const observe=()=>{
        if(!native.open||!native.inTransaction||closingReads||reservedGeneration!==generation)return deny();sameFile();
        if(config.protectedAdmission)assertProtectedWriterAdmission(config.protectedAdmission,options,undefined,true);
        const row=get("SELECT total_changes() AS n,(SELECT schema_version FROM pragma_schema_version) AS s"),temp=asRow(native.prepare("PRAGMA temp.schema_version").safeIntegers(true).get([]));
        if(!row||typeof row.n!=="bigint"||typeof row.s!=="bigint"||typeof temp.schema_version!=="bigint")return deny();
        if(all("SELECT name FROM pragma_database_list").some(r=>r.name!=="main"&&r.name!=="temp")||get("SELECT name FROM temp.sqlite_schema LIMIT 1"))return deny();
        const sidecars=["-wal","-shm"].map(suffix=>{const st=lstatSync(location.filename+suffix,{bigint:true});if(!st.isFile()||st.isSymbolicLink()||st.nlink!==BigInt(1))return deny();return [st.dev.toString(),st.ino.toString()];}).flat().join(":");
        return {changes:row.n,schema:row.s,tempSchema:temp.schema_version,identity:sidecars,generation};
      };
      const reviewInsert=(table:string)=>{
        // Compare ALL actual target triggers/table SQL with pinned reviewed
        // programs. The reviewed INSERT triggers only read/RAISE, never write.
        const expected=cashObjects(),actual=all("SELECT name,type,tbl_name,sql FROM main.sqlite_schema WHERE tbl_name=? AND type IN ('table','trigger')",[table]);
        const definitions=[...expected.entries()].filter(([,o])=>o.table===table&&(o.type==="table"||o.type==="trigger"));
        return definitions.length===actual.length&&actual.every(r=>{const e=expected.get(String(r.name));return e&&e.table===table&&e.type===r.type&&typeof r.sql==="string"&&(r.type==="trigger"?storedTriggerSql(r.sql)===storedTriggerSql(e.sql):schemaTokens(r.sql)===schemaTokens(e.sql));});
      };
    const run=(sql:string,values:readonly SqlValue[]=[])=>{if(!journal)return rawRun(sql,values);
          const table=reviewedMetadataTarget(sql),absent=table&&values.length>0&&!get("SELECT id FROM main."+table+" WHERE id=?",[values[0]]);
          return journal.mutate(sql,()=>rawRun(sql,values),(target,result)=>{
            // total_changes==1 PLUS an absent-before, exact complete new row
            // proves the sole native effect belongs to this reviewed table.
            // Same-count redirected or fabricated writes cannot establish reuse.
            if(!absent||result.changes!==BigInt(1))return false;
            const columns=all("SELECT name FROM pragma_table_info(?)",[target]),row=get("SELECT * FROM main."+target+" WHERE id=?",[values[0]]);
            return !!row&&columns.length===values.length&&columns.every((column,i)=>row[String(column.name)]===values[i]);
          });
    };
    const reserve=(role:string)=>{if(reservedGeneration!==generation){if(run("UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id=?",[role]).changes!==BigInt(1))return deny();}};
    const scope = (guard: () => void,readOnly=false): AuthorizedTransaction => {
      const transaction = Object.freeze({
        async get(sql: string, values: readonly SqlValue[] = []) { guard(); return get(sql, values); },
        async all(sql: string, values: readonly SqlValue[] = []) { guard(); return all(sql, values); },
        async run(sql:string,values:readonly SqlValue[]=[]){guard();if(readOnly)return deny();return run(sql,values);},
      });
      inputScopes.set(transaction,{
        capture(kind){guard();if((options.mode!=="test"&&!config.protectedAdmission)||reservedGeneration!==generation)return;const version=get("SELECT user_version FROM pragma_user_version")?.user_version;if(version!==BigInt(40)&&version!==BigInt(41))return;journal??=createNativeInputJournal(observe,reviewInsert);return journal.capture(kind);},
        unchanged(point,kind,noWrites){guard();return !!journal&&journal.unchanged(point,kind,noWrites);},
        resume(kind,owner){guard();const saved=continuations.get(owner);return saved?.kind===kind&&!!journal&&journal.unchanged(saved.point,kind); },
        retain(point,kind,owner){guard();if(journal?.unchanged(point,kind,true))continuations.set(owner,{kind,point});}
      });
      fileScopes.set(transaction, () => {
        guard(); if ((options.mode !== "test" && !config.protectedAdmission) || !native.open || !native.inTransaction || closingReads) return deny();
        sameFile(); if(config.protectedAdmission)assertProtectedWriterAdmission(config.protectedAdmission,options,undefined,true);
        return createHash("sha256").update(JSON.stringify(["pos-test-inventory-file-v1",
          location.filename.toLowerCase(), identity.dev.toString(), identity.ino.toString()])).digest("hex");
      });
      restoredScopes.set(transaction,async()=>{
        guard();if((options.mode!=="test"&&!config.protectedAdmission)||!native.open||!native.inTransaction||closingReads)return deny();sameFile();
        if(config.protectedHistory)protectedRestoredHistory(config.protectedHistory,options);await verifyHistoricalPrefixes(transaction,historical);guard();sameFile();
        return historical;
      });
      return transaction;
    };
    const withBootstrapReadScope = async <T>(lease: BootstrapLease, work: (reader: BootstrapReadScope) => Promise<T>, signal?: AbortSignal): Promise<T> => {
      if (typeof work !== "function" || (signal !== undefined && !(signal instanceof AbortSignal)) ||
          !hasActiveBootstrapLease(lease, options) || !native.open || !native.inTransaction || closingReads ||
          (boundLease && boundLease !== lease) || (leaseOwners.has(lease) && leaseOwners.get(lease) !== ownerIdentity)) return deny();
      boundLease = lease; leaseOwners.set(lease, ownerIdentity);
      const admittedGeneration = generation;
      let live = true;
      const guard = () => {
        if (!live || closingReads || !native.open || !native.inTransaction || generation !== admittedGeneration ||
            signal?.aborted || !hasActiveBootstrapLease(lease, options) || leaseOwners.get(lease) !== ownerIdentity) return deny();
        sameFile();
      };
      guard();
      const reader = Object.freeze({
        async get(text: string, values: readonly SqlValue[] = []) { guard(); return get(text, values); },
        async all(text: string, values: readonly SqlValue[] = []) { guard(); return all(text, values); },
      }) as BootstrapReadScope;
      bootstrapScopes.set(reader, { lease, filename: location.filename.toLowerCase(), guard });
      try { const result = await work(reader); guard(); return result; }
      finally { live = false; bootstrapScopes.delete(reader); }
    };
    // Private owner fact, not business/admission authority. Bind handoff to the
    // actual handle's original identity; never infer it from a replacement path.
    const fileIdentity = () => {
      if (!native.open || closingReads) return deny();
      sameFile();
      return Object.freeze({ filename: location.filename.toLowerCase(), device: String(identity.dev), inode: String(identity.ino) });
    };
    return { db, get, all, run, reserve, scope, withBootstrapReadScope, fileIdentity, inTransaction: () => native.inTransaction,
      async close() { closingReads = true; invalidate(); if (!native.open) { releaseLeaseOwner(); return; } try { await db!.destroy(); } finally { if (native.open) native.close(); if (!native.open) releaseLeaseOwner(); } },
      quarantine() { closingReads = true; invalidate(); try { if (native.open) native.close(); if (!native.open) releaseLeaseOwner(); } catch { /* No further access is allowed. */ } }
    };
  } catch { if (native.open) native.close(); return deny(); }
}
