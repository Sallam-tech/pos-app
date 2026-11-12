# B1b Part3L - private Admin-controlled password rotation

10 November2026. **PASS for bounded backend implementation; owner review pending.**
No production accounts, HTTP/UI wiring, enrollment or recovery activated.

## Implemented

- Two fixed private methods: rotateAdminPassword and rotateSalespersonPassword.
  BOTH require a real signed ADMIN session plus a genuine, fresh, single-use ADMIN
  credential receipt. A receipt alone grants nothing. No caller-selected account,
  role, hash, SQL or authorization flag is accepted.
- Proof consumption occurs before later failures. Its existing five-second monotonic
  deadline, boot/role, credential hash/version/epoch and live session are rechecked.
  Forged/expired/aborted/replayed/Salesperson proofs deny generically.
- Same owner/queue/official adapter transactions. A short authorized snapshot precedes
  exact8..128-scalar/max512-byte offline screening, TWO native credential-reuse checks
  and new salted hash generation OUTSIDE the writer. Both trusted accounts are
  snapshotted and rechecked; no normalization, trim or composition rules.
- password.ts shares its unchanged native scrypt/timingSafeEqual comparison core.
  Existing Better Auth verify still returns false on errors; the private reuse helper
  instead throws on malformed/native/resource errors, so failure cannot prove that
  a password differs. Version001, costs, salts, limits and no-fallback policy unchanged.
- One final writer transaction rechecks provisioning/active Admin/session/proof and
  BOTH credentials. The supported pinned internalAdapter.updateAccount joins the
  current official adapter transaction. Hash/update timestamp, signed-int64
  credential-version AND auth-epoch increments, and revocation of EVERY target
  registration commit atomically. No session is issued. Return value is void.
- Confirmed COMMIT precedes supported deleteUserSessions and target-role RAM clearing,
  under the same queue. Even dual cleanup failure cannot authorize old cookies.
  Self-rotation invalidates ALL Admin sessions and requires a fresh login.
  Salesperson rotation preserves unrelated valid Admin sessions.
- One rotation/native-work admission; verification/issuance cannot race it or queue
  extra KDF jobs. Protected work can run between its transactions. Logout/shutdown/
  expiry cancel at checkpoints; an already completing transaction may commit before
  queued logout. Stale SQL, version overflow and errors deny.
  Confirmed callback rollback preserves old credentials. COMMIT/ack uncertainty
  quarantines the owner for BOTH roles rather than reporting success.
- A persistent RAM-clear fault exposed a close() issue. Shutdown now marks the drained
  owner closed, attempts each RAM clear, and ALWAYS closes SQLite before releasing
  its process fence. Retained RAM cannot authorize; database-close uncertainty
  still keeps the process fenced. No second owner or framework patch was added.
- Existing5-failure/30-second policy, disabled GLOBAL policy, two-account latch,
  migration history/checksums, account metadata and business records remain unchanged.
  Successful fresh Admin verification retains its existing streak-reset behavior;
  rotation itself does not clear attempt state, create accounts or reset anything.

Pinned1.7.18 internal-adapter updateAccount/updateWithHooks/getCurrentAdapter and
deleteUserSessions/secondaryStorage contracts were inspected and exercised.
No default verifier, raw API/handler, testUtils, custom bearer, new dependency or migration.

## Focused evidence

FINAL32 new distinct cases +10 selected regressions PASS;0 unresolved failures.
Scoped TypeScript and ESLint PASS, zero warnings. No frontend/browser/build/full
previous suite, install or OS change. Earlier Parts3G-K evidence reused.

New cases cover both targets, both old/new passwords, every target cookie, unrelated
sessions, actual credential reuse, Unicode/space distinctions, weak/input limits,
malformed hashes/corpus failure, native failures at EACH reuse/hash job, genuine
Admin proof/session pairing, exact cooldown expiry, SQL rollback/REAL deferred-FK
COMMIT failure/post-COMMIT acknowledgment, surviving RAM, stale SQL during native
work, expiry/logout/shutdown cancellation, post-write Admin self-session expiry rollback,
concurrent admission, writer exclusion,
protected-operation ordering, int64 overflow, nested contexts and non-disclosure.

