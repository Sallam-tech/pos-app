# B1b Part 2A - authentication transaction experiment

TEST ONLY. This isolated experiment is not a login system or a production database adapter.

Owner authorization: investigate Better Auth 1.7.18 asynchronous transaction compatibility only.
All new sources, dependencies, cache, disposable databases and evidence stay in this directory.
No application, frontend, B1a, B1b Part 1 or shared project document is modified.

## Result

See [REPORT.md](REPORT.md). The focused transaction experiment passed 18 checks.
Production authentication remains unimplemented and requires separate owner approval.

## Reproduce on the reviewed Windows x64 runtime

Node 24.11.0 / npm 11.6.1. Run from this directory:

1. `node preflight.mjs` checks registry SHA-512 tarball integrity, engines and the reviewed bundled Windows binary, and snapshots protected existing files.
2. `npm ci --ignore-scripts --no-audit --no-fund --cache .npm-cache` installs only this locked dependency graph. No native compilation or system installation is allowed.
3. `npm test` runs the actual official adapter and Better Auth transaction context against fresh TEST SQLite files. A separate process verifies persistence.

Do not run these commands in web/. Never copy this fixture into production.
.npmrc enforces disabled scripts, strict engines, a local cache and disabled audit/fund requests.

## Actual transaction path

`@better-auth/core/context.runWithTransaction`
-> `@better-auth/kysely-adapter` with `transaction: true`
-> Kysely 0.29.0 asynchronous transaction callback
-> better-sqlite3 13.0.3 native SQLite.

The suite uses the official adapter's CRUD methods and real AsyncLocalStorage context.
No adapter, database, transaction or commit/rollback implementation is mocked.
Kysely owns one native connection; callbacks resolve only after all intended writes are awaited.
Its transaction-state guard rejects later operations through captured transaction adapters.

The TEST schema is derived from pinned Better Auth core metadata and renamed test_principal,
test_credential, test_session and test_challenge. Dates use ISO TEXT and booleans INTEGER,
matching this adapter's conversion behavior. Additional CHECKs require TEST token/password
markers and prohibit a real credential provider. Password fields contain unusable placeholders,
not passwords or hashes. No Better Auth login instance, route, cookie or working account exists.

## Evidence and handoff

Every suite creates a new ignored suite-* evidence directory with TAP, stdout, stderr,
source/lock hashes, package/native provenance, verdict and independently parsed counters.
Fresh run-* TEST databases are retained. No cleanup/deletion of prior work is performed.
preflight-* and preservation-* evidence remains alongside them.

This directory is the handoff record for Part 2A because authorization restricts all writes
to this experiment. Shared PROJECT_MEMORY.md and the Part 1 report remain byte-identical.
Whole B1b, production authentication and B2 are not complete or authorized.
