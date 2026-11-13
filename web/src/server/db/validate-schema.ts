import {CASH_AUTO,CASH_INDEXES,CASH_TABLES} from "./cash-manifest";
import {cashObjects} from "./cash-program";
import {INVOICE_AUTO,INVOICE_INDEXES,INVOICE_TABLES,invoicesObjects} from "./invoices-program";
import "server-only";
import {EXPENSE_AUTO,EXPENSE_INDEXES,EXPENSE_TABLES,expensesObjects} from "./expenses-program";
import { RETURN_AUTO,RETURN_INDEXES,RETURN_TABLES,returnsObjects } from "./returns-program";
import {salesObjects,SALES_AUTO,SALES_INDEXES,SALES_TABLES} from "./sales-program";
import type { AuthorizedTransaction } from "../auth/types";
import { AUTO_INDEXES, EXPLICIT_INDEXES, HISTORY_DEFINITION, reviewedMigrations, STATISTICS_DEFINITIONS } from "./reviewed-schema";
import { immutableInventoryTables, storedTriggerSql } from "./inventory-trigger-policy";
import { schemaTokens } from "./schema-sql";

export type ReviewedSchemaVersion = 8 | 18 | 35 | 36 | 37 | 38 | 39 | 40;
export type SchemaFailure = "UNSUPPORTED_VERSION" | "MANIFEST_UNAVAILABLE" | "READ_FAILED" |
  "VERSION_MISMATCH" | "HISTORY_MISMATCH" | "MISSING_OBJECT" | "UNEXPECTED_OBJECT" |
  "OBJECT_CHANGED" | "METADATA_MISMATCH" | "AMBIGUOUS_SNAPSHOT" | "LIMIT_EXCEEDED";
export type SchemaValidation = Readonly<
  { ok: true; version: ReviewedSchemaVersion; scope: "SCHEMA_AND_HISTORY_ONLY" } |
  { ok: false; code: SchemaFailure }
>;
// Caller supplies a LIVE, already admitted, consistent transaction from the sole
// owner. This is NOT a transaction opener, public API or authorization capability.
type ReadScope = Pick<AuthorizedTransaction, "get" | "all">;
class Mismatch { constructor(readonly code: SchemaFailure) {} }
const reject = (code: SchemaFailure): never => { throw new Mismatch(code); };
interface ObjectDefinition { type: "table" | "index" | "trigger"; table: string; sql: string | null }
interface IndexDefinition { table: string; origin: string; unique: bigint; partial: bigint; columns: readonly string[] }

