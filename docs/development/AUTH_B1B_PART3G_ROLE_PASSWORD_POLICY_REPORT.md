# B1b Part 3G - final two-role password policy integration

10 November2026. **PASS for bounded password-policy integration; owner review pending.**
No working login, real account enrollment or production-security approval.

## Current owner decision and implemented paths

BOTH ADMIN and shared SALESPERSON now use8..128 well-formed Unicode scalar values,
maximum512 UTF-8 bytes. No character-class requirements, normalization, trimming,
truncation or credential case conversion. The owner explicitly supersedes the earlier
15-character policy and short-PIN requirement for the initial release;4/5-digit PIN
remains DISABLED, not an additional release prerequisite.

password-policy.ts is the single bounds definition/predicate. password.ts uses it in
BOTH hash/verify; the native asynchronous scrypt, fresh16-byte random salts, POSPW001
V001161-character encoding,56-byte binary timingSafeEqual, N=131072/r=8/p=1,
maxmem192MiB, maximum2 concurrent jobs/no queue, buffer clearing and sanitized errors
are unchanged. No default Better Auth hash/verify fallback.

offline-password.ts reuses the reviewed Part3E loader/screen for BOTH roles. The
unchanged integrity-pinned46,483-entry artifact covers8..14 as well as longer inputs.
No new download/artifact/license/dependency. Original329-entry15+ data is historical,
not an alternative Salesperson screen. Admin API delegates to the same implementation.
Only a SCREENING COPY is lowercased; original bytes reach scrypt.
Common/weak rejection is prospective setup/change policy, not an extra login verifier
that could reject existing credentials because the blocklist changed.

Private provision.ts screens BOTH independently chosen passwords, checks actual exact
equivalence using the existing fixed516-byte timingSafeEqual buffers, hashes/self-verifies
outside the writer reservation and atomically creates both identities/credentials/principals
and the completion latch. Existing pristine/history/schema/concurrency/fence checks and
rollback/overwrite rejection remain. No real setup invocation, default or generated role
password. No SQL migration or applied checksum changed.

Both real private Better Auth portals explicitly use these callbacks, min8 and max256
UTF-16 units; callbacks enforce scalar/byte bounds. Login/signup remain disabled; raw
handler/API stay private. Authoritative SQLite role/version/epoch/boot/expiry/revocation
and latch checks remain mandatory. No session issuer or public route was added.

## Focused verification and limits

-61 distinct affected cases verified: callbacks19, provisioning21, Admin/shared screen21.
- Initial affected run:60 pass/1 failure in TEST vector selection, not production policy.
  Numeric-only candidate generation lacked a14-character corpus member. Reused the reviewed
  numeric/public-word candidate coverage; targeted rerun:1 pass/20 deliberately filtered.
  The original failure is retained. The90-second affected suite was NOT repeated.
- Three existing targeted gateway checks pass/24 deliberately filtered: genuine framework
  session plus latch enforcement, crafted Staff/Admin role-cookie denial and actual SQL
  unavailability fail-closed. These pre-existing TEST helpers issue disposable TEST sessions;
  no production issuance or privileged testUtils was introduced into production.
- Scoped TypeScript and ESLint PASS, zero warnings, including the corrected helper.
- Actual pinned Better Auth/core/official adapter1.7.18, Kysely0.29.0 and real SQLite/native
  scrypt exercised. Both role contexts checkPassword verify stored8-character credentials,
  reject the other credential, retain explicit callback identity and disabled signup/login.
-8/7 and longer inputs for BOTH roles, lowercase-only acceptance, actual listed8..14 values
  and weak repetition rejection for BOTH before writes, distinct/identical credentials,
  canonical/compatibility Unicode exactness,128-scalar/512-byte bounds, malformed inputs,
  wrong passwords, independent salts, native-cost oracle/admission/error handling, atomic
  visibility/latch/reopen, SQL/async failure rollback, repeat/concurrent setup and unknown
  state/history rejection. Import never bootstraps.
