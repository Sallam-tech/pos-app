'use strict';
// TEST infrastructure only. Never point this harness at shop/application data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { types } = require('node:util');

// Trusted local workspace only: these pathname checks are not a security sandbox.
const ROOT = path.resolve(__dirname, 'test-results');
if (path.relative(__dirname, fs.realpathSync(__dirname)) !== '') {
  throw new Error('Redirected TEST experiment directory is not permitted');
}
if (fs.lstatSync(ROOT, { throwIfNoEntry: false })?.isSymbolicLink()) {
  throw new Error('Redirected TEST root is not permitted');
}
fs.mkdirSync(ROOT, { recursive: true });
const REAL_ROOT = fs.realpathSync(ROOT);
if (path.relative(ROOT, REAL_ROOT) !== '') throw new Error('Redirected TEST root is not permitted');
const MIN = -(1n << 63n);
const MAX = (1n << 63n) - 1n;

function within(root, value) {
  const rel = path.relative(root, value);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}
function testPath(file) {
  const target = path.resolve(file);
  if (!within(ROOT, target) || path.extname(target) !== '.sqlite') {
    throw new Error('Only isolated test-results/*.sqlite paths are permitted');
  }
  const realParent = fs.realpathSync(path.dirname(target));
  if (!within(REAL_ROOT, realParent)) throw new Error('TEST parent escaped experiment');
  const entry = fs.lstatSync(target, { throwIfNoEntry: false });
  if (entry?.isSymbolicLink()) throw new Error('TEST database symlinks are not permitted');
  if (entry && !within(REAL_ROOT, fs.realpathSync(target))) {
    throw new Error('TEST file escaped experiment');
  }
  return target;
}
function open(file, options = {}) {
  const target = testPath(file);
  const db = new Database(target, {
    timeout: options.timeout ?? 1000,
    readonly: options.readonly ?? false,
    fileMustExist: options.mustExist ?? false,
  });
  try {
    db.defaultSafeIntegers(true);
    db.pragma('foreign_keys = ON');
    if (!options.readonly) db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('busy_timeout = ' + (options.timeout ?? 1000));
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
// TEST-only, trusted synchronous callbacks. Never copy unchanged into production.
// A normal function can hide deferred work/thenables; no runtime check can undo it.
function transaction(db, fn) {
  if (typeof fn !== 'function') throw new TypeError('Synchronous TEST callback required');
  if (types.isAsyncFunction(fn) || types.isGeneratorFunction(fn)) {
    throw new TypeError('Recognized async/generator callback is forbidden before BEGIN');
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = fn();
    if (value && typeof value.then === 'function') throw new Error('Synchronous TEST transaction required');
    db.exec('COMMIT');
    return value;
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
// Explicitly reviewed TEST runtime, not an open-ended numerical safety promise.
function assertSqliteVersion(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new TypeError('Expected an exact SQLite release version');
  }
  const [major, minor, patch] = version.split('.').map(Number);
  if (!(major > 3 || (major === 3 && (minor > 51 || (minor === 51 && patch >= 3))))) {
    throw new Error('SQLite WAL-fix minimum is 3.51.3; no unverified backport');
  }
  if (version === '3.52.0') throw new Error('Withdrawn SQLite 3.52.0 is forbidden');
  if (version !== '3.53.4') throw new Error('Unreviewed SQLite release; explicit compatibility review required');
  return version;
}
function int64(value) {
  if (typeof value !== 'bigint') throw new TypeError('BigInt required; Number conversion is forbidden');
  if (value < MIN || value > MAX) throw new RangeError('Signed int64 overflow');
  return value;
}
function add64(a, b) { return int64(int64(a) + int64(b)); }
function schema(db) {
  db.exec(
    'CREATE TABLE test_parent (id TEXT PRIMARY KEY, label TEXT NOT NULL UNIQUE, value INTEGER NOT NULL CHECK(value >= 0)) STRICT;' +
    'CREATE TABLE test_child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES test_parent(id), magnitude INTEGER NOT NULL CHECK(magnitude > 0)) STRICT;'
  );
}
function records(db) {
  return {
    parent: db.prepare('SELECT * FROM test_parent ORDER BY id').all(),
    child: db.prepare('SELECT * FROM test_child ORDER BY id').all(),
  };
}
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function checkHealth(db, assert) {
  assert.deepEqual(db.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
}
module.exports = { ROOT, MIN, MAX, testPath, open, transaction, assertSqliteVersion, int64, add64, schema, records, digest, checkHealth };
