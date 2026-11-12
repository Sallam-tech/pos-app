# B1b Part3K - private logout and session revocation

10 November2026. **PASS for bounded backend implementation; owner review pending.**
No HTTP/UI activation, real enrollment or production security approval.

## Implemented

- Fixed private logoutAdmin/logoutSalesperson resolve real Better Auth signed cookies
  with cache/refresh bypass. Caller role/account/session-ID claims have no authority.
- SAME owner/queue/official transaction. Writer reservation, exact role/version/epoch/
  boot/expiry registry bindings and confirmed targeted revocation COMMIT precede RAM
  deletion, cookie expiry and success. Obsolete/already-revoked sessions are removable.
- Supported internalAdapter.deleteSession, then exact secondaryStorage-key deletion
  on failure. No whole-role clearing on normal logout. If both fail, confirmed SQL
  revocation still denies the genuinely surviving framework session and stale cookie.
- Pathless exported serverOnly/deleteSessionCookie expires only that portal's secure
  host-only HttpOnly/SameSite=Strict cookies. No-store JSON is only {"ok":true}.
  Raw handler/API/context stays private; no endpoint is mounted.
- Repeated/no-live-session logout confirms available/provisioned SQL and registry in
  a committed transaction, then clears cookies without guessing a row. This means
  already unauthenticated, NOT confirmed revocation of an unknown ID. A missing SQL
  grant cannot authorize; only its verified RAM session is cleaned. Expired rows
  remain expired; no account/history/business records are deleted.
- Lookup/SQL/COMMIT/cookie-output uncertainty returns generic denial and quarantines
  BOTH roles until trusted close/reopen. No successful revocation is claimed on a
  failed COMMIT, even if rollback leaves the old row and RAM deletion also fails.
- Logout invalidates pending receipts and earlier native verification/issuance.
  Late issuance cannot publish; existing compensation revokes any possibly committed
  row. Admitted protected work serializes before logout; later checks deny.
  Nested/inherited contexts reject safely. Shutdown drains admitted logout.

Pinned1.7.18 source inspected: api/routes/session.mjs, db/internal-adapter.mjs,
cookies/index.mjs and exported serverOnly types. Lookup errors throw; they are not
interpreted as absent sessions. No framework patch/custom bearer/production testUtils.
Passwords/throttle unchanged: BOTH8+;5 consecutive failures/30 seconds; GLOBAL policy,
PIN and Remote Admin disabled. No dependency or production migration changes.

## Verification

25 NEW distinct cases +6 selected existing regressions PASS;0 failed tests.
Scoped TypeScript and ESLint PASS, zero warnings. An initial typecheck caught the
cookie handler's synchronous signature; corrected to the pinned async contract.

Real Better Auth, official adapter, SQLite, native scrypt and signed cookies.
Passthrough TEST faults/barriers never fabricate framework sessions. Coverage:
both roles/stale cookies; repeat/absent/expired sessions; same-role/cross-role
isolation; forged identity/host/origin/cookie claims; obsolete epochs/corrupt
bindings; missing SQL/lookup/write failures; REAL deferred-FK COMMIT rollback;
post-COMMIT acknowledgment failure; pre-COMMIT publication/writer exclusion;
dual RAM cleanup failure; receipt/native-verifier/issuance cancellation;
protected-work ordering; nested contexts; shutdown/reopen; non-disclosure.

Generated disposable fake accounts only. Closed DB/WAL/SHM scanned for plaintext
passwords, signing secrets and bearer/cookie values. Credentials/principals/latch/
migration history plus an unrelated existing TEST sentinel remain unchanged.
Disposable0008 commit-guard schema is not a production migration/business table.

Separate ignored evidence:
web/test-results/auth-b1b-part3k-fed574c1-7dbb-4089-8671-3a973646187c/
baseline.json; contract-focused.json (3 pass); revocation-focused.json (21 pass,
3 filtered); commit-final.json (6 pass/19 filtered: one new +5 related rechecks);
issuance-regressions.json (3 pass); gateway-shape.json/verifier-shape.json/
password-shape.json (1 pass each); typecheck-final.txt; eslint-final.txt;
verification-summary.json. Union=31 distinct, no double-counting.
Commands: vitest.revocation.config.mts filtered in those reports; three selected
vitest.sessions cases; one affected shape case each in auth/credentials/password
configs; tsc --project tsconfig.revocation.json --noEmit; scoped ESLint on seven
changed source/test/config files. Prior full evidence reused; no frontend suites.

## Exact files

Created:
- web/tests/integration/session-revocation.test.ts
- web/vitest.revocation.config.mts
- web/tsconfig.revocation.json
- docs/development/AUTH_B1B_PART3K_SESSION_REVOCATION_REPORT.md

Modified:
- web/src/server/auth/gateway.ts
- web/src/server/auth/types.ts
- web/src/server/auth/README.md
- web/tests/integration/auth-foundation.test.ts
- web/tests/integration/password-callbacks.test.ts
- web/tests/integration/credential-verification.test.ts
- docs/development/BACKEND_SQLITE_ARCHITECTURE_V1.md
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

Older tests change only two private-method shape expectations.
Prior work/reports/evidence/drifts/fixtures preserved. HEAD remains
1456ce4df2c6ff7d1c4d61833a019b0cbcee36a1; index empty; no Git mutation.

## Remaining gates and one next task

No supported-framework blocker found for this private capability. SQL/RAM are
separate stores: complete RAM/index erasure cannot be guaranteed on cleanup failure.
SQL remains mandatory. Uncertainty can interrupt BOTH roles. Registry retention
and safe operational fault recovery remain future work.

HTTP/CSRF/request admission, Back to Login/role-switch wiring, owner enrollment/
recovery/rotation, portable encrypted restore/key custody, deployed TLS/cookie
partitioning/single-process supervision and target hardware remain unverified.
Browser/Electron window reopen while the backend lives does NOT yet force fresh
authentication. Restart here is gateway owner close/reopen; earlier Part2C process
restart evidence is reused, not a deployment certificate. No live business DB
exists; sentinel tests do not certify future business integrations. B1b incomplete.

Exactly ONE recommended next task: private password rotation bound to fresh Admin
verification, atomic credential-version/auth-epoch changes and role-wide session
revocation, with focused tests and HTTP/UI disabled. STOP for owner review.
