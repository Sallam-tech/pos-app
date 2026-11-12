# Controlled 8-to-18 migration: security review and approval checkpoint

11 November 2026. **CURRENT: PARTIAL. Approved Medium reader fix PASS; real enrolled8-to18 migration BLOCKED.**
The owner approved the scoped fix and gated TEST contract A-G below, with independent Windows restore explicitly UNAVAILABLE. Production authentication/activation and trigger migrations remain gated. See the final section for implemented work and exact results.

The initial review/approval snapshot below is preserved as history; its pending-approval and no-source-change statements describe the state BEFORE that approval.
This preserves the Part4A implementation/evidence rather than treating its PASS as new proof.

## Five concerns: source inspection and actual evidence

| Concern | Classification | Verified facts and limits |
| --- | --- | --- |
| 1. Ownership and reader lifetime | **CONFIRMED DEFECT - Medium** | Genuine/expired lease WeakMap checks and the cooperative fixed-port process guard exist. However, the preflight accepts structural readers without proving a live transaction or its unique lifetime. Two native negative checks failed below. No authorization flag became true. |
| 2. Windows protection and paths | **UNVERIFIED / BLOCKED for unrestricted concurrent replacement** | Helpers actually use CurrentUser DPAPI, current-user/SYSTEM-only ACL checks, reparse-parent inspection, bounded streams, exclusive creation and journal readback. TypeScript rejects observed hard links and compares before/after metadata. These are pathname checks separated from native opens, not handle-pinned ACL/ancestor/file-identity proof. Stable protected paths/cooperating processes are an assumption; arbitrary replacement races, other Windows users and target hardware were not verified here. No new exploit was demonstrated. |
| 3. Schema, identity and authorization | **VERIFIED SAFE within the private diagnostic contract** | Packaged immutable 18-file pins, exact object/history/STRICT/index checks and false grant flags inspected. Schema8 additionally checks FKs and protected identity. At18 the preflight returns maintenance-proof-required BEFORE inspecting FKs or enrollment lineage (migration-preflight.ts:100-102). It does not certify18 data integrity or an authorized upgrade. General gateway startup still checks history rather than invoking this exact-schema validator; activation remains prohibited. |
| 4. SQL/files, interruption and retry | **UNVERIFIED / BLOCKED for maintenance** | Existing enrollment distinguishes verified rollback/no-write from unknown COMMIT, requires linked protected COMMITTED before anchor-only reconciliation, and does not auto-adopt SQL rows. Old native results were inspected, not rerun. Maintenance intent/completion, backup recovery and upgrade reconciliation do not exist yet. SQL and filesystem publication are not one atomic transaction. |
| 5. Bounds, leaks and preservation | **VERIFIED SAFE within current private composition, with release gates** | Fixed diagnostic results contain no credentials/paths/SQL and all grants remain false. New probes assert zero total_changes and no protected-file creation. Existing gateway scopes independently use a live flag in finally (gateway.ts:565-573); no gateway/inventory bypass was demonstrated. Directory enumeration in older vault/journal paths materializes names before count checks; native scans and I/O are not hard time-bounded. Existing audit UPDATE/DELETE protections and runtime exact-schema integration remain pending. No claim of complete security or physical durability. |

## Confirmed defect and requested minimal correction

Affected: bootstrap/migration-preflight.ts:26,73-89; bootstrap/ownership.ts:9,12-14;
auth/database.ts:93-100 supplies the generic guard-based scope used by callers.
The last module is not independently proven vulnerable: the existing authorization gateway
supplies a permanent per-operation live flag. Do not rewrite that passing gateway.

A genuine lease is bound to a pathname, not a specific native owner/transaction reader.
The preflight checks pragma_database_list pathname and delegates scope lifetime to its caller.
Using real pinned SQLite on a fresh isolated schema8 database:

- Valid live owned transaction: PASS control, missing-custody diagnostic as expected.
- Genuine lease, real reader, no SQLite transaction: **FAIL**, returns
  PROTECTED_RECORDS_REQUIRED rather than rejecting the invalid lifecycle.
- Reader created in transaction A: rejects after A ends, then **FAIL**, works again in
  transaction B when its guard only checks inTransaction. The preflight accepts it.
- Forged lease: PASS control, rejected before any reads.

These are two negative-test failures, NOT four security passes. They do not show a login,
owner-authorization, migration or data-write exploit. A future coordinator trusting these
classifications could combine inconsistent snapshots; reject this contract before reuse.
The previous26+5 historical cases remain passing evidence for their narrower scenarios;
their expired-reader tests explicitly flip caller-controlled live flags and miss these cases.

