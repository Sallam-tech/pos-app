# B1b Part3R - protected local custody and enrollment preparation

11 November2026. **Task A: PASS for the tested custody foundation.
Task B: PARTIAL. Production authentication and accepted enrollment remain disabled.**

## Implemented

A: explicit private key creation/reopen with Windows inbox PowerShell5.1/.NET
CurrentUser DPAPI, restricted current-user/SYSTEM ACLs, separate random role-signing
secrets and encrypted TLS identity/installation metadata. Real existing TLS
validation is reused; no production certificate issuance/trust exception/store
change. Only version marker and encrypted DPAPI bytes persist.

Creation requires a pristine exact seven-migration database under the SAME auth
fence, machine-wide runtime guard and existing SQLite owner. A no-change writer
reservation excludes provisioning races; no account/schema/latch is written.
Existing/missing/corrupt custody is never repaired or overwritten. Existing
enrollment cannot acquire replacement keys just because its key folder is absent.
Reopen checks native ACL/owner, payload/version, SID, DB path/file identity and TLS.
Failures return generic errors; private containers reject JSON/redact inspection.
Secret pipes are private; no secret args/env/logging. Buffer cleanup is best effort.

B: private preparation validates custody and pristine schema/history/counts.
It ALWAYS returns ownerAuthorizationRequired=true, enrollmentAccepted=false and
productionActivation=false. There is NO owner grant, setup/password endpoint,
accepted-enrollment transition or new provisioning implementation.
The unchanged runTrustedFirstRunSetup remains the sole atomic two-account writer;
it is exercised with real pinned Better Auth/SQLite in disposable tests.

## Why enrollment remains partial

The existing recovery contract still requires approved owner-authorizing local
action, R custody/acknowledgment, durable matching SQL/external enrollment anchor
and crash reconciliation. Windows/DPAPI user identity or localhost is not owner
proof. No irreversible journal/acceptance/recovery policy was invented.
No new migration or persistent activation path was added.

The prepared vault is NOT a permanent enrollment-freshness anchor. File binding
detects replaced/copied files; it cannot prove whole-machine/in-place rollback,
fence sequential clones or replace owner-held evidence. A random device UUID is
not hardware attestation. Uncertain enrollment remains blocked; no automatic reset.

## Focused verification

**21 distinct new tests +6 selected existing provisioning regressions PASS.
Zero unresolved failures. Scoped TypeScript/ESLint PASS.**
Actual Windows DPAPI and ACL enforcement, actual helper processes, independent
Node-process reopen/competing ownership, pinned Better Auth/official adapter and
native SQLite. Corruption, wrong application entropy, broadened ACL, hard links,
missing/replaced/mismatched DB, failed/partial writes, simultaneous creation/
preparation, rejected enrolled/partial/history/schema states, private gateway
restart denial, no auto-provision, secret non-disclosure and preserved data/history.
Six regressions cover atomic visibility, native/late rollback, concurrency, shared
gateway ownership and partial/missing-latch refusal.

No Node internet connection was required in the test run. Physical disconnect,
different Windows identity/profile, cold/offline domain profile and actual shop
hardware remain untested. Application-context rejection is not a different-user test.
CurrentUser DPAPI does not protect against the same user/admin/malware or guarantee
portable recovery. Keys do NOT encrypt the business DB. R/Admin reset and B/portable
backup remain separate, unissued and unimplemented. No real accounts/data used.

Initial2pass/16fail shared a WRITE_OWNER request denied by Windows. Keeping the
verified existing current-user owner and applying only the restrictive DACL fixed
it without elevation or weaker ACLs.18 cases then pass; shared pristine/rekey
guards and3 process/missing-identity cases bring the final run to21pass.
Two affected redaction cases pass afterward; counts are merged, not summed.
Initial React-hook lint false positive from callback name use was corrected by
renaming it. All old/new evidence retained.
Disposable TEST certificate generation was also corrected to encrypted PKCS8
files with a random RAM-only passphrase over stdin. The eight temporary plaintext
fixture keys created in earlier3R runs were protected with recoverable CurrentUser
DPAPI before handover; earlier parts and result logs were untouched. Two affected
cases pass again. No plaintext3R certificate key remains on disk.

Evidence: web/test-results/auth-b1b-part3r-2c57f55d-1e23-418c-bb49-427ec8049d4d/
baseline.json; bootstrap-initial/correction/final/redaction.*;
provision-regressions.*; scoped check logs; verification-summary.json.
Fresh disposable material remains only in new ignored bootstrap3r-* directories.
No build, installation, frontend/browser suite, OS setting/certificate-store change.

## Exact project files

Created:
- web/src/server/bootstrap/keys.ts
- web/src/server/bootstrap/windows.ts
- web/src/server/bootstrap/windows-protection.ps1
- web/src/server/bootstrap/ownership.ts
- web/src/server/bootstrap/database.ts
- web/src/server/bootstrap/enrollment.ts
- web/src/server/bootstrap/README.md
- web/tests/integration/protected-bootstrap.test.ts
- web/tests/helpers/protected-bootstrap-child.mjs
- web/tsconfig.bootstrap.json
- web/vitest.bootstrap.config.mts
- docs/development/AUTH_B1B_PART3R_PROTECTED_BOOTSTRAP_REPORT.md

Modified:
- web/src/server/hosting/https.ts (export existing TLS validation without listening)
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

All prior auth/provision/DB/migrations/frontend/dependencies/evidence/drifts preserved;
HEAD/index unchanged. Git:6 modified tracked files +142 untracked files, nothing
staged. Exact hashes/status and merged results: verification-summary.json.

Remaining gates: trusted owner ceremony and accepted external anchor/reconciliation;
R recovery, independent portable encrypted B backups/restore and device transfer;
production TLS trust/renewal/signing-key custody lifecycle, signed packaged helper/
Windows EXE/desktop lifecycle, target hardware and production activation/UI.
No Part3Q TEST certificate exception is used as production trust.
[Private API/limits](../../web/src/server/bootstrap/README.md).

ONE next grouped task: approve the trusted owner-setup action and enrollment-anchor/
crash-recovery rules, then implement their one-time orchestration around the existing
atomic provisioner. Whole B1b is incomplete. STOP for owner review.
