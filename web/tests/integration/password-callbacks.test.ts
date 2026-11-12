import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { passwordCallbacks, passwordPolicy } from "../../src/server/auth/password";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import { openDatabase, type SqliteConnection } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import type { AuthorizationGateway } from "../../src/server/auth/types";

const probe = vi.hoisted(() => ({
  costs: [] as { N?: number; r?: number; p?: number; maxmem?: number; length: number; passwordBytes: number; saltBytes: number }[],
  comparisons: [] as { left: number; right: number; binary: boolean }[],
  failure: "" as "" | "callback" | "throw",
  detail: "",
}));
const observed = vi.hoisted(() => ({ instances: [] as ReturnType<typeof import("better-auth")["betterAuth"]>[] }));
// Observes calls; the real native scrypt/timingSafeEqual execute except in the
// explicitly named fault-injection test. No credential bytes are recorded.
vi.mock("node:crypto", async importOriginal => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual,
    scrypt(password: Buffer, salt: Buffer, length: number, options: import("node:crypto").ScryptOptions,
      callback: (error: Error | null, key: Buffer) => void) {
      probe.costs.push({ ...options, length, passwordBytes: password.length, saltBytes: salt.length });
      if (probe.failure === "throw") throw new Error(probe.detail);
      if (probe.failure === "callback") {
        queueMicrotask(() => callback(new Error(probe.detail), Buffer.alloc(0))); return;
      }
      return actual.scrypt(password, salt, length, options, callback);
    },
    timingSafeEqual(left: Buffer, right: Buffer) {
      probe.comparisons.push({ left: left.length, right: right.length, binary: Buffer.isBuffer(left) && Buffer.isBuffer(right) });
      return actual.timingSafeEqual(left, right);
    }
  };
});
// Capture unchanged private instances for contract tests. No plugins, mocks of
// framework behavior, testUtils, login issuance or new production exports.
vi.mock("better-auth", async importOriginal => {
  const actual = await importOriginal<typeof import("better-auth")>();
  return { ...actual, betterAuth: (options: import("@better-auth/core").BetterAuthOptions) => {
    const instance = actual.betterAuth(options); observed.instances.push(instance); return instance;
  } };
});

const secrets = new Set<string>();
const remember = (value: string) => { secrets.add(value); return value; };
const fake = () => remember(randomBytes(24).toString("base64url"));
const containsSecret = (value: string) => [...secrets].some(secret => value.includes(secret));
const zero = BigInt(0);
const one = BigInt(1);
const marker = Buffer.from("POSPW001", "ascii").toString("hex");
const root = path.resolve("test-results/sqlite-b1b-part1");
mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "password3b-"));
const dbs: SqliteConnection[] = [], gateways: AuthorizationGateway[] = [];
const audits: (() => void)[] = [];

