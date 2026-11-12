# Coordinated inventory recovery and audit schema contract

11 November 2026. **OWNER APPROVED - complete corrected TEST-only contract,11 November2026. Coordinated TEST implementation exists; focused TEST verification PASS; production acceptance excluded. [Current report](INVENTORY_COORDINATED_RECOVERY_AND_TEST_LOGIN_REPORT.md). Production remains disabled.**
Scope: disposable, path-confined authenticated TEST only. Current working18 implementation/evidence preserved. This contract does not authorize production, a real-shop upgrade, new recovery keys/authority, enrollment rebind, financial policy, sales schema or Windows changes.

## Why a schema change is necessary

Current0010 stores only successful business operations and requires a product/result/payload. It cannot safely represent cancellation of a request that never arrived and has no product yet. Encoding a fake operation/product would violate its meaning/constraints. Absence of a row is not a terminal outcome. Page RAM, a404 or deleting IndexedDB cannot fence a delayed request.

Use ONE small cancellation-only table alongside the existing committed-operation ledger; no persistent PENDING registry, saved browser payload, generic job engine or second writer. Add database guards to the three existing immutable ledgers and this new terminal ledger together. UPDATE/DELETE triggers alone are insufficient: SQLite REPLACE can delete conflicting rows without firing delete triggers when recursive triggers are off. The original proposal covered declared unique indexes but missed the hidden rowid key. Revised BEFORE INSERT guards cover declared and physical keys plus reciprocal execute/cancel exclusion; AFTER INSERT guards validate physical IDs. Native review evidence below covers both recursive settings; the owner subsequently approved the corrected contract, and the coordinated TEST implementation now exists. [SQLite conflict rules](https://www.sqlite.org/lang_conflict.html), [trigger/RAISE behavior](https://www.sqlite.org/lang_createtrigger.html).

## Confirmed native review and corrected safety invariant

Owner declined the original thirteen-program contract pending this review. Actual pinned better-sqlite313.0.3 uses SQLite 3.53.4. These are native engine tests with foreign_keys ON, trusted_schema OFF, real STRICT schema0001-0018 and the proposed cancellation table; no historical migration was modified.

| Protected table | Actual declared PRIMARY KEY / UNIQUE keys | Partial unique index |
| --- | --- | --- |
| inventory_operations | id; request_key; (id,product_id) | none |
| stock_movements | id; operation_id; (product_id,balance_version) | stock_opening_unique(product_id) WHERE kind='OPENING' |
| product_events | operation_id only | none; product_events_product is NONUNIQUE |
| inventory_cancellations (candidate) | request_key only | none |

All four are regular rowid STRICT tables with an additional unique physical rowid, accessible as rowid, _rowid_ or oid; no declared column shadows these aliases. Index-list inspection alone does not enumerate that physical key. The OPENING partial key overlaps the product/version constraint because valid OPENING requires version1; both actual predicates are nevertheless retained/tested. Any future extra column/index/trigger requires a reviewed schema change and exact admission, never implicit acceptance.

**Confirmed gap:** the original guards allowed an explicit physical-rowid replacement through each alias on all four tables with recursive_triggers OFF (twelve successful replacement probes). ON blocked those implicit deletes. The leaf-operation probe deliberately uses an otherwise FK-valid operation without child rows; existing FKs sometimes also block parent replacement, but cannot protect leaf events/movements/cancellations and are not an immutability solution. These probes prove a proposed-guard defect, not a public SQL endpoint or active production exploitation.

**Correction:** each BEFORE INSERT guard also rejects an existing physical-rowid collision. Keep unconditional UPDATE/DELETE denial. Four AFTER INSERT guards reject NEW.rowid<=0 using RAISE(ABORT), which undoes the entire statement, including an implicit replacement or earlier rows in a multi-row insert. No conflict algorithm or UPSERT grants overwrite authority.

**Why four additional programs:** SQLite documents automatic NEW.rowid as undefined in BEFORE INSERT; the pinned engine exposes -1 there for normal automatic appends. A rowid-only correction allowed an explicit -1 history row, then blocked a valid automatic append. Do not special-case -1 as authorized or exempt it from collision checks: that would reopen replacement. Instead admit only positive physical IDs, with AFTER validation of the actual allocated value. Existing legitimate service methods omit physical IDs and pass unchanged; no application identity or recovery context is derived from rowid. An engine upgrade requires renewed native tests; unexpected BEFORE behavior must fail closed, never relax collision detection. [SQLite rowid keys](https://www.sqlite.org/rowidtable.html), [BEFORE-trigger caution](https://www.sqlite.org/lang_createtrigger.html#cautions_on_the_use_of_before_triggers).

**Compatibility gate requiring the same approval:** the proposed atomic18-to35 TEST migration must query each protected table for rowid<=0 INSIDE its migration transaction before final COMMIT/history/version acceptance. Finding any existing nonpositive ID aborts the entire suffix and leaves original rows/history/version intact. Never renumber, rebuild or delete history automatically. Exact schema35 startup/per-operation admission also checks this indexed rowid range with LIMIT1. Historical8/18 inspection stays unchanged. File owners capable of dropping triggers or rewriting an entire database remain outside cryptographic tamper protection; exact admission catches missing/changed objects, not coherent malicious history rewrites.

**Review evidence:** 77 distinct checks PASS (one72-case native run plus3 and2 newly added focused cases; not one clean77-case run), zero final unresolved failures. Verified twelve original replacement probes,216 blocked candidate conflict/mutation statements,16 additional direct UPDATE OR REPLACE collisions,16 genuine gateway mutations and16 idempotent replays. Scoped TypeScript and zero-warning ESLint PASS. Separate evidence: web/test-results/master-completion-35afbc5f-fc6b-4561-b4b8-76948495067d/; actual native metadata and case counts in web/test-results/sqlite-b1b-part1/audit-guard-review-4wrR6g/. Subsequent targeted runs retain their own directories/logs. Existing crash/relaunch/browser work was not repeated. The literal SQL below and the isolated native fixture are checked for exact agreement. This does NOT establish migration-runner trigger support, exact35 startup, recovery endpoints/cancellation races, browser cancellation or real Login; those were subsequent coordinated implementation obligations; see the current report for executed proof. The first attempted run failed the TEST helper's Number-versus-BigInt pragma assertion; it did not establish a guard failure. The setup was corrected and the full72-case run passed. Initial scoped type diagnostics (BigInt syntax/metadata typing) were corrected; original native diagnostics remain retained. No test assertions were weakened to allow a conflict.

## Terminal lifecycle and authority

| Current authoritative state for key | Read recovery | Explicit Admin resolve-or-cancel | Delayed execution |
| --- | --- | --- | --- |
| Valid committed inventory operation only | COMMITTED with existing validated safe result | Same COMMITTED, never insert cancellation | Same-payload authorized replay only; changed payload conflicts |
| Matching durable cancellation only | CANCELLED | Same CANCELLED, no extra audit/write | Reject this key for EVERY mutation kind, no product/stock write |
| Neither row | UNKNOWN | Insert cancellation under SAME gateway writer transaction; CANCELLED only after confirmed COMMIT | Wins only if execution committed before cancellation; otherwise rejected |
| Both rows, wrong context/kind, corrupt result/history, unavailable SQL | UNKNOWN, fail closed | UNKNOWN, no clearing or repair | Deny; preserve evidence |

SQLite serializes writers. Use the existing sole gateway queue and its writer reservation BEFORE the two-ledger check; no async work outside the guarded transaction. [SQLite isolation](https://www.sqlite.org/isolation.html). Cancellation and business execution cannot both commit for one key. Every private mutator checks cancellation before writes/replay; database insert guards are the independent backstop. Current genuine Admin session, provisioning, version/epoch/boot/expiry/revocation and exact schema are rechecked using existing gateway rules through COMMIT. Caller kind/context are assertions, never identity authority. No password-only bypass or raw SQL endpoint.

Terminal committed reads additionally bind stored key/kind/actor/product/result and verify the canonical payload/hash, then apply existing inventory/history integrity checks. Inconsistent evidence remains UNKNOWN; do not rewrite historical rows to make a migration pass. These hashes detect inconsistency, not malicious coherent rewriting by a privileged file owner.

Cancellation audit stores only its key, opaque current namespace, one of the eight EXISTING inventory kinds, genuine Admin principal/non-bearer session reference and safe int64 timestamp. No product payload, cost, credential, bearer or signing key. A cancelled key is permanently unusable: no TTL, purge, reverse/reset endpoint or key recycling. Browser storage alone never proves server execution or cancellation.

If COMMIT/response is unknown, retain the SAME marker and deny replacements. A later NEW authorized transaction may observe a durable terminal row or atomically establish cancellation if neither exists; this is not blindly retrying the uncertain write or inferring failure from absence. In-flight execution must serialize before/after that fence. Unavailable/quarantined ownership stays UNKNOWN until authoritative access is restored.

Existing operational file/Admin namespace remains based on unchanged18/provisioning/file identity so an approved IN-PLACE disposable18-to35 upgrade does not orphan a marker. Copied/replaced/restored files are not auto-adopted. A cancellation for a key blocks execution even if its stored context mismatches; mismatch cannot be used to ignore a fence or clear a marker. No anti-rollback/enrollment claim.

## Narrow endpoint and browser contract

Proposed ONLY on current trusted TEST Admin origin, inside existing dispatcher:
- GET /api/admin/inventory/operations/:uuid/recovery: bodyless, required original X-Inventory-Context and expected existing inventory-kind X-Inventory-Operation assertion; no query. Read terminal union or UNKNOWN.
- POST same path: flat strict JSON {kind: existingInventoryKind, action: RECONCILE_OR_CANCEL}; original context header, exact Origin/Host/SNI/CSRF and existing request bounds. Explicit current Admin confirmation is required in UI; never auto-cancel on a timeout. Terminal COMMITTED or CANCELLED only after confirmed COMMIT. Fixed safe errors otherwise, no permissive CORS or framework proxy.

Terminal JSON is {outcome: COMMITTED, result: existing MutationResult} or {outcome: CANCELLED}; enum values are JSON strings. Existing GET result JSON remains compatible. Actual context/kind come from SQL and trusted namespace response headers, not client echoes. Current authorization required for every read/cancel/acknowledgement; no protected page relies on session-status cache.

Keep the exact bounded marker fields/version/key/context; allow the eight already-implemented inventory kinds in validation (current UI still only issues CREATE/RECEIVE). CONFIRMED expands to mean a freshly verified terminal outcome, COMMITTED OR CANCELLED. No result/outcome payload is persisted. On reload always read authoritative terminal state. Explicit acknowledgement performs a FRESH authorized matching terminal lookup before conditional deletion. The user sees distinct Saved / Cancelled messages and acknowledgement labels. No deletion on404, SQL error, auth expiry, mismatch, storage error or stale tab. Conditional IDB transactions protect newer markers from stale callbacks. No automatic replacement/new key; after verified cancellation+acknowledgement, only an explicit new user save may use a new key. Existing normal success follows the same discipline.

This approval therefore includes the permanent per-key cancellation and clearing a CONFIRMED cancellation after Admin acknowledgement; the previous contract permitted only saved-success acknowledgement. It does NOT permit abandoning UNKNOWN.

## Exact proposed additive files (17; no historical edits)

One STRICT table and sixteen narrowly pinned triggers; one object per migration remains. The original thirteen-program proposal is superseded: four additional AFTER INSERT guards prevent nonpositive physical-rowid history from obstructing automatic appends. SQL below is REVIEW CANDIDATE ONLY: it has been exercised on disposable native TEST databases, not installed as application migrations. Numbering is0019 through0035. All eight CURRENT inventory kinds remain covered; no new business kind or endpoint is activated.

### 0019_inventory_cancellations.sql

```sql
CREATE TABLE inventory_cancellations (
 request_key TEXT PRIMARY KEY NOT NULL CHECK(
  length(request_key)=36 AND length(replace(request_key,'-',''))=32 AND
  request_key NOT GLOB '*[^0-9a-f-]*' AND
  substr(request_key,9,1)='-' AND substr(request_key,14,1)='-' AND
  substr(request_key,19,1)='-' AND substr(request_key,24,1)='-' AND
  substr(request_key,15,1)='4' AND substr(request_key,20,1) IN ('8','9','a','b')),
 context_fingerprint TEXT NOT NULL CHECK(length(context_fingerprint)=64 AND context_fingerprint NOT GLOB '*[^0-9a-f]*'),
 kind TEXT NOT NULL CHECK(kind IN ('CREATE','EDIT','SELLING_PRICE','STATUS','ARCHIVE','REPRICE','RECEIVE','ADJUST')),
 actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id) ON DELETE RESTRICT,
 actor_session_ref TEXT NOT NULL CHECK(length(actor_session_ref) BETWEEN 1 AND 128),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;
```

### 0020_inventory_operations_insert_guard.sql

```sql
CREATE TRIGGER inventory_operations_insert_guard BEFORE INSERT ON inventory_operations
WHEN EXISTS(SELECT 1 FROM inventory_operations WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM inventory_operations WHERE id=NEW.id) OR
 EXISTS(SELECT 1 FROM inventory_operations WHERE request_key=NEW.request_key) OR
 EXISTS(SELECT 1 FROM inventory_cancellations WHERE request_key=NEW.request_key)
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;
```

### 0021_inventory_operations_no_update.sql

```sql
CREATE TRIGGER inventory_operations_no_update BEFORE UPDATE ON inventory_operations
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
```

### 0022_inventory_operations_no_delete.sql

```sql
CREATE TRIGGER inventory_operations_no_delete BEFORE DELETE ON inventory_operations
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
```

### 0023_stock_movements_insert_guard.sql

```sql
CREATE TRIGGER stock_movements_insert_guard BEFORE INSERT ON stock_movements
WHEN EXISTS(SELECT 1 FROM stock_movements WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE id=NEW.id) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE operation_id=NEW.operation_id) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE product_id=NEW.product_id AND balance_version=NEW.balance_version) OR
 (NEW.kind='OPENING' AND EXISTS(SELECT 1 FROM stock_movements WHERE product_id=NEW.product_id AND kind='OPENING'))
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;
```

### 0024_stock_movements_no_update.sql

```sql
CREATE TRIGGER stock_movements_no_update BEFORE UPDATE ON stock_movements
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
```

### 0025_stock_movements_no_delete.sql

```sql
CREATE TRIGGER stock_movements_no_delete BEFORE DELETE ON stock_movements
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
```

### 0026_product_events_insert_guard.sql

```sql
CREATE TRIGGER product_events_insert_guard BEFORE INSERT ON product_events
WHEN EXISTS(SELECT 1 FROM product_events WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM product_events WHERE operation_id=NEW.operation_id)
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;
```

### 0027_product_events_no_update.sql

```sql
CREATE TRIGGER product_events_no_update BEFORE UPDATE ON product_events
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
```

### 0028_product_events_no_delete.sql

```sql
CREATE TRIGGER product_events_no_delete BEFORE DELETE ON product_events
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
```

### 0029_inventory_cancellations_insert_guard.sql

```sql
CREATE TRIGGER inventory_cancellations_insert_guard BEFORE INSERT ON inventory_cancellations
WHEN EXISTS(SELECT 1 FROM inventory_cancellations WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM inventory_cancellations WHERE request_key=NEW.request_key) OR
 EXISTS(SELECT 1 FROM inventory_operations WHERE request_key=NEW.request_key)
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;
```

### 0030_inventory_cancellations_no_update.sql

```sql
CREATE TRIGGER inventory_cancellations_no_update BEFORE UPDATE ON inventory_cancellations
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
```

### 0031_inventory_cancellations_no_delete.sql

```sql
CREATE TRIGGER inventory_cancellations_no_delete BEFORE DELETE ON inventory_cancellations
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
```

### 0032_inventory_operations_positive_rowid.sql

```sql
CREATE TRIGGER inventory_operations_positive_rowid AFTER INSERT ON inventory_operations
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;
```

### 0033_stock_movements_positive_rowid.sql

```sql
CREATE TRIGGER stock_movements_positive_rowid AFTER INSERT ON stock_movements
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;
```

### 0034_product_events_positive_rowid.sql

```sql
CREATE TRIGGER product_events_positive_rowid AFTER INSERT ON product_events
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;
```

### 0035_inventory_cancellations_positive_rowid.sql

```sql
CREATE TRIGGER inventory_cancellations_positive_rowid AFTER INSERT ON inventory_cancellations
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;
```

## Migrator, exact validator and startup compatibility - SAME approval

- Preserve0001-0018 byte-for-byte; append seventeen reviewed hash pins. Accept only these named, exact pinned trigger programs, not arbitrary CREATE TRIGGER SQL, compound migration scripts, PRAGMA/ATTACH/DROP/ALTER, writable_schema or relaxed STRICT checks. Existing actual PRAGMA table_list STRICT proof remains.
- Verify actual created trigger type, target table and exact stored SQL in sqlite_schema inside the migration transaction. Internal BEGIN/END semicolons are legal ONLY in these pinned trigger bodies. Do not relax general schemaTokens, which correctly rejects internal semicolons for existing table/index definitions; compare these literal approved trigger programs separately (SQLite omits the final semicolon).
- Extend explicit reviewed schema profiles to8,18,35. Profiles8/18 remain exact historical inspectors, not aliases for current35. New TEST inventory runtime requires35. Add exact trigger metadata with rootpage0; keep non-trigger page/index/STRICT checks intact. Register the cancellation PK autoindex. Bound history to36 rows, directory discovery to64 entries/35 pinned SQL files; the current LIMIT19/32-directory budget otherwise incorrectly rejects35. Unknown/missing/changed/extra trigger or migration always denies.
- Before accepting schema35 in migration/startup/guarded inventory work, reject any nonpositive physical rowid on all four protected tables. The migration check must execute inside the same atomic writer transaction before final version/history COMMIT; no data repair or table rebuild.
- Integrate exact target-schema validation through the SAME native owner before HTTP listening/boot acceptance; do not create a second connection or manufacture an Admin session for startup. Recheck exact schema inside every existing guarded product/inventory transaction. Auth/private8 fixtures remain independently valid, but an incompatible TEST HTTP inventory runtime must not expose login before target admission. Precise implementation must preserve single-owner scope/queue and close partial startup on failure.
- Explicit disposable TEST migration only: drain/close runtime, verify exact18/source integrity and auth/business sentinels, apply complete suffix atomically with existing migration mechanism, verify exact35/history/integrity/FKs/data and reopen. No migration during import/login/startup and no automatic production upgrade. Empty TEST fixtures may build35 from EMPTY. Reopen/rollback/native COMMIT failure and original-marker compatibility must pass.
- Existing protected enrollment/maintenance proofs remain8/18-only and MUST deny35 rather than be silently extended or rebound. This TEST schema approval does not grant real8-to18/35 migration, production bootstrap, independent restore or protected maintenance evidence. No new cryptographic/recovery authority. Existing anchors, credentials, session policy, business records and current financial rules stay intact.

## Verification required after approval

1. Native real SQLite: both cancellation/execution orderings and concurrent duplicate requests; exactly one terminal outcome, no extra stock/product/event/movement. Same/changed payload and cross-kind key attempts; repeated cancellation; no expiry; all private mutation types fenced.
2. All UPDATE/DELETE actions on four immutable tables; REPLACE, INSERT OR REPLACE and UPSERT conflict paths under recursive_triggers0 AND1; unchanged valid append/replay flows. Test every declared unique/partial-unique conflict and rowid/_rowid_/oid alias, including UPSERT, multi-row atomicity and invalid physical IDs. Removed/modified/extra triggers and raw DDL corruption deny runtime admission and later protected access. Do not claim malicious-file tamper immunity.
3. Migration: fresh35 and populated disposable18-to35, all auth/latch/history/data unchanged except added migration rows/table; exact historical8/18 inspectors still pass their own fixtures; trigger/body/checksum change and actual batch/COMMIT rollback; partial-startup cleanup/ownership release. No real enrolled upgrade.
4. Actual HTTPS and genuine Better Auth Admin: anonymous/Salesperson/expired/revoked/forged-cookie denial, fixed host/kind/context, exact methods/body/header bounds, CSRF/Origin/Host/SNI/forwarded headers, no secrets and success-after-COMMIT only. Keep no raw framework/public Next endpoint.
5. Retained-profile Chromium: never-arrived request then cancel; lost committed response returns saved result; lost cancellation response/restart recovers CANCELLED; original delayed request after fence cannot write; refresh/crash/two tabs/duplicate acknowledgement; session expiry/logout/restart; failed/unavailable IDB; wrong installation; native SQL/COMMIT failure and UNKNOWN retention. Same original key until terminal acknowledgement; no automatic payload replay.
6. Focused inventory/recovery/schema/auth regressions affected by new guards/profile, scoped TypeScript/ESLint, isolated changed UI build. Reuse unrelated existing evidence. Critical source/endpoint/data-integrity self-review, preservation hashes and updated cumulative API inventory.

## Implementation boundaries and approval request

After this ONE approval, implement the table/guards, restricted migration support, exact admission, terminal service/endpoints and recovery UI/tests as ONE coordinated stage; do not return after each minor correction. Then continue safe TEST Login integration under the master assignment. Financial schema/policies and production/recovery authority remain separately gated.

Likely existing files: db/migrate.ts, reviewed-schema.ts, validate-schema.ts; auth/database.ts/gateway.ts only as necessary for private startup admission; hosting/runtime.ts/inventory-http.ts/inventory-recovery-context.ts/inventory-pages.ts; inventory/service.ts/mutations.ts/contracts.ts; client/recovery-store and TEST recovery/forms; affected fixture/config/tests and current memory/checklist. New: the17 migrations, a small literal trigger-policy module if needed to avoid circular manifest imports, focused recovery/schema/guard tests. No unrelated frontend redesign, dependency install or OS setting change.

Current checkpoint: owner APPROVED the full corrected contract; all17 application migration files and exact35/cancellation/UI implementation now exist. Focused verification is recorded in the [current report](INVENTORY_COORDINATED_RECOVERY_AND_TEST_LOGIN_REPORT.md). Historical0001-0018, original enrollment anchor and prior evidence are preserved. No real-shop upgrade, new protected maintenance authority or production activation is authorized.
