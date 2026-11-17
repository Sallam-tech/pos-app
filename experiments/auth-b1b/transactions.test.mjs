import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { getCurrentAdapter, runWithTransaction, queueAfterTransactionHook } from "@better-auth/core/context";
import { fixture, createSession, principal, fakePassword, deferred, delayTurn, here, root, provenance } from "./fixture.mjs";

async function withFixture(work) {
  const f = await fixture();
  try { await f.seed(); await work(f); }
  finally { await f.close(); }
}
const password = f => f.read("SELECT password FROM test_credential WHERE id = ?", "TEST-credential")[0].password;
const updatePassword = (a, value) => a.update({ model: "account", where: [{ field: "id", value: "TEST-credential" }], update: { password: value } });
const createPrincipal = (a, id, email = id + "@example.invalid") => a.create({ model: "user", forceAllowId: true, data: { id, name: "TEST fixture", email, emailVerified: false, createdAt: new Date(), updatedAt: new Date() } });
const sessions = f => f.read("SELECT id FROM test_session ORDER BY id").map(r => r.id);
const ended = /already committed|already rolled back/i;

test("01 real pinned adapter, native runtime and connection settings", async () => {
  const p = provenance();
  assert.equal(p.runtime.platform, "win32"); assert.equal(p.runtime.arch, "x64");
  assert.match(p.runtime.node, /^v24\./);
  for (const v of p.packages) assert.equal(v.version, ({ "better-auth": "1.7.18", "@better-auth/core": "1.7.18", "@better-auth/kysely-adapter": "1.7.18", kysely: "0.29.0", "better-sqlite3": "13.0.3", "node-addon-api": "8.9.2" })[v.name]);
  assert.equal(p.nativeSha256, "e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a");
  await withFixture(async f => {
    assert.equal(typeof f.adapter.options.adapterConfig.transaction, "function");
    assert.equal(f.adapter.id, "kysely");
    assert.equal(f.native.pragma("foreign_keys", { simple: true }), 1);
    assert.equal(f.native.pragma("synchronous", { simple: true }), 2);
    assert.equal(f.native.pragma("journal_mode", { simple: true }), "wal");
    assert.equal(f.native.pragma("busy_timeout", { simple: true }), 250);
    const tables = f.read("SELECT name, strict FROM pragma_table_list WHERE name LIKE 'test_%' ORDER BY name");
    assert.equal(tables.length, 4); assert.ok(tables.every(t => t.strict === 1));
    assert.ok((await f.adapter.findOne({ model: "user", where: [{ field: "id", value: principal }] })).createdAt instanceof Date);
  });
});

test("02 awaited asynchronous multi-record operation commits completely, never early", async () => withFixture(async f => {
  const reached = deferred(), release = deferred();
  const work = f.tx(async a => {
    await createSession(a, "commit-one"); reached.resolve(); await release.promise;
    assert.equal(f.native.inTransaction, true);
    await createSession(a, "commit-two"); return { completed: true };
  });
  await reached.promise;
  try { assert.equal(f.native.inTransaction, true); assert.equal(f.count("test_session"), 0); }
  finally { release.resolve(); }
  assert.deepEqual(await work, { completed: true });
  assert.deepEqual(sessions(f), ["commit-one", "commit-two"]);
  assert.equal(f.native.inTransaction, false);
}));

test("03 exception after first write rolls back every record", async () => withFixture(async f => {
  await assert.rejects(f.tx(async a => { await createSession(a, "rollback-one"); throw new Error("TEST-first-write-failure"); }), /TEST-first-write-failure/);
  assert.deepEqual(sessions(f), []); assert.equal(f.native.inTransaction, false);
}));

test("04 awaited failure after an event-loop turn still rolls back", async () => withFixture(async f => {
  await assert.rejects(f.tx(async a => { await createSession(a, "async-failure"); await delayTurn(); await updatePassword(a, "TEST-new-placeholder"); throw new Error("TEST-late-callback-failure"); }), /TEST-late-callback-failure/);
  assert.deepEqual(sessions(f), []); assert.equal(password(f), fakePassword);
}));

test("05 failed session replacement rolls back password update and old-session deletion", async () => withFixture(async f => {
  await f.tx(a => createSession(a, "original"));
  await assert.rejects(f.tx(async a => {
    await updatePassword(a, "TEST-new-placeholder");
    await a.deleteMany({ model: "session", where: [{ field: "userId", value: principal }] });
    const invalid = { ...((await import("./fixture.mjs")).session("invalid")), token: "INVALID-NOT-TEST" };
    await a.create({ model: "session", forceAllowId: true, data: invalid });
  }), /CHECK constraint failed/i);
  assert.equal(password(f), fakePassword); assert.deepEqual(sessions(f), ["original"]);
}));

