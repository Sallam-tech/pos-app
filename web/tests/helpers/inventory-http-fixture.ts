import { randomBytes, createPrivateKey } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import https from "node:https";
import net from "node:net";
import type { Role } from "../../src/server/auth/types";
import { runTrustedFirstRunSetup } from "../../src/server/auth/provision";
import { openDatabase } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { startLocalRuntime, type LocalRuntimeConfiguration } from "../../src/server/hosting/runtime";
const root = path.resolve("test-results/sqlite-b1b-part1"); mkdirSync(root, { recursive: true });
export const run = mkdtempSync(path.join(root, "inventory-http5-"));
const source = path.resolve("src/server/db/migrations");
export const passwords = { ADMIN: randomBytes(18).toString("base64url"), SALESPERSON: randomBytes(18).toString("base64url") };
export const sensitive = new Set(Object.values(passwords));
export const credentialHashes = new Set<string>();
export let material: LocalRuntimeConfiguration["tls"];
let base: string;
export const stable = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
export async function initialize() {
 const cert = path.join(run, "tls"), auth8 = path.join(run, "auth8"), enrolled = path.join(run, "generic-auth8");
 [cert, auth8, enrolled].forEach(d => mkdirSync(d));
 const passphrase = randomBytes(32).toString("base64url"); sensitive.add(passphrase);
 const execute = promisify(execFile), openssl = (...args: string[]) => {
  const job = execute("C:\\Program Files\\Git\\usr\\bin\\openssl.exe", args, { cwd: cert, windowsHide: true }); job.child.stdin!.end(passphrase); return job;
 };
 await openssl("req", "-x509", "-newkey", "rsa:2048", "-passout", "stdin", "-days", "1", "-subj", "/CN=POS-INVENTORY-TEST-CA", "-addext", "basicConstraints=critical,CA:TRUE", "-keyout", "ca.key", "-out", "ca.pem");
 await openssl("req", "-newkey", "rsa:2048", "-passout", "stdin", "-subj", "/CN=localhost", "-keyout", "leaf.key", "-out", "leaf.csr");
 writeFileSync(path.join(cert, "leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n");
 await openssl("x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-passin", "stdin", "-CAcreateserial", "-days", "1", "-sha256", "-extfile", "leaf.ext", "-out", "leaf.pem");
 material = { key: Buffer.from(createPrivateKey({ key: readFileSync(path.join(cert, "leaf.key")), passphrase }).export({ type: "pkcs8", format: "pem" })), certificate: readFileSync(path.join(cert, "leaf.pem")), trustAnchor: readFileSync(path.join(cert, "ca.pem")) };
 sensitive.add(material.key.toString());
 for (const name of readdirSync(source).filter(n => /^000[1-8]_/.test(n))) copyFileSync(path.join(source, name), path.join(auth8, name));
 const config8 = { database: { directory: enrolled, filename: "test.sqlite3", mode: "test" as const, create: false }, migrationsDirectory: auth8 };
 const db8 = openDatabase({ ...config8.database, create: true }); applyMigrations(db8, auth8); db8.close();
 await runTrustedFirstRunSetup(config8, async () => passwords);
 const read8 = openDatabase(config8.database);
 const tables = ["auth_users", "auth_credentials", "auth_principals", "auth_provisioning", "auth_login_attempts", "auth_enrollment_binding"];
 const rows = tables.map(table => ({ table, rows: read8.all("SELECT * FROM " + table) })); for (const row of read8.all("SELECT password FROM auth_credentials")) credentialHashes.add(String(row.password)); read8.close();
 // NEW empty18 only. Clone generic TEST authorization records; this is neither
 // enrolled8->18 migration nor production enrollment/anchor validation.
 base = path.join(run, "fresh18"); mkdirSync(base);
 const db = openDatabase({ directory: base, filename: "test.sqlite3", mode: "test", create: true });
 applyMigrations(db, source);
 db.transaction(tx => { for (const group of rows) for (const row of group.rows) {
  const keys = Object.keys(row); tx.run("INSERT INTO " + group.table + "(" + keys.map(k => '"' + k + '"').join(",") + ") VALUES(" + keys.map(() => "?").join(",") + ")", keys.map(k => row[k]));
 } }); db.close();
}
export async function fixture() {
 const directory = mkdtempSync(path.join(run, "db-")); copyFileSync(path.join(base, "test.sqlite3"), path.join(directory, "test.sqlite3"));
 const server = net.createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
 const address = server.address(); if (!address || typeof address === "string") throw Error("TEST port");
 await new Promise<void>(resolve => server.close(() => resolve()));
 const port = address.port, signingSecrets = { ADMIN: randomBytes(48).toString("base64url"), SALESPERSON: randomBytes(48).toString("base64url") };
 Object.values(signingSecrets).forEach(s => sensitive.add(s));
 const config: LocalRuntimeConfiguration = { applicationDirectory: process.env.SHOP_POS_INVENTORY_BUILT_APP ?? process.cwd(), port, tls: material,
  authorization: { database: { directory, filename: "test.sqlite3", mode: "test", create: false, busyTimeoutMs: 75 }, migrationsDirectory: source,
   origins: { ADMIN: "https://localhost:" + port, SALESPERSON: "https://127.0.0.1:" + port }, signingSecrets, sessionLifetimeSeconds: 120 } };
 const reader = () => openDatabase(config.authorization.database);
 const inspect = <T>(work: (db: ReturnType<typeof reader>) => T) => { const db = reader(); try { return work(db); } finally { db.close(); } };
 const snapshot = () => inspect(db => stable(Object.fromEntries(["products", "stock_balances", "inventory_operations", "stock_movements", "product_events", "product_identifiers"].map(t => [t, db.all("SELECT * FROM " + t)]))));
 return { config, inspect, snapshot, start: () => startLocalRuntime(config) };
}
export interface WireResult { status: number; body: string; cookies: string[]; headers: import("node:http").IncomingHttpHeaders }
export function wire(config: LocalRuntimeConfiguration, endpoint: string, role: Role = "ADMIN", cookies: readonly string[] = [], value?: unknown, overrides: https.RequestOptions = {}) {
 const text = value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
 return new Promise<WireResult>((resolve, reject) => {
  const request = https.request({ hostname: role === "ADMIN" ? "localhost" : "127.0.0.1", family: 4, port: config.port, servername: role === "ADMIN" ? "localhost" : "", ca: material.trustAnchor, agent: false,
   method: value === undefined ? "GET" : "POST", path: endpoint, ...overrides, headers: { origin: config.authorization.origins[role], cookie: cookies.map(c => c.split(";")[0]).join("; "), ...(value === undefined ? {} : { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) }), ...overrides.headers } }, response => {
    const chunks: Buffer[] = []; response.on("data", c => chunks.push(c)); response.on("end", () => resolve({ status: response.statusCode!, body: Buffer.concat(chunks).toString(), cookies: response.headers["set-cookie"] ?? [], headers: response.headers }));
   }); request.once("error", reject); request.end(text);
 });
}
export async function login(config: LocalRuntimeConfiguration, role: Role = "ADMIN") {
 const reply = await wire(config, "/api/auth/login", role, [], { password: passwords[role] });
 if (reply.status !== 200 || !reply.cookies.length) throw Error("TEST login failed");
 for (const cookie of reply.cookies) sensitive.add(cookie.split(";")[0].split("=").slice(1).join("="));
 return reply.cookies;
}
