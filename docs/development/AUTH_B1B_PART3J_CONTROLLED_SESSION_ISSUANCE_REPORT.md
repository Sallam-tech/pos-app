# B1b Part3J - controlled private session issuance

10 November2026. **PASS for bounded backend implementation; owner review pending.**
No public login/logout route, UI wiring, real enrollment or production security approval.

## Implemented

- Two fixed private methods consume genuine gateway receipts once. Identity, role, boot,
  AbortSignal and five-second monotonic deadline are enforced. Even a later failed/cross-role
  attempt burns a genuine receipt; retry requires fresh password verification.
- SAME owner/queue/lifecycle. Inherited Better Auth adapter contexts and nested/native
  transactions reject safely. Writer reservation precedes provisioning/active/credential
  hash/update metadata/version/epoch checks and lasts through registration COMMIT.
- Actual pinned AuthContext.internalAdapter.createSession generates the session ID/bearer.
  getCurrentAdapter inside the framework joins this official transaction, avoiding the
  base-adapter deadlock. RAM secondaryStorage only; no SQL token model or custom bearer.
- Validated owner lifetime is snapshotted against caller mutation and overrides the
  framework's dontRememberMe24h default. Official
  createAuthEndpoint.serverOnly (pathless, never registered) supplies the real context for
  setSessionCookie. Cookies are host-only/Secure/HttpOnly/SameSite=Strict, no persistent
  Max-Age/Expires. No-store success JSON is only {"ok":true}. The browser must hold its
  signed session cookie; the server stores credentials only in RAM.
- Cookies/Response remain private until the native registration COMMIT succeeds. SQLite
  stores only NON-BEARER ID, role/version/epoch/boot/expiry/revocation bindings. Final checks
  reject state changes. No session/Actor/SQL privilege follows from a receipt alone.
- RAM/SQLite are not one atomic store: failures discard staged headers and attempt RAM
  deletion/clearing. Any possibly committed row is revoked. SQL uncertainty quarantines
  the entire owner. A surviving RAM session cannot bypass absent/revoked SQL authorization.
- Session lookup/cache-refresh bypass stays disabled; every protected call rechecks SQL.
  Shutdown drains issuance and denies late publication, clears RAM, closes the same owner
  and preserves persisted records. Restart invalidates old cookies.

Pinned contracts inspected locally: core types/context.d.mts (createSession); core api/index
(serverOnly); better-auth db/internal-adapter.mjs (createSession/current adapter/RAM lookup/
deleteSession); cookies/index.mjs (setSessionCookie). These are typed/exported extension
facilities used by production plugins in1.7.18. No upstream patches, testUtils, manual
cookie signatures or exposed raw handler/API. Framework upgrades require review.

Approved password/throttle policy unchanged: BOTH8+;5 consecutive wrong/30-second durable
cooldown; no global10/15-minute admission, escalation, permanent lock or PIN. No dependency,
production migration, account-provisioning, password, throttle or business-service change.

## Focused verification

19 NEW distinct integration cases +3 selected existing gateway regressions PASS;0 failures.
Scoped TypeScript and ESLint PASS, zero warnings. Existing3H/3I password/throttle evidence
reused; no repeated full previous suites, frontend/browser/build/install/system changes.

New19 coverage: both genuine signed-cookie roles, secure nonpersistent cookie attributes,
same owner/native callback/adapter path, no pre-COMMIT publication, forged/serialized/getter/
aborted/expired/replayed/cross-role receipts, once-only consumption, stale provisioning/
credential/hash/version/epoch/active state, external writer exclusion, internal version-change
rollback, simultaneous admission, nested/inherited framework context rejection, registration
SQL failure, REAL deferred-FK SQLite COMMIT failure, dual RAM cleanup failure, actual committed
row followed by acknowledgment failure/revocation, SQL-compensation quarantine, bad clocks/
cookie failure, fixed expiry/revocation/restart, shutdown drain and non-disclosure.

Tests use real installed framework, official adapters/native SQLite, unchanged native scrypt
and actual signed cookies, with disposable generated8-character fake accounts. Passthrough
TEST instrumentation adds fault/barrier observations; it never fabricates sessions or crypto.
A disposable0008_test_commit_guard table (never a production migration) causes a real deferred
FK failure on COMMIT. No privileged testUtils in the new proof. Previous gateway regression
helpers retain their existing disposable TEST-only sessions.

The two critical contract cases ran first (2 pass); remaining16 ran once (16 pass,2 filtered).
Final review added inherited-context guard/test; targeted run5 pass/14 filtered includes
that new case and four relevant reruns. The fixed-expiry case also reran once after
snapshotting validated config; caller mutation cannot change the opened lifetime.
Union=19 cases, not24. Existing gateway3 pass/24
filtered. No test failure occurred. Staged cookies deliberately captured ONLY in TEST RAM
to prove a genuinely surviving framework session still fails SQL authorization when BOTH
cleanup mechanisms throw. No credential/header values in evidence. Closed DB/WAL/SHM
scanned for generated plaintext credentials, signing keys and bearer/cookie values.

Evidence: web/test-results/auth-b1b-part3j-cc3a1733-0b9b-4be5-b7d6-ae12012de7e9/
baseline.json, contract-focused.json, issuance-focused.json, ownership-final.json,
gateway-regressions.json, expiry-final.json and verification-summary.json. Older evidence/databases unchanged.
Commands from web: vitest.sessions.config.mts filtered as above; vitest.auth.config.mts
filtered to actual role/latch, nested scopes and admitted-mutation shutdown;
tsc --project tsconfig.sessions.json --noEmit; scoped ESLint on7 source/test/config files.

## Exact files

Created:
- web/tests/integration/session-issuance.test.ts
- web/vitest.sessions.config.mts
- web/tsconfig.sessions.json
- docs/development/AUTH_B1B_PART3J_CONTROLLED_SESSION_ISSUANCE_REPORT.md

Modified:
- web/src/server/auth/gateway.ts
- web/src/server/auth/types.ts
- web/tests/integration/credential-verification.test.ts (capability list only)
- web/tests/integration/auth-foundation.test.ts (capability lists only)
- web/tests/integration/password-callbacks.test.ts (capability list only)
- web/src/server/auth/README.md
- docs/development/BACKEND_SQLITE_ARCHITECTURE_V1.md
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

Six pre-existing tracked modifications remain;105 untracked paths (four added), empty index,
unchanged HEAD. Preservation hashes verify all old dirty/untracked files except the stated
nine modifications, plus prior3H/3I evidence. Known formatting drifts, frontend, fixtures,
migrations0001-0007, dependencies and all earlier modules remain intact. No Git mutations.

## Remaining gates / one next task

Private session revocation/logout and reopen/Back to Login/role-switch lifecycle, HTTP
origin/CSRF/request admission, approved UI wiring, trusted real enrollment, owner recovery/
rotation, encrypted portable restore/key custody/anchor, expired-registry retention review,
deployed browser/Electron separation/TLS, single-process supervision, target Windows cost/
ACL/power-loss/packaging and privileged clock/storage protections remain pending.
A browser/window reopen while the backend survives is NOT yet a fresh-login guarantee.
No real accounts or shop data were used; no business/closing/backup reset is implemented.
Remote Admin remains disabled; no additional strong remote authentication is provided.

Exactly ONE recommended next task: implement private session revocation/logout lifecycle
for Back to Login/role change/reopen boundaries with focused fail-closed tests, without
HTTP routes or frontend wiring. Whole B1b incomplete. STOP for owner review.