beforeEach(() => {
  probe.costs.length = 0; probe.comparisons.length = 0; probe.failure = ""; probe.detail = "";
});
afterEach(async () => {
  probe.failure = ""; probe.detail = "";
  for (const gateway of gateways.splice(0)) await gateway.close();
  for (const db of dbs.splice(0)) db.close();
  for (const audit of audits.splice(0)) audit();
});
async function hash(value: string) { return passwordCallbacks.hash(value); }
async function verify(encoded: string, password: string) { return passwordCallbacks.verify({ hash: encoded, password }); }
async function genericFailure(work: Promise<unknown>) {
  let caught: unknown;
  try { await work; } catch (error) { caught = error; }
  expect(caught instanceof Error).toBe(true);
  const error = caught as Error;
  expect(error.message === "Password operation failed.").toBe(true);
  expect(Object.hasOwn(error, "cause")).toBe(false);
  expect(containsSecret(JSON.stringify({ message: error.message, stack: error.stack }))).toBe(false);
}
async function fixture() {
  const directory = mkdtempSync(path.join(run, "db-"));
  const migrations = mkdtempSync(path.join(run, "migrations-"));
  const source = path.resolve("src/server/db/migrations");
  for (const name of readdirSync(source).filter(name => name.endsWith(".sql"))) copyFileSync(path.join(source, name), path.join(migrations, name));
  const options = { directory, filename: "test.sqlite3", mode: "test" as const, create: true, busyTimeoutMs: 75 };
  const db = openDatabase(options); dbs.push(db); applyMigrations(db, migrations);
  const start = observed.instances.length;
  const gateway = await openAuthorizationGateway({
    database: { ...options, create: false }, migrationsDirectory: migrations,
    origins: { ADMIN: "https://admin.password-proof.invalid", SALESPERSON: "https://staff.password-proof.invalid" },
    signingSecrets: { ADMIN: remember(randomBytes(48).toString("base64url")), SALESPERSON: remember(randomBytes(48).toString("base64url")) },
    sessionLifetimeSeconds: 120,
  }); gateways.push(gateway);
  audits.push(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = path.join(directory, options.filename) + suffix;
      if (suffix && !existsSync(file)) continue;
      expect(containsSecret(readFileSync(file).toString("latin1"))).toBe(false);
    }
  });
  const instances = observed.instances.slice(start, start + 2);
  return { db, gateway, instances, contexts: await Promise.all(instances.map(instance => instance.$context)) };
}
async function testCredential(f: Awaited<ReturnType<typeof fixture>>) {
  const context = f.contexts[0], password = fake(), encoded = await context.password.hash(password), now = new Date();
  await context.adapter.create({ model: "user", forceAllowId: true, data: {
    id: "ADMIN", role: "ADMIN", name: "TEST", email: "admin@shop-pos.invalid",
    emailVerified: false, createdAt: now, updatedAt: now,
  } });
  await context.adapter.create({ model: "account", forceAllowId: true, data: {
    id: "ADMIN", userId: "ADMIN", accountId: "ADMIN", providerId: "credential",
    password: encoded, createdAt: now, updatedAt: now,
  } });
  return { context, password, encoded };
}

