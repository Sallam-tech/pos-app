# B1b Part3H - persistent login-attempt foundation

10 November2026. **PARTIAL: reusable backend verified; real login/lifecycle binding pending.**
No currently nonexistent login route is claimed protected. No production accounts/sessions.

## URGENT owner correction (current policy)

The original15-minute cooldown was NOT owner-approved and is superseded. BOTH roles now
have5 consecutive failures followed by exactly30 seconds of cooldown. A successful
verification clears only its role streak; expiry starts a fresh allowance. No escalation
or permanent failed-attempt lockout. Correct input cannot bypass the active cooldown.
The separate overall observation window described below is not a lockout duration.

Correction verification:25 focused tests pass/0 unresolved failures. Fresh-process tests
for BOTH roles prove20 seconds remaining after restart, denial at29999ms and acceptance
at30000ms. Three repeated failure/cooldown cycles never increase the penalty. Success on
the fifth input resets only its role; consecutive counts do not silently expire with the
GLOBAL observation window. SQL/concurrency/fail-closed and actual native verifier cases pass.
A later strengthened GLOBAL expiry assertion initially used1ms for a1000ms scenario gap;
TEST timing corrected and only that case rerun:1 pass/24 filtered. Original failed result
retained. Scoped TypeScript/ESLint pass. The prior11 unaffected provisioning/gateway results
are reused, not rerun or added to the25-case count.

Separate correction evidence:
web/test-results/auth-b1b-part3h-owner-policy-eb881ac2-b72c-4486-b971-7a272a68c956/
baseline.json, attempts-correction.json, overall-expiry.json (TEST timing failure),
overall-expiry-corrected.json and verification-summary.json. Earlier evidence/databases intact.

Exactly8 files modified by the correction (no new tracked-project paths):
- web/src/server/auth/login-attempts.ts
- web/tests/integration/login-attempt-protection.test.ts
- web/tests/helpers/login-attempt-restart.mjs
- web/src/server/auth/README.md
- docs/development/BACKEND_SQLITE_ARCHITECTURE_V1.md
- docs/development/AUTH_B1B_PART3H_LOGIN_ATTEMPT_PROTECTION_REPORT.md
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

No migration or provisioning/gateway/password source changed. Superseded15-minute TEST
state fails validation without silent rewriting/reset; no operational database used that
policy. An actual incompatible state would require reviewed maintenance. Integration is
still PARTIAL; no real login, route or session is activated.

## Implemented

Internal server-only createLoginAttemptProtection takes the EXISTING owner, its trusted
serialized official transaction runner and one fixed trusted verifier at construction.
It opens no connection; returns only fixed ADMIN/SALESPERSON verification capabilities.
No per-request verifier, admission/reset/refund API, caller-selected identity/IP authority,
raw Better Auth handler/API, session or role grant. Duplicate owner mounting rejects.

Current role rule is owner-approved; the separate GLOBAL policy remains proposed:
-5 CONSECUTIVE charged failures per ROLE, then30-second cooldown.
-10 across BOTH roles in a rolling15-minute OBSERVATION window, then30-second overall cooldown.
- One in-flight verifier per owner; no waiter/native-KDF queue.
- Success clears its ROLE streak; GLOBAL removes only its provisional charge.
- Expired cooldown clears the completed streak/batch and permits a fresh allowance.
- Blocked requests do not extend cooldown or invoke verification. Busy requests do no
  credential work. No permanent failed-attempt lockout flag or privileged reset was added.
Overall cooldown can temporarily affect both roles; ongoing attacks remain an availability
risk. GLOBAL threshold/window and reservation availability tradeoffs still require review.
No15-minute penalty or stronger escalation is implemented.

Additive STRICT0007_auth_login_attempts defines exactly three allowlisted buckets and
fixed safe-integer slots/revision/security time: maximum20 positive failure timestamps.
No passwords, submitted-password digests, bearer tokens, IPs or request identifiers.
GLOBAL history ages out on the next non-cooling request; ROLE streaks clear only at
success/cooldown expiry. Fixed high-water rows remain; storage stays bounded.

A real writer reservation and atomic update commit the provisional failure BEFORE any
verification. Wrong/error/abandoned attempts keep it across restart. No transaction spans
scrypt. Correct results cannot bypass existing cooldown; successful finalization rechecks
the exact revision/snapshot, clears its ROLE streak and removes its GLOBAL charge atomically. SQL/finalization/
uncertain-transaction failure denies. Nested transactions reject without disrupting the
outer operation. Verifier false, exceptions and non-boolean truthy results all deny generically.

Security time advances by monotonic elapsed time during uptime; wall rollback cannot erase
history or freeze cooldown forever. Reopen starts no earlier than persisted high-water
time. If wall time is behind, untrusted downtime is not credited; stable uptime can finish
the remaining cooldown. Invalid/unsafe/reversed clocks deny. Forward clock manipulation
at boot, privileged DB edits/rollback and actual power-loss durability are not certified.

0007 creates NO rows. Existing private pristine setup now requires the seven-file schema
and initializes all three zeroed buckets with BOTH accounts/principals/completion latch in
ONE transaction. Rollback/retry/concurrency protections remain. No login/startup/import
recreates deleted state. Existing enrolled-v6 data needs a separately reviewed maintenance
transition; applying the table alone fails closed, never re-provisions/erases shop records.
0001-0006 are byte-identical; Part1 runner and actual STRICT/checksum checks are unchanged.

## Original pre-correction verification (historical)