test("06 password-like update and session replacement commit as one operation", async () => withFixture(async f => {
  await f.tx(a => createSession(a, "old"));
  await f.tx(async a => {
    await updatePassword(a, "TEST-new-placeholder");
    await a.deleteMany({ model: "session", where: [{ field: "userId", value: principal }] });
    await delayTurn(); await createSession(a, "replacement");
  });
  assert.equal(password(f), "TEST-new-placeholder"); assert.deepEqual(sessions(f), ["replacement"]);
}));

test("07 failed password-like constraint rolls back an earlier session write", async () => withFixture(async f => {
  await assert.rejects(f.tx(async a => { await createSession(a, "first"); await updatePassword(a, "INVALID-NONTEST"); }), /CHECK constraint failed/i);
  assert.equal(password(f), fakePassword); assert.deepEqual(sessions(f), []);
}));

test("08 deferred foreign-key COMMIT failure rolls back all writes and connection recovers", async () => withFixture(async f => {
  let callbackFinished = false;
  await assert.rejects(f.tx(async a => {
    await updatePassword(a, "TEST-commit-must-fail");
    await createSession(a, "bad-fk", "TEST-missing-principal");
    callbackFinished = true;
  }), /FOREIGN KEY constraint failed/i);
  assert.equal(callbackFinished, true); assert.equal(password(f), fakePassword);
  assert.deepEqual(sessions(f), []); assert.equal(f.native.inTransaction, false);
  await f.tx(a => createSession(a, "after-failure"));
  assert.deepEqual(sessions(f), ["after-failure"]);
}));

test("09 concurrent operations have separate async contexts and rollback ownership", async () => withFixture(async f => {
  const entered = deferred(), release = deferred(), traces = [];
  let firstScope, secondScope, secondEntered = false;
  const first = f.tx(async a => {
    firstScope = a; traces.push("first-enter");
    assert.equal(await getCurrentAdapter(f.adapter), a);
    await createSession(a, "first-rolled-back"); entered.resolve(); await release.promise;
    assert.equal(await getCurrentAdapter(f.adapter), a);
    throw new Error("TEST-first-rolls-back");
  });
  const firstOutcome = first.then(() => ({ ok: true }), error => ({ error }));
  await entered.promise;
  const second = f.tx(async a => {
    secondEntered = true; secondScope = a; traces.push("second-enter");
    assert.notEqual(a, firstScope); assert.equal(await getCurrentAdapter(f.adapter), a);
    await createSession(a, "second-committed");
  });
  try {
    await delayTurn(); await delayTurn();
    assert.equal(secondEntered, false); assert.equal(await getCurrentAdapter(f.adapter), f.adapter);
    assert.deepEqual(sessions(f), []);
  } finally { traces.push("release-first"); release.resolve(); }
  const outcome = await firstOutcome; await second;
  assert.match(outcome.error.message, /TEST-first-rolls-back/);
  assert.notEqual(firstScope, secondScope);
  assert.deepEqual(traces, ["first-enter", "release-first", "second-enter"]);
  assert.deepEqual(sessions(f), ["second-committed"]);
}));

test("10 nested Better Auth transaction joins current context and rolls back with outer failure", async () => withFixture(async f => {
  let outer;
  await assert.rejects(f.tx(async a => {
    outer = a; await createSession(a, "outer");
    await runWithTransaction(f.adapter, async () => {
      assert.equal(await getCurrentAdapter(f.adapter), outer);
      await createSession(await getCurrentAdapter(f.adapter), "inner");
    });
    throw new Error("TEST-outer-failure");
  }), /TEST-outer-failure/);
  assert.deepEqual(sessions(f), []);
}));

test("11 captured transaction adapter expires after commit", async () => withFixture(async f => {
  let captured; await f.tx(async a => { captured = a; await createSession(a, "committed"); });
  await assert.rejects(createSession(captured, "escaped-after-commit"), ended);
  assert.deepEqual(sessions(f), ["committed"]);
}));

test("12 captured transaction adapter expires after rollback", async () => withFixture(async f => {
  let captured;
  await assert.rejects(f.tx(async a => { captured = a; await createSession(a, "rolled-back"); throw new Error("TEST-rollback"); }), /TEST-rollback/);
  await assert.rejects(createSession(captured, "escaped-after-rollback"), ended);
  assert.deepEqual(sessions(f), []);
}));

