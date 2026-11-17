// TEST-only negative controls for supported Better Auth session contracts.
// No HTTP listener, credential provider, file database, custom adapter or upstream changes.
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { customSession } from "better-auth/plugins/custom-session";
import { getAuthTables } from "@better-auth/core/db";
import { runWithTransaction } from "@better-auth/core/context";

const origin = "https://session-review.invalid";
const quote = s => { assert.match(s, /^[A-Za-z][A-Za-z0-9_]*$/); return '"' + s + '"'; };
export async function diagnostics() {
  const secrets = new Set();
  const register = value => { if (typeof value === "string" && value.length >= 16) secrets.add(value); return value; };
  const key = randomBytes(32);
  register(key.toString("hex")); register(key.toString("base64"));
  const secret = register(randomBytes(48).toString("base64url"));
  const originals = [];
  const logs = [];
  const native = new Database(":memory:");
  native.pragma("foreign_keys = ON"); native.pragma("synchronous = FULL"); native.pragma("busy_timeout = 250"); native.pragma("trusted_schema = OFF");
  const db = new Kysely({ dialect: new SqliteDialect({ database: native }) });
  const options = {
    baseURL: origin, secret,
    database: { db, type: "sqlite", transaction: true },
    user: { modelName: "b2b_test_principal" },
    account: { modelName: "b2b_test_credential" },
    verification: { modelName: "b2b_test_challenge" },
    session: { modelName: "b2b_test_session", expiresIn: 3600, disableSessionRefresh: true, cookieCache: { enabled: false } },
    emailAndPassword: { enabled: false, disableSignUp: true },
    telemetry: { enabled: false },
    trustedOrigins: [origin],
    advanced: { useSecureCookies: true, defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: "strict" } },
    logger: { disabled: true, log: (...args) => logs.push(args) },
    plugins: [
      testUtils(),
      customSession(async ({ user, session }) => ({
        user: { id: user.id, name: user.name },
        session: { id: session.id, expiresAt: session.expiresAt }
      }))
    ],
    databaseHooks: { session: { create: { before: async session => {
      const original = register(session.token);
      originals.push(original);
      const digest = register(createHmac("sha256", key).update("TEST-session-lookup\\0").update(original).digest("hex"));
      return { data: { ...session, token: digest } };
    } } } }
  };
  // Actual pinned model metadata; this memory-only negative control is not a migration.
  const schema = getAuthTables(options);
  for (const model of ["user", "session", "account", "verification"]) {
    const table = schema[model];
    const cols = ["id TEXT PRIMARY KEY NOT NULL"];
    for (const [name, f] of Object.entries(table.fields)) {
      let col = quote(f.fieldName ?? name) + " " + (["number", "boolean"].includes(f.type) ? "INTEGER" : "TEXT");
      if (f.required) col += " NOT NULL";
      if (f.unique) col += " UNIQUE";
      if (f.references) {
        col += " REFERENCES " + quote(schema[f.references.model].modelName) + "(" + quote(f.references.field) + ") ON DELETE CASCADE";
        if (model === "session") col += " DEFERRABLE INITIALLY DEFERRED";
      }
      cols.push(col);
    }
    native.exec("CREATE TABLE " + quote(table.modelName) + "(" + cols.join(", ") + ") STRICT");
  }
  const auth = betterAuth(options);
  const ctx = await auth.$context;
  const outcomes = [];
  const check = async (name, work) => {
    try { await work(); outcomes.push({ name, passed: true }); }
    catch { outcomes.push({ name, passed: false, error: "CONTRACT_ASSERTION_FAILED" }); }
  };
  const user = await ctx.test.saveUser(ctx.test.createUser({ name: "TEST generic principal", email: "session-proof@example.invalid" }));
  let login;
  const issue = async () => {
    const result = await ctx.test.login({ userId: user.id });
    register(result.token);
    for (const c of result.cookies) register(c.value);
    register(result.headers.get("cookie"));
    return result;
  };
  const request = async (path, headers = new Headers(), method = "GET") => {
    const h = new Headers(headers); if (method !== "GET") h.set("origin", origin);
    return auth.handler(new Request(origin + "/api/auth/" + path, { method, headers: h }));
  };
  const read = () => native.prepare("SELECT id, token, expiresAt FROM b2b_test_session ORDER BY id").all();
  const facts = { fileDatabaseCreated: false, customAdapterCreated: false, externalListenerStarted: false };
  try {
    await check("actual session creation through official test-utils and supported write hook", async () => {
      login = await issue();
      assert.ok(login.session.id);
      assert.equal(originals.length, 1);
      assert.equal(read().length, 1);
      assert.equal(read()[0].token === originals[0], false);
    });
    await check("negative control: write-only keyed hashing substitutes a stored value as the issued bearer", async () => {
      facts.storedValueEqualsIssuedBearer = read()[0].token === login.token;
      assert.equal(facts.storedValueEqualsIssuedBearer, true);
      assert.ok(login.headers.get("cookie").includes(login.token));
      const a = await ctx.internalAdapter.findSession(originals[0]);
      const b = await ctx.internalAdapter.findSession(login.token);
      facts.originalTokenLookupRejected = a === null;
      facts.storedDigestLookupAccepted = b !== null;
      assert.equal(facts.originalTokenLookupRejected, true); assert.equal(facts.storedDigestLookupAccepted, true);
    });
    await check("real get-session accepts the signed cookie and supported customSession removes tokens from its JSON", async () => {
      const response = await request("get-session", login.headers);
      assert.equal(response.status, 200);
      const text = await response.text();
      const value = JSON.parse(text);
      assert.equal(value.user.id, user.id);
      assert.equal(Object.hasOwn(value.session, "token"), false);
      assert.equal([...secrets].some(s => text.includes(s)), false);
      facts.selectedSessionResponseRedacted = true;
    });
    await check("secure HttpOnly Strict cookie properties are preserved; missing or tampered credential is rejected", async () => {
      const cookie = login.cookies[0];
      assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, "Strict");
      const missing = await request("get-session");
      assert.equal(await missing.json(), null);
      const broken = new Headers(login.headers);
      const text = broken.get("cookie"); broken.set("cookie", text.slice(0, -1) + (text.endsWith("A") ? "B" : "A"));
      const tampered = await request("get-session", broken);
      assert.equal(await tampered.json(), null);
      facts.cookieCredentialRequired = true;
    });
    await check("actual update and expiry enforcement reject an expired cookie and remove the expired row", async () => {
      await ctx.internalAdapter.updateSession(login.token, { expiresAt: new Date(Date.now() - 60000) });
      const response = await request("get-session", login.headers);
      assert.equal(await response.json(), null); assert.equal(read().length, 0);
      facts.expirationEnforced = true;
    });
    await check("actual session revocation rejects the previous signed cookie", async () => {
      login = await issue();
      assert.ok(await ctx.internalAdapter.findSession(login.token));
      await ctx.internalAdapter.deleteSession(login.token);
      assert.equal(await ctx.internalAdapter.findSession(login.token), null);
      assert.equal(await (await request("get-session", login.headers)).json(), null);
      facts.revocationEnforced = true;
    });
    await check("actual session update/create rollback and deferred-FK COMMIT failure leave no partial records", async () => {
      login = await issue(); const before = read();
      let rejected = false;
      try {
        await runWithTransaction(ctx.adapter, async () => {
          await ctx.internalAdapter.updateSession(login.token, { expiresAt: new Date(Date.now() + 120000) });
          const created = await ctx.internalAdapter.createSession("TEST-missing-principal");
          register(created.token);
        });
      } catch { rejected = true; }
      assert.equal(rejected, true); assert.deepEqual(read(), before); assert.equal(native.inTransaction, false);
      facts.rollbackEnforced = true;
    });
    await check("captured framework logs contain none of the ephemeral credential values", async () => {
      const text = JSON.stringify(logs);
      assert.equal([...secrets].some(s => text.includes(s)), false);
      facts.capturedLogsContainCredential = false;
    });
    return { outcomes, facts, secrets, logs };
  } finally { await db.destroy(); if (native.open) native.close(); key.fill(0); }
}