Real Better Auth, official adapter, SQLite, native scrypt and signed cookies;
passthrough TEST observations/faults never fabricate sessions. Runtime-generated
fake credentials only. Closed DB/WAL/SHM checked for generated passwords, keys,
bearers/cookies. Public weak-word vectors are not secret sentinels (the word
also names an SQL column); actual generated credentials remain checked. Existing
unrelated TEST data/latch/migration history preserved. TEST0008 deferred-FK guard
is disposable, never a production migration/business schema.

Separate ignored evidence:
web/test-results/auth-b1b-part3l-c4039af6-85d5-4312-8ed7-7fc0e48c8cd6/
- baseline.json; contract-focused.json:3 pass.
- rotation-focused.json:2 pass/26 fail/3 filtered. Initial TEST public-keyword
  scan false positives cascaded; corrected without weakening real-secret checks.
- rotation-corrected.json:12 pass/14 fail/5 filtered. Timestamp-slot assertion
  corrected; persistent RAM-clear fault then exposed the real shutdown issue,
  fencing subsequent fixtures. Fixed in gateway; original evidence retained.
- lifecycle-final.json:14 pass/17 filtered. ALL remaining cases pass after the fix.
- password-regressions.json:5 pass; logout-regressions.json:2 pass;
  gateway-shape.json/verifier-shape.json/shutdown-regression.json:1 pass each.
- expiry-final.json:3 pass/29 filtered (one new expiry case +two success rechecks).
- typecheck-final.txt/eslint-final.txt and typecheck-expiry-final.txt/
  eslint-expiry-final.txt; verification-summary.json (prior snapshot preserved) and
  verification-summary-final.json (final accounting).
Union of latest executed results=42 PASS, filtered cases excluded, no double-counting.

Commands from web: vitest.rotation.config.mts filtered as recorded above; five
directly affected password cases; two logout cases; one shutdown and one affected
shape case each in auth/credentials configs. tsc --project tsconfig.rotation.json
--noEmit. Scoped ESLint on8 changed source/test/config files, --max-warnings=0.

## Exact files

Created:
- web/tests/integration/password-rotation.test.ts
- web/vitest.rotation.config.mts
- web/tsconfig.rotation.json
- docs/development/AUTH_B1B_PART3L_PASSWORD_ROTATION_REPORT.md

Modified:
- web/src/server/auth/gateway.ts
- web/src/server/auth/password.ts
- web/src/server/auth/types.ts
- web/src/server/auth/README.md
- web/tests/integration/auth-foundation.test.ts
- web/tests/integration/password-callbacks.test.ts
- web/tests/integration/credential-verification.test.ts
- docs/development/BACKEND_SQLITE_ARCHITECTURE_V1.md
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

Older tests only add two capability names. Previous reports/evidence, frozen
frontend, fixtures, dependencies/migrations and both known formatting drifts
preserved. No Git stage/commit/push/reset/clean/stash; HEAD/index unchanged.

## Limits and one next task

No framework integration blocker found for this private capability. RAM cleanup
is best effort; SQL remains mandatory. A lost COMMIT acknowledgment may mean the
new password actually committed; never retry using the consumed proof or silently
undo it. Trusted reopen and fresh authentication are required. No recovery bypass.

The5-second proof includes native reuse/hash work and any queue delay. Target
Windows performance/memory and production configuration remain unverified; do
not silently extend security deadlines or lower costs. This task does not approve
real enrollment, owner recovery/portable encrypted restore/key custody, auth audit
storage, HTTP/CSRF/UI, deployed TLS/role partitions/supervision, or fresh browser/
Electron window authentication while a backend lives. No real business DB exists;
TEST sentinels do not certify future business integrations. Whole B1b incomplete.

Exactly ONE recommended next task: independent safety audit of Part3L only before
any HTTP/UI integration. STOP for owner review.
