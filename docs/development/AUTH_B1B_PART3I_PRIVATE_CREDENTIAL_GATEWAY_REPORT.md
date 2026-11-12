# B1b Part3I - real private credential-verifier binding

10 November2026. **PASS for this bounded backend task; owner review pending.**
No production login/session issuance, frontend integration or production-security approval.

## Implemented and policy effect

The existing gateway adds fixed verifyAdminPassword/verifySalespersonPassword methods.
Each uses its actual pinned Better Auth1.7.18 context.password.verify with the unchanged
native scrypt/V001 callbacks. Callback identity is checked at startup; no default verifier,
raw auth.api/handler, testUtils, request-selected identity/hash/verifier or second DB owner.

Completed two-account provisioning, fixed role/provider/credential identity, active principal
and positive int64 credential-version/authorization-epoch are checked under the writer
reservation. Durable ROLE charge commits before native work. Another short transaction on
the SAME gateway queue rechecks the actual hash/update metadata, setup, active state and
versions before accepting success/resetting its streak. A race/failure rolls finalization
back; no receipt is returned. No transaction spans native scrypt.

BOTH roles:5 consecutive failed attempts,30-second cooldown; correct input cannot bypass
it, expiry permits attempts and success resets only that role. No escalating15-minute or
permanent failed-attempt lock. Clock/high-water and restart persistence safeguards retained.

The unapproved GLOBAL10-attempt/15-minute observation control is DISABLED. Its former
effect was cross-role denial, even for correct credentials. The existing GLOBAL row is
only bounded legacy-history validation/pruning and synchronized revision/time, never
newly charged or consulted for admission. It remains mandatory structural state: corruption
or SQL unavailability fails closed. No migration, existing-role reset or evidence rewrite.
Simple overall alternative implemented: one in-flight verification across BOTH roles,
fail-fast admission and no native/waiter queue. No additional long penalty or escalation.
Any stronger global policy needs separate owner approval.

Successful verification returns a frozen private receipt containing only an AbortSignal.
Private WeakMap metadata records role/version/epoch/boot and a five-second monotonic deadline.
Timer/new verification/shutdown invalidates it. Actual/forged receipts cannot authorize an
operation; no consumer/session issuer exists. A future single-use issuer MUST enforce
identity/deadline/boot and fresh SQLite versions under the writer lock, not trust signal
or serialization. Finalization is linearized at COMMIT; later revocation requires that
future issuer's fresh SQL check. Nothing is a substitute for the existing session/SQL gateway.

Shutdown rejects new work, invalidates receipts, drains native verification and denies a
late result before closing the existing owner. Nested verification rejects without closing
the outer protected transaction. Errors expose only Access denied, no nested SQL cause.

## Verification

-16 new real-integration cases PASS,0 failed.
-25 affected throttling cases PASS,0 failed; includes BOTH-role fresh Node-process proof.
-5 selected existing gateway cases PASS,22 filtered: real sessions/latch, crafted Staff/Admin
  denial, expired/nested scopes (including new verify methods), independent callback
  rollback and admitted-mutation shutdown.
-46 DISTINCT focused cases passed. Not a full frontend/browser/Part1/password-policy run.
- After inactive legacy constants were separated from active policy, only the one affected
  consecutive-streak case reran:1 pass/24 filtered. After adding the private monotonic
  receipt deadline, only its expiry case reran:1 pass/15 filtered. Not extra distinct cases.
- Scoped TypeScript and ESLint PASS, zero warnings, final changed scope.

Actual pinned framework/official adapter/SQLite and native scrypt execute. New TEST
instrumentation captures private objects and can defer completion of REAL native work
for races; it never substitutes a verification result. Disposable generated8-character
credentials and their hashes are reused only across isolated TEST databases in this run.
New tests issue NO sessions and use NO privileged testUtils. Older gateway regressions
retain their pre-existing disposable TEST session instrumentation.

Tests cover correct/wrong/cross-role and malformed envelopes, real callback identity,
pre-scrypt durable charge/no open transaction, both role thresholds/exact29999/30000ms
boundary, successful streak reset, inactive legacy GLOBAL cooldown, real-verifier reopen
with20 seconds remaining,20 simultaneous attempts, unavailable/corrupt SQL/provisioning,
finalization failure, credential version/epoch/hash/active/latch races, shutdown drain,
receipt expiry/invalidation, forged/real receipt denial and credential/log/JSON non-disclosure.
Main/WAL/SHM files are checked for known plaintext credentials/signing keys. Hashes persist
only in TEST auth_credentials; sensitive snapshot assertions emit booleans, not hashes.

Initial new fixture run was STOPPED: it mistakenly used a base adapter inside the official
transaction, waiting on the occupied connection. No passing suite result is claimed for
that run. TEST fixture corrected to supported getCurrentAdapter, matching existing
provisioning. Three TEST variable-name ESLint errors corrected. Production guards were not
weakened. A guarded line-ending mismatch aborted before writes. Diagnostic evidence retained.

Evidence: web/test-results/auth-b1b-part3i-6ea0233d-c282-494a-94ca-f94d2291fb6d/
baseline.json, initial-fixture-diagnostic.json, credentials-verified.json,
attempts-regressions.json, gateway-regressions.json, receipt-final.json,
attempt-constant-regression.json and verification-summary.json.
All earlier evidence/databases, experiments and known formatting drifts are preserved.

Commands from web: vitest.credentials.config.mts; vitest.login-attempts.config.mts;
vitest.auth.config.mts filtered to the five names above; final scoped
tsc --project tsconfig.credentials.json --noEmit; ESLint on the three auth source files,
new/affected four integration tests and vitest.credentials.config.mts. Installed tools only.

## Exact project files

Created:
- web/tests/integration/credential-verification.test.ts
- web/vitest.credentials.config.mts
- web/tsconfig.credentials.json
- docs/development/AUTH_B1B_PART3I_PRIVATE_CREDENTIAL_GATEWAY_REPORT.md

Modified:
- web/src/server/auth/gateway.ts
- web/src/server/auth/types.ts
- web/src/server/auth/login-attempts.ts
- web/tests/integration/login-attempt-protection.test.ts
- web/tests/integration/auth-foundation.test.ts
- web/tests/integration/password-callbacks.test.ts (gateway method-shape expectation only)
- web/src/server/auth/README.md
- docs/development/BACKEND_SQLITE_ARCHITECTURE_V1.md
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

No migrations/password/provisioning/database-owner source/dependencies/business/frontend
changes. Six existing tracked modifications remain; four additional untracked project
paths, now101 untracked. HEAD/index unchanged; no stage/commit/push/reset/clean/stash.
Bounded preservation hashes check every prior dirty/untracked file and prior3H evidence.

## Pending and one next task

Controlled receipt consumption/session issuance and logout/reopen/Back to Login/role-switch
lifecycle are pending. Also pending: trusted owner enrollment, recovery/rotation service,
portable encrypted restore/key custody/anchor, HTTP/CSRF/request admission and transport,
browser/Electron isolation, single-process deployment supervision and target Windows native
cost/memory/TLS/packaging/ACL/power-loss verification. Nothing here resets shop/closing data.
Native jobs that stall keep their slot until settlement; no unsafe timeout releases it.

Exactly ONE recommended next task: implement private single-use receipt consumption and
controlled RAM-session issuance with atomic SQLite registry/version binding and focused
tests, without HTTP routes or UI wiring.

Whole B1b remains incomplete. STOP for owner review; no automatic next task.