export async function validateReviewedSchema(reader: ReadScope, version: ReviewedSchemaVersion): Promise<SchemaValidation> {
  if (version !== 8 && version !== 18 && version !== 35 && version !== 36 && version !== 37 && version !== 38 && version !== 39 && version !== 40) return Object.freeze({ ok: false, code: "UNSUPPORTED_VERSION" });
  let reviewed;
  try { reviewed = reviewedMigrations().slice(0, version); }
  catch { return Object.freeze({ ok: false, code: "MANIFEST_UNAVAILABLE" }); }
  try {
    const generation = (await reader.get("SELECT schema_version FROM pragma_schema_version"))?.schema_version;
    if (typeof generation !== "bigint" || generation < BigInt(0)) reject("AMBIGUOUS_SNAPSHOT");
    const databases = await reader.all("SELECT name FROM pragma_database_list LIMIT 4");
    if (databases.length > 2 || databases.filter(r => r.name === "main").length !== 1 ||
        databases.some(r => r.name !== "main" && r.name !== "temp")) reject("AMBIGUOUS_SNAPSHOT");
    if (databases.some(r => r.name === "temp") &&
        (await reader.all("SELECT type FROM temp.sqlite_schema LIMIT 1")).length) reject("UNEXPECTED_OBJECT");
    if ((await reader.get("SELECT user_version FROM pragma_user_version"))?.user_version !== BigInt(version)) reject("VERSION_MISMATCH");

    const expected = new Map<string, ObjectDefinition>([["schema_migrations", { type: "table", table: "schema_migrations", sql: HISTORY_DEFINITION }]]);
    const indexes = new Map<string, IndexDefinition>();
    for (const m of reviewed) {
      if(m.objectType === "program")continue;
      const table = m.objectTable;
      if (!table || expected.has(m.objectName)) reject("MANIFEST_UNAVAILABLE");
      expected.set(m.objectName, { type: m.objectType, table, sql: m.sql });
      if (m.objectType === "index") indexes.set(m.objectName, { ...EXPLICIT_INDEXES[m.objectName], origin: "c" });
    }
    if(version>=36){for(const[n,v]of salesObjects())expected.set(n,v);for(const[n,v]of Object.entries(SALES_INDEXES))indexes.set(n,{...v,origin:"c"});}
    if(version>=37){for(const[n,v]of returnsObjects())expected.set(n,v);for(const[n,v]of Object.entries(RETURN_INDEXES))indexes.set(n,{...v,origin:"c"});}
    if(version>=38){for(const[n,v]of expensesObjects())expected.set(n,v);for(const[n,v]of Object.entries(EXPENSE_INDEXES))indexes.set(n,{...v,origin:"c"});}
    if(version>=39){for(const[n,v]of invoicesObjects())expected.set(n,v);for(const[n,v]of Object.entries(INVOICE_INDEXES))indexes.set(n,{...v,origin:"c"});}
    if(version===40){for(const[n,v]of cashObjects())expected.set(n,v);for(const[n,v]of Object.entries(CASH_INDEXES))indexes.set(n,{...v,origin:"c"});}
    for (const [table, definitions] of Object.entries({...AUTO_INDEXES,...(version>=36?SALES_AUTO:{}),...(version>=37?RETURN_AUTO:{}),...(version>=38?EXPENSE_AUTO:{}),...(version>=39?INVOICE_AUTO:{}),...(version===40?CASH_AUTO:{})})) {
      if (!expected.has(table)) continue;
      definitions.forEach(([origin, ...columns], i) => {
        const name = "sqlite_autoindex_" + table + "_" + (i + 1);
        expected.set(name, { type: "index", table, sql: null });
        indexes.set(name, { table, origin, columns, unique: BigInt(1), partial: BigInt(0) });
      });
    }
    const objects = await reader.all(
      "SELECT type,substr(name,1,129) AS name,substr(tbl_name,1,129) AS tbl_name," +
      "length(CAST(sql AS BLOB)) AS sql_bytes,substr(sql,1,65537) AS sql,rootpage FROM main.sqlite_schema LIMIT "+(version===40?769:version>=39?513:version>=37?385:129));
    if (objects.length > (version===40?768:version>=39?512:version>=37?384:128)) reject("LIMIT_EXCEEDED");
    const pageCount = (await reader.get("SELECT page_count FROM pragma_page_count"))?.page_count;
    if (typeof pageCount !== "bigint" || pageCount < BigInt(1)) reject("METADATA_MISMATCH");
    const seen = new Set<string>(), rootPages = new Set<bigint>();
    for (const object of objects) {
      if (typeof object.name !== "string" || object.name.length > 128 || typeof object.tbl_name !== "string" ||
          object.tbl_name.length > 128 || (typeof object.sql_bytes === "bigint" && object.sql_bytes > BigInt(65536))) reject("LIMIT_EXCEEDED");
      const name = object.name as string;
      if (seen.has(name)) reject("AMBIGUOUS_SNAPSHOT");
      seen.add(name);
      let definition = expected.get(name);
      if (!definition && Object.hasOwn(STATISTICS_DEFINITIONS, name)) {
        definition = { type: "table", table: name, sql: STATISTICS_DEFINITIONS[name as keyof typeof STATISTICS_DEFINITIONS] };
      }
      if (!definition) reject("UNEXPECTED_OBJECT");
      const approved = definition!;
      if (object.type !== approved.type || object.tbl_name !== approved.table ||
          typeof object.rootpage !== "bigint" || (approved.type === "trigger" ? object.rootpage !== BigInt(0) : object.rootpage <= BigInt(1))) reject("OBJECT_CHANGED");
      const root = object.rootpage as bigint;
      if (approved.type !== "trigger" && (root > (pageCount as bigint) || rootPages.has(root))) reject("METADATA_MISMATCH");
      if (approved.type !== "trigger") rootPages.add(root);
      if (approved.sql === null) { if (object.sql !== null) reject("OBJECT_CHANGED"); }
      else {
        if (typeof object.sql !== "string") reject("OBJECT_CHANGED");
        let equal = false;
        try { equal = approved.type === "trigger" ? storedTriggerSql(object.sql as string) === storedTriggerSql(approved.sql) : schemaTokens(object.sql as string) === schemaTokens(approved.sql); } catch { /* Invalid/ambiguous text denies. */ }
        if (!equal) reject("OBJECT_CHANGED");
      }
    }
    for (const name of expected.keys()) if (!seen.has(name)) reject("MISSING_OBJECT");
    if (seen.has("sqlite_stat4") && !seen.has("sqlite_stat1")) reject("METADATA_MISMATCH");

    const tables = [...expected].filter(([, d]) => d.type === "table").map(([name]) => name);
    for (const name of Object.keys(STATISTICS_DEFINITIONS)) if (seen.has(name)) tables.push(name);
    const tableMetadata = await reader.all("SELECT name,type,wr,strict FROM pragma_table_list WHERE schema='main' LIMIT "+(version===40?81:49));
    if (tableMetadata.length !== tables.length + 1 || tableMetadata.length > (version===40?80:48)) reject("METADATA_MISMATCH");
    for (const table of [...tables, "sqlite_schema"]) {
      const rows = tableMetadata.filter(r => r.name === table);
      const internal = table === "sqlite_schema" || Object.hasOwn(STATISTICS_DEFINITIONS, table);
      if (rows.length !== 1 || rows[0].type !== "table" || rows[0].wr !== BigInt(0) || rows[0].strict !== (internal ? BigInt(0) : BigInt(1))) reject("METADATA_MISMATCH");
    }
    for (const table of tables) {
      const list = await reader.all('SELECT name,"unique",origin,partial FROM pragma_index_list(?,?) LIMIT 17', [table, "main"]);
      const approved = [...indexes].filter(([, i]) => i.table === table);
      if (list.length !== approved.length || list.length > 16) reject("METADATA_MISMATCH");
      for (const [name, index] of approved) {
        const rows = list.filter(r => r.name === name);
        if (rows.length !== 1 || rows[0].unique !== index.unique || rows[0].origin !== index.origin || rows[0].partial !== index.partial) reject("METADATA_MISMATCH");
        const columns = await reader.all('SELECT seqno,cid,name,"desc",coll,key FROM pragma_index_xinfo(?,?) ORDER BY seqno LIMIT 49', [name, "main"]);
        if (columns.length !== index.columns.length + 1 || columns.length > 32) reject("METADATA_MISMATCH");
        for (const [i, col] of columns.entries()) {
          const rowid = i === index.columns.length;
          if (col.seqno !== BigInt(i) || col.key !== (rowid ? BigInt(0) : BigInt(1)) || col.desc !== BigInt(0) || col.coll !== "BINARY" ||
              (rowid ? col.cid !== -BigInt(1) || col.name !== null : typeof col.cid !== "bigint" || col.cid < BigInt(0) ||
                typeof col.name !== "string" || col.name.toLowerCase() !== index.columns[i].toLowerCase())) reject("METADATA_MISMATCH");
        }
      }
    }
    const history = await reader.all("SELECT version,name,checksum,applied_at FROM main.schema_migrations ORDER BY version LIMIT 40");
    if (history.length !== reviewed.length || history.some((r, i) => r.version !== reviewed[i].version ||
      r.name !== reviewed[i].name || r.checksum !== reviewed[i].checksum ||
      typeof r.applied_at !== "bigint" || r.applied_at <= BigInt(0) || r.applied_at > BigInt("9223372036854775807"))) reject("HISTORY_MISMATCH");
    if (version === 35 || version >= 36) for (const table of [...immutableInventoryTables,...(version>=36?SALES_TABLES:[]),...(version>=37?RETURN_TABLES:[]),...(version>=38?EXPENSE_TABLES:[]),...(version>=39?INVOICE_TABLES:[]),...(version===40?CASH_TABLES:[])]) {
      if (await reader.get("SELECT rowid FROM " + table + " WHERE rowid<=0 LIMIT 1")) reject("METADATA_MISMATCH");
    }
    if ((await reader.get("SELECT schema_version FROM pragma_schema_version"))?.schema_version !== generation ||
        (await reader.get("SELECT user_version FROM pragma_user_version"))?.user_version !== BigInt(version)) reject("AMBIGUOUS_SNAPSHOT");
    return Object.freeze({ ok: true, version, scope: "SCHEMA_AND_HISTORY_ONLY" });
  } catch (error) {
    return Object.freeze({ ok: false, code: error instanceof Mismatch ? error.code : "READ_FAILED" });
  }
}