**Proposed fix requiring approval:** mint a private unforgeable read capability through the
existing sole owner, bound to the genuine lease, native owner/database identity and a unique
transaction lifetime. Invalidate it permanently in finally; reject detached, wrapped/forged,
wrong-owner, ended and reused readers. Preserve a narrow safe observation hook for tests;
do not create another owner, expose native handles, or change auth/business policy.
Regressions must cover both reproduced failures, forged/expired lease, wrong DB/owner,
transaction replacement, cancellation/close, zero writes, exact8/enrolled evidence and18
maintenance-proof-required. File/handle identity checks and race limits need explicit review.

## Consolidated proposed maintenance contract - NOT yet approved

A. Preserve the original schema8 vault/enrollment anchor byte-for-byte. Only the packaged,
reviewed0009-0018 suffix is eligible; never change0001-0018, re-enroll or reset accounts.
Drain the normal runtime; hold the same cooperative process/machine guard throughout.
Require exact source8, integrity/FKs, matching protected identity and permanent scoped reads.

B. Use a separate protected maintenance journal. Versioned INTENT binds a random operation ID,
original anchor/commit digests, installation/device/DB path+file identity, vault digest,
source8/target18 manifests, source-data preservation fingerprint, backup ID/ciphertext digest,
independent restore evidence and purpose-bound owner authorization. Confirmed COMPLETION
links that exact intent, real COMMIT and verified18 preservation result. Preserve pending,
corrupt and unknown records; no overwriting or silent journal repair. Records contain no
passwords, tokens, keys or raw business data.

C. Owner authority must be fresh, deliberate, purpose-bound and single-use. Recommend actual
existing Admin credential verification plus explicit local owner confirmation through a
trusted maintenance entry; a Windows SID, localhost or a callback returning true is insufficient.
For a disposable TEST proof only, request approval of a TEST driver exercising real Admin
verification and explicit operation-bound confirmation. This is NOT physical owner-identity
or signed-desktop proof. Production still requires the separately trusted packaged entry.
Do not create a new public endpoint or invent a recovery bypass if that entry is unavailable.

D. Require a real consistent SQLite Online Backup snapshot, encrypted/authenticated portable
archive and separately owner-controlled high-entropy recovery material B. Use a reviewed
maintained archive format/crypto engine; do not improvise a crypto container or use the shop
password as its key. Keep Admin recovery R separate and unimplemented in this task.
Require both independently protected owner B copies and a decrypt/restore drill into a new
isolated target using the actual portable recovery path. Verify integrity/FKs, exact8,
accounts/hashes/versions/epochs/counters/registry/latch/binding/history and all existing data.
No overwrite of the source or existing shop files. Available independent Windows hardware/
profile and the archive implementation still need verification; same-profile DPAPI reopen
is insufficient. Missing keys/evidence or unavailable independent verification blocks migration.

E. Allow no automatic retry of a write after uncertain COMMIT, or reconstruction of missing
completion from schema18 alone. Confirmed rollback+unchanged8 permits a NEW owner-approved
attempt/operation ID. Confirmed COMMIT+matching verified18 permits completion-only recovery
only with protected commit evidence and fresh purpose-specific authority. Intent-only/unknown
COMMIT/schema mismatch requires owner-authorized investigation, not a guessed success/failure.
A previously completed invocation is inspection-only; never execute its suffix twice.
Backup restoration/rebind is a separate explicitly authorized operation, never an automatic
migration error handler. A recovery test must not activate an independent shop writer.

F. Restore/cross-profile or cross-machine rebind must preserve accounts/latch/anchor lineage,
migration/audit/business data and archive key history; mint new local custody/generation only
under approved owner authority after fencing the old writer. No automatic adoption or startup
when authority is uncertain. All old RAM sessions stay invalid; no shop-state reset.
A disposable isolated restore must remain non-authoritative. Production rebind and disaster
replacement remain disabled until independent hardware/owner custody acceptance.

G. Existing Medium release gates remain explicit: no DB-enforced append-only protections for
inventory_operations, stock_movements or product_events; and exact-schema validation is not
yet integrated into runtime admission. Do not add triggers under schema18 or rewrite history.
Any contiguous0019+ trigger migrations, grammar/pin updates and REPLACE/implicit-delete
protections require SEPARATE EXPLICIT owner approval. The bounded8-to18 TEST proof must not
claim to resolve that release gate. D05/P02/P08 and frozen frontend remain untouched.

