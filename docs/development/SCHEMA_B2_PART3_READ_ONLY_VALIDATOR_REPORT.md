# B2 Part3 - Read-only exact schema validator

11 November2026. **PASS for this bounded private feature; owner review pending.**
Production activation, maintenance, restore and whole-module acceptance remain gated.

## Contract and verified behavior

Private server-only validateReviewedSchema(existingReadScope, 8 | 18) accepts ONLY
get/all from a live, already admitted, consistent transaction. It opens no connection,
starts no transaction, imports no runtime gateway, and executes SELECT statements only.
Later orchestration must hold the existing sole ownership/authorization lease and keep
inspection and any subsequent approved action in its reviewed lifecycle. A success is
SCHEMA_AND_HISTORY_ONLY: it is neither pristine enrollment approval nor an access grant,
and it must not be cached as proof of a future database state.

Reviewed authority is the eighteen exact migration identities/SHA-256 byte pins plus
schema_migrations' existing definition and explicit internal-index metadata. Authority
never comes from the inspected database. Schema8 uses the first eight reviewed files;
schema18 uses all eighteen. Packaged definitions must match ALL pins before any DB query.
Protected enrollment digests, schema8-only provisioning/bootstrap, anchors and keys are
unchanged. No protected record is read, rehashed, replaced or created by the validator.

Inspection compares user_version, ordered version/name/checksum history and positive
int64 application timestamps; exact tables/indexes and their targets; STRICT/rowid table
metadata; auto-index identities, origin/uniqueness/partial flags, columns/collations/order;
and bounded, distinct, plausible root pages. Missing/extra/changed tables/indexes, triggers,
views, unknown history, partial schemas, attached databases, TEMP objects, expired scopes,
SQL errors and ambiguous metadata deny with fixed structured codes. Diagnostics contain
no actual SQL, unknown object names, credentials, keys, paths or native error details.

