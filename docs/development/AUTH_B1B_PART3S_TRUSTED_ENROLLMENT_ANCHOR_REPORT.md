# B1b Part3S ? Trusted enrollment and durable anchor
Date: 11 November 2026. Owner review required; whole B1b remains incomplete.

**Task A: PARTIAL.** Private backend orchestration is implemented and verified.
Physical owner authorization through a trusted packaged Windows entry is not implemented.
**Task B: PASS for the bounded TEST-verified protocol.** Production authentication remains disabled.

## Implemented

- A genuine private desktop-interaction handle requires a fresh purpose-specific
  confirmation and one-shot RAM password handoff. No HTTP flag, SID, pristine DB
  or certificate is owner proof. There is no production desktop/installer caller.
- The existing sole provisioner still writes exactly ADMIN and shared SALESPERSON.
  Genuine scoped ownership leases preserve the same process/machine fences across
  sequential uses of the existing native owner. Persistent unbound setup denies;
  prior unbound calls remain path-confined TEST-only.
- Unchanged exact-input8?128-scalar/max512-byte screening, distinctness and native
  scrypt. Explicit additive STRICT0008 binds installation/device/intent/vault digest
  to the existing latch in the SAME real official-adapter account transaction.
  No migration0001?0007, credential policy, session or business code changed.
- Protected numbered intent precedes SQL. Confirmed COMMIT is independently checked
  against exact initial accounts/versions/counters/binding, then protected COMMITTED
  and final anchor publish. CurrentUser DPAPI, restricted ACLs, exclusive pending
  files, WriteThrough/Flush(true), same-directory Win32 write-through publication
  and readback are exercised on local NTFS. No overwrite/repair/delete path.
- Verified no-write/driver rollback permits a new linked attempt only after fresh
  confirmation. Unknown COMMIT, pending/corrupt/mismatched evidence or pre-enrollment
  rollback halts for recovery review. SQL rows alone never prove a lost COMMIT reply.
  Matching protected COMMITTED plus unchanged initial SQL permits owner-confirmed
  anchor-only reconciliation, including a fresh process; passwords/accounts stay untouched.
  Bounded journal admission reserves room before invoking the account writer.

## Verification

**32 new distinct checks +20 selected existing regressions PASS;0 unresolved failures.**
Scoped TypeScript and ESLint PASS. Counts aggregate initial passing checks and
targeted reruns; this is not a claim of one clean52-case run.

Real Windows DPAPI/ACL/NTFS helper, official Better Auth1.7.18 adapter/native scrypt,
better-sqlite3 13.0.3 and actual SQLite transactions/COMMIT exercised. Coverage:
authorization/policy, exact two-account atomicity, rollback, repetition/concurrency,
intent/outcome/final-anchor faults, REAL deferred-FK COMMIT failure, lost replies,
fresh-process reconciliation, replaced/old DB/vault, corrupt/missing records,
unknown schema/history, cancellation, preserved sentinels/history and non-disclosure.
Existing checks:6 provisioning,7 custody,3 migration,1 credential-schema and3
issuance/revocation/rotation COMMIT regressions. No success/COMMIT was fabricated.

Initial diagnostics are preserved: the initial-state check incorrectly counted
format_version=1 as a zero-valued attempt counter (fixed); a weak TEST sample
matched the schema column name in the leakage scan (sample replaced with a verified
corpus member); a harmless Node loader warning violated an empty-output assertion
(specific TEST-only warning suppressed); an old private-export assertion was updated.
One60-second TEST timeout fenced later cases; the case passed separately in22.23s.
Only affected cases were rerun in fresh workers with a120-second TEST ceiling.
Application helper/security timeouts and scrypt costs are unchanged. No shop-hardware
latency claim. Older full suites, frontend/browser tests and builds were not repeated.
The existing hosting fixture received only its new schema-version expectation;
its historical runtime evidence is reused, not rerun here.

Separate ignored evidence: web/test-results/auth-b1b-part3s-e671dc11-6a28-4f35-a686-2db31d875b4c/
(verification-summary.json, original/corrected reports, scoped checks and preservation-verified.json).
New disposable fixtures use fresh subdirectories of web/test-results/sqlite-b1b-part1/.

## Exact project files

Modified (17):
- docs/MODULE_CHECKLIST.md
- docs/PROJECT_MEMORY.md
- web/src/server/auth/provision.ts
- web/src/server/bootstrap/README.md
- web/src/server/bootstrap/database.ts
- web/src/server/bootstrap/keys.ts
- web/src/server/bootstrap/ownership.ts
- web/src/server/bootstrap/windows.ts
- web/src/server/db/migrations/.gitattributes
- web/src/server/db/migrations/README.md
- web/tests/integration/account-provisioning.test.ts
- web/tests/integration/auth-foundation.test.ts
- web/tests/integration/local-hosting.test.ts
- web/tests/integration/password-callbacks.test.ts
- web/tests/integration/password-rotation.test.ts
- web/tests/integration/session-issuance.test.ts
- web/tests/integration/session-revocation.test.ts

Created (9):
- docs/development/AUTH_B1B_PART3S_TRUSTED_ENROLLMENT_ANCHOR_REPORT.md
- web/src/server/bootstrap/journal.ts
- web/src/server/bootstrap/owner-enrollment.ts
- web/src/server/bootstrap/windows-enrollment-records.ps1
- web/src/server/db/migrations/0008_auth_enrollment_binding.sql
- web/tests/integration/owner-enrollment.test.ts
- web/tests/helpers/owner-enrollment-child.mjs
- web/vitest.enrollment.config.mts
- web/tsconfig.enrollment.json

Existing test-fixture edits update only migration counts/numbers and the precise
private-export allowlist. No dependency/package/lockfile, frozen frontend, demo fixture or business-source change.

## Remaining gates and limits

Trusted signed desktop entry/physical-owner ceremony, secure input/lifecycle/IPC,
owner-held R and separate B issuance/custody/recovery, portable encrypted backup,
independent Windows restore/device/profile loss/rebind and lost-kit procedures
remain unimplemented. No recovery bypass or developer dependency was introduced.

Production TLS issuance/trust/renewal, key lifecycle, signed helper/EXE packaging
and actual shop/clean Windows acceptance remain gates. Tested current-user DPAPI
and inbox .NET P/Invoke availability do not prove other-user/device portability.
Native flush/publication APIs are used, but controller power-cut durability was
not tested; no absolute directory/hardware durability guarantee is claimed.

The anchor binds immutable enrollment identity, not every later credential/counter
or shop write. It detects pre-enrollment rollback/mismatched restore, not every
in-place replay of a later matching enrolled snapshot, simultaneous whole-machine
rollback, or malicious same-user/admin control. Future schema/restore/activation
transitions need separate review; no automatic rebinding or latch reset exists.
See [private contract](../../web/src/server/bootstrap/README.md).

## Preservation and next step

HEAD and Git index bytes unchanged; nothing staged, committed, pushed, reset,
cleaned or stashed. Git status retains6 modified tracked files and151 untracked
files (including prior work).157 untouched baseline files/prior3R evidence match;
only17 intended existing files changed and9 project files were added. Both
formatting drifts remain. No installation, Windows-setting/trust change, real
enrollment or production activation. Byte comparisons: preservation-verified.json.

ONE recommended next grouped task: implement and verify the trusted packaged
Windows owner-enrollment entry (physical confirmation and secure password handoff),
keeping production HTTP authentication disabled. STOP for owner review.
