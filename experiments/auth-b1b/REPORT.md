# B1b Part 2A - asynchronous authentication transaction compatibility

9 November 2026, Asia/Karachi. **PASS for the bounded TEST-only transaction experiment.**
This is not approval of production authentication, a protected-token adapter or application integration.
STOP for owner review. Do not start full Part 2 or B2.

## What was verified

Actual Windows x64 / Node 24.11.0 / npm 11.6.1 / ABI 137 / N-API 10.
Pinned Better Auth 1.7.18, @better-auth/core 1.7.18,
@better-auth/kysely-adapter 1.7.18, Kysely 0.29.0, better-sqlite3 13.0.3,
and node-addon-api 8.9.2. Native SQLite 3.53.4.
Native binary SHA256: e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a.

Before installation, direct/core/adapter/native package tarballs were downloaded in memory
and verified against registry SHA-512 integrity; the SQLite integrity also matches the existing
web lockfile. The bundled PE x64 binary matches the previously reviewed native binary.
The resolved 23-package lockfile has registry integrity entries and compatible declared engines.
npm engine-strict remained enabled. npm ci used --ignore-scripts, --no-audit, --no-fund and
the experiment's own .npm-cache. No build tools, system changes or unrelated framework installs.
Better Auth itself requires small adapter packages for other backends transitively; Prisma,
Drizzle ORM, Next.js and other optional backend/framework peers were not installed here.

Inspected the pinned adapter transaction callback signature and implementation, core
runWithTransaction/getCurrentAdapter async context, Kysely connection mutex and state guards,
and the real SQLite driver's begin/commit/rollback behavior. Installed source agrees.

The official exported adapter package is @better-auth/kysely-adapter. An initial fixture
smoke check found that better-auth/adapters/kysely is not an exported subpath in 1.7.18.
Only the new fixture/import and isolated dependency declaration were corrected before tests.
That setup error created no database and is not counted as a transaction test result.

## Safe approach demonstrated, within this scope

Use the real Better Auth adapter with transaction:true and pin Kysely 0.29.0.
Kysely awaits the complete callback promise, retains exclusive ownership of its single
connection, commits on success, rolls back on callback/SQL/COMMIT failure and rejects
queries through completed transaction handles. Better Auth's AsyncLocalStorage supplies
the correct transaction adapter across awaited continuations and nested operations.

This is a different connection owner from the Part 1 synchronous wrapper. No async callback
is passed into that wrapper, and its guards were not changed. This does not authorize
exposing its raw connection or placing two Kysely instances around the same native handle.

All intended database operations must be awaited and use the supplied/current transaction
adapter. The suite does not claim control over arbitrary external side effects, raw native
handles, deliberately independent transactions or unawaited application work. After-commit
external-hook failures cannot undo committed database writes. Keep credential/session security
changes inside the real database transaction, not after-commit hooks.

## Focused verification

Exactly one complete focused experiment suite:
**18 passed / 0 failed / 0 skipped / 0 cancelled / 0 todo.**

1. Exact packages/native binary, actual adapter and WAL/FULL/FK/bounded timeout settings.
2. Awaited asynchronous multi-record commit; independent reader sees no partial/uncommitted state.
3. Exception after first write rolls back.
4. Failure after an event-loop turn rolls back both session and credential writes.
5. Session constraint failure restores the previous placeholder and deleted old session.
6. Successful credential-like update and session replacement commit together.
7. Credential-like CHECK failure rolls back an earlier session write.
8. Deferred foreign-key failure at COMMIT rolls back all writes; next transaction succeeds.
9. Concurrent operations retain separate async adapters and rollback ownership; second waits.
10. Nested Better Auth transaction joins the outer scope and rolls back with it.
11. Captured adapter rejects writes after commit.
12. Captured adapter rejects writes after rollback.
13. Detached callback inheriting Better Auth context cannot write after commit.
14. Detached callback inheriting Better Auth context cannot write after rollback.
15. Independent root-adapter operation waits, then survives another transaction's rollback.
16. Better Auth after-commit hook runs only for committed work.
17. Fresh-process read/reopen preserves committed rows, excludes rollback, passes integrity/FK checks;
    reopened official adapter can transact again.
18. Existing Part 1 sources and prior protected files/evidence match preflight SHA256.

Evidence: test-results/suite-2026-11-09T16-47-27-632Z/{results.tap,stdout.txt,stderr.txt,summary.json}.
The summary records exact tested source/lock hashes and six independent TAP counters.
Additional fixture smoke check succeeded after the import correction; it is not an extra test.
Syntax checks passed for fixture.mjs, transactions.test.mjs, run.mjs and reopen-worker.mjs.
No frontend/browser, full application build or Part 1 suite was rerun.
Part 1's separate existing 30-test evidence remains unchanged, not added to this count.

## Limits and remaining blockers

- Only one owned Kysely connection and one adapter instance per TEST file were exercised.
  Multi-process writer admission, supervised lifecycle, contention between production business/auth
  hosts, busy-retry policy, crash/power-loss and packaged application integration remain unverified.
- Kysely's standard SQLite transaction begins with BEGIN, not Part 1's BEGIN IMMEDIATE.
  Atomicity was verified here, including COMMIT failure; future writer/lock policy needs review.
- Disposable schemas have no roles, real credentials or login. Schema generation here is a TEST
  fixture, not a reviewed production migration. Production STRICT/checksum migration integration,
  exact-two-account enforcement and trigger policy remain separate gates.
- This adapter's ordinary ISO date/boolean conversion was exercised on small nonfinancial fields.
  Full protected-storage schema and BigInt/int64 type mapping were not certified.
- Remaining High blockers: encrypted session/challenge storage with keyed lookup and secret-free
  responses; persistent throttling covering server auth.api calls; genuine Admin/staff cookie-jar
  isolation. Password normalization/strength, session lifetimes, TLS/origin/CSRF/permissions,
  safe credential rotation/recovery and exact-operation grants still require separate design/tests.
- No production connection host or custom auth framework was implemented. Retain Part 1 unchanged;
  separately authorize/review an auth-specific owner for this adapter before real integration.
- Passing this experiment does not demonstrate a working login or accept the whole B1b phase.

## Exact created files

All under experiments/auth-b1b/:

1. .gitignore
2. .npmrc
3. package.json
4. package-lock.json
5. preflight.mjs
6. fixture.mjs
7. transactions.test.mjs
8. reopen-worker.mjs
9. run.mjs
10. README.md
11. REPORT.md

Generated node_modules/, .npm-cache/ and test-results/ are ignored, local and retained.
No existing file outside this directory was modified. Shared memory/checklists remain unchanged
because the owner limited this task's writes to this isolated experiment; this report is its handoff.

## Git and preservation

Started master at 1456ce4df2c6ff7d1c4d61833a019b0cbcee36a1 with six modified tracked files,
23 untracked paths and an empty index. All are preserved. New paths are only this experiment.
No stage, commit, push, reset, clean or stash. The known B1a package ending drift and cloud-plan
formatting drift are untouched. Final preservation evidence is recorded separately in test-results/.
