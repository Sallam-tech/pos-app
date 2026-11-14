# Backup / restore and production security - verified TEST implementation

14 November 2026. **Authorized TEST implementation PASS; complete system PARTIAL;
production handover BLOCKED and production DISABLED.**
Parent checkpoint: 2fb62d62aa53a673d257622927da74852373ffcd.
No critical TEST check remains unfinished. Physical and protected production gates
below remain unverified. No EXE, deployment, real enrollment, shop migration or
source-data replacement.

## Approved boundaries and changes

The owner approved [A+B](BACKUP_RESTORE_PRODUCTION_SECURITY_AUTHORIZATION_CONTRACT.md),
the [narrow restore-provenance extension](TEST41_RESTORE_PROVENANCE_SECURITY_ADDENDUM.md)
and the [TEST workflow integration batch](TEST_BACKUP_WORKFLOW_INTEGRATION_APPROVAL.md).
The earlier guard-edit rejection and later usage-limit review failure executed no
rejected edit. Explicit resume continued after review recovered; neither remains
an active approval blocker.

- Exact TEST41 and every financial/authentication guard retained; all 0001-0041
  migration bytes unchanged. No financial migration or alternate account writer.
- Native consistent-read SQLite online backup; bounded typed-row/hidden-rowid
  fingerprints, exact reviewed schema, integrity/FKs and original-cost inventory,
  Returns/Expenses/Invoices/Cash/Settings reconciliation. Source identity checked.
  Free-space reserves before snapshot and encryption. Current TEST snapshot cap 1 GiB.
- Standard age v1 using pinned age-encryption 0.3.1; separate Ed25519 signed inner
  manifest, pinned public trust root, full schema/table fingerprints, SHA256/length
  and authenticated EOF. Restore authorization also checks the hash of ciphertext
  actually consumed, rejecting a valid signed archive swapped after path hashing.
  Native flushed no-overwrite publication; partial files never qualify as verified.
- Windows CurrentUser DPAPI/restricted NTFS custody. Recovery B is independent of
  login passwords. Two RAM-supplied test inputs plus a separate Node process prove
  portable decryption logic; no witnessed owner copies/new-PC acceptance claimed.
  Portable read-only capsule has no signing key, login or writer authority.
- Fresh Admin, short-lived one-use archive-hash/destination-bound restore authority.
  Empty isolated targets only. Signed DPAPI receipt and opaque destination identity
  proof required at restart. Five historical Settings table prefixes have exact
  row hashes/cutoffs; every NEW operation requires the NEW file context. Persistent
  mode rejects the TEST exception. No automatic restore promotion.
- Fresh genuine Admin configures one source/key/protected job root/export destination.
  Dedicated opaque capability holds no gateway, Admin session or password. Worker
  requires the actual runtime ownership lease and matching source. Readonly backups
  continue after logout; no business-write/credential/promotion/activation authority.
- Serialized queue, current-time 30-minute scheduling and committed closing discovery.
  Immutable closing outbox rows stay unchanged; signed external jobs track outcomes.
  Original keys/archive IDs survive restart and actual process death. Incomplete
  attempts are preserved; verified final archives are checked before recovery.
  No fabricated powered-off historical snapshots. Journal publication uncertainty
  fails closed. TEST limits: 10,000 jobs, 30,000 events, 16 historical restore origins.
- Six bounded Admin APIs: status, original job, manual, export, isolated restore,
  readonly readiness. Existing TLS/role-host/Origin/CSRF/session controls; duplicate-safe
  strict JSON <=2 KiB, URL <=200 characters, <=50 safe job DTOs, no-store/generic errors.
  No arbitrary path/URL, secret or financial payload. Mutations require fresh Admin.
- Existing TEST Settings Backup card wired, including visible latest job/failure,
  ciphertext export and explicit isolated restore confirmation. Password cleared
  on submit. Browser persists only <=256-byte original UUID/kind/archive ID marker;
  lost responses require resolution and terminal acknowledgment. Preview disabled.
- Configured TEST export verifies authenticated source ciphertext, flushes/readbacks
  and publishes without overwrite. Copying to a TEST folder is not physical off-device
  acceptance. All archives retained; pruning awaits owner storage/media acceptance.
  Cloud remains NOT_CONFIGURED.
- Exact41 readonly readiness always blocks protected production maintenance/enrollment
  and activation; sole two-account writer and original eight enrollment anchors unchanged.

Files: web/src/server/backup/ (8 source files), narrow auth/Settings provenance
integration, hosting runtime/ownership/HTTPS/backup dispatcher, existing Settings
card/component, pinned package/lock/notices, 7 new test files/3 helpers/2 configs,
and current memory/checklist/matrix/authorization/evidence documentation.

NTFS/signatures do not prove resistance to privileged whole-profile/disk rollback.
Independent owner/high-water evidence and protected production maintenance remain
gates. This implementation grants no production exception.

## Genuine verification

**17 distinct new cases +2 selected unchanged regressions =19 distinct passing
checks across focused runs; not one clean19-case full-suite run.** Earlier failed
diagnostics are preserved and have passing focused follow-ups; no final unresolved
tested failure.

Private ignored evidence: web/test-results/backup-security-preflight-20261114/.

