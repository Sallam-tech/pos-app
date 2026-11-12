# B2 Part2 - Inventory integrity and migration compatibility review

11 November2026. **Overall PARTIAL. Production readiness is NOT approved.**
Private inventory corrections verified; enrollment/maintenance and DB audit guards
are **BLOCKED FOR OWNER REVIEW**. No production activation, schema or protected-record changes.

## Findings and localized corrections

No CRITICAL issue demonstrated within the existing private boundary.

| Severity / status | Finding and exact affected source |
| --- | --- |
| HIGH, BLOCKED FOR OWNER REVIEW | Auth setup and protected bootstrap only accept8, while business schema is18: auth/provision.ts:83,88; bootstrap/database.ts:27. Changing8 to18 alone also conflicts with immutable protected schema digests (journal.ts:35). Fresh full-schema setup and enrolled-device maintenance lack an accepted production path. |
| MEDIUM, pending production gate | inventory_operations, stock_movements and product_events have no UPDATE/DELETE guards: migrations0010:1,0013:1,0014:1; db/migrate.ts:44-49 supports table/index only. Real TEST DML proved edits/deletion are allowed. No parser/trigger change made. |
| MEDIUM, pending production gate | General owner validates history rows/checksums, not exact existing SQL objects: auth/database.ts:49-55; db/migrate.ts:80-113. An extra untracked STRICT table survived a zero-change migration pass and the actual gateway still accepted fresh Admin authorization. The8-only bootstrap DOES compare exact object definitions (bootstrap/database.ts:13-23). Full schema inspection needs reviewed lifecycle integration. |
| MEDIUM, FIXED | Ledger SUM equal to balance did not prove movement before/after continuity. A constraint-valid RECEIVE row changed from5->7 to0->2 while retaining delta2; total remained7 and detail accepted it. inventory/model.ts:9 now checks ordered LAG(after_q), with first expected before0; state:25 and reads.ts:16 reject broken chains for detail, totals and mutation/replay entry. Reprice-only version gaps and zero opening remain valid. |
| LOW, FIXED | Event JSON could identify another valid product, or omit before data on a non-CREATE event. reads.ts:65-69 now binds both snapshots to the queried product; CREATE requires null before, other kinds require a valid before. Allowlisted savedProduct validation remains. |

The three failing pre-correction probes are retained. These fixes detect specified
inconsistencies; they do NOT establish full tamper evidence, complete audit coverage
or protection against someone coherently rewriting SQL/files. No corruption is repaired.

## Confirmed implementation and accounting boundary

| Requirement | Actual source / assessment |
| --- | --- |
| STRICT, FKs, stable identities | migrations0009-0018: six STRICT tables, RESTRICT/composite FKs, unique codes/barcodes/operation keys/opening index.0011:10 defers the product-cost FK for atomic reprice. No historical migration edited. |
| Whole PACK/BOX, exact value | validation.ts:5,27-38;0011:4-12. Canonical whole strings, BigInt paisa, checked int64 value; integer division/remainder checks avoid SQL financial REAL multiplication. INTEGER SUM overflow denies. |
| Opening/receiving/counts/reprice | mutations.ts:37-54,56-105. One creation/opening latch, zero has no zero movement; same-cost receive only; reasoned signed count; current-cost revalue without rewriting old snapshots or normal price. Cost-floor checks remain at create/price/resume; future sale must enforce it too. |
| Status, catalog and query models | mutations.ts:61-86; reads.ts:20-53. Archive retains stock; low includes zero, OUT separate, AVAILABLE physical positive quantity. Overall/filtered totals and bounded keyset pages remain distinct. Literal search uses bindings. |
| Transactions/idempotency/concurrency | mutations.ts:27-34,89-105; service.ts:13-24. Key/payload/result, balance, movement and event commit atomically. Stale versions conflict; changed-payload retry conflicts. Actual COMMIT/acknowledgement failure regressions pass; original-key retry prevents double stock. |
| Authorization/no exposure | service.ts:10-34 calls SAME withAdminTransaction for ALL12 methods; auth/gateway.ts:244-263,546-580 checks real cookie, role, active/version/epoch/boot/expiry/revocation before and after callback. auth/database.ts:85-95 scopes native SQL/BigInt. No new owner, caller actor/SQL/role authority or inventory route. |
| Production remains disabled | hosting/auth-http.ts:13-16 and runtime.ts:70,98 confine auth to valid isolated TEST storage. Existing Next route is health only; no inventory import in app/frontend. Demo pages remain previews. No raw framework API exposed. |

