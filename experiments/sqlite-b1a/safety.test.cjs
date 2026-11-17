'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const {
  ROOT, MIN, MAX, testPath, open, transaction, assertSqliteVersion, int64, add64, schema, records, digest, checkHealth,
} = require('./helpers.cjs');

const RUN = fs.mkdtempSync(path.join(ROOT, 'run-'));
const evidence = { scope: 'B1a disposable TEST only', started: new Date().toISOString(), results: [], runtime: {} };
let nativeReady = false;
function fileFor(name, base = 'test') {
  const dir = path.join(RUN, name);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, base + '.sqlite');
}
function evidenceCounts(results) {
  const count = (status) => results.filter((r) => r.status === status).length;
  return { passed: count('PASS'), failed: count('FAIL'), skipped: count('SKIP'),
    notRun: count('NOT_RUN'), unfinished: count('RUNNING') };
}
function check(name, fn, native = false) {
  const entry = { name, status: 'NOT_RUN' };
  evidence.results.push(entry);
  test(name, async (t) => {
    if (!native && !nativeReady) {
      entry.status = 'SKIP';
      entry.reason = 'Native compatibility gate failed';
      return t.skip(entry.reason);
    }
    entry.status = 'RUNNING';
    const start = performance.now();
    try {
      await fn(entry);
      entry.status = 'PASS';
    } catch (error) {
      entry.status = 'FAIL';
      entry.error = { name: error.name, message: error.message, code: error.code };
      throw error;
    } finally { entry.elapsedMs = Math.round(performance.now() - start); }
  });
}
test.after(() => {
  evidence.finished = new Date().toISOString();
  Object.assign(evidence, evidenceCounts(evidence.results));
  evidence.cancelled = null;
  evidence.countingNotes = 'Wrapper cannot reliably count runner cancellations; use Node runner summary. NOT_RUN means body unentered (including name filtering); RUNNING means unfinished at snapshot.';
  evidence.sourceSha256 = Object.fromEntries(['helpers.cjs', 'worker.cjs', 'safety.test.cjs']
    .map((name) => [name, digest(path.join(__dirname, name))]));
  const output = path.join(RUN, 'evidence.json');
  fs.writeFileSync(output, JSON.stringify(evidence, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
  console.log('TEST evidence: ' + path.relative(__dirname, output));
});

// IPC messages are buffered to avoid a ready/exit race; all waits are bounded.
function worker(mode, file, key = '', fingerprint = '') {
  const child = fork(path.join(__dirname, 'worker.cjs'), [mode, testPath(file), key, fingerprint], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const messages = [];
  let exited = false;
  let exitInfo;
  let stderr = '';
  let spawnError;
  child.stderr.on('data', (data) => { stderr += data.toString(); });
  child.stdout.resume();
  child.on('message', (message) => messages.push(message));
  child.on('error', (error) => { spawnError = error; });
  const ended = new Promise((resolve) => {
    child.once('exit', (code, signal) => { exited = true; exitInfo = { code, signal }; resolve(exitInfo); });
  });
  async function until(predicate) {
    const deadline = performance.now() + 8000;
    while (performance.now() < deadline) {
      if (spawnError) throw spawnError;
      const error = messages.find((m) => m.phase === 'error');
      if (error) throw new Error('TEST worker: ' + JSON.stringify(error));
      const found = messages.find(predicate);
      if (found) return found;
      if (exited) throw new Error('TEST worker exited early: ' + JSON.stringify(exitInfo) + stderr);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('TEST worker timed out' + stderr);
  }
  async function finish(force = false) {
    if (force && !exited) child.kill('SIGKILL');
    let timer;
    try {
      return await Promise.race([ended, new Promise((_, reject) => {
        timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('TEST worker exit timeout')); }, 8000);
      })]);
    } finally { clearTimeout(timer); }
  }
  return { child, messages, until, finish };
}

check('01 native Windows x64, runtime, compile options and WAL-fix gate', (entry) => {
  assert.equal(process.platform, 'win32');
  assert.equal(process.arch, 'x64');
  assert.match(process.version, /^v24\./);
  assert.equal(require('better-sqlite3/package.json').version, '13.0.3');
  const binary = path.join(__dirname, 'node_modules/better-sqlite3/prebuilds/win32-x64.node');
  const pe = fs.readFileSync(binary);
  const header = pe.readUInt32LE(0x3c);
  assert.equal(pe.toString('ascii', header, header + 4), 'PE\u0000\u0000');
  assert.equal(pe.readUInt16LE(header + 4), 0x8664);
  const db = open(fileFor('01-runtime'));
  try {
    const runtime = db.prepare('SELECT sqlite_version() AS version, sqlite_source_id() AS source').get();
    assertSqliteVersion(runtime.version);
    const options = db.pragma('compile_options').map((r) => r.compile_options);
    assert.ok(!options.includes('OMIT_FOREIGN_KEY'));
    assert.ok(!options.includes('OMIT_TRIGGER'));
    assert.ok(options.some((x) => /^THREADSAFE=[12]$/.test(x)));
    db.exec('CREATE TABLE test_feature (value INTEGER NOT NULL) STRICT');
    assert.deepEqual(db.prepare('INSERT INTO test_feature VALUES (?) RETURNING value').get(7n), { value: 7n });
    assert.equal(db.prepare("SELECT json_valid(?) AS valid").get('{"test":1}').valid, 1n);
    evidence.runtime = {
      node: process.version, npm: process.env.npm_config_user_agent?.match(/npm\/([^\s]+)/)?.[1] ?? 'not launched through npm',
      platform: process.platform, architecture: process.arch, abi: process.versions.modules, napi: process.versions.napi,
      driver: require('better-sqlite3/package.json').version, sqlite: runtime.version, sourceId: runtime.source,
      compileOptions: options, prebuiltSha256: digest(binary), peMachine: '0x8664',
    };
    entry.features = ['STRICT', 'RETURNING', 'JSON', 'actual native open'];
    nativeReady = true;
  } finally { db.close(); }
}, true);

check('02 independent connections apply WAL, FULL, foreign keys and busy timeout', (entry) => {
  const file = fileFor('02-settings');
  const a = open(file, { timeout: 125 });
  const b = open(file, { mustExist: true, timeout: 125 });
  try {
    const settings = [a, b].map((db) => ({
      journal: db.pragma('journal_mode', { simple: true }),
      synchronous: db.pragma('synchronous', { simple: true }),
      foreignKeys: db.pragma('foreign_keys', { simple: true }),
      timeout: db.pragma('busy_timeout', { simple: true }),
    }));
    for (const value of settings) assert.deepEqual(value, { journal: 'wal', synchronous: 2n, foreignKeys: 1n, timeout: 125n });
    entry.settings = settings;
  } finally { b.close(); a.close(); }
});

check('03 STRICT, foreign key, CHECK and UNIQUE rejection leave valid records', () => {
  const db = open(fileFor('03-constraints'));
  try {
    schema(db);
    db.prepare('INSERT INTO test_parent VALUES (?, ?, ?)').run('p', 'unique', 2n);
    assert.throws(() => db.prepare('INSERT INTO test_child VALUES (?, ?, ?)').run('c', 'missing', 1n), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
    assert.throws(() => db.prepare('INSERT INTO test_child VALUES (?, ?, ?)').run('c', 'p', 0n), { code: 'SQLITE_CONSTRAINT_CHECK' });
    assert.throws(() => db.prepare('INSERT INTO test_parent VALUES (?, ?, ?)').run('other', 'unique', 1n), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    assert.throws(() => db.prepare('INSERT INTO test_parent VALUES (?, ?, ?)').run('wrong', 'wrong', 'not-an-integer'), { code: 'SQLITE_CONSTRAINT_DATATYPE' });
    assert.deepEqual(records(db), { parent: [{ id: 'p', label: 'unique', value: 2n }], child: [] });
    checkHealth(db, assert);
  } finally { db.close(); }
});

check('04 BEGIN IMMEDIATE multi-record failure rolls back every effect', () => {
  const db = open(fileFor('04-rollback'));
  try {
    schema(db);
    assert.throws(() => transaction(db, () => {
      assert.equal(db.inTransaction, true);
      db.prepare('INSERT INTO test_parent VALUES (?, ?, ?)').run('p', 'first', 1n);
      db.prepare('INSERT INTO test_child VALUES (?, ?, ?)').run('c', 'p', 2n);
      db.prepare('INSERT INTO test_parent VALUES (?, ?, ?)').run('second', 'first', 5n);
    }), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
    assert.equal(db.inTransaction, false);
    assert.deepEqual(records(db), { parent: [], child: [] });
  } finally { db.close(); }
});

check('05 successful multi-record commit survives close and reopen', () => {
  const file = fileFor('05-reopen');
  let db = open(file);
  const expected = { parent: [{ id: 'p', label: 'persisted', value: 9007199254740993n }], child: [{ id: 'c', parent_id: 'p', magnitude: 2n }] };
  try {
    schema(db);
    transaction(db, () => {
      db.prepare('INSERT INTO test_parent VALUES (?, ?, ?)').run('p', 'persisted', 9007199254740993n);
      db.prepare('INSERT INTO test_child VALUES (?, ?, ?)').run('c', 'p', 2n);
    });
    db.close();
    db = open(file, { mustExist: true });
    assert.deepEqual(records(db), expected);
    checkHealth(db, assert);
  } finally { if (db.open) db.close(); }
});

check('06 int64 BigInt boundaries, unsafe conversion and overflow safeguards', (entry) => {
  const db = open(fileFor('06-integers'));
  try {
    db.exec('CREATE TABLE test_int (id TEXT PRIMARY KEY, value INTEGER NOT NULL) STRICT');
    const insert = db.prepare('INSERT INTO test_int VALUES (?, ?)');
    const values = [MIN, MIN + 1n, -9007199254740993n, 9007199254740993n, MAX - 1n, MAX];
    values.forEach((value, i) => insert.run(String(i), int64(value)));
    assert.deepEqual(db.prepare('SELECT value FROM test_int ORDER BY id').all().map((r) => r.value), values);
    for (const bad of [MAX + 1n, MIN - 1n]) {
      assert.throws(() => insert.run('overflow', bad), RangeError);
      assert.throws(() => int64(bad), RangeError);
    }
    for (const bad of [1, Number(MAX), Number(9007199254740993n), '9223372036854775807']) {
      assert.throws(() => int64(bad), TypeError);
    }
    assert.throws(() => add64(MAX, 1n), RangeError);
    assert.throws(() => add64(MIN, -1n), RangeError);
    assert.equal(add64(MAX - 1n, 1n), MAX);
    assert.throws(() => db.prepare('UPDATE test_int SET value = value + 1 WHERE id = ?').run('5'), { code: 'SQLITE_CONSTRAINT_DATATYPE' });
    assert.equal(db.prepare('SELECT value FROM test_int WHERE id = ?').get('5').value, MAX);
    assert.throws(() => db.prepare('SELECT SUM(value) AS total FROM test_int WHERE id IN (?, ?)').get('4', '5'), /integer overflow/);
    // Raw SQLite expression overflow promotes to REAL; STRICT storage and checked BigInt arithmetic are required.
    assert.equal(db.prepare("SELECT typeof(value + 1) AS kind FROM test_int WHERE id = ?").get('5').kind, 'real');
    const lossy = db.prepare('SELECT value FROM test_int WHERE id = ?').safeIntegers(false).get('5').value;
    assert.equal(Number.isSafeInteger(lossy), false);
    assert.notEqual(BigInt(lossy), MAX);
    entry.knownRawLimits = {
      rawReadWithoutSafeIntegers: String(lossy),
      exactValue: MAX.toString(),
      uncheckedExpressionOverflow: 'REAL (observed); STRICT INTEGER write rejected',
      requiredProtocol: 'BigInt reads/bindings, reject Number input, range-checked arithmetic, STRICT columns',
    };
  } finally { db.close(); }
});

check('07 bound SQL stores hostile-looking text literally', () => {
  const db = open(fileFor('07-parameters'));
  try {
    schema(db);
    const label = "x'); DROP TABLE test_parent; --";
    db.prepare('INSERT INTO test_parent VALUES (?, ?, ?)').run('p', label, 1n);
    assert.deepEqual(db.prepare('SELECT label FROM test_parent WHERE id = ?').get('p'), { label });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM test_parent WHERE id = ?').get("' OR 1=1 --").n, 0n);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM test_parent').get().n, 1n);
  } finally { db.close(); }
});

check('08 one writer, WAL readers, bounded SQLITE_BUSY and no lost update', (entry) => {
  const file = fileFor('08-lock');
  const a = open(file, { timeout: 125 });
  a.exec('CREATE TABLE test_counter (value INTEGER NOT NULL) STRICT; INSERT INTO test_counter VALUES (0)');
  const b = open(file, { mustExist: true, timeout: 125 });
  try {
    a.exec('BEGIN IMMEDIATE; UPDATE test_counter SET value = value + 1');
    assert.equal(b.prepare('SELECT value FROM test_counter').get().value, 0n);
    const start = performance.now();
    assert.throws(() => b.exec('BEGIN IMMEDIATE'), { code: 'SQLITE_BUSY' });
    const waited = performance.now() - start;
    assert.ok(waited >= 80 && waited < 2000, 'busy wait bounded: ' + waited);
    assert.equal(b.inTransaction, false);
    a.exec('COMMIT');
    transaction(b, () => b.exec('UPDATE test_counter SET value = value + 1'));
    assert.equal(a.prepare('SELECT value FROM test_counter').get().value, 2n);
    entry.busyWaitMs = Math.round(waited);
    entry.finalValue = 2n;
  } finally {
    if (a.inTransaction) a.exec('ROLLBACK');
    if (b.inTransaction) b.exec('ROLLBACK');
    b.close(); a.close();
  }
});

check('09 separate processes: duplicate key once, distinct keys without lost updates', async (entry) => {
  const file = fileFor('09-process-writers');
  const db = open(file);
  try {
    db.exec("CREATE TABLE test_counter (id TEXT PRIMARY KEY, value INTEGER NOT NULL) STRICT; INSERT INTO test_counter VALUES ('only', 0);" +
      'CREATE TABLE test_once (request_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL) STRICT');
    const rounds = [];
    for (const keys of [['same', 'same'], ['a', 'b']]) {
      const workers = keys.map((key) => worker('once', file, key, 'same-test-intent'));
      try {
        await Promise.all(workers.map((w) => w.until((m) => m.phase === 'ready')));
        workers.forEach((w) => w.child.send('go'));
        const result = await Promise.all(workers.map((w) => w.until((m) => m.phase === 'committed')));
        const exits = await Promise.all(workers.map((w) => w.finish()));
        exits.forEach((x) => assert.equal(x.code, 0));
        rounds.push(result.map((x) => x.outcome).sort());
      } finally { await Promise.all(workers.map((w) => w.finish(true))); }
    }
    assert.deepEqual(rounds, [['applied', 'replayed'], ['applied', 'applied']]);
    assert.equal(db.prepare('SELECT value FROM test_counter WHERE id = ?').get('only').value, 3n);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM test_once').get().n, 3n);
    const conflict = worker('once', file, 'same', 'different-test-intent');
    try {
      await conflict.until((m) => m.phase === 'ready');
      conflict.child.send('go');
      await assert.rejects(conflict.until((m) => m.phase === 'committed'), /idempotency conflict/);
    } finally { await conflict.finish(true); }
    assert.equal(db.prepare('SELECT value FROM test_counter WHERE id = ?').get('only').value, 3n);
    entry.roundOutcomes = rounds;
    entry.conflictingReuse = 'rejected; value unchanged';
  } finally { db.close(); }
});

for (const mode of ['before', 'after']) {
  check((mode === 'before' ? '10' : '11') + ' forced termination ' + mode + ' commit and restart', async (entry) => {
    const file = fileFor('crash-' + mode);
    let db = open(file);
    db.exec('CREATE TABLE test_crash (id TEXT PRIMARY KEY, payload BLOB NOT NULL) STRICT');
    db.close();
    const w = worker(mode, file);
    try {
      await w.until((m) => m.phase === 'ready');
      w.child.send('go');
      const signal = await w.until((m) => m.phase === (mode === 'before' ? 'uncommitted' : 'committed'));
      assert.equal(signal.inTransaction, mode === 'before');
      assert.ok(signal.walBytes > 0, 'must exercise actual WAL, not a closed connection');
      if (mode === 'before') {
        assert.equal(w.messages.some((m) => m.phase === 'committed'), false);
        const observer = open(file, { mustExist: true, readonly: true });
        try { assert.equal(observer.prepare('SELECT COUNT(*) AS n FROM test_crash').get().n, 0n); }
        finally { observer.close(); }
      }
      entry.handshake = signal;
      entry.termination = await w.finish(true);
      // Observed contract on this harness's gated Windows x64 / Node 24 target only.
      assert.equal(process.platform, 'win32');
      assert.deepEqual(entry.termination, { code: null, signal: 'SIGKILL' });
      db = open(file, { mustExist: true });
      const rows = db.prepare('SELECT * FROM test_crash ORDER BY id').all();
      if (mode === 'before') assert.deepEqual(rows, []);
      else {
        assert.deepEqual(rows.map((r) => r.id), ['first', 'second']);
        assert.deepEqual(rows[0].payload, Buffer.alloc(65536, 0x41));
        assert.deepEqual(rows[1].payload, Buffer.alloc(65536, 0x42));
      }
      checkHealth(db, assert);
      entry.recoveredRecords = rows.length;
    } finally { await w.finish(true); if (db.open) db.close(); }
  });
}

check('12 live WAL backup API, second-database restore and exact verification', async (entry) => {
  const file = fileFor('12-backup', 'source');
  const db = open(file);
  let restored;
  let snapshot;
  try {
    schema(db);
    db.pragma('wal_autocheckpoint = 0');
    transaction(db, () => {
      db.prepare('INSERT INTO test_parent VALUES (?, ?, ?)').run('p', 'snapshot', MAX);
      db.prepare('INSERT INTO test_child VALUES (?, ?, ?)').run('c', 'p', 9007199254740993n);
    });
    const expected = records(db);
    const walBytes = fs.statSync(file + '-wal').size;
    assert.ok(walBytes > 0);
    const candidate = testPath(path.join(path.dirname(file), 'candidate.sqlite'));
    const good = testPath(path.join(path.dirname(file), 'snapshot-good.sqlite'));
    const restore = testPath(path.join(path.dirname(file), 'restored.sqlite'));
    const result = await db.backup(candidate);
    snapshot = open(candidate, { mustExist: true, readonly: true });
    checkHealth(snapshot, assert);
    assert.deepEqual(records(snapshot), expected);
    snapshot.close();
    assert.equal(fs.existsSync(good), false);
    fs.renameSync(candidate, good); // Publish only this fresh, verified TEST candidate.
    snapshot = open(good, { mustExist: true, readonly: true });
    await snapshot.backup(restore); // Restore via SQLite backup API, no live main-file copy.
    restored = open(restore, { mustExist: true });
    checkHealth(restored, assert);
    assert.deepEqual(records(restored), expected);
    db.prepare('INSERT INTO test_parent VALUES (?, ?, ?)').run('later', 'after-snapshot', 3n);
    assert.deepEqual(records(restored), expected);
    entry.walBytes = walBytes;
    entry.backupPages = result;
    entry.exactRecords = expected;
    entry.snapshotSha256 = digest(good);
  } finally {
    if (restored?.open) restored.close();
    if (snapshot?.open) snapshot.close();
    db.close();
  }
});

check('13 interrupted/failed new candidate preserves last verified backup', async (entry) => {
  const file = fileFor('13-backup-failure', 'source');
  const db = open(file);
  try {
    db.exec('CREATE TABLE test_blob (id INTEGER PRIMARY KEY, payload BLOB NOT NULL) STRICT');
    transaction(db, () => {
      const put = db.prepare('INSERT INTO test_blob VALUES (?, ?)');
      for (let i = 1n; i <= 12n; i++) put.run(i, Buffer.alloc(65536, Number(i)));
    });
    const good = testPath(path.join(path.dirname(file), 'last-good.sqlite'));
    await db.backup(good);
    const expected = db.prepare('SELECT id, payload FROM test_blob ORDER BY id').all();
    const initial = open(good, { mustExist: true, readonly: true });
    try {
      checkHealth(initial, assert);
      assert.deepEqual(initial.prepare('SELECT id, payload FROM test_blob ORDER BY id').all(), expected);
    } finally { initial.close(); }
    const before = digest(good);
    const candidate = testPath(path.join(path.dirname(file), 'cancelled-candidate.sqlite'));
    assert.equal(fs.existsSync(candidate), false, 'pinned driver cleanup applies to a NEW target');
    const progress = [];
    let eligibleForPublication = false;
    await assert.rejects(db.backup(candidate, { progress(info) {
      progress.push({ ...info });
      assert.ok(info.remainingPages > 0);
      if (progress.length === 1) return 1;
      // Source is deliberately quiescent here. No monotonicity promise under concurrent mutations.
      assert.equal(info.totalPages, progress[0].totalPages);
      assert.ok(info.remainingPages < progress[0].remainingPages, 'must transfer a page before cancellation');
      throw new Error('controlled TEST backup cancellation');
    } }).then(() => { eligibleForPublication = true; }), /controlled TEST backup cancellation/);
    assert.equal(progress.length, 2);
    assert.equal(eligibleForPublication, false, 'rejected candidate cannot enter successful publication path');
    // Pinned v13.0.3 CloseHandles removes a newly-created incomplete target on clean cancellation.
    assert.equal(fs.existsSync(candidate), false, 'cleanly cancelled NEW target must be removed');
    assert.throws(() => open(candidate, { mustExist: true, readonly: true }), { code: 'SQLITE_CANTOPEN' });
    const missing = path.join(path.dirname(file), 'not-created', 'candidate.sqlite');
    await assert.rejects(db.backup(missing), {
      name: 'TypeError', message: 'Cannot save backup because the directory does not exist',
    });
    assert.equal(digest(good), before);
    const verified = open(good, { mustExist: true, readonly: true });
    try {
      checkHealth(verified, assert);
      assert.deepEqual(verified.prepare('SELECT id, payload FROM test_blob ORDER BY id').all(), expected);
    } finally { verified.close(); }
    entry.progressCallbacks = progress.length;
    entry.progress = progress;
    entry.eligibleForPublication = eligibleForPublication;
    entry.lastGoodSha256BeforeAndAfter = before;
    entry.failedCandidateExists = fs.existsSync(candidate);
    entry.protocol = 'Fresh candidate only; never supply last-good path to a replacement backup';
  } finally { db.close(); }
});

check('14 harness rejects paths outside its disposable TEST area', () => {
  assert.throws(() => testPath(path.join(__dirname, 'production.sqlite')), /Only isolated/);
  assert.throws(() => testPath(path.join(RUN, 'not-a-database.txt')), /Only isolated/);
  assert.throws(() => int64(9007199254740992), TypeError);
  assert.throws(() => testPath(path.join(ROOT, '..', 'test-results-escape', 'test.sqlite')), /Only isolated/);
  assert.throws(() => testPath(path.join(RUN, '..', '..', 'escape.sqlite')), /Only isolated/);
});

check('15 version policy rejects withdrawn, older and unreviewed future runtimes', () => {
  assert.equal(assertSqliteVersion('3.53.4'), '3.53.4');
  assert.throws(() => assertSqliteVersion('3.51.2'), /WAL-fix minimum/);
  assert.throws(() => assertSqliteVersion('3.50.7'), /WAL-fix minimum/); // Backport not reviewed here.
  assert.throws(() => assertSqliteVersion('3.52.0'), /Withdrawn/);
  assert.throws(() => assertSqliteVersion('3.51.3'), /Unreviewed/); // Minimum alone is not approval.
  for (const future of ['3.53.5', '3.54.1', '4.0.0']) {
    assert.throws(() => assertSqliteVersion(future), /Unreviewed/);
  }
  for (const invalid of ['3.53.4-custom', '3.53', '', null]) {
    assert.throws(() => assertSqliteVersion(invalid), TypeError);
  }
});

check('16 recognized async callbacks never enter or leave late writes', async (entry) => {
  const db = open(fileFor('16-async-rejection'));
  let entered = 0;
  try {
    db.exec('CREATE TABLE test_async (value INTEGER NOT NULL) STRICT');
    const callback = async () => {
      entered++;
      db.prepare('INSERT INTO test_async VALUES (?)').run(1n);
      await Promise.resolve();
      db.prepare('INSERT INTO test_async VALUES (?)').run(2n);
    };
    assert.throws(() => transaction(db, callback), {
      name: 'TypeError', message: 'Recognized async/generator callback is forbidden before BEGIN',
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(entered, 0);
    assert.equal(db.inTransaction, false);
    assert.deepEqual(db.prepare('SELECT * FROM test_async').all(), []);
    // Post-call thenable rejection still rolls back synchronous effects; it cannot undo scheduled work.
    assert.throws(() => transaction(db, () => {
      db.prepare('INSERT INTO test_async VALUES (?)').run(3n);
      return { then() {} };
    }), /Synchronous TEST transaction required/);
    assert.deepEqual(db.prepare('SELECT * FROM test_async').all(), []);
    entry.recognizedCallbackEntered = entered;
    entry.recordsAfterEventLoopTurn = 0;
  } finally { db.close(); }
});

check('17 worker disconnect closes uncommitted TEST connection and exits', async (entry) => {
  const file = fileFor('17-disconnect');
  let db = open(file);
  db.exec('CREATE TABLE test_crash (id TEXT PRIMARY KEY, payload BLOB NOT NULL) STRICT');
  db.close();
  const w = worker('before', file);
  try {
    await w.until((m) => m.phase === 'ready');
    w.child.send('go');
    await w.until((m) => m.phase === 'uncommitted');
    w.child.disconnect();
    entry.exit = await w.finish();
    assert.deepEqual(entry.exit, { code: 1, signal: null });
    db = open(file, { mustExist: true });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM test_crash').get().n, 0n);
    checkHealth(db, assert);
  } finally { await w.finish(true); if (db.open) db.close(); }
});

check('18 evidence counters distinguish pass, fail, skip and unentered states', () => {
  const synthetic = ['PASS', 'FAIL', 'SKIP', 'NOT_RUN', 'RUNNING', 'PASS'].map((status) => ({ status }));
  assert.deepEqual(evidenceCounts(synthetic), { passed: 2, failed: 1, skipped: 1, notRun: 1, unfinished: 1 });
  assert.deepEqual(evidenceCounts([]), { passed: 0, failed: 0, skipped: 0, notRun: 0, unfinished: 0 });
});