| Coverage | Distinct cases | Passing evidence |
| --- | ---: | --- |
| Age/DPAPI/ACL, supplied B copies/separate portable child, wrong key/signer/corruption/truncation/cancel | 2 | cipher-binding-final.log |
| Correct recipient/B/key ID/manifest/DB with valid age ciphertext but wrong Ed25519 source signature | 1 | source-signature-isolated-final.log |
| Authorized provenance, forged/replayed/wrong destination/production refusal, NEW contexts, restart, internally consistent historical forgery | 2 | cipher-binding-final.log |
| Controlled ENOSPC/actual ACL denial, actual child termination during partial backup/restore, signed ciphertext swap after hash check | 3 | cipher-binding-final.log |
| Automatic/manual/closing/export/logout/restart/idempotency/source binding and actual worker kill/RUNNING recovery | 2 | verified-app-workflow-worker.log |
| Actual Chromium -> API -> backup/export -> isolated restore -> fresh login -> exact finances; lost response/original key/restart/role rejection | 1 | verified-app-workflow-worker.log; workflow-proof.json |
| Rich WAL graph/immutable receipt/cost/closing/full rows/HTTPS/Chromium/restart; interrupted copy/old schema/corruption/path refusal; real concurrent expense during online snapshot | 5 | workflow-focused-2.log (rich positive); core-final-attempt.log (3 negatives); adversarial-volume-focused.log (WAL) |
| Retained1k/10k/50k originals unchanged; new TEST41 copies encrypt/restore/login/reconcile | 1 | adversarial-volume-focused.log; volume-progress.json |
| Existing password audit/revocation/fresh-login recovery and exact5-failure30-second BOTH-role limit | 2 | faults-regressions-final.log |

Controlled ENOSPC is an injected real file-write error; actual disk-full hardware is
NOT_VERIFIED. Child-process termination is real; physical power loss is NOT_VERIFIED.
Portable child uses supplied B/public trust, not DPAPI custody; physical independent
Windows/profile recovery is NOT_VERIFIED.

Recorded retained-data run (before final additional ciphertext-binding refinement):

| Expense rows | Snapshot bytes | Backup ms | Restore validation ms |
| ---: | ---: | ---: | ---: |
| 1,000 | 3,928,064 | 4,491 | 3,970 |
| 10,000 | 28,700,672 | 12,635 | 6,522 |
| 50,000 | 139,325,440 | 32,302 | 16,963 |

These are local synthetic measurements, not target-hardware capacity/SLA acceptance.
Final ciphertext refinement subsequently passed crypto, provenance, crash, worker
and full UI/API/login/reconciliation follow-ups.

Final scoped TypeScript type-accepted.log PASS; full touched-scope zero-warning
lint-cipher-binding.log plus lint-accepted-followup.log PASS. Exact final isolated
Next build build-verified.log PASS, app-verified-463fcd08-8536-44a7-80be-63bd5b749012.
Next's multi-lockfile workspace warning is retained; no lockfile was deleted.

final-source-preservation-review.json PASS: all329 source files match built bytes;
312 original source files unchanged,7 reviewed shared edits and10 new source files;
all34 unrelated paths and41 migrations unchanged.41 client output files scanned:
no private custody/key markers. Reviewed explicit39 related paths; no evidence,
database, vault, TLS material, environment file or node_modules staged.

Dependency audit: dependency-audit-runtime.json reports0 runtime findings.
dependency-audit-after.json reports7 MODERATE dev-tool findings,0 HIGH/CRITICAL.
No unrelated dependency update/audit fix; these findings remain. This is no security
certification. THIRD_PARTY_BACKUP_NOTICES.md contains installed BSD/MIT notices;
lock changes introduce the pinned encryption chain without changing old versions.

Initial failures: relocated raw Settings context; helper parser/scope registration;
test comparison of volatile per-file fingerprint/capture metadata; early Login
hydration; unsupported setup SQL form; expected auth-rate revision/high-water updates.
Corrections preserve guards. Fixed-cutoff economic values match exactly; capture
times/new file identity checked separately. Fault test compares every other table
exactly and checks only legitimate monotonic rate-metadata changes separately.
Source review also caught the ciphertext hash/decryption race; a valid-signed
substitution now fails against consumed bytes.

## Remaining release gates

| Gate | Status |
| --- | --- |
| Two separately protected owner B copies, witnessed retrieval and pinned public trust kit | NOT_VERIFIED |
| Independent replacement Windows PC/profile with actual owner custody | NOT_VERIFIED |
| Protected schema41 production maintenance/enrollment and former-writer fencing | BLOCKED; readonly readiness only |
| Target TLS trust, removable/off-device media, physical power-loss/disk-full | NOT_VERIFIED |
| Owner storage budget/retention activation/cloud destination/account | BLOCKED/NOT_CONFIGURED; all archives preserved |
| Physical cash evidence, target-hardware50k capacity and printer | Separate retained gates |

Safe LOCAL checkpoint follows exact related-path/index/hash/secret review. Parent
and actual checkpoint outcome are recorded in ignored local-checkpoint.json and
the final delivery; inspect live Git. No push/reset/clean, EXE or production activation.