- TEST-only generated credentials; closed fixture main/WAL/SHM files scanned for known
  plaintext/key/bearer values as applicable. No sensitive output/console/ordinary JSON;
  actual private login/signup tests return400 without cookies.
- Prior reports/evidence, Part1/Part2 experiments, frozen frontend and business fixtures
  preserved. No full frontend/browser/old foundation suite, installation, build or OS change.
  Packaged Next/Electron/TLS/target Windows performance and actual lifecycle are unverified.

Evidence: web/test-results/auth-b1b-part3g-e0f3bbbd-1655-4e0d-82b6-57e8e0a9c8da/
baseline.json, role-password-focused.json, common-policy-regression.json,
gateway-regressions.json, verification-summary.json. Never includes submitted secret values.
Fresh disposable databases only under existing permitted sqlite-b1b-part1 TEST folders.

Commands from web:
- node node_modules/vitest/vitest.mjs run --config vitest.role-password.config.mts
- node node_modules/vitest/vitest.mjs run --config vitest.role-password.config.mts tests/integration/account-provisioning.test.ts -t "screens actual eight-to-fourteen-character"
- node node_modules/vitest/vitest.mjs run --config vitest.auth.config.mts -t "accepts actual role-bound|prevents Staff credentials|fails closed on real SQL"
- node node_modules/typescript/bin/tsc --project tsconfig.role-password.json --noEmit
- node node_modules/eslint/bin/eslint.js src/server/auth/password-policy.ts src/server/auth/password.ts src/server/auth/admin-password-policy.ts src/server/auth/offline-password.ts src/server/auth/provision.ts src/server/auth/gateway.ts tests/integration/password-callbacks.test.ts tests/integration/account-provisioning.test.ts vitest.role-password.config.mts --max-warnings=0

## Exact file scope

Created:
- web/src/server/auth/password-policy.ts
- web/vitest.role-password.config.mts
- web/tsconfig.role-password.json
- docs/development/AUTH_B1B_PART3G_ROLE_PASSWORD_POLICY_REPORT.md

Modified:
- web/src/server/auth/password.ts
- web/src/server/auth/admin-password-policy.ts
- web/src/server/auth/offline-password.ts
- web/src/server/auth/provision.ts
- web/src/server/auth/gateway.ts
- web/tests/integration/password-callbacks.test.ts
- web/tests/integration/account-provisioning.test.ts
- web/src/server/auth/README.md
- web/src/server/auth/admin-policy/README.md
- web/src/server/auth/offline-policy/README.md
- docs/development/AUTH_B1B_PART3D_OWNER_RECOVERY_ENROLLMENT_RESTORE_CONTRACT.md
- docs/development/BACKEND_SQLITE_ARCHITECTURE_V1.md
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

## Remaining gates / stop

Owner enrollment and recovery/portable encrypted restore contract remain unapproved for
real use. Real login/logout, fresh entry on reopen/Back to Login/role switch, password
rotation/version/revocation binding, persistent throttling, production session issuance,
HTTP/UI integration and deployed role isolation remain unimplemented.
No login/logout/password change may reset business/closing/backup data; no such business
mutation was added. Daily Closing remains Admin-only without blocking next-day sales.
Remote Admin needs a separately enrolled strong factor; the local password alone is not
remote authority. The historical blocklist is incomplete;8 characters is not assurance
of strength or a single-factor standards-compliance claim. No PIN fallback.

Git HEAD/index unchanged; existing six tracked modifications preserved; four new untracked
source/config/report paths. Other modified/untracked work, ignored prior evidence and
known formatting drifts preserved by the bounded baseline comparison. No stage/commit/push/
reset/clean/stash. Exact final counts/hashes are in verification-summary.json.

Exactly ONE recommended next task: implement and test bounded persistent login throttling
behind the private server boundary, without enabling routes/UI or real login.
STOP for owner review.