SQLite normalizes CREATE prefixes and uses NULL SQL for generated indexes. The bounded
lexer ignores layout/comments and ASCII keyword/identifier case, while preserving quoted
contents and token boundaries. It rejects ambiguous/unsupported input; it is not a general
SQL authorizer or semantic-equivalence engine. Cosmetic quoted-identifier rewrites not
produced by these reviewed migrations may conservatively reject. See the official
[SQLite schema-table contract](https://www.sqlite.org/schematab.html).

Only reviewed automatic PK/UNIQUE indexes and exact optional sqlite_stat1/sqlite_stat4
ANALYZE definitions are allowed; arbitrary sqlite-prefixed objects are never ignored.
Read-only table-valued PRAGMAs inspect metadata without setter PRAGMAs; see
[SQLite PRAGMA functions](https://www.sqlite.org/pragma.html#pragfunc).

Budgets: directory discovery32 entries/18 SQL files, schema128 objects,64KiB SQL per
object,16384 comparison tokens,32 table metadata rows,16 indexes/table,32 index columns,
19 history rows. All SQL identifiers are fixed; metadata arguments use bindings. These
bounds limit materialization/work, not absolute native I/O latency or malicious-file
resource consumption. Trusted packaged assets must remain protected from concurrent edits.

## Focused verification

**40 new checks PASS +4 selected existing inventory regressions PASS;0 final failures.**
Scoped TypeScript and ESLint with zero warnings PASS. Real installed better-sqlite3
13.0.3/SQLite3.53.4, existing migration runner/sole owner, Better Auth1.7.18/official adapter,
native scrypt and real signed-cookie Admin/Salesperson integration are exercised.

- Exact8 and18 pass, including actual canonical SQL and14/28 automatic indexes.
- Missing/extra/altered objects; predicate/UNIQUE/STRICT/CHECK changes; checksums/names/
  missing/extra history; unknown/inconsistent versions; partial application; TEMP/attached
  state; bounds; SQL failure; expired/cancelled scopes; reopen and queued reads are tested.
- Header-corrupted TEST DB fails existing owner admission without repair. Native catalog
  writes remain blocked. Manifest/generation/page/index fault injections are explicitly
  fault-injection checks, not claims of physical corruption/recovery coverage.
- Every inspector-issued statement is SELECT. Native total_changes, main/WAL hashes,
  history and settings are unchanged across inspection. The real gateway preservation
  test retains all auth credentials/versions/latch/binding/counters/registry/history and
  populated products/balances/operations/movements/events. No protected vault is created.
- Real signed-cookie Admin invokes the inspector inside SAME gateway transaction;
  anonymous/Salesperson requests never reach its callback. Gateway's pre-existing writer
  reservation is a no-change UPDATE; the wider gateway is not claimed to be SELECT-only.
  SQLite SHM coordination and owner open/close housekeeping are outside the inspector's
  zero-DML contract. No app/hosting/auth/bootstrap import or new HTTP endpoint exists.
- Native movement CHECK enforces after-before=delta. Existing first-before0/ordered LAG
  continuity and SUM(delta)=balance guards imply terminal after=balance for valid schema.
  Four selected regressions confirm native constraints, corrupt-ledger/broken-chain denial,
  and valid zero-opening/reprice gaps. No inventory source or historical migration changed.

Initial results/evidence are retained: one oversized-SQL TEST had placed a comment where
SQLite omits it from stored SQL; corrected to an internal comment. Two catalog-tampering
setups were blocked by native defensive mode, which remains enabled. Replaced with native
protection assertions and normal altered-schema fixtures. One non-disclosure assertion
included cleared-cookie empty values; corrected. Existing ES2017 target requires BigInt()
expressions, now used without changing configuration. No unresolved failures remain.
Evidence: web/test-results/schema-b2-part3-f75677e8-29de-4b79-8a8f-8e94861bb6d3/.

## Exact files and preservation

Created:
- web/src/server/db/reviewed-schema.ts
- web/src/server/db/schema-sql.ts
- web/src/server/db/validate-schema.ts
- web/tests/integration/schema-validator.test.ts
- web/vitest.schema.config.mts
- web/tsconfig.schema.json
- docs/development/SCHEMA_B2_PART3_READ_ONLY_VALIDATOR_REPORT.md

Modified: docs/PROJECT_MEMORY.md; docs/MODULE_CHECKLIST.md.
The275-file preservation baseline has exactly two intended documentation edits; every
other baseline file, ALL18 migrations, frontend/demo, dependency, auth/enrollment/custody/
inventory source and sampled prior evidence remain byte-identical. Known drifts are untouched.
HEAD/index/staged state unchanged; no install, OS or Git mutation. Final separate hash
comparison records exact preservation rather than relying only on status counts.

## Critical self-review and remaining gates

No new known critical defect found in this reviewed scope. Schema8/18 separation,
authority pins, canonical comparison, internal objects, integer handling, bounded reads,
SQL injection, diagnostics, transaction lifetime and all nine changed/new files reviewed.

This does not inspect every business row/index B-tree, prove complete physical integrity,
resist a coherent malicious whole-file rewrite, stop whole-machine rollback or establish
power-loss durability. Existing owner preflight remains; no full forensic integrity scan
or shop-hardware/packaged-asset relocation test ran. SQL locking assumes existing exclusive
owned-transaction discipline; hostile privileged tools are outside that guarantee.

General gateway/migrator still do NOT automatically call this validator: later integration
is separately approved work. Immutable enrollment8 versus current18 maintenance, append-only
DB guards, recovery/portable restore, trusted owner entry, keys/TLS/packaging and production
HTTP activation remain blocked/pending. D05/P02/P08 policies remain unresolved. Successful
schema inspection does not resolve those gates or approve production readiness.

**ONE recommended next task:** independently review and approve the baseline8-to18
maintenance/enrollment contract, including crash/unknown-COMMIT and protected-record states,
using this inspector without changing immutable enrollment anchors. STOP for owner review.
