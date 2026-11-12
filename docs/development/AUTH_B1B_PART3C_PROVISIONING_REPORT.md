# B1b Part 3C - private atomic two-account provisioning

10 November 2026, Asia/Karachi. **PARTIAL: bounded backend verified; permanent
enrollment, owner recovery and restore contract still require review before real use.**
No production account/database was provisioned, no login/session feature was enabled.

## Implemented safe portion

Private server-only runTrustedFirstRunSetup requires an explicit trusted-server call and
one-shot RAM password reader. Import/start/open never applies migrations or creates accounts.
The reader is not called for completed, partial or unknown state. There is no HTTP/CLI/env
entry, signup/reset handler, raw adapter/API return or default password/signing secret.

Reuses Part3B EXACT-input15..128 scalar/max512-byte policy and both callbacks unchanged.
Checks actual credential equivalence with timingSafeEqual over fixed516-byte UTF-8/length
buffers; independent salted hashes are NOT a distinctness test. Original Unicode/whitespace
values go unchanged to scrypt. Both hashes self-verify BEFORE acquiring SQLite writer lock.

Offline screening uses a pinned, MIT-licensed SecLists common-password corpus:
99,840 original records,331 eligible under existing minimum,329 case-folded unique SHA-256
entries retained. The downloaded plaintext was never saved or printed. Runtime validates
the code-pinned digest/size/count and fails closed if unavailable/changed. Whole-value short
repetitions also reject. Fast membership hashes are NOT stored user credentials. Dataset
is historical/bounded, not an all-breaches list or guarantee of password strength.
[Full provenance, limits, license and transform](../../web/src/server/auth/offline-policy/README.md).

Adds ONLY0006_auth_provisioning.sql through the unchanged reviewed additive runner.
STRICT singleton row references BOTH principals with RESTRICT FKs, format/version/time.
No migration seed data. Existing0001..0005 checksums and Part1 runner are unchanged.

Uses the actual pinned official Kysely adapter, core runWithTransaction/getCurrentAdapter
and the existing one-connection native owner. No privileged testUtils/Better Auth handler/
session issuer/signing key is needed for setup. The owner's ONLY change is its TypeScript
config parameter narrowed to the two fields already used; runtime safety behavior unchanged.
Setup and gateway share the existing same-PID ownership fence, so they cannot run as
separate owners concurrently. This does not introduce multi-process authentication.

Writer reservation occurs BEFORE repeated pristine/history/exact-schema/STRICT checks.
Both fixed user records, both credential records, both active/version1/epoch1 principal
records and the completion latch commit together. No session row or bearer is created.
No UPDATE/UPSERT of existing credentials, deletion, repair/adoption or reset path exists.
No intermediate active account is visible to an independent reader.
Callback/SQL failure, including a failure after the pending latch, rolls back all records.
Retry is allowed only if the whole original pristine state remains intact.

Setup currently recognizes ONLY the six reviewed auth migrations and no additional
schema objects. Unknown/newer/modified history, schema, partial records or deleted latch
with retained identities fail closed. Future business-schema setup compatibility needs review.
No existing shop record is deleted or adopted.

The authoritative gateway now additionally requires a valid completion latch and matching
principal provisioning timestamps before EVERY grant, inside its existing transaction.
A real signed TEST RAM session is denied after the latch is removed.
Existing version/epoch/boot/revocation/expiry/role checks remain; no new public capability.

## Latch, recovery and restore implications

The completion latch is permanent THROUGH THE SUPPORTED APPLICATION API: there is no clear,
reset or overwrite operation. Its FKs protect referenced principals while it exists.
It is not a tamper-proof device enrollment record. Privileged direct SQLite/file edits can
delete/alter metadata; restoring an entire pre-bootstrap snapshot can reproduce empty state.
No SQLite-only flag can detect whole-database rollback without an external trusted anchor.
No trigger grammar, hidden reset, emergency password or bypass was introduced.

A future first-run lifecycle MUST establish actual owner authorization, secure secret input
and device/enrollment custody before invoking this function. A callback/type is not evidence
of owner identity. No such ceremony/transport is implemented or approved by these tests.
Production invocation remains gated.

All verified backups must preserve the latch, BOTH identities/credentials/principals,
schema history and future shop records in ONE consistent image. Never strip the latch or
re-run setup to repair restored data. Recovery must authenticate the owner and change
credentials/versions atomically without deleting identities/history or clearing completion.
Lost Admin password, encrypted portable key custody, device replacement and restored
enrollment verification are explicitly UNIMPLEMENTED policy/implementation gates.

On any ambiguous completion/close/acknowledgment failure, inspect state under trusted
maintenance; do not auto-clear or overwrite it. A committed latch makes retry refuse.
Failed attempts before COMMIT are recoverable through the ordinary pristine retry path.
No production backup/recovery operation was performed or implemented.

## Focused evidence

