# B1b Part 1 - safe SQLite foundation

9 November 2026, Asia/Karachi. **Audit findings corrected and verified: 30 passing Part 1 tests. Ready for owner review/acceptance of Part 1 only; approval pending and whole B1b remains incomplete.**

## Implemented

- Server-only SQLite module inside the existing Next.js app; no eager database open, route, public API, frontend import or shop data. Next's existing server-only marker support and automatic better-sqlite3 externalization require no frontend configuration changes or extra package.
- Explicit configured directory/filename and creation opt-in. Existing directory required; TEST mode restricted to isolated test-results subdirectories under NODE_ENV=test. Persistent paths restricted to dedicated local Windows application-data locations, rejecting source/installation/temp/known cloud/public/build directories, junctions/symlinks, hard links and redirected sidecars. No persistent database created.
- Parameterized positional SQL, BigInt-only signed-int64 binding/reads, checked integer addition, rejection of Number bindings and REAL query results; no financial or business calculations. Every connection verifies SQLite provenance, quick/FK checks, WAL, FULL, foreign keys and bounded busy timeout (default/max 5,000 ms).
- Short explicit BEGIN IMMEDIATE transactions; rollback on statement/callback/COMMIT failure; no nested scopes/configuration escapes. Async/generator callbacks reject before entry; actual promises, callable thenables/iterators and generator objects roll back while harmless non-callable then/next fields are accepted. Captured transaction scopes expire. Close is explicit/idempotent, with safe error codes and no automatic file replacement or retry.
- Explicit maintenance migrations: contiguous numbered files, exact-byte SHA-256, ordered immutable history and matching user_version, atomic pending batch/history/version, integrity/FK checks, rejection of changed/unknown/newer/incomplete/untracked history. SQL text only classifies one additive table/index statement. Each new table is checked inside the transaction against pragma_table_list for its exact main-schema name, type=table and strict=1 before history is recorded. Misleading comments cannot substitute for metadata. Production migration directory contains README only. Numbered TEST fixtures create two tiny non-business tables and one index.

## Original implementation file manifest

Created:

1. web/src/server/db/connection.ts
2. web/src/server/db/errors.ts
3. web/src/server/db/integers.ts
4. web/src/server/db/location.ts
5. web/src/server/db/migrate.ts
6. web/src/server/db/migrations/README.md
7. web/tests/fixtures/sqlite-b1b/migrations/0001_test_parent.sql
8. web/tests/fixtures/sqlite-b1b/migrations/0002_test_child.sql
9. web/tests/fixtures/sqlite-b1b/migrations/0003_test_index.sql
10. web/tests/integration/sqlite-foundation.test.ts
11. web/tsconfig.sqlite.json
12. web/vitest.sqlite.config.mts
13. docs/development/SQLITE_B1B_PART1_FOUNDATION_REPORT.md

Modified by this task:

1. web/package.json - exact SQLite dependency plus test:sqlite script.
2. web/package-lock.json - only better-sqlite3 and node-addon-api entries added; all existing entries unchanged.
3. docs/PROJECT_MEMORY.md - scoped implementation/evidence/remaining gates.
4. docs/MODULE_CHECKLIST.md - Part 1 implementation verified; independent acceptance/Part 2/whole B1b remain unchecked.

Existing docs/IMPLEMENTATION_PLAN.md, untracked architecture/B1a report and all B1a experiment files/evidence are preserved. No frontend, styles, demo fixtures, original source documents or architecture files edited. Generated TEST files/cache/results are ignored and retained, never real shop data.

## Dependency and native checks