After approval: correct and independently verify scopes; review the concrete protected record
and archive formats; implement verifier and prerequisite backup/restore/owner controls; only
then execute a genuine enrolled TEST8-to18 coordinator and fresh-process lineage verification.
Approval of this design alone cannot satisfy missing authority, key custody or restore evidence.
No real production migration without a separate named-machine/database go/no-go. Production
HTTP authentication remains disabled independently of this work.

## Evidence, preservation and review limits

New evidence: web/test-results/master-migration-deed3822-59e5-4684-b209-8c56f72854a0/.
Includes source probe, actual results/log, initial loader diagnostic and preservation hashes.
Node24.11.0 / better-sqlite3 13.0.3 / SQLite3.53.4. Initial strip-only Node invocation failed
before probes; same source then ran with existing TypeScript transform support. No installation.
Only a new EMPTY schema8 TEST fixture was created; no enrolled8-to18 migration/backup/restore
was attempted. No new native DPAPI, power-cut, independent hardware or production tests.
No production TypeScript source changed, so previous scoped TypeScript/ESLint evidence is
reused; the new isolated JavaScript probe receives a syntax check. No historical full suites.

Project changes: this report, docs/PROJECT_MEMORY.md and docs/MODULE_CHECKLIST.md only.
Ignored new probe/database/evidence files are separate; no prior fixture/evidence modified.
Preservation comparison covers450 existing tracked/untracked files plus38 prior Part4A
evidence files, HEAD and index. No Git stage/commit/push/reset/clean/stash or OS changes.
Self-review: distinguished actual failures from historical passes, private diagnostics from
authority, source review from native tests, protected-key integrity from portable recovery,
and simulated/native failures from physical crash durability. No Critical/High exploit newly
confirmed; unresolved prerequisites prohibit a claim of release readiness or completed migration.

