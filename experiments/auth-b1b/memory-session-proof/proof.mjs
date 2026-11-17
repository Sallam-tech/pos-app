// TEST ONLY. Real pinned framework integration; no mocked auth implementation.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fork } from "node:child_process";
import { once } from "node:events";
import { setTimeout as pause } from "node:timers/promises";
import Database from "better-sqlite3";
import { host, here, principal, makeSecret, remember, containsSecret, secretSet } from "./host.mjs";
import { memoryStore } from "./storage.mjs";

const jsonBodies = [], capturedLogs = [];
const filename = () => join(mkdtempSync(join(here, "test-results/case-")), "test.sqlite");
const turn = () => new Promise(resolve => setImmediate(resolve));
function cookies(headers, setCookies) {
  const values = new Map((headers.get("cookie") ?? "").split("; ").filter(Boolean).map(c => {
    const i = c.indexOf("="); return [c.slice(0, i), c.slice(i + 1)];
  }));
  for (const line of setCookies) {
    const c = line.split(";")[0], i = c.indexOf("="); values.set(c.slice(0, i), c.slice(i + 1));
    remember(c.slice(i + 1));
  }
  return new Headers({ cookie: [...values].map(([k,v]) => k + "=" + v).join("; ") });
}
async function use(options, work) {
  const h = await host({ filename: filename(), ...options });
  const original = h.request;
  h.request = async (...args) => {
    const before = h.test.metrics.sqlGateReads;
    const r = await original(...args);
    jsonBodies.push(await r.clone().text());
    const action = new URL(args[0], "https://memory-proof.invalid").pathname, method = args[2] ?? "GET";
    if ((["/proof/protected", "/api/auth/get-session"].includes(action) && method === "GET") ||
        (action === "/api/auth/sign-out" && method === "POST")) assert.ok(h.test.metrics.sqlGateReads > before);
    return r;
  };
  try { await work(h); }
  finally {
    try {
      capturedLogs.push(...h.test.logs);
      assert.equal(h.test.diskHasSecret(), false);
      assert.equal(h.test.writer.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
      assert.equal(h.test.writer.prepare("PRAGMA foreign_key_check").all().length, 0);
    } finally { await h.close(); }
  }
}
const accepted = async (h, login, path = "/proof/protected") => {
  const r = await h.request(path, login.headers); assert.equal(r.status, 200); assert.equal((await r.json()).authenticated, true); return r;
};
const denied = async (h, login, path = "/proof/protected") => {
  const r = await h.request(path, login.headers); assert.notEqual(r.status, 200); return r;
};
async function child() {
  const p = fork(join(here, "worker.mjs"), [], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const output = [], pending = new Map(); let sequence = 0;
  p.stdout.on("data", b => output.push(b.toString())); p.stderr.on("data", b => output.push(b.toString()));
  p.on("message", m => {
    const item = pending.get(m.id); if (!item) return;
    pending.delete(m.id); clearTimeout(item.timer);
    if (m.ok) item.resolve(m.value); else item.reject(new Error("TEST_CHILD_FAILED"));
  });
  const rpc = (action, data = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error("TEST_CHILD_TIMEOUT")); }, 15000);
    pending.set(id, { resolve, reject, timer }); p.send({ id, action, ...data });
  });
  const kill = async () => {
    if (p.exitCode !== null || p.signalCode !== null) return;
    const exited = once(p, "exit"); p.kill(); await exited;
    assert.equal(p.exitCode !== null || p.signalCode !== null, true);
    assert.equal(containsSecret(output.join("")), false);
    assert.equal(output.length, 0);
  };
  return { rpc, kill };
}