- NEW provisioning file: FINAL19 passed /0 failed/skipped/pending.
- Affected existing migration/gateway subset:2 passed /25 intentionally name-filtered skipped.
  This is not a repeat of the full Part3A suite.
- Focused TypeScript and scoped ESLint PASS, zero warnings.
- Earlier18-case run and initial2-case subset retained, NOT added to final count.
  A later19-case run had one test-only alias ReferenceError after a lint rename.
  Corrected; final19 all pass. Original failure evidence remains separate.
- Real SQLite/official adapter transactions/native scrypt, exact roles and hashes,
  independent-reader atomic visibility/writer contention, identical/Unicode-distinct/invalid/
  common/weak/malformed inputs, offline-artifact failure, actual SQLite CHECK rollback,
  async/late rollback and retry, concurrent/repeated attempts, ownership exclusion,
  unknown/partial/missing-latch/history/path/schema rejection and reopen persistence.
- Real private Better Auth checkPassword verifies both provisioned TEST credentials.
  Production has no testUtils; the EXISTING gateway regression uses its official TEST-only
  instrumentation to verify latch enforcement with signed disposable sessions.
- Every NEW fixture main/WAL/SHM scanned after close for known TEST plaintext passwords
  and keys. Provisioning-only tests issue NO sessions. The targeted pre-existing gateway
  fixture also scans its known disposable bearer/cookie values. No real credentials,
  secret values or plaintext corpus appears in source fixtures, ordinary output or evidence.

Evidence: web/test-results/auth-b1b-part3c-e2c442e3-2d61-46b2-aff7-adbca46ff9a6/
baseline.json, initial-atomic.json, provision-focused.json, provision-final.json
(the retained test-typo failure), provision-verified.json, latch-gateway-regressions.json,
verification-summary.json.
Fresh TEST files only under permitted sqlite-b1b-part1/provision3c-* and the existing
gateway helper's new auth3-* run. Prior evidence/databases were not overwritten.

Commands from web:
- node node_modules/vitest/vitest.mjs run --config vitest.provision.config.mts
- node node_modules/vitest/vitest.mjs run --config vitest.auth.config.mts -t "installs six|accepts actual role-bound"
- node node_modules/typescript/bin/tsc --project tsconfig.provision.json --noEmit
- node node_modules/eslint/bin/eslint.js src/server/auth/provision.ts src/server/auth/offline-password.ts src/server/auth/database.ts src/server/auth/gateway.ts tests/integration/account-provisioning.test.ts tests/integration/auth-foundation.test.ts tests/integration/password-callbacks.test.ts vitest.provision.config.mts --max-warnings=0

No full prior/frontend/browser/application suite/build, dependency install or whole-project
scan. Existing Part3A27/Part3B19 results remain historical evidence, not freshly recertified.

## Exact file scope

Created:
- web/src/server/db/migrations/0006_auth_provisioning.sql
- web/src/server/auth/provision.ts
- web/src/server/auth/offline-password.ts
- web/src/server/auth/offline-policy/common-passwords.sha256
- web/src/server/auth/offline-policy/manifest.json
- web/src/server/auth/offline-policy/LICENSE.txt
- web/src/server/auth/offline-policy/README.md
- web/tests/integration/account-provisioning.test.ts
- web/vitest.provision.config.mts
- web/tsconfig.provision.json
- docs/development/AUTH_B1B_PART3C_PROVISIONING_REPORT.md

Modified:
- web/src/server/auth/database.ts (TypeScript config shape only)
- web/src/server/auth/gateway.ts (additional authoritative completion check)
- web/tests/integration/auth-foundation.test.ts (migration6/fixture7/latch regression)
- web/tests/integration/password-callbacks.test.ts (expected schema version6 only)
- web/src/server/auth/README.md
- web/src/server/db/migrations/README.md
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

No password.ts or existing SQL migration changed. Prior B1a/Part1/experiment/evidence,
dependencies/manifests/lockfile, frozen frontend/demo fixtures and known formatting drifts
remain preserved. No stage/commit/push/reset/clean/stash or Windows/system change.
Final bounded hash/Git/source manifest accompanies evidence; no repeated whole-project scan.

## Outstanding review flags / stop

Backend minimum15 vs frozen UI preview8 remains unresolved for future wiring.
Target Windows login memory/latency is unverified; scrypt remains roughly128MiB working
memory/job, max192MiB, module limit2. This setup hashes/verifies sequentially outside locks.
Owner recovery/encrypted restore/enrollment, persistent throttling, real login/logout,
password rotation/version binding, HTTP/UI wiring, deployed browser/Electron role isolation,
TLS, OS key/pagefile/ACL custody and cross-process supervision remain pending.
Whole B1b and production readiness are NOT approved.

Exactly ONE recommended next task: owner recovery and restore/enrollment contract review
before enabling any real first-run ceremony or login.
STOP for owner review.
