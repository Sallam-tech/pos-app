// TEST ONLY. No listener, password login, application routes or production migration.
// The private Better Auth instance is never the exposed authorization boundary.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { lstatSync, realpathSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { getAuthTables } from "@better-auth/core/db";
import { memoryStore } from "./storage.mjs";

export const here = dirname(fileURLToPath(import.meta.url));
export const origin = "https://memory-proof.invalid";
export const principal = "TEST-generic-principal";
export const secretSet = new Set();
export const remember = value => {
  if (typeof value === "string" && value.length >= 16) {
    secretSet.add(value); secretSet.add(encodeURIComponent(value));
  }
  return value;
};
export const containsSecret = text => [...secretSet].some(s => text.includes(s));
export const makeSecret = () => remember(randomBytes(48).toString("base64url"));
const quote = s => { assert.match(s, /^[A-Za-z][A-Za-z0-9_]*$/); return '"' + s + '"'; };
const publicJSON = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});
const fail = () => { throw new Error("TEST_AUTHORITY_REJECTED"); };
const safePath = filename => {
  const base = realpathSync(resolve(here, "test-results"));
  const parent = realpathSync(dirname(filename));
  const rel = relative(base, parent);
  if (!rel || rel.startsWith("..") || resolve(filename) !== resolve(parent, "test.sqlite") ||
      lstatSync(parent).isSymbolicLink()) throw new Error("TEST_PATH_REJECTED");
  if (existsSync(filename) && (lstatSync(filename).isSymbolicLink() || lstatSync(filename).nlink !== 1)) throw new Error("TEST_LINK_REJECTED");
};
export async function host({ filename, secret = makeSecret(), reopen = false, cookieCache = false, expiresIn = 120, refresh = false }) {
  safePath(filename); remember(secret);
  const boot = randomUUID(), ram = memoryStore(), logs = [];
  const writer = new Database(filename, { timeout: 250, fileMustExist: reopen });
  writer.pragma("foreign_keys=ON"); writer.pragma("journal_mode=WAL");
  writer.pragma("synchronous=FULL"); writer.pragma("busy_timeout=250"); writer.pragma("trusted_schema=OFF");
  const db = new Kysely({ dialect: new SqliteDialect({ database: writer }) });
  let observer, closed = false;
  // Serializes publication, requests and revocation in this one-process proof.
  // Credential verification is NOT implemented; its captured-version contract is simulated.
  let tail = Promise.resolve();
  const serial = fn => { const p = tail.then(fn); tail = p.catch(() => {}); return p; };
  const options = {
    baseURL: origin, secret, telemetry: { enabled: false },
    database: { db, type: "sqlite", transaction: true },
    secondaryStorage: ram.storage,
    user: { modelName: "c_test_principal" },
    account: { modelName: "c_test_unused_account" },
    verification: { modelName: "c_test_unused_challenge" },
    session: {
      modelName: "c_test_FORBIDDEN_session",
      storeSessionInDatabase: false, preserveSessionInDatabase: false,
      expiresIn, updateAge: 0, disableSessionRefresh: !refresh,
      cookieCache: { enabled: cookieCache, maxAge: 60, refreshCache: false },
      additionalFields: {
        proofEpoch: { type: "string", required: true, input: false },
        proofBoot: { type: "string", required: true, input: false }
      }
    },
    emailAndPassword: { enabled: false, disableSignUp: true },
    trustedOrigins: [origin],
    advanced: { useSecureCookies: true, defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: "strict" } },
    logger: { level: "debug", log: (...args) => logs.push(args) },
    // No public routes are registered by this official TEST-only plugin.
    plugins: [testUtils()]
  };
  try {
    if (!reopen) {
      const schema = getAuthTables(options);
      // Only the real framework's generic user table is needed. SQL sessions must not exist.
      assert.equal(Object.hasOwn(schema, "session"), false);
      for (const model of ["user", "account"]) {
        const table = schema[model], cols = ["id TEXT PRIMARY KEY NOT NULL"];
        for (const [name, f] of Object.entries(table.fields)) {
          let col = quote(f.fieldName ?? name) + " " + (["number", "boolean"].includes(f.type) ? "INTEGER" : "TEXT") +
            (f.required ? " NOT NULL" : "") + (f.unique ? " UNIQUE" : "");
          if (f.references) col += " REFERENCES " + quote(schema[f.references.model].modelName) + "(" + quote(f.references.field) + ") ON DELETE CASCADE";
          cols.push(col);
        }
        writer.exec("CREATE TABLE " + quote(table.modelName) + "(" + cols.join(",") + ") STRICT");
      }
      writer.exec(`CREATE TABLE c_test_authority(
        principal_id TEXT PRIMARY KEY REFERENCES c_test_principal(id),
        auth_epoch INTEGER NOT NULL CHECK(auth_epoch > 0),
        credential_version INTEGER NOT NULL CHECK(credential_version > 0),
        active INTEGER NOT NULL CHECK(active IN (0,1))
      ) STRICT;
      CREATE TABLE c_test_access(
        session_id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL REFERENCES c_test_authority(principal_id),
        auth_epoch INTEGER NOT NULL CHECK(auth_epoch > 0),
        boot TEXT NOT NULL,
        expires_ms INTEGER NOT NULL,
        revoked INTEGER NOT NULL CHECK(revoked IN (0,1))
      ) STRICT`);
    }
    const auth = betterAuth(options), ctx = await auth.$context;
    if (!reopen) {
      await ctx.test.saveUser(ctx.test.createUser({ id: principal, name: "TEST generic principal", email: "memory-proof@example.invalid" }));
      writer.prepare("INSERT INTO c_test_authority VALUES(?,1,1,1)").run(principal);
    }
    observer = new Database(filename, { readonly: true, fileMustExist: true, timeout: 250 });
    observer.pragma("foreign_keys=ON"); observer.pragma("synchronous=FULL"); observer.pragma("busy_timeout=250");
    const metrics = { sqlGateReads: 0, accepted: 0, denied: 0, cleanupFailures: 0, issued: 0 };
    const state = () => observer.prepare("SELECT * FROM c_test_authority WHERE principal_id=?").safeIntegers(true).get(principal);
    const snapshot = () => {
      const a = state();
      if (!a || a.active !== 1n) fail();
      return { epoch: a.auth_epoch, credential: a.credential_version };
    };
    const matches = captured => {
      const a = writer.prepare("SELECT * FROM c_test_authority WHERE principal_id=?").safeIntegers(true).get(principal);
      if (!a || a.active !== 1n || a.auth_epoch !== captured.epoch || a.credential_version !== captured.credential) fail();
    };
    const cleanup = async () => {
      const before = ram.stats.failedWrites;
      try { await ctx.internalAdapter.deleteUserSessions(principal); } catch { metrics.cleanupFailures++; }
      if (ram.stats.failedWrites > before) metrics.cleanupFailures++;
    };
    // Captured epoch MUST predate the (simulated) credential verification.
    // Cookie publication happens only after a second epoch check and SQL commit.
    const issue = async ({ captured = snapshot(), afterMemory, failRegistration = false } = {}) => serial(async () => {
      matches(captured);
      const login = await ctx.test.login({ userId: principal, session: { proofEpoch: String(captured.epoch), proofBoot: boot } });
      remember(login.token); remember(login.headers.get("cookie"));
      for (const c of login.cookies) remember(c.value);
      if (afterMemory) await afterMemory(login);
      try {
        writer.transaction(() => {
          matches(captured);
          writer.prepare("INSERT INTO c_test_access VALUES(?,?,?,?,?,0)").run(
            login.session.id, principal, captured.epoch, boot, BigInt(login.session.expiresAt.getTime()));
          if (failRegistration) throw new Error("TEST_REGISTRATION_ROLLBACK");
        }).immediate();
      } catch {
        // A leftover RAM credential has no SQL permission. Never publish its cookie.
        try { await ctx.internalAdapter.deleteSession(login.token); } catch { /* deny via registry */ }
        throw new Error("TEST_SESSION_NOT_PUBLISHED");
      }
      metrics.issued++;
      return login; // Privileged test fixture only; never an ordinary JSON response.
    });
    const gate = session => {
      metrics.sqlGateReads++;
      const row = observer.prepare(`SELECT a.auth_epoch, a.active, r.revoked, r.expires_ms, r.boot
        FROM c_test_authority a JOIN c_test_access r ON a.principal_id=r.principal_id
        WHERE r.session_id=? AND r.principal_id=? AND r.auth_epoch=a.auth_epoch`)
        .safeIntegers(true).get(session.id, session.userId);
      if (!row || row.active !== 1n || row.revoked !== 0n || row.boot !== boot ||
          session.proofBoot !== boot || String(row.auth_epoch) !== session.proofEpoch ||
          row.expires_ms <= BigInt(Date.now()) || new Date(session.expiresAt).getTime() <= Date.now()) fail();
    };
    const raw = (path, headers, method = "GET") => {
      const h = new Headers(headers);
      if (method !== "GET") { h.set("origin", origin); h.set("content-type", "application/json"); }
      return auth.handler(new Request(origin + path, { method, headers: h, ...(method !== "GET" ? { body: "{}" } : {}) }));
    };
    // The ONLY exposed request capability. Raw handler and auth.api stay private.
    // Exact allowlist; never mount auth.handler as a catch-all route.
    const request = (path, headers = new Headers(), method = "GET") => serial(async () => {
      const url = new URL(path, origin), action = url.pathname;
      if (!((action === "/api/auth/get-session" && method === "GET") ||
            (action === "/proof/protected" && method === "GET") ||
            (action === "/api/auth/sign-out" && method === "POST"))) return publicJSON({ denied: true }, 404);
      try {
        // Every allowed request consults committed SQL even if credential/RAM lookup later fails.
        metrics.sqlGateReads++;
        const current = state();
        if (!current || current.active !== 1n) fail();
        if (method === "POST" && new Headers(headers).get("origin") !== origin) fail();
        // Forces actual secondaryStorage lookup even when a signed cache cookie exists.
        const value = await auth.api.getSession({ headers, query: { disableCookieCache: true, disableRefresh: true } });
        // Even unauthenticated requests perform a fresh SQL read (never use cached roles).
        if (!value) { metrics.sqlGateReads++; state(); fail(); }
        gate(value.session);
        if (action === "/api/auth/sign-out") {
          writer.transaction(() => {
            writer.prepare("UPDATE c_test_access SET revoked=1 WHERE session_id=?").run(value.session.id);
          }).immediate();
          // Database revocation is authoritative even if framework RAM cleanup fails.
          const response = await raw("/api/auth/sign-out", headers, method);
          metrics.accepted++;
          return response;
        }
        const response = action === "/api/auth/get-session" ?
          await raw("/api/auth/get-session?disableCookieCache=true", headers) : null;
        if (response && response.status !== 200) fail();
        const result = response ? await response.json() : value;
        if (!result || result.session.id !== value.session.id) fail();
        // Final committed-state read before publishing data; raw framework JSON is never forwarded.
        gate(result.session);
        const out = publicJSON({ authenticated: true, principal: result.user.id });
        // Secure credential transport only, separate from ordinary JSON.
        if (response) for (const c of response.headers.getSetCookie()) {
          remember(c.split(";")[0].split("=").slice(1).join("="));
          out.headers.append("set-cookie", c);
        }
        metrics.accepted++;
        return out;
      } catch { metrics.denied++; return publicJSON({ denied: true }, 401); }
    });
    const rotate = ({ failTransaction = false, cleanupRAM = true, deactivate = false } = {}) => serial(async () => {
      writer.transaction(() => {
        writer.prepare("UPDATE c_test_authority SET auth_epoch=auth_epoch+1,credential_version=credential_version+1,active=? WHERE principal_id=?")
          .run(deactivate ? 0 : 1, principal);
        writer.prepare("UPDATE c_test_access SET revoked=1 WHERE principal_id=?").run(principal);
        if (failTransaction) throw new Error("TEST_SQL_ROLLBACK");
      }).immediate();
      if (cleanupRAM) await cleanup();
    });
    const close = async () => {
      if (closed) return;
      closed = true;
      await tail;
      if (observer.open) observer.close();
      await db.destroy(); ram.clear();
    };
    return {
      request, issue, rotate, close,
      // TEST-ONLY control plane, never an HTTP/server API or browser capability.
      test: {
        ctx, ram, writer, observer, metrics, logs, options, boot, snapshot, state,
        raw, cleanup, gate,
        records: () => observer.prepare("SELECT * FROM c_test_access ORDER BY session_id").safeIntegers(true).all(),
        diskHasSecret: () => [filename, filename + "-wal", filename + "-shm"].filter(existsSync)
          .some(p => { const b = readFileSync(p); return [...secretSet].some(s => b.includes(Buffer.from(s))); }),
        schemas: () => observer.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' ORDER BY name").all(),
        expireRegistry(id) { writer.prepare("UPDATE c_test_access SET expires_ms=? WHERE session_id=?").run(BigInt(Date.now() - 1000), id); },
        async expireFramework(token) { await ctx.internalAdapter.updateSession(token, { expiresAt: new Date(Date.now() - 1000) }); },
        closeObserver() { observer.close(); }
      }
    };
  } catch (error) {
    if (observer?.open) observer.close();
    await db.destroy();
    throw error;
  }
}
