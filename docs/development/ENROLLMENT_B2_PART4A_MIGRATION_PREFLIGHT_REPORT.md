# B2 Part4A - Safe enrollment-to-inventory migration preflight

11 November2026. **PASS for bounded READ-ONLY private preflight. Owner review pending.**
No migration coordinator, maintenance record, backup/restore or production activation.

## Implemented contract and states

preflightEnrollmentToInventory(config, lease, readScope) requires a genuine EXISTING
bootstrap lease and a live consistent transaction from the SAME sole owner. It validates
the actual main-database path against that lease/configuration. It opens no connection,
starts no transaction and issues SELECTs only. No raw gateway, HTTP or startup caller exists.
Every result is frozen, with productionActivation, upgradeAuthorized and enrollmentAuthorized
ALL false. Status is a point-in-time diagnostic, never owner proof or permission to proceed.

| Status | Meaning |
| --- | --- |
| SCHEMA8_ENROLLMENT_VERIFIED | Exact reviewed8, consistent SQL identity and matching actual DPAPI/ACL vault, journal and final anchor. No upgrade permission. |
| SCHEMA8_NOT_ENROLLED | Exact8 is pristine; custody exists but enrollment is not complete. No automatic setup. |
| SCHEMA18_MAINTENANCE_PROOF_REQUIRED | Exact reviewed18; original enrollment/authorized maintenance lineage is NOT established. Never fresh-enrollment eligibility. |
| SCHEMA_INVALID | Unsupported version, damaged history or actual object mismatch. |
| ENROLLMENT_STATE_INVALID | Partial/inconsistent auth identity or FK violation. |
| ENROLLMENT_EVIDENCE_INVALID | Corrupt/mismatched protected evidence or failed native protection checks. |
| PROTECTED_RECORDS_REQUIRED | Required custody/final enrollment evidence missing; no reconstruction. |
| LIFECYCLE_UNKNOWN | Interrupted/uncertain/unsupported state, unavailable scope, changed evidence or manifest unavailable. |
| OWNERSHIP_REQUIRED | Forged/expired lease or reader bound to another database. |

Schema18 deliberately does not use the schema8-only protected bootstrap inspector. There
is no reviewed maintenance evidence format/verifier yet; its protected lineage remains
UNINSPECTED/UNPROVEN. No claimed completion flag is accepted and no anchor is reinterpreted.

Schema8 reuses Part3's exact validator, original enrollment digest/fingerprint inputs,
DPAPI/ACL inspection, journal parsing and lifecycle classifier. The original row inspection
was separated from its writer-reservation wrapper into readEnrollmentSnapshot. The helper
itself also rejects18; existing schema8 gates, schema checks, reservations and predicates
remain unchanged. Presence probes/sentinel LIMITs replace full counts/unbounded row reads.
Preflight separately preserves the original FK validation with a result-bounded SELECT.

Transient ciphertext/file-identity checkpoints detect observed changes during inspection;
no digest or protected record is published. Directory enumeration is capped at2 custody
entries/128 journal entries; original file-size/path/link/ACL constraints and Part3 metadata
budgets apply. FK verification can scan auth/session history: result bounds do not prove a
fixed native I/O/latency bound. No actual SQL, credentials, private paths or key material
appears in structured results; original native error details are discarded.

## Future transition - DESIGN ONLY, not an implemented operation

1. Prepare authentic schema8 enrollment under the existing ownership boundary.
2. Confirm the original protected enrollment anchor.
3. Verify exact8 and its protected database/installation identity.
4. Require approved recoverable backup AND explicit trusted owner authorization.
5. Publish separately reviewed protected maintenance INTENT before migration.
6. Under one controlled owner, apply ONLY reviewed0009-0018 through the existing runner.
7. After confirmed SQL COMMIT, verify exact18 and preserved identity/data bindings.
8. Publish separate maintenance COMPLETION evidence linked to that intent/outcome.
9. Preserve the original enrollment anchor and baseline8 digest byte-for-byte.
10. Uncertain COMMIT, missing/corrupt evidence, mismatch or interruption halts for
    owner-authorized reconciliation; never reset, rerun setup or infer success from18.