Primary contracts consulted: [Microsoft DPAPI](https://learn.microsoft.com/en-us/windows/desktop/api/Dpapi/nf-dpapi-cryptprotectdata),
[Windows reparse points](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points-and-file-operations),
[SQLite Online Backup](https://www.sqlite.org/c3ref/backup_finish.html).


## Approved continuation: actual completed work and stop gate

The owner's subsequent approval accepts the proposed gated TEST contract, not a recovery
waiver. Independent Windows restore target/profile is explicitly UNAVAILABLE until verified.
No real shop database, original anchor or enrolled8-to18 migration was touched.

**Concern1 FIXED/PASS within the stated cooperative Windows/runtime assumptions:**
- Same existing native owner mints a WeakMap-registered get/all-only capability, bound to a
  genuine lease, owner identity, canonical database path/dev/inode and unique execution
  generation. No second owner/connection, new transaction opener or native handle is exposed.
- Permanently invalidate the capability in finally, on cancellation, close/quarantine, and
  on actual Kysely transaction-boundary execution. SQLite marks BEGIN/COMMIT readonly;
  the supported SqliteDatabase wrapper observes non-result statements as well as writes,
  including commented COMMIT/BEGIN. No regex is used as proof of transaction identity.
- Lease checks revalidate the existing machine guard and file identity, including before
  returning a completed ownership callback. Preflight checks the genuine scope at entry,
  every SQL operation and asynchronous protected-file checkpoint. Clones/structural wrappers,
  detached readers, prior scopes, wrong owners, replaced files and stale leases deny.
- Existing authorization gateway scopes/session/password/throttle behavior are unchanged;
  their independent live flags remain. No raw Better Auth/HTTP API was exposed.

**Non-destructive maintenance component:** maintenance-record-contract.ts validates bounded
candidate records against packaged pinned manifests and original identity/anchor bindings.
It is a format/linkage validator, NOT a protected journal loader, real COMMIT verifier,
owner-authority issuer, backup verifier or migration coordinator. It opens no database,
writes no files and never grants any authority. Even a matching pair returns
PREREQUISITES_UNVERIFIED with protectedStorageVerified/recoveryVerified/ownerAuthorized,
upgradeAuthorized and productionActivation ALL false.

Candidate V1 wire representation is a fixed-position UTF-8 JSON tuple (8192 bytes each;
max one ordered INTENT+COMPLETION pair), avoiding duplicate/unknown JSON property meanings.
Positions0-18: format,kind,operationId,installationId,deviceId,enrollmentIntentId,vaultDigest,
databaseFingerprint,anchorDigest,enrollmentCommittedDigest,source8Manifest,target18Manifest,
preservedDataDigest,backupId,backupCiphertextDigest,restoreEvidenceDigest,ownerAuthorizationId,
ownerAuthorizationEvidenceDigest,preparedAtMs. COMPLETION repeats those bindings, then adds
canonical intent-tuple SHA256,COMMIT_CONFIRMED,preservedDataDigestAfter,confirmedAtMs.
Digests are structural bindings, NOT proof that the asserted backup/restore/owner/COMMIT
actually happened. Timestamps are canonical positive decimal safe milliseconds. Unknown
outcomes/versions, duplicate/reordered/replayed/unlinked/wrong-identity records and excessive
inputs reject. Whole-journal retry/ABORTED chains and protected publication remain pending;
this component must never be used alone for runtime/migration admission.

**Verification:50 distinct passing checks,0 final unresolved failures.**
10 new native reader/lease cases +14 format-only checks +26 affected preflight regressions.
Counts aggregate scoped runs/corrections; NOT one clean50-case run. Final3 protected/native
checkpoint cases rechecked after the asynchronous guard update; final10 reader cases after
file-identity completion hardening. Scoped TypeScript and zero-warning ESLint PASS.

Native cases cover detached/revived scopes, permanent expiry, wrappers/forgeries, genuine
COMMIT/BEGIN replacement, wrong native owner/lease, cancellation/exception, native close and
same-path identical-byte TEST file replacement. Real prior preflight regressions again use
Windows DPAPI/ACL, real enrolled8 accounts/anchor, real Better Auth/official adapter/native
scrypt and populated inventory. Their schema18 fixture is created from EMPTY, NOT migrated
from an enrolled8 database. No physical backup/restore/power-cut proof or production test.

Initial failures remain preserved:2 review probes exposed the original gap; the first new
run7/8 exposed transaction controls being readonly (corrected);2 of26 affected regressions
expected an inner error instead of the existing generic ownership wrapper (expectations
corrected, native checks retained). One scoped TEST spy needed an explicit this type.
The new capability was never bypassed to retain old tests; native observation/fault injection
replaced structural reader wrappers. No full historical/frontend/browser suite or build.

**Exact created project files (4):**
- docs/development/MIGRATION_8_TO_18_SECURITY_GATE_REVIEW.md
- web/src/server/bootstrap/maintenance-record-contract.ts
- web/tests/integration/bootstrap-read-scope.test.ts
- web/tests/unit/maintenance-record-contract.test.ts

**Exact modified existing project files (8):**
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md
- web/src/server/auth/database.ts
- web/src/server/bootstrap/ownership.ts
- web/src/server/bootstrap/migration-preflight.ts
- web/tests/integration/migration-preflight.test.ts
- web/vitest.preflight.config.mts
- web/tsconfig.preflight.json

New ignored evidence/probe/TEST directories are separate. Initial/failed/corrected reports
and before-images remain under the original new master evidence directory. No dependency,
frontend/fixture/business-source or old0001-0018 migration changes. Final preservation
checks compare450 original tracked/untracked files,38 prior Part4A evidence files and
HEAD/index; nothing staged/committed/pushed/reset/cleaned/stashed. Other ignored shop/test
files were not opened for writing; this is not a claim of hashing every ignored directory.

**Remaining gates:** concern2 concurrent path/handle replacement, other-profile/target-drive
behavior and physical durability remain unverified; concern3 remains schema/history-only,
with18 FK/lineage admission pending; concern4 real protected maintenance/recovery remains
BLOCKED; concern5 current diagnostic non-disclosure/preservation is verified but existing
Medium append-only and runtime exact-schema integration release gaps remain. No new
unresolved Critical/High exploit was confirmed; this is not production security approval.

Critical self-review covered every changed source/test/config/document and dependent native
owner, actual transaction controls, callback/close lifetimes, identity checks, all-false
candidate trust results, query bounds, generic errors, preserved auth/inventory state and
false recovery/COMMIT claims. File identity uses canonical path/stat checks under existing
Windows VFS/cooperative ownership; do not describe it as handle-pinned ACL/ancestor proof
or protection from malicious same-user/admin/disk tools.

**Actual8-to18 migration, real recoverable backup/independent restore and owner maintenance
authority are NOT implemented/verified.** No protected maintenance record was published,
no uncertain migration COMMIT was fabricated/retried, no rebind/account reset and no new
trigger migration. Production migration and HTTP authentication/activation remain DISABLED.

**Next prerequisite in this SAME task:** identify and independently verify a compatible
isolated Windows restore target/profile and owner recovery-key custody. Then implement/test
the approved portable backup/restore and purpose-bound authority prerequisites before any
migration writes. If unavailable, remain BLOCKED; no request for a new master prompt and
no automatic Login/Stock/Sales/Reports/UI/EXE module follows this checkpoint.