The counts below describe the original run, not the current owner policy proof above.
FINAL23 new throttle tests passed/0 failed/skipped. Seven selected provisioning regressions
pass/14 filtered; four selected gateway/migration regressions pass/23 filtered.
**34 selected checks passed; no unresolved failure.** Scoped TypeScript/ESLint pass.

Actual SQLite/native owner, pinned official Kysely adapter/core transactions run throughout.
New majority tests use explicitly disposable TEST verifier decisions; one uses the existing
real native scrypt callbacks. This does NOT prove full Better Auth login/session integration.
A fresh Node24 process loads the actual production TS with a TEST-only loader/marker alias,
proves persisted cooldown blocks a positive verifier WITHOUT calling it, then proves expiry
permits it. No framework/database/transaction behavior is mocked for compatibility proof.

Coverage: both roles/thresholds/overall/rolling expiry, correct-during-cooldown refusal,
success preserving other-role/GLOBAL failures, no extension/permanent latch, partial history
and wall rollback after reopen, forward/invalid/monotonic anomalies, missing/corrupt state,
int64 overflow, SQL-before-verification and partial-update rollback, finalization failure,
precommit injection, verifier failures,20 concurrent requests/no KDF queue, stale completion,
nested-transaction preservation, credential/log/response non-disclosure and duplicate mount.
New throttle fixtures create NO accounts/session rows; closed main/WAL/SHM scanned for known
generated plaintext secrets. Selected pre-existing gateway helpers issue only disposable TEST
sessions; no production issuance/testUtils was added. Provisioning regressions create only TEST
accounts and now prove security rows initialize/roll back with the accounts/latch.

Initial new suite:6 pass/16 fail because TEST adapters omitted the application's model/RAM-
storage mappings, so pinned schema checks denied before verification. TEST-only mapping fixed;
initial overly weak restart assertion strengthened with persisted-count and positive-expiry
checks. Pinned helper Promise typing corrected with async/await. Guards were not weakened.
After22 passed, a nested-owner guard/regression was added; FINAL23 pass. Original failures,
diagnostic and intermediate evidence remain separate and are not summed.

Evidence: web/test-results/auth-b1b-part3h-70647cd5-0165-4710-becf-2a9162b142dc/
baseline.json, attempts-focused.json, threshold-diagnostic.json, attempts-verified.json,
attempts-final.json, provisioning-regressions.json, gateway-regressions.json,
verification-summary.json. No submitted credential values. Disposable files only under
existing sqlite-b1b-part1 TEST paths. No password-policy/full frontend/browser/old experiment
suite, installation, build, business or Windows-system change.

Commands from web:
- node node_modules/vitest/vitest.mjs run --config vitest.login-attempts.config.mts
- node node_modules/vitest/vitest.mjs run --config vitest.provision.config.mts -t "creates both fixed|rolls back a failure after|rolls back an actual|rolls back an async|rejects concurrent bootstrap|refuses partial|reopens with the latch"
- node node_modules/vitest/vitest.mjs run --config vitest.auth.config.mts -t "installs seven|accepts actual role-bound|prevents Staff credentials|fails closed on real SQL"
- node node_modules/typescript/bin/tsc --project tsconfig.login-attempts.json --noEmit
- Scoped ESLint: login-attempts.ts, provision.ts, the new test/restart helper, affected three
  existing integration tests and vitest.login-attempts.config.mts; zero warnings.

## Exact file scope

Created:
- web/src/server/auth/login-attempts.ts
- web/src/server/db/migrations/0007_auth_login_attempts.sql
- web/src/server/db/migrations/.gitattributes
- web/tests/integration/login-attempt-protection.test.ts
- web/tests/helpers/login-attempt-restart.mjs
- web/vitest.login-attempts.config.mts
- web/tsconfig.login-attempts.json
- docs/development/AUTH_B1B_PART3H_LOGIN_ATTEMPT_PROTECTION_REPORT.md

Modified:
- web/src/server/auth/provision.ts
- web/tests/integration/account-provisioning.test.ts
- web/tests/integration/auth-foundation.test.ts
- web/tests/integration/password-callbacks.test.ts (schema-version expectation ONLY)
- web/src/server/auth/README.md
- web/src/server/db/migrations/README.md
- docs/development/BACKEND_SQLITE_ARCHITECTURE_V1.md
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

## Pending binding and stop

Future login must construct this once inside the existing fenced single-process gateway,
use its SAME serialized owner queue for both short transactions, bind the real private
Better Auth credential verifier, recheck role/credential-version/epoch before authentication
publication and drain verifier work before close/reload. A stalled verifier stays busy until
settlement/restart; releasing it early could queue native work and is not done.
A resolved void is NOT an authorization/session capability. No unrestricted endpoint is added.

Overall settings/reservation availability tradeoffs, actual login/session lifecycle, owner enrollment/
recovery, persistent request admission/CSRF/transport limits, rotation/revocation binding,
deployed role isolation, protected storage/restore freshness and target deployment remain
gates. Business records/closing/backup behavior and both8-character password policies unchanged.
No real operational database was migrated. Whole B1b and production readiness are incomplete.

Git HEAD/index unchanged; previous six tracked modifications retained; eight new untracked
paths. Bounded preservation hashes protect prior work/evidence/drifts outside the stated
authorized modifications. No stage/commit/push/reset/clean/stash.

Exactly ONE recommended next implementation task: bind this capability to the private
Better Auth credential verifier and existing gateway scheduling/close lifecycle, with
authoritative version/epoch checks and focused tests, without routes/sessions/UI.
STOP for owner review.