for (const rollback of [false, true]) {
  test(rollback ? "14 detached async callback cannot write after rollback through inherited context" : "13 detached async callback cannot write after commit through inherited context", async () => withFixture(async f => {
    const startLate = deferred(), lateFinished = deferred(); let captured;
    const operation = f.tx(async a => {
      captured = a;
      setImmediate(async () => {
        try {
          await startLate.promise;
          const inherited = await getCurrentAdapter(f.adapter);
          assert.equal(inherited, captured);
          await createSession(inherited, "escaped-detached");
          lateFinished.resolve({ wrote: true });
        } catch (error) { lateFinished.resolve({ error }); }
      });
      await createSession(a, "normal");
      if (rollback) throw new Error("TEST-detached-rollback");
    });
    if (rollback) await assert.rejects(operation, /TEST-detached-rollback/); else await operation;
    startLate.resolve();
    const outcome = await lateFinished.promise;
    assert.equal(outcome.wrote, undefined); assert.match(outcome.error.message, ended);
    assert.deepEqual(sessions(f), rollback ? [] : ["normal"]);
  }));
}

test("15 ordinary concurrent root-adapter write waits and is not swallowed by another rollback", async () => withFixture(async f => {
  const entered = deferred(), release = deferred();
  const first = f.tx(async a => { await createSession(a, "rolled-back"); entered.resolve(); await release.promise; throw new Error("TEST-owned-rollback"); });
  const outcome = first.then(() => null, e => e);
  await entered.promise;
  let outsideDone = false;
  const independent = createPrincipal(f.adapter, "TEST-independent").then(r => { outsideDone = true; return r; });
  try { await delayTurn(); assert.equal(outsideDone, false); }
  finally { release.resolve(); }
  assert.match((await outcome).message, /TEST-owned-rollback/); await independent;
  assert.equal(f.count("test_principal"), 2); assert.deepEqual(sessions(f), []);
}));

test("16 Better Auth after-commit hooks do not run for rolled-back writes", async () => withFixture(async f => {
  const calls = [];
  await f.tx(async a => { await createSession(a, "one"); await queueAfterTransactionHook(async () => { calls.push("committed"); }); assert.deepEqual(calls, []); });
  await assert.rejects(f.tx(async a => { await createSession(a, "two"); await queueAfterTransactionHook(async () => { calls.push("must-not-run"); }); throw new Error("TEST-hook-rollback"); }), /TEST-hook-rollback/);
  assert.deepEqual(calls, ["committed"]); assert.deepEqual(sessions(f), ["one"]);
}));

test("17 fresh-process reopen preserves committed records and excludes rolled-back changes", async () => {
  const f = await fixture(); let filename;
  try {
    await f.seed(); filename = f.filename;
    await f.tx(a => createSession(a, "persistent"));
    await assert.rejects(f.tx(async a => { await updatePassword(a, "TEST-must-not-persist"); await createSession(a, "discarded"); throw new Error("TEST-persistence-rollback"); }), /TEST-persistence-rollback/);
  } finally { await f.close(); }
  const text = execFileSync(process.execPath, [join(here, "reopen-worker.mjs"), filename], { cwd: here, encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_ENV: "test", BETTER_AUTH_TELEMETRY: "false" } });
  const data = JSON.parse(text);
  assert.deepEqual(data.sessions, ["persistent"]); assert.equal(data.password, fakePassword);
  assert.equal(data.integrity, "ok"); assert.deepEqual(data.foreignKeyErrors, []);
  const reopened = await fixture(filename);
  try { assert.equal((await reopened.adapter.findMany({ model: "session", limit: 10 })).length, 1); await reopened.tx(a => createSession(a, "after-reopen")); assert.deepEqual(sessions(reopened), ["after-reopen", "persistent"]); }
  finally { await reopened.close(); }
});

test("18 existing Part 1 source and prior protected evidence remain byte-identical", () => {
  const file = readdirSync(join(here, "test-results")).filter(n => n.startsWith("preservation-")).sort()[0];
  const data = JSON.parse(readFileSync(join(here, "test-results", file), "utf8"));
  let checked = 0;
  for (const item of data.files) {
    if (!item.sha256) continue;
    assert.equal(createHash("sha256").update(readFileSync(join(root, item.path))).digest("hex"), item.sha256, item.path); checked++;
  }
  assert.ok(checked >= 639);
});