All source inspection used real files, not prior PASS text as proof. Current
focused tests use actual Better Auth/official adapter/native scrypt/signed cookies
and SQLite. Existing42-case evidence is preserved and reused, not fully rerun.

## Exact8-to18 diagnosis and enrollment implications

- runTrustedFirstRunSetup requires the exact eight-file list, user_version8,
  matching history, exact objects and all initial auth tables empty BEFORE requesting
  passwords. createProtectedLocalKeys/prepareOwnerEnrollment require the same pristine
  bootstrap validation. No automatic migrate, account reset or re-enrollment exists.
- inspectOwnerEnrollment/enroll/reconcile call inspectEnrollmentDatabase; its8-only
  manifest/object checks reject18. With an eight-file config, a version18 DB instead
  fails the general owner history preflight. Both paths fail closed; no lower-version adoption.
- applyMigrations accepts known contiguous prefixes and atomically applies the suffix.
  General gateway/runtime can operate18 when actual history exactly matches its18-file
  manifest. This is NOT protected enrollment acceptance; runtime never claims it is.
- A new real-session TEST upgraded8->18 after closing its sole gateway. All auth rows,
  credential hashes/versions/epochs, counters, latch, binding and session registry were
  byte-equivalent as serialized rows. New18 gateway accepted fresh password login and
  denied the old boot cookie. Registry preservation is not session survival across restart.
- The enrollment schemaDigest hashes ordered [version,name,checksum]. Actual8 and18
  digests differ. journal.ts:35 rejects a record against another digest, even though
  auth binding/immutable identity rows remain unchanged. These are separate bindings.
  Existing anchors must NOT be edited/rehashed merely to make18 pass.
- Vault custody also binds canonical DB filename/device/inode (keys.ts:39-47,59-65),
  while journal binds vault/database fingerprints. In-place additive DDL ordinarily
  preserves file identity; copied/restored/replaced files require an approved owner
  rebind/new custody lifecycle. This review did not create/change any protected records.
- Changed checksums, missing history rows, newer history and inconsistent version
  marker all deny without repair or resetting accounts (four real TEST cases). Missing/
  misnumbered source migrations reject in loadMigrations. Unknown actual objects with
  otherwise valid history remain the explicit inspection gap above.
- Batch failure rollback/retry, actual COMMIT failure and reopen persistence pass.
  WAL/FULL/foreign-key/busy-timeout/integer guards remain unchanged. Physical power-cut,
  storage-controller durability and portable restore are NOT demonstrated. Interrupted
  or ambiguous maintenance must preserve evidence and halt for approved reconciliation.

## Smallest safe follow-up designs - proposals, not approval

Migration/enrollment: preserve immutable enrollment baseline8 and distinguish the
CURRENT reviewed schema manifest. First specify allowed prefix/target/object definitions
and verify full SQL schema/history under the existing ownership/transaction. Do not
manufacture temporary old migration directories in production as the TEST fixture does.
For new installs, propose explicit auth8 enrollment followed by approved8->18 maintenance;
for enrolled devices, verify existing anchor before that maintenance. Both need approval.

