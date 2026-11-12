# B1b Part3M - password rotation timeout safety

10 November2026. **PASS for the focused correction; owner review pending.**
No HTTP/UI, enrollment/recovery, business, dependency, migration or OS changes.

## Finding and one native timing check

Confirmed defect: Part3L rechecked the original5-second receipt deadline after
each native comparison/hash, even though the valid proof was already consumed.
A real-native test modeled third-job completion at6000ms; the old code denied,
with unchanged SQL state and a still-valid Admin session. The failure mechanism
was reproduced; slow target-hardware occurrence was not assumed.

ONE actual-clock development-laptop check, no substituted Date/monotonic clock:
- Node24.11.0, Windows x64; rotation succeeded in2404.20ms.
- Native comparison1:816.22ms; comparison2:760.33ms; new hash:670.86ms.
- No native errors, no writer held across KDF; N131072/r8/p1/maxmem192MiB unchanged.
This single pre-correction run did NOT time out on this laptop and establishes
no shop-hardware, cold/load, percentile or post-correction timing guarantee.
The benchmark was not repeated. Its TEST case now requires explicit opt-in.

## Approved correction

The owner explicitly approved30 seconds for bounded rotation execution only,
resolving the initial step8 approval gate. No pending/unapproved default remains.

- The genuine Admin proof must be valid at admission AND through completion of
  the initial authoritative SQL snapshot. It burns once before later failures.
  Delayed initial authorization beyond its original5 seconds still denies.
- Only after that authorized snapshot and final fresh-proof check does a PRIVATE
 30-second monotonic operation lifecycle start. Its deadline is fixed, never
  slides, is safe-integer checked, and rejects clock rollback/invalid values.
  It is bound to the existing boot/owner/transition and stored snapshots.
- Native comparisons/hash and final queue delay use this operation bound instead
  of the consumed proof's deadline. No reusable proof, Actor, session or external
  authorization capability is created. Single native-work admission remains.
- The same owner/queue/writer transaction still rechecks Admin session, provisioning,
  active principals, BOTH credential hashes/versions/epochs, target state and
  actual session expiry before completing writes/COMMIT. Logout/shutdown/stale SQL/
  revocation cancel or deny safely. Atomic rollback and post-COMMIT cleanup remain.
  An already completing transaction may commit before queued logout, as in Part3L.
- The5-second proof and actual session expiry are NOT extended. The30-second
  execution cap is distinct from the existing5-failure/30-second cooldown.
  BOTH8+ password policy, native costs, roles, permanent latch, data and history
  remain unchanged.

Expiry is enforced at checkpoints; Node native scrypt already running cannot be
forcibly cancelled. Its late result is rejected, no further native job is started,
and admission remains occupied until that job finishes. Close drains it. This is
a bounded authorization lifecycle, not a hard30-second process/response timer.

## Focused verification

17 new corrected-lifecycle cases +11 selected regressions PASS;0 failed.
2 pre-correction investigation cases also PASS (one native measurement, one
failure reproduction), reported separately from correction success.
Scoped TypeScript/ESLint PASS. No full rotation/frontend/browser/previous suites.

Coverage: successful6000ms modeled native completion for BOTH accounts, genuine
single-use/replay protection,29999ms success/30000ms denial, failure after original
proof expiry, actual Admin expiry, slow-work logout/shutdown/registry revocation/
credential-version/auth-epoch/target changes, invalid/rollback/overflow clocks,
expired proof while queued for initial authorization, and atomic rollback when
the operation expires during a credential write.

Selected regressions cover both success paths, original5-second proof rejection,
updated operation timeout plus logout/shutdown, existing5-failure/30-second
cooldown, concurrency, REAL SQLite COMMIT failure, post-write self-session expiry,
and unchanged session-issuance proof deadline. Real Better Auth/official adapter/
SQLite/native crypto/signed cookies; TEST hooks model elapsed time or explicit
failures, never fabricate authentication results. No secrets in metadata/errors/
normal responses/logs; existing closed DB/WAL/SHM checks remain.

Evidence:
web/test-results/auth-b1b-part3m-6b34b0e9-777d-422e-b59e-e5f9dbab21fb/
baseline.json; native-timing.json; investigation.json (2 pass/32 filtered);
timeout-focused.json (17 pass/33 filtered); rotation-regressions.json (10 pass/
40 filtered); issuance-proof-regression.json (1 pass/18 filtered);
typecheck-investigation.txt/eslint-investigation.txt;
typecheck-correction.txt/eslint-correction.txt; verification-summary.json.
All earlier Part3L evidence/reports unchanged.

Commands: vitest.rotation.config.mts filtered to investigation, then new Part3M
cases, then the10 directly affected old cases; one vitest.sessions proof case.
tsc --project tsconfig.rotation.json --noEmit; ESLint only gateway.ts and the
changed password-rotation test, --max-warnings=0. Earlier full evidence reused.

## Exact files

Modified:
- web/src/server/auth/gateway.ts
- web/src/server/auth/README.md
- web/tests/integration/password-rotation.test.ts
- docs/development/BACKEND_SQLITE_ARCHITECTURE_V1.md
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

Created:
- docs/development/AUTH_B1B_PART3M_ROTATION_TIMEOUT_REPORT.md

No password callback, gateway public type/configuration, migration, dependency,
frontend or business change. Prior files/evidence/drifts preserved; HEAD/index
unchanged; no Git stage/commit/push/reset/clean/stash.

## Remaining limits and one next task

This development laptop is not evidence about actual shop hardware. The approved
execution bound can still reject work exceeding30 seconds or expiring sessions;
that is intentional, fail-closed behavior. No costs were lowered. Trusted enrollment,
recovery/restore/keys, HTTP/UI/deployed lifecycle/TLS/isolation and production security
approval remain gates. Whole B1b is incomplete.

Exactly ONE recommended next task: one disposable native rotation acceptance check
on the actual shop computer before production use. STOP for owner review.