- better-sqlite3 **13.0.3**; required node-addon-api **8.9.2**; no other dependency-graph changes or upgrades.
- Windows x64, Node **24.11.0**, npm **11.6.1**, ABI 137 / N-API 10; embedded SQLite **3.53.4**.
- Pre-install in-memory probe verified the PE 8664 prebuilt loads and registry integrity matches the B1a lock. Installation used --ignore-scripts --no-audit --no-fund and a fresh ignored cache; no native compilation, build tools or Windows configuration changes. npm reported 99 materialized on-disk packages; the lockfile diff adds exactly the two packages above, with no existing entry changes.
- Installed prebuilt SHA256: e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a. SQLite source ID: 2026-07-24 19:02:57 bf7c7f30031888f4e796e429ab3978879485813aaca6f641c7b33e4e09459bcc. Both match B1a. Runtime guard rejects unreviewed driver/SQLite versions.
- Consulted installed Next 16.4.3 server/client and external-package guidance plus the [pinned driver API](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/docs/api.md), [SQLite transactions](https://sqlite.org/lang_transaction.html) and [PRAGMA reference](https://sqlite.org/pragma.html).

## Original verification before the independent audit (historical)

**22 focused integration tests passed; 0 failed/skipped/pending.** Covers settings on two connections, FK/STRICT, bound SQL, int64 extremes/overflow, commit and rollback including deferred-FK COMMIT failure, async/deferred scope lifetime, transaction/configuration escapes, lock contention, close/reopen/persistence, migration order/checksum/repeatability/history rejection, first/later batch rollback, unsafe paths/configuration/links, and corrupt-file preservation.

Initial 21 cases and an earlier 22-case run passed. The latest reviewed 22-case run also verifies literal internal-name-prefix filtering for untracked schemas. Repeated runs do not increase the 22 distinct case count. Focused TypeScript and scoped ESLint pass. No full frontend/browser suite or application build run/claimed.

Reproduce from web/ using installed tools:

- npm run test:sqlite
- node node_modules/typescript/bin/tsc --project tsconfig.sqlite.json --noEmit
- node node_modules/eslint/bin/eslint.js src/server/db tests/integration/sqlite-foundation.test.ts vitest.sqlite.config.mts --max-warnings=0

Ignored evidence: web/test-results/sqlite-b1b-part1/review-23600462d69040b28d0d346e9b7ff8cc/{before-hashes.json,integration-initial.json,integration-final.json,integration-reviewed.json,verification-summary.json}; disposable run-* databases and npm cache retained nearby. All 460 protected existing files outside four authorized edits match the 464-file baseline, including B1a ignored evidence/dependencies and ending-only drift. No original evidence overwritten.

## Audit findings corrected - 9 November 2026

The independent read-only audit blocked acceptance on one Medium STRICT-validation bypass and reported two Low findings. This bounded correction task addresses those findings only; it does not authorize Part 2 or production schemas.

- Medium: removed the textual STRICT suffix as proof of strictness. After each table migration executes, the same atomic transaction looks up the exact intended main-schema table in pragma_table_list and requires type=table and strict=1. A non-STRICT table throws MIGRATION_SCHEMA_INVALID, and the outer migration batch rolls back all pending tables, history and user_version. Regressions verify both first-batch rollback/reopen and preservation of earlier committed data/history when an unrelated existing STRICT table is present.
- Low: return-value detection checks actual promises, generator objects and callable then/next members. Plain objects with next:1 or then:"text" commit normally. Real promises with a shadowed non-callable then still reject; callable thenables/iterators, async/generator callbacks, rollback and expired scopes remain protected.
- Low syntax limitation: narrowly allow newlines/tabs between CREATE TABLE and CREATE [UNIQUE] INDEX keywords; valid STRICT declarations and trailing comments/index migrations pass. Unquoted ASCII object names remain required. Quoted/schema-qualified identifiers, IF NOT EXISTS, comments between keywords, temp/virtual tables, views/triggers, ALTER/data/control SQL remain explicitly unsupported. The README documents these boundaries; further expansion belongs to a separately reviewed production-schema task. Native prepare still rejects multiple statements.

Exactly seven existing files modified by this correction:

1. web/src/server/db/migrate.ts
2. web/src/server/db/connection.ts
3. web/tests/integration/sqlite-foundation.test.ts
4. web/src/server/db/migrations/README.md
5. docs/development/SQLITE_B1B_PART1_FOUNDATION_REPORT.md
6. docs/PROJECT_MEMORY.md
7. docs/MODULE_CHECKLIST.md

Verification: eight new focused regressions passed (the original 22 cases were name-filtered/skipped in that focused run). Then exactly ONE full B1b Part 1 suite passed: **30 passed / 0 failed / 0 skipped/pending**. Focused TypeScript and ESLint passed. These are 30 distinct tests, not 38. No frontend/browser/full-app build runs, package installs or upgrades.

Fresh ignored evidence: web/test-results/sqlite-b1b-part1/audit-fixes-96102074-cd2a-4cfc-87cd-b5c54edeff20/{before-hashes.json,focused-regressions.json,full-part1.json,verification-summary.json}. Old runs/evidence and original TEST fixture files are preserved. All 632 protected files outside the seven authorized edits, plus three existing links, match the 639-file task-start snapshot. Main package/lock files, frontend/demo fixtures, B1a sources/evidence and both known formatting drifts are unchanged. The cloud/offline plan's already-existing formatting edit remains untouched at SHA256 b671cce4bfc65ccf27c0842d88603b7008a340d14736371365ac0d6ce1b6f22b; B1a package SHA256 remains 41ef7bbeaae280b9875c021dd416c70096c727e295d673926938fd7a8a3bd814.

Ready for owner review/acceptance of Part 1 within the documented syntax and deployment limits. Owner acceptance is pending. Whole B1b remains incomplete; no next-phase work authorized.

## Safety limits and Git state

This is foundation code for review, not an operational production POS. No production migration set, account/auth adapter, business table/service/API or frontend integration exists. P02/P08 remain pending; Part 2 requires separate approval. No cloud/remote/Electron/logo work.

Before real data: separately implement/review maintenance and single-authority/writer supervision, free-space/verified backup and recovery/promotion, Windows ACL/storage enrollment and key custody. Directory checks assume a stable trusted filesystem; they do not defeat same-user/administrator races or detect every third-party sync setup. Scope revocation protects the supplied transaction handle, not arbitrary external deferred side effects. Only validated integers should enter reviewed SQL; arbitrary SQL expressions can still overflow internally. Hardware power loss, disk full, capacity, packaging and physical recovery are not certified here.

Git master at 1456ce4df2c6ff7d1c4d61833a019b0cbcee36a1; index empty. Existing dirty documentation/untracked B1a work remains, plus the manifest above. No stage/commit/push/reset/clean/stash/deployment. The existing B1a package.json ending drift remains untouched (SHA256 41ef7bbeaae280b9875c021dd416c70096c727e295d673926938fd7a8a3bd814).

**STOP for independent/owner review of Part 1. Do not mark whole B1b complete or start Part 2.**