Before implementation, approve maintenance record format/linkage, backup verification,
owner authority and explicit crash/unknown-COMMIT states. Intent without completion,
completion without matching intent, schema18 without proven authorized transition, or
mixed/unknown state must not grant startup. SQL and protected files are not jointly atomic.
No live steps4-10, maintenance format, retry/recovery writer or production activation exists.

## Actual verification and preserved behavior

**26 new distinct checks +5 selected existing schema-validator regressions PASS;0 unresolved
failures.** Results aggregate an expanded run and affected reruns, not one clean31-case run.
Scoped TypeScript and zero-warning ESLint PASS. No full historical/frontend/browser suite.

Real better-sqlite3 13.0.3, SQLite3.53.4, Windows DPAPI/ACL helpers and protected schema8
fixtures exercise matching/missing/corrupt/stale/changed evidence, pending records, missing
COMMITTED/final anchor, partial SQL state, unknown history/objects/version, forged/expired/
competing leases, wrong DB reader, expired scopes, reopen and credential-version/counter
changes. Real deferred-FK failure denies with unchanged total_changes and TEST rollback.
The protected identity/fingerprint decisions match the pre-edit source; final helper guard
and unchanged eight-file/schema/role/version/fingerprint blocks are separately recorded.

All ordinary preflight cases assert zero SQL DML, unchanged native total_changes/main/WAL
hashes and unchanged table/protected-file snapshots. Native operations are read-only open/
record-list. The injected external-file fault is explicitly distinguished from a preflight
write and is caught by the existing journal file-stat guard. Missing evidence is never repaired.

A fresh18 TEST schema was created from EMPTY, then generic TEST auth rows and real private
Better Auth/official-adapter/native-scrypt/gateway-created inventory were populated. Preflight
preserves accounts, hashes/versions/counters/registry/latch/binding/history, product, balance,
operation, movement and event rows. No8-to18 upgrade was performed, even for fixture setup.
No original fixture, shop DB, key, anchor, password or session was modified.

Initial failures are retained: one STRICT TEST table omitted its column type; external-file
fault auditing first treated its intentional mutation as a preflight write, then expected a
later rejection instead of the existing earlier journal rejection. The new deferred-FK TEST
initially reacquired the sole Kysely connection inside its own transaction and timed out;
corrected to its current transaction, passing in a fresh worker WITHOUT timeout changes.
No production validation was weakened. Evidence:
web/test-results/preflight-b2-part4a-f96b019f-8bfd-4057-a03f-f4420601bc23/.

## Exact files and critical self-review

Created:
- web/src/server/bootstrap/migration-preflight.ts
- web/tests/integration/migration-preflight.test.ts
- web/vitest.preflight.config.mts
- web/tsconfig.preflight.json
- docs/development/ENROLLMENT_B2_PART4A_MIGRATION_PREFLIGHT_REPORT.md

Modified: web/src/server/bootstrap/database.ts; docs/PROJECT_MEMORY.md; docs/MODULE_CHECKLIST.md.
All other baseline files, ALL migrations0001-0018, journal/custody/ownership/provisioning,
auth/hosting/inventory/frontend/dependency source and prior evidence remain unchanged.
Separate final preservation hashes verify HEAD/index/staged state and exact scoped edits.

All eight affected files/workflows reviewed for fail-open states, SQL/protected writes,
identity/lease pairing, schema8/18 confusion, stale evidence, bounded reads and disclosure.
No known critical defect remains in this bounded feature. This is NOT production approval
or a promise of zero bugs. Native FK/protected-file fault tests are not physical power-loss
recovery proof. Privileged file tools/whole-machine rollback, fully atomic filesystem/SQL
snapshots, complete business-data audit and target-hardware/deployment behavior are unverified.

Remaining gates: approved maintenance evidence/reconciliation and verified backup/owner
authority; trusted packaged enrollment; recovery/portable encrypted restore/rebind; DB
append-only protections; TLS/key lifecycle, signed packaging, UI/desktop/session lifecycle
and production acceptance. Existing vault inspection requires the correct Windows profile
and valid TLS material. D05/P02/P08 remain unresolved. Production HTTP stays DISABLED.

**ONE next implementation task:** after owner approves the maintenance evidence format and
crash-state rules, implement its PRIVATE READ-ONLY verifier and focused failure tests;
keep migrations, protected-record publication and production activation disabled. STOP.
