'use strict';
const fs = require('node:fs');
const { open, transaction } = require('./helpers.cjs');
const [mode, file, key, fingerprint] = process.argv.slice(2);
let db;
let stopping = false;
// Small TEST safeguard, not production supervision; synchronous native I/O can delay timers.
const deadline = setTimeout(() => fail(new Error('TEST worker lifetime exceeded 12 seconds')), 12000);
function stop(code) {
  if (stopping) return;
  stopping = true;
  clearTimeout(deadline);
  try { if (db?.open) db.close(); }
  catch { code = 1; }
  process.exitCode = code;
  if (process.connected) process.disconnect();
}
function send(value) {
  if (process.connected) process.send(value, (error) => { if (error) stop(1); });
}
function fail(error) {
  send({ phase: 'error', message: error.message, code: error.code });
  stop(1);
}
process.once('disconnect', () => stop(1));
try {
  if (!['once', 'before', 'after'].includes(mode)) throw new Error('Unknown TEST worker mode');
  db = open(file, { mustExist: true, timeout: 2000 });
  if (mode !== 'once') {
    db.pragma('cache_size = 8');
    db.pragma('cache_spill = ON');
    db.pragma('wal_autocheckpoint = 0');
  }
  send({ phase: 'ready', pid: process.pid });
  process.once('message', (message) => {
    if (message !== 'go') return fail(new Error('Unknown TEST message'));
    try {
      if (mode === 'once') {
        const outcome = transaction(db, () => {
          const previous = db.prepare('SELECT fingerprint FROM test_once WHERE request_key = ?').get(key);
          if (previous) {
            if (previous.fingerprint !== fingerprint) throw new Error('TEST idempotency conflict');
            return 'replayed';
          }
          db.prepare('INSERT INTO test_once VALUES (?, ?)').run(key, fingerprint);
          db.prepare('UPDATE test_counter SET value = value + 1 WHERE id = ?').run('only');
          return 'applied';
        });
        send({ phase: 'committed', outcome });
        stop(0);
      } else {
        db.exec('BEGIN IMMEDIATE');
        const insert = db.prepare('INSERT INTO test_crash VALUES (?, ?)');
        insert.run('first', Buffer.alloc(65536, 0x41));
        insert.run('second', Buffer.alloc(65536, 0x42));
        if (mode === 'after') db.exec('COMMIT');
        const wal = file + '-wal';
        send({
          phase: mode === 'after' ? 'committed' : 'uncommitted',
          inTransaction: db.inTransaction,
          walBytes: fs.existsSync(wal) ? fs.statSync(wal).size : 0,
        });
        // Leave connection open until forced kill, IPC disconnect or TEST deadline.
      }
    } catch (error) { fail(error); }
  });
} catch (error) { fail(error); }