describe("Part 3B exact-input asynchronous scrypt callbacks", () => {
  it("hashes and verifies with the real native implementation and fixed safe costs", async () => {
    const password = fake(), encoded = await hash(password);
    expect(encoded.length).toBe(161);
    expect(/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(encoded)).toBe(true);
    expect(encoded.slice(33, 49) === marker).toBe(true);
    expect(encoded.includes(password)).toBe(false);
    expect(await verify(encoded, password)).toBe(true);
    expect(await verify(encoded, fake())).toBe(false);
    expect(probe.costs.length).toBe(3);
    expect(probe.costs.every(cost => cost.N === 131072 && cost.r === 8 && cost.p === 1 &&
      cost.maxmem === 192 * 1024 * 1024 && cost.length === 56 && cost.saltBytes === 16)).toBe(true);
  });
  it("matches an independent native scrypt derivation of exact UTF-8 bytes and raw salt", async () => {
    const native = await vi.importActual<typeof import("node:crypto")>("node:crypto");
    const password = remember(fake() + "\u00e9\u0000 "), encoded = await hash(password);
    const bytes = Buffer.from(password, "utf8"), salt = Buffer.from(encoded.slice(0, 32), "hex");
    const expected = await new Promise<Buffer>((resolve, reject) => native.scrypt(bytes, salt, 56,
      { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
    const stored = Buffer.from(encoded.slice(49), "hex");
    try { expect(native.timingSafeEqual(expected, stored)).toBe(true); }
    finally { bytes.fill(0); salt.fill(0); expected.fill(0); stored.fill(0); }
  });
  it("uses independent full-length random salts for the same password", async () => {
    const password = remember(fake().slice(0, 8)), first = await hash(password), second = await hash(password);
    expect(first.slice(0, 32) !== second.slice(0, 32)).toBe(true);
    expect(await verify(first, password)).toBe(true);
    expect(await verify(second, password)).toBe(true);
  });
  it("compares only fixed-size binary derived keys with timingSafeEqual", async () => {
    const password = fake(), encoded = await hash(password);
    expect(await verify(encoded, password)).toBe(true);
    expect(await verify(encoded, fake())).toBe(false);
    expect(probe.comparisons.length).toBe(2);
    expect(probe.comparisons.every(c => c.binary && c.left === 56 && c.right === 56)).toBe(true);
  });
  it("keeps canonical Unicode equivalents byte-distinct in both directions", async () => {
    const suffix = remember(fake().slice(0, 7));
    const composed = remember("\u00e9" + suffix), decomposed = remember("e\u0301" + suffix);
    const first = await hash(composed), second = await hash(decomposed);
    expect(await verify(first, composed)).toBe(true);
    expect(await verify(first, decomposed)).toBe(false);
    expect(await verify(second, composed)).toBe(false);
    expect(await verify(second, decomposed)).toBe(true);
  });
  it("keeps compatibility Unicode equivalents distinct without NFKC", async () => {
    const suffix = remember(fake().slice(0, 7)), fullwidth = remember("\uff21" + suffix), ascii = remember("A" + suffix);
    const encoded = await hash(fullwidth);
    expect(await verify(encoded, fullwidth)).toBe(true);
    expect(await verify(encoded, ascii)).toBe(false);
  });
  it("preserves leading/trailing whitespace, case and embedded NUL without truncation", async () => {
    const middle = fake(), password = remember(" A" + middle + "\u0000 ");
    const encoded = await hash(password);
    expect(await verify(encoded, password)).toBe(true);
    for (const altered of [password.trim(), " a" + middle + "\u0000 ", " A" + middle, password.slice(0, -1)]) {
      remember(altered); expect(await verify(encoded, altered)).toBe(false);
    }
  });
  it("accepts minimum and maximum scalar counts, including the 512-byte Unicode boundary", async () => {
    for (const value of [fake().slice(0, 8), fake().repeat(4).slice(0, 128), Array.from(randomBytes(128), byte => String.fromCodePoint(0x1f300 + byte)).join("")]) {
      const password = remember(value), encoded = await hash(password);
      expect(await verify(encoded, password)).toBe(true);
    }
    expect(passwordPolicy).toEqual({ minCharacters: 8, maxCharacters: 128, maxUtf8Bytes: 512 });
    expect(probe.costs.some(cost => cost.passwordBytes === 512)).toBe(true);
  });
  it("rejects short, oversized, non-string and malformed Unicode inputs before native work", async () => {
    const values: unknown[] = [undefined, null, 1, {}, [], new String(fake()), "", fake().slice(0, 7), "\ud83d\ude42".repeat(7),
      ...[4, 5].map(length => Array.from(randomBytes(length), byte => String(byte % 10)).join("")),
      fake().repeat(5).slice(0, 129), "\ud83d\ude42".repeat(129), fake() + "\ud800", "\udc00" + fake(),
      fake().repeat(40000)];
    const validShape = randomBytes(16).toString("hex") + ":" + marker + randomBytes(56).toString("hex");
    for (const value of values) {
      await genericFailure(passwordCallbacks.hash(value as string));
      expect(await passwordCallbacks.verify({ hash: validShape, password: value as string })).toBe(false);
    }
    expect(probe.costs.length).toBe(0);
  });
  it("rejects malformed/unknown/default hashes and parameter injection before native work", async () => {
    const password = fake(), salt = randomBytes(16).toString("hex"), key = randomBytes(56).toString("hex");
    const encoded = salt + ":" + marker + key;
    const unknownVersion = salt + ":" + Buffer.from("POSPW002").toString("hex") + key;
    const values: unknown[] = [undefined, null, 1, {}, [], new String(encoded), "", encoded + "\n", encoded.toUpperCase(),
      encoded.slice(1), encoded + "0", encoded.replace(":", "::"), unknownVersion,
      salt + ":" + "0".repeat(128), salt + ":" + marker + key.slice(0, -1) + "z",
      "$scrypt$N=1073741824,r=64,p=99$" + encoded, encoded + "$N=1", encoded.repeat(20000)];
    for (const value of values) expect(await passwordCallbacks.verify({ hash: value as string, password })).toBe(false);
    expect(probe.costs.length).toBe(0);
    expect(probe.comparisons.length).toBe(0);
  });
  it("rejects tampering at either end of a valid derived key using binary comparison", async () => {
    const password = fake(), encoded = await hash(password);
    for (const offset of [49, 160]) {
      const replacement = encoded[offset] === "0" ? "1" : "0";
      const altered = encoded.slice(0, offset) + replacement + encoded.slice(offset + 1);
      expect(await verify(altered, password)).toBe(false);
    }
    expect(probe.comparisons.length).toBe(2);
  });
  it("runs asynchronously and bounds concurrent work without queuing rejected attempts", async () => {
    const password = fake(), encoded = await hash(password);
    let finished = false;
    const first = hash(password).finally(() => { finished = true; }), second = hash(password);
    const before = probe.costs.length;
    await genericFailure(hash(password));
    expect(await verify(encoded, password)).toBe(false);
    expect(probe.costs.length).toBe(before);
    expect(finished).toBe(false);
    await Promise.all([first, second]);
    expect(await verify(encoded, password)).toBe(true);
  });
  it("fails closed with sanitized native errors and releases slots after failures", async () => {
    const password = fake(), encoded = await hash(password);
    probe.detail = remember(password + encoded);
    for (const mode of ["callback", "throw"] as const) {
      probe.failure = mode;
      await genericFailure(hash(password));
      expect(await verify(encoded, password)).toBe(false);
    }
    probe.failure = ""; probe.detail = "";
    expect(await verify(encoded, password)).toBe(true);
  });
  it("handles invalid verify envelopes and throwing accessors without exception details", async () => {
    for (const value of [undefined, null, 4, [], {}, { get hash() { throw new Error(fake()); } }]) {
      expect(await passwordCallbacks.verify(value as unknown as Parameters<typeof passwordCallbacks.verify>[0])).toBe(false);
    }
    expect(probe.costs.length).toBe(0);
  });
});

describe("real pinned private Better Auth callback integration", () => {
  it("installs both exact callbacks in both private contexts without fallback or added exports", async () => {
    const f = await fixture();
    for (const context of f.contexts) {
      expect(context.password.hash === passwordCallbacks.hash).toBe(true);
      expect(context.password.verify === passwordCallbacks.verify).toBe(true);
      expect(context.options.emailAndPassword?.enabled).toBe(false);
      expect(context.options.emailAndPassword?.disableSignUp).toBe(true);
      expect(context.password.config.minPasswordLength).toBe(8);
      expect(context.password.config.maxPasswordLength).toBe(256);
      for (const length of [8, 32]) {
        const password = remember(fake().slice(0, length)), encoded = await context.password.hash(password);
        expect(await context.password.verify({ hash: encoded, password })).toBe(true);
        expect(await context.password.verify({ hash: encoded, password: remember(fake().slice(0, 8)) })).toBe(false);
        expect(await context.password.verify({ hash: encoded, password: remember(fake().slice(0, 7)) })).toBe(false);
        expect(await context.password.verify({ hash: "0".repeat(32) + ":" + "0".repeat(128), password })).toBe(false);
      }
      await genericFailure(context.password.hash(remember(fake().slice(0, 7))));
    }
    expect(Object.keys(f.gateway).sort()).toEqual(["authorizeAdmin", "authorizeSalesperson", "close", "withAdminTransaction", "withSalespersonTransaction","verifyAdminPassword","verifySalespersonPassword", "issueAdminSession", "issueSalespersonSession", "logoutAdmin", "logoutSalesperson", "rotateAdminPassword", "rotateSalespersonPassword"].sort());
    expect(f.db.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(zero);
  });
  it("persists a TEST hash only in the existing credential table through the actual official adapter", async () => {
    const f = await fixture(), { context, password, encoded } = await testCredential(f);
    const account = await context.internalAdapter.findCredentialAccount("ADMIN");
    expect(typeof account?.password === "string" && account.password.length === 161).toBe(true);
    expect(await context.password.verify({ hash: account!.password!, password })).toBe(true);
    expect(f.db.get("SELECT strict FROM pragma_table_list WHERE name='auth_credentials'")?.strict).toBe(one);
    expect(f.db.get("SELECT count(*) AS n FROM auth_credentials")?.n).toBe(one);
    expect(f.db.get("SELECT count(*) AS n FROM auth_principals")?.n).toBe(zero);
    expect(f.db.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n).toBe(zero);
    expect(f.db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(8));
    // No source/migration changes to accommodate the versioned format.
    expect(encoded.slice(33, 49) === marker).toBe(true);
  });
  it("executes the real framework checkPassword path against the stored credential", async () => {
    const f = await fixture(), { context, password } = await testCredential(f);
    type CheckContext = Parameters<typeof context.password.checkPassword>[1];
    const make = (value: string) => ({ context, body: { password: value } }) as CheckContext;
    const before = probe.comparisons.length;
    expect(await context.password.checkPassword("ADMIN", make(password))).toBe(true);
    let rejected = false, safe = false;
    try { await context.password.checkPassword("ADMIN", make(fake())); }
    catch (error) {
      rejected = true;
      const message = error instanceof Error ? error.message : "";
      safe = !containsSecret(JSON.stringify({ message }));
    }
    expect(rejected).toBe(true); expect(safe).toBe(true);
    expect(probe.comparisons.length - before).toBe(2);
    expect(f.db.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n).toBe(zero);
  });
  it("keeps actual framework login and signup disabled and returns no credential JSON or cookie", async () => {
    const f = await fixture(), { password, encoded } = await testCredential(f);
    const logs = ["log", "warn", "error", "info", "debug"].map(method =>
      vi.spyOn(console, method as "log").mockImplementation(() => { throw new Error("Unexpected TEST console output."); }));
    const before = probe.costs.length;
    try {
      for (const instance of f.instances) {
        const responses = [
          await instance.api.signInEmail({ body: { email: "admin@shop-pos.invalid", password }, asResponse: true }),
          await instance.api.signUpEmail({ body: { name: "TEST", email: "admin@shop-pos.invalid", password }, asResponse: true }),
        ];
        for (const response of responses) {
          expect(response.status).toBe(400);
          expect(response.headers.has("set-cookie")).toBe(false);
          const output = await response.text();
          expect(containsSecret(output) || output.includes(encoded)).toBe(false);
          const json = JSON.parse(output);
          expect(Object.hasOwn(json, "token") || Object.hasOwn(json, "password")).toBe(false);
        }
      }
      expect(probe.costs.length).toBe(before);
      expect(logs.every(log => log.mock.calls.length === 0)).toBe(true);
    } finally { for (const log of logs) log.mockRestore(); }
    expect(f.db.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(one);
    expect(f.db.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n).toBe(zero);
  });
  it("keeps production auth imports server-only with no testUtils, logs or raw framework export", () => {
    for (const name of readdirSync(path.resolve("src/server/auth")).filter(name => name.endsWith(".ts"))) {
      const source = readFileSync(path.resolve("src/server/auth", name), "utf8");
      expect(source.startsWith('import "server-only";')).toBe(true);
      expect(/testUtils|console\.(?:log|warn|error|info|debug)\s*\(/.test(source)).toBe(false);
    }
    const source = readFileSync(path.resolve("src/server/auth/password.ts"), "utf8");
    expect(/scryptSync|\.normalize\(|\.trim\(|toLowerCase\(|toUpperCase\(/.test(source)).toBe(false);
  });
});
