# B2 Part 1 - Private Products and Inventory

Date: 11 November 2026. **PARTIAL: bounded private backend verified; production gates remain.**
Production authentication, business HTTP routes and frontend wiring remain disabled.

## Recovered checkpoint and implementation

Part3S remains Task A PARTIAL / Task B PASS (32 new +20 selected prior checks).
Filesystem recovery confirmed B2 HAD STARTED: ten new migrations, six inventory
source files and an unfinished test harness existed. The usage-limit-rejected append
was NOT executed: the harness had zero test cases and no B2 test evidence. All216
prior-file hashes matched except the intended migration attributes; HEAD/index matched.
No auth/desktop work was restarted and no historical suite was repeated.

Completed private capabilities: product create/detail/literal search/bounded list;
name/category/barcode/threshold edit; independent whole PACK/BOX variants; dedicated
normal price, Stop/Resume and retained-stock archival. Opening initializes once
(positive movement or recorded zero initialization), same-cost receiving, reasoned
physical corrections, explicit Option A reprice, movement/audit pages and consistent
overall/filtered/available/low/out/Stock Value reads. Zero counts as low and stays cataloged.

Each method enters the existing REAL signed-Admin/authoritative-SQL transaction
gateway. No second production database owner, browser role authority or raw auth API.
Mutations use atomic balance/ledger/audit/idempotency state and optimistic versions.
Whole quantities and integer paisa use BigInt, checked signed-int64 values and string
responses. Native aggregate overflow denies, never REAL/rounded/partial zero totals.
No historical movement/event snapshot is rewritten by metadata or current-cost changes.
A generic pre-existing TEST historical sentinel survives; real sales do not exist yet.

## Actual verification

**42 distinct focused checks PASS;0 unresolved failures.** One clean40-case B2 run,
then5 targeted checks (2 new +3 affected regressions). Scoped TypeScript and ESLint PASS.
Real Better Auth1.7.18/official adapter/native scrypt/signed cookies, better-sqlite3
13.0.3, Node24.11.0 Windows x64 and disposable SQLite files; no mock authorizer/testUtils.

Verified: empty18-file STRICT/FK migration; populated8->18 preservation of auth rows,
hashes/versions/latch/TEST binding and old history; failed additive batch rollback and
successful retry; product/uniqueness/whole-unit validation; zero/positive opening;
50+20=70 once; current-cost receipt policy; signed corrections; exact valuation beyond
Number precision and int64 overflow denial; repricing/old snapshots; stale edits;
concurrency; all native-write-stage rollback; REAL deferred-FK COMMIT failure; lost-COMMIT
acknowledgement replay; all12 methods deny missing/Salesperson/wrong-role cookies;
logout/stale denial; unknown/corrupt state/replay rejection; clock rollback; non-disclosure.
Reopened gateway plus independent readonly Node process confirms durable stock/history;
old session denies and fresh test authentication succeeds without a data reset.

Original diagnostics retained: initial TEST binding INSERT had8 placeholders for7
columns (all35 cases skipped); corrected setup ran27pass/8fail because fault hooks
watched direct owner methods rather than scoped writes, so faults never fired.
Hooks now wrap actual scoped native operations; the clean40-case run passes. Initial
lint found one CJS require import/two unused test imports, corrected. No production
guard weakened. Reviewed fixes reject coercible filter objects, validate saved result
shape and recheck current inventory on replay. Final Available filter and migration
recovery verified by targeted run; no unnecessary full-suite rerun or build.

Separate ignored evidence: web/test-results/inventory-b2-part1-cfde1b49-1af8-4f76-913d-f7f5a571aabc/.
Original/corrected JSON reports, scoped logs, baseline and preservation summary retained.
Fresh TEST databases live in new web/test-results/sqlite-b1b-part1/inventory-b2-* subdirectories.
No real database, business fixture or previous evidence was opened for mutation.

## Outstanding production/business gates

1. D05 different-cost receiving deliberately returns POLICY_PENDING, no side effects.
   No FIFO, averaging, purchase-payment or combined reprice/receipt policy. P02/P08 unchanged.
2. Existing auth/provision.ts:83-88 and bootstrap/database.ts:27 reject schemas beyond8.
   TEST setup explicitly provisions8, closes it, then applies18 and uses the SAME gateway.
   It proves auth-history/binding preservation, NOT production maintenance, external-anchor
   digest acceptance, owner enrollment or restore compatibility. Auth guards remain untouched.
3. Architecture calls for database update/delete-blocking history triggers. Reviewed
   migrator currently permits ONLY one additive STRICT table/index per file, no triggers.
   Service never updates/deletes history, but database-level append-only protection is
   PENDING a separate reviewed migration solution. Ledger checks do not prove full disk
   tamper resistance. Do not deploy or describe this as complete production audit security.
4. No real HTTP/UI integration, operational shop DB, WAN-off deployment/power-cut/load,
   full sales/race integration, actual shop hardware or owner production acceptance tested.
   Product inputs use canonical paisa strings; reviewed rupee/UI mapping is future work.

## Exact files

Created (22):
- web/src/server/db/migrations/0009_products.sql
- web/src/server/db/migrations/0010_inventory_operations.sql
- web/src/server/db/migrations/0011_stock_balances.sql
- web/src/server/db/migrations/0012_product_identifiers.sql
- web/src/server/db/migrations/0013_stock_movements.sql
- web/src/server/db/migrations/0014_product_events.sql
- web/src/server/db/migrations/0015_stock_opening_unique_index.sql
- web/src/server/db/migrations/0016_product_events_product_index.sql
- web/src/server/db/migrations/0017_inventory_operations_product_index.sql
- web/src/server/db/migrations/0018_products_search_index.sql
- web/src/server/inventory/contracts.ts
- web/src/server/inventory/validation.ts
- web/src/server/inventory/model.ts
- web/src/server/inventory/mutations.ts
- web/src/server/inventory/reads.ts
- web/src/server/inventory/service.ts
- web/src/server/inventory/README.md
- web/tests/integration/inventory.test.ts
- web/tests/helpers/inventory-readonly-child.cjs
- web/vitest.inventory.config.mts
- web/tsconfig.inventory.json
- docs/development/INVENTORY_B2_PART1_REPORT.md

Modified (3; two already modified before B2):
- web/src/server/db/migrations/.gitattributes (LF checksum policy for new SQL only)
- docs/PROJECT_MEMORY.md (current bounded status and evidence)
- docs/MODULE_CHECKLIST.md (private completion versus remaining gates)

No auth/hosting/enrollment source, migrations0001-0008, frontend/demo fixture,
package/lockfile, original drifts or earlier reports/evidence changed. No installs,
OS changes, Git staging/reset/clean/stash/commit/push. Final baseline/hash/index/HEAD
comparison and full read-only Git status are in preservation-verified.json/status-final.txt.

**One next related task:** independent B2 integrity review of schema/services and the
production append-only/migration-anchor gates before any HTTP or UI wiring. STOP.