export async function proof() {
  const outcomes = [], facts = { realFramework: true, realNativeSQLite: true, networkListener: false, productionLogin: false };
  const check = async (name, fn) => {
    try { await fn(); outcomes.push({ name, passed: true }); }
    catch (e) {
      // Never persist arbitrary framework/SQL exception messages or assertion operands.
      outcomes.push({ name, passed: false, category: e?.code === "ERR_ASSERTION" ? "ASSERTION_FAILED" : "OPERATION_FAILED" });
    }
  };
  await check("pinned versions, native SQLite settings and absence of a SQL session table", () => use({}, async h => {
    const versions = { "better-auth": "1.7.18", "@better-auth/core": "1.7.18", "@better-auth/kysely-adapter": "1.7.18", "kysely": "0.29.0", "better-sqlite3": "13.0.3" };
    for (const [name, expected] of Object.entries(versions)) assert.equal(JSON.parse(readFileSync(join(here, "../node_modules", name, "package.json"), "utf8")).version, expected);
    assert.equal(process.version, "v24.11.0"); assert.equal(process.platform, "win32"); assert.equal(process.arch, "x64");
    assert.equal(h.test.writer.pragma("journal_mode", { simple: true }), "wal");
    assert.equal(h.test.writer.pragma("synchronous", { simple: true }), 2);
    assert.equal(h.test.writer.pragma("foreign_keys", { simple: true }), 1);
    assert.equal(h.test.writer.pragma("busy_timeout", { simple: true }), 250);
    assert.equal(h.test.writer.prepare("SELECT sqlite_version() AS v").get().v, "3.53.4");
    assert.deepEqual(h.test.schemas().map(s => s.name), ["c_test_access", "c_test_authority", "c_test_principal", "c_test_unused_account"]);
    facts.versions = versions;
  }));
  await check("actual session and signed Secure HttpOnly Strict cookie work through the guarded handler", () => use({}, async h => {
    const login = await h.issue(); await accepted(h, login); await accepted(h, login, "/api/auth/get-session");
    assert.equal(login.cookies.length, 1);
    assert.equal(login.cookies[0].httpOnly, true); assert.equal(login.cookies[0].secure, true); assert.equal(login.cookies[0].sameSite, "Strict");
    assert.ok(h.test.ram.storage.get(login.token)); assert.equal(h.test.records().length, 1);
  }));
  await check("live SQL files contain no tokens or keys and persisted session IDs are not credentials", () => use({}, async h => {
    const a = await h.issue(), b = await h.issue(); await accepted(h, a); await accepted(h, b);
    assert.equal(h.test.diskHasSecret(), false);
    for (const row of h.test.records()) {
      assert.equal(row.session_id === a.token || row.session_id === b.token, false);
      const headers = new Headers({ cookie: a.cookies[0].name + "=" + row.session_id });
      await denied(h, { headers });
    }
    facts.noSqlSessionTable = true; facts.tokensPersisted = false;
  }));
  await check("real secondary-storage single/bulk lookup and update retain the authorization binding", () => use({}, async h => {
    const a = await h.issue(), b = await h.issue();
    const results = await h.test.ctx.internalAdapter.findSessions([a.token, b.token], { onlyActiveSessions: true });
    assert.equal(results.length, 2);
    await h.test.ctx.internalAdapter.updateSession(a.token, { userAgent: "TEST-updated-agent" });
    const found = await h.test.ctx.internalAdapter.findSession(a.token);
    assert.equal(found.session.userAgent, "TEST-updated-agent"); assert.equal(found.session.proofEpoch, "1");
    await accepted(h, a);
  }));
  await check("fresh-process restart rejects all old cookies including a genuine signed cache cookie", async () => {
    const file = filename(), secret = makeSecret(), first = await child();
    let second;
    try {
      await first.rpc("init", { options: { filename: file, secret, cookieCache: true } });
      const old = [];
      for (let i=0; i<3; i++) {
        const a = await first.rpc("issue"); remember(a.token); remember(a.cookie);
        const r = await first.rpc("request", { path: "/api/auth/get-session", cookie: a.cookie });
        assert.equal(r.status, 200); jsonBodies.push(r.body);
        const jar = cookies(new Headers({ cookie: a.cookie }), r.cookies); remember(jar.get("cookie")); old.push(jar.get("cookie"));
        assert.ok(r.cookies.some(c => c.includes("session_data")));
      }
      const before = await first.rpc("audit"); assert.equal(before.diskHasSecret, false); assert.equal(before.logHasSecret, false); assert.equal(before.records, 3);
      await first.kill(); // No graceful storage export; same SQLite file and signing key survive.
      second = await child();
      await second.rpc("init", { options: { filename: file, secret, reopen: true, cookieCache: true } });
      const opened = await second.rpc("audit"); assert.equal(opened.records, 3); assert.equal(opened.ramEntries, 0);
      for (const cookie of old) {
        const r = await second.rpc("request", { path: "/proof/protected", cookie }); assert.equal(r.status, 401); jsonBodies.push(r.body);
        const s = await second.rpc("request", { path: "/api/auth/get-session", cookie }); assert.equal(s.status, 401); jsonBodies.push(s.body);
      }
      const fresh = await second.rpc("issue"); remember(fresh.token); remember(fresh.cookie);
      const r = await second.rpc("request", { path: "/proof/protected", cookie: fresh.cookie }); assert.equal(r.status, 200); jsonBodies.push(r.body);
      const after = await second.rpc("audit"); assert.equal(after.records, 4); assert.equal(after.diskHasSecret, false); assert.equal(after.logHasSecret, false);
      await second.rpc("close"); facts.freshProcessRestart = true; facts.oldCookiesRejected = old.length;
    } finally { await first.kill(); if (second) await second.kill(); }
  });
  await check("committed credential/authorization-version change immediately rejects every older session", () => use({}, async h => {
    const a = await h.issue(), b = await h.issue(); await h.rotate({ cleanupRAM: false });
    assert.equal(h.test.state().auth_epoch, 2n); assert.equal(h.test.state().credential_version, 2n);
    await denied(h, a); await denied(h, b); await accepted(h, await h.issue());
  }));
  await check("failed real RAM revocation leaves a live framework session that SQLite still rejects", () => use({}, async h => {
    const a = await h.issue(); h.test.ram.faults.writes = true;
    await h.rotate();
    assert.ok(h.test.ram.stats.failedWrites > 0); assert.ok(h.test.metrics.cleanupFailures > 0);
    assert.ok(await h.test.ctx.internalAdapter.findSession(a.token));
    await denied(h, a); await denied(h, a, "/api/auth/get-session");
    h.test.ram.faults.writes = false; await accepted(h, await h.issue());
    facts.cleanupFailureCannotRestoreAccess = true;
  }));
  await check("inactive authoritative principal is denied despite a valid RAM session", () => use({}, async h => {
    const a = await h.issue(); await h.rotate({ deactivate: true, cleanupRAM: false });
    await denied(h, a); await assert.rejects(h.issue()); assert.equal(h.test.state().active, 0n);
  }));
  await check("failed SQLite credential/version/revocation transaction rolls back all authorization writes", () => use({}, async h => {
    const a = await h.issue(), state = h.test.state(), rows = h.test.records();
    await assert.rejects(h.rotate({ failTransaction: true }));
    assert.deepEqual(h.test.state(), state); assert.deepEqual(h.test.records(), rows);
    assert.equal(h.test.writer.inTransaction, false); await accepted(h, a);
  }));
  await check("failed registration rolls back its SQL row and a leftover RAM cookie has no permission", () => use({}, async h => {
    let unissued;
    h.test.ram.faults.writes = false;
    await assert.rejects(h.issue({ failRegistration: true, afterMemory: async a => { unissued = a; h.test.ram.faults.writes = true; } }));
    assert.equal(h.test.records().length, 0); assert.equal(h.test.metrics.issued, 0);
    assert.ok(await h.test.ctx.internalAdapter.findSession(unissued.token));
    await denied(h, unissued);
    h.test.ram.faults.writes = false; await accepted(h, await h.issue());
  }));
  await check("a captured pre-verification version cannot adopt a newer credential version", () => use({}, async h => {
    const captured = h.test.snapshot(); await h.rotate({ cleanupRAM: false });
    await assert.rejects(h.issue({ captured })); assert.equal(h.test.metrics.issued, 0); assert.equal(h.test.records().length, 0);
  }));
  await check("independent SQLite revocation during actual async session creation prevents cookie publication", () => use({}, async h => {
    let candidate;
    await assert.rejects(h.issue({ afterMemory: async a => {
      candidate = a; await turn();
      const independent = new Database(h.test.writer.name, { timeout: 250, fileMustExist: true });
      try {
        independent.pragma("foreign_keys=ON"); independent.pragma("synchronous=FULL");
        independent.transaction(() => {
          independent.prepare("UPDATE c_test_authority SET auth_epoch=auth_epoch+1,credential_version=credential_version+1 WHERE principal_id=?").run(principal);
          independent.prepare("UPDATE c_test_access SET revoked=1 WHERE principal_id=?").run(principal);
        }).immediate();
      } finally { independent.close(); }
    } }));
    assert.equal(h.test.metrics.issued, 0); assert.equal(h.test.records().length, 0); await denied(h, candidate);
  }));
  await check("concurrent login/revocation/stale-login operations leave no usable old session", () => use({}, async h => {
    const captured = h.test.snapshot();
    const first = h.issue({ captured, afterMemory: turn });
    const rotation = h.rotate({ cleanupRAM: false });
    const stale = h.issue({ captured });
    const r = await Promise.allSettled([first, rotation, stale]);
    assert.equal(r[0].status, "fulfilled"); assert.equal(r[1].status, "fulfilled"); assert.equal(r[2].status, "rejected");
    await denied(h, r[0].value); await accepted(h, await h.issue());
  }));
  await check("every exposed protected operation reads fresh SQLite rather than cached authorization", () => use({}, async h => {
    const a = await h.issue();
    for (const path of ["/proof/protected", "/api/auth/get-session", "/api/auth/get-session?disableCookieCache=false&disableRefresh=false"]) {
      const before = h.test.metrics.sqlGateReads; await accepted(h, a, path); assert.ok(h.test.metrics.sqlGateReads > before);
    }
    h.test.writer.prepare("UPDATE c_test_access SET revoked=1 WHERE session_id=?").run(a.session.id);
    const before = h.test.metrics.sqlGateReads; await denied(h, a); assert.ok(h.test.metrics.sqlGateReads > before);
  }));
  await check("a real stale signed cookie cache cannot bypass the gateway after revocation or RAM loss", () => use({ cookieCache: true }, async h => {
    const a = await h.issue(), r = await accepted(h, a, "/api/auth/get-session");
    assert.ok(r.headers.getSetCookie().some(c => c.includes("session_data")));
    const headers = cookies(a.headers, r.headers.getSetCookie());
    h.test.ram.faults.writes = true; await h.rotate();
    // Private diagnostic only: the framework alone trusts its signed stale cache.
    const privateResponse = await h.test.raw("/api/auth/get-session", headers);
    const privateValue = await privateResponse.json();
    assert.equal(privateResponse.status, 200); assert.ok(privateValue?.session);
    await denied(h, { headers }); await denied(h, { headers }, "/api/auth/get-session?disableCookieCache=false");
    h.test.ram.clear();
    const stillCached = await h.test.raw("/api/auth/get-session", headers);
    assert.ok((await stillCached.json())?.session);
    await denied(h, { headers });
    facts.privateCacheNeedsGateway = true; facts.cacheBypassRejected = true;
  }));
  await check("alternative framework endpoints and path/method variants cannot reach the private handler", () => use({}, async h => {
    const a = await h.issue(); await h.rotate({ cleanupRAM: false });
    const paths = ["list-sessions", "revoke-session", "revoke-sessions", "revoke-other-sessions", "change-password", "update-user", "sign-in/email", "sign-up/email", "request-password-reset", "reset-password", "delete-user", "change-email", "get-access-token", "callback/test", "get-session/", "%67et-session", "get-session/extra", "../proof/protected"];
    let count = 0;
    for (const p of paths) for (const method of ["GET", "POST"]) {
      const r = await h.request("/api/auth/" + p, a.headers, method); assert.equal(r.status, 404); count++;
    }
    for (const method of ["POST", "HEAD", "OPTIONS", "PUT", "DELETE"]) {
      const r = await h.request("/api/auth/get-session", a.headers, method); assert.equal(r.status, 404); count++;
    }
    assert.equal((await h.request("/api/auth/sign-out", a.headers, "GET")).status, 404);
    facts.endpointVariantsRejected = count + 1;
  }));
  await check("missing, altered and unsigned credentials are rejected without cached identity fallback", () => use({}, async h => {
    const a = await h.issue();
    await denied(h, { headers: new Headers() });
    const h1 = new Headers(a.headers), value = h1.get("cookie"); h1.set("cookie", value.slice(0,-1) + (value.endsWith("A") ? "B" : "A"));
    await denied(h, { headers: h1 });
    await denied(h, { headers: new Headers({ cookie: a.cookies[0].name + "=" + a.token }) });
    await accepted(h, a);
  }));
  await check("real wall-clock framework session expiry rejects the old signed cookie", () => use({ expiresIn: 1 }, async h => {
    const a = await h.issue(); await accepted(h, a); await pause(1250); await denied(h, a); await denied(h, a, "/api/auth/get-session");
  }));
  await check("actual refresh cannot extend access beyond the authoritative SQLite expiry", () => use({ refresh: true }, async h => {
    const a = await h.issue();
    await h.test.ctx.internalAdapter.updateSession(a.token, { updatedAt: new Date(0), expiresAt: new Date(Date.now() + 119000) });
    const before = await h.test.ctx.internalAdapter.findSession(a.token);
    await accepted(h, a, "/api/auth/get-session");
    const after = await h.test.ctx.internalAdapter.findSession(a.token);
    assert.ok(after.session.updatedAt.getTime() > before.session.updatedAt.getTime());
    h.test.expireRegistry(a.session.id);
    await h.test.ctx.internalAdapter.updateSession(a.token, { expiresAt: new Date(Date.now() + 3600000) });
    await denied(h, a); await denied(h, a, "/api/auth/get-session");
  }));
  await check("actual logout revokes SQLite permission, deletes the RAM session and clears the cookie", () => use({}, async h => {
    const a = await h.issue(), headers = new Headers(a.headers); headers.set("origin", "https://memory-proof.invalid");
    const before = h.test.metrics.sqlGateReads;
    const r = await h.request("/api/auth/sign-out", headers, "POST");
    assert.equal(r.status, 200); assert.equal((await r.json()).success, true); assert.ok(h.test.metrics.sqlGateReads > before);
    assert.ok(r.headers.getSetCookie().some(c => /Max-Age=0/i.test(c)));
    assert.equal(h.test.records()[0].revoked, 1n); assert.equal(await h.test.ctx.internalAdapter.findSession(a.token), null);
    await denied(h, a);
  }));
  await check("failed logout RAM cleanup cannot reauthorize the revoked SQLite session", () => use({}, async h => {
    const a = await h.issue(), headers = new Headers(a.headers); headers.set("origin", "https://memory-proof.invalid");
    h.test.ram.faults.writes = true;
    const r = await h.request("/api/auth/sign-out", headers, "POST"); assert.equal(r.status, 200);
    assert.ok(h.test.ram.stats.failedWrites > 0); assert.ok(await h.test.ctx.internalAdapter.findSession(a.token));
    assert.equal(h.test.records()[0].revoked, 1n); await denied(h, a);
    h.test.ram.faults.writes = false;
  }));
  await check("unavailable SQLite authorization state fails closed on every exposed protected route", () => use({}, async h => {
    const a = await h.issue(); h.test.closeObserver();
    await denied(h, a); await denied(h, a, "/api/auth/get-session");
    const headers = new Headers(a.headers); headers.set("origin", "https://memory-proof.invalid");
    assert.equal((await h.request("/api/auth/sign-out", headers, "POST")).status, 401);
    facts.sqliteUnavailableDenies = true;
  }));
  await check("unavailable secondary storage also fails closed", () => use({}, async h => {
    const a = await h.issue(); h.test.ram.faults.reads = true;
    await denied(h, a); await denied(h, a, "/api/auth/get-session");
    h.test.ram.faults.reads = false; await accepted(h, a);
  }));
  await check("memory storage implements actual atomic single-key contracts, TTL and bounded capacity", async () => {
    const m = memoryStore({ maxEntries: 2 });
    m.storage.set("TEST-a", "TEST-value", 1); assert.equal(m.storage.getAndDelete("TEST-a"), "TEST-value"); assert.equal(m.storage.get("TEST-a"), null);
    assert.equal(m.storage.increment("TEST-counter", 0.05), 1); assert.equal(m.storage.increment("TEST-counter", 0.05), 2);
    await pause(70); assert.equal(m.storage.get("TEST-counter"), null);
    m.storage.set("TEST-a", "a"); m.storage.set("TEST-b", "b"); assert.throws(() => m.storage.set("TEST-c", "c"));
    assert.throws(() => m.storage.set("TEST-a", "a", -1));
    m.clear(); assert.equal(m.size(), 0);
  });
  await check("ordinary JSON responses and captured framework logs contain no tokens passwords or signing keys", async () => {
    assert.ok(jsonBodies.length > 60); assert.ok(secretSet.size > 20);
    assert.equal(containsSecret(JSON.stringify(jsonBodies)), false);
    assert.equal(containsSecret(JSON.stringify(capturedLogs, (_, v) => v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v)), false);
    facts.ordinaryJsonResponsesChecked = jsonBodies.length;
    facts.frameworkLogEntriesChecked = capturedLogs.length;
    facts.noActualPasswordsCreated = true;
  });
  return { outcomes, facts, secretSet, containsSecret };
}