A maintenance supervisor must drain/stop the runtime, hold the SAME ownership lease,
verify a consistent recoverable backup, match old enrollment/DB identity and exact old
schema, then apply the reviewed suffix atomically. A separately reviewed protected
maintenance intent/outcome must link old/new digests WITHOUT rewriting enrollment records.
SQL and protected files are not jointly atomic: startup needs explicit crash/unknown-COMMIT
classification and owner-authorized recovery, not an inferred reset. Restore/profile/device
replacement remains a separate gate. No production migration is safe to activate yet.

Append-only: protect UPDATE and DELETE on all three history tables; current service
only INSERTs them, but trusted AuthorizedTransaction.run can issue arbitrary DML.
Service restrictions suffice ONLY for current private TEST composition, not production
DB-enforced immutability. Review a narrow trigger manifest/grammar, future contiguous
migrations and sqlite_schema trigger type/target/definition checks. Preserve0001-0018.
Tests must cover all six forbidden actions, valid appends, rollback/upgrade/unknown or
changed definitions and INSERT OR REPLACE/implicit-delete behavior under reviewed
recursive-trigger settings. Do not assume two simple triggers close every bypass.
Dropping triggers, alternate privileged connections or modifying files can still defeat
them; triggers do not provide encryption, owner proof or malicious-disk anti-tamper.

## Requirements-to-implementation gap list

| Gap | Current safe behavior / required gate |
| --- | --- |
| Exact schema/current-head inspection | History matches alone insufficient; reviewed read-only validator and integration required. |
| Enrollment baseline versus current schema/maintenance |8 and18 blocked at protected bootstrap; owner approval of versioned contract and crash states required. |
| Database append-only audit | Service never edits history; reviewed migrator/trigger/bypass verification required. |
| D05 different-cost receiving | POLICY_PENDING, no side effects; owner must decide affected receipt/reprice behavior. Same-cost stays enabled privately. |
| P02/P08 | Unresolved; no rounding, cash carry/count, sale or closing logic added. |
| Portable backup/recovery/restore | Not implemented/approved; DPAPI-only copying is not portable recovery. Never reset latch/accounts/shop records. |
| Production/UI/deployment | Auth/inventory HTTP disabled; owner enrollment, TLS/key custody activation, signed desktop/restore and target-hardware gates remain. |
| Scale/durability | Returned pages bounded; full ledger/aggregate scans are not latency-bounded. Shop-scale load and physical power loss untested. |

## Verification, exact changes and preservation

**12 new +12 selected existing checks PASS (24 distinct),0 unresolved failures.**
Scoped TypeScript and ESLint pass. No full42-case run, frontend/browser suite or build.
Actual three failures reproduced before correction; one append-only TEST assertion
expected the inner rollback text instead of the safe wrapper error, corrected with
explicit verification that all3 native writes were accepted then rolled back.
An initial wrong relative append path wrote nothing and selected no probes; evidence
is retained separately, not counted as successful testing.

Evidence: web/test-results/inventory-b2-part2-45e771a2-b25a-46a1-bacf-76ad691a01d6/.
Modified: web/src/server/inventory/model.ts; web/src/server/inventory/reads.ts;
web/src/server/inventory/README.md; web/tests/integration/inventory.test.ts;
docs/PROJECT_MEMORY.md; docs/MODULE_CHECKLIST.md.
Created: docs/development/INVENTORY_B2_PART2_INTEGRITY_COMPATIBILITY_REVIEW.md.
All other baseline files, ALL18 migrations, auth/bootstrap/hosting/custody, dependencies,
frontend/demo and previous evidence preserved. No install/OS/Git mutation. Final hash/
HEAD/index/status evidence records the six pre-existing tracked modifications and untracked work.

**ONE next implementation task:** after owner approves the immutable-baseline/current-schema
contract, add a read-only exact schema/history validator usable inside the existing owned
transaction, with8/18/unknown-object/trigger rejection tests. It must grant no activation,
write no anchor and apply no migrations. Maintenance/trigger/recovery implementations
remain gated separately. STOP FOR OWNER REVIEW.
