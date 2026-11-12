# B1b Part 3B - secure password callbacks

10 November 2026, Asia/Karachi. **PASS for this bounded module; owner review pending.**
This is not production authentication approval or a working login.

## Implemented and verified

Inspected the INSTALLED @better-auth/core 1.7.18 callback types, Better Auth 1.7.18
context/password/checkPassword implementations and unchanged 0002_auth_credentials.sql.
The supported interface is hash(string) -> Promise<string> and
verify({hash,password}) -> Promise<boolean>. Both callbacks are explicitly supplied to
BOTH private role contexts; there is no default-verifier fallback or upstream patch.
No handler/API/context is added to the gateway's returned capability.

Node asynchronous native scrypt uses N=131072,r=8,p=1, maxmem=192MiB and a fresh
cryptographic 16-byte salt. At most two derivations run in this module; saturation
fails closed with no pending work queue. This admission bound is not persistent
login-attempt throttling. Derived keys are compared only by timingSafeEqual on
fixed 56-byte buffers. Temporary password/key buffers are cleared on success/failure;
JavaScript strings and OS memory cannot be reliably erased by this code.

Exact UTF-8 input: 15-128 Unicode scalar values, at most512 bytes, well-formed UTF-16.
No normalization, trimming, case conversion, truncation or composition rule.
Whitespace and embedded NUL are significant. Unpaired surrogates reject, preventing
UTF-8 replacement collisions. The backend minimum15 is stricter than the architecture's
earlier proposed12 and frozen UI's8-character preview; this task changes no UI.
Common/breached-password screening and distinct-role credential policy remain future
provisioning review gates; length alone is not a claim that a chosen password is strong.

Versioned format fits the EXISTING161-character SQL constraint without changing SQL:
32 lowercase hex salt + ":" + 16 hex version-marker +112 hex derived key.
Marker is the eight public ASCII bytes POSPW001. V001 fixes all parameters and a
56-byte (448-bit) derived key, with a FULL independent128-bit random salt.
This is an application hash encoding, not the pinned default hash encoding or a
new authentication protocol. No arbitrary work parameters or legacy format are accepted.
Unknown versions/unsafe formats reject before native work; future format/parameter
changes require explicit review. SQL shape checks alone do not verify format/strength.

Malformed/oversized/runtime-invalid input and native/admission failures cannot grant access.
Verification returns false; hashing errors are generic without nested native causes.
This does not claim equal timing for malformed input, invalid versions or unavailable
credentials. Future login must retain generic responses, authoritative SQL and throttling.

## Actual focused verification

- Password suite: **19 passed /0 failed /0 skipped/pending**.
- Focused TypeScript: PASS. Scoped ESLint: PASS, zero warnings.
- Initial typecheck found an intentional-invalid-input test cast; initial lint found one
  unused test import. Both were corrected. The import-only cleanup changes no behavior.
- Real native work, including an independent Node scrypt oracle, correct/wrong input,
  salt independence, binary timingSafeEqual, NFC/NFKC-distinct Unicode, spaces/case/NUL,
  scalar/UTF-8 bounds, malformed hashes/unknown versions/parameter injection, tampering,
  asynchronous/resource bounds, sanitized injected native errors and slot recovery.
- Unmodified real Better Auth context callbacks on BOTH role portals; actual official
  adapter writes/reads a disposable TEST credential in the approved STRICT table;
  real framework checkPassword verifies it and rejects wrong input.
- Actual private framework login/signup calls remain disabled:400, no Set-Cookie,
  no password/hash/token JSON and no console output. No session is issued.
- Every disposable fixture's closed main/WAL/SHM files checked for generated plaintext
  passwords/signing keys. Hashes persist only in TEST auth_credentials; no real account.
- TEST instrumentation observes unchanged instances/native calls; no testUtils or framework
  behavior simulation. Native-error injection is limited to its explicitly named fault test.
- No Part3A/Part1/experiment/frontend/browser/full-app suite repeated or build/install run.
  Part3A's existing27 results and earlier evidence remain separate, unchanged evidence.

Commands from web:
- node node_modules/vitest/vitest.mjs run --config vitest.password.config.mts
- node node_modules/typescript/bin/tsc --project tsconfig.password.json --noEmit
- node node_modules/eslint/bin/eslint.js src/server/auth/password.ts src/server/auth/gateway.ts tests/integration/password-callbacks.test.ts vitest.password.config.mts --max-warnings=0

Separate ignored evidence:
web/test-results/auth-b1b-part3b-be331b52-4b33-475a-9c3d-1a6fcaf48387/
baseline.json, password-focused.json and verification-summary.json.
Fresh TEST files: web/test-results/sqlite-b1b-part1/password3b-*.
No credential values are recorded in reports/evidence.

Parameter/reference checks: [Node24 scrypt](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback),
[OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
and [OWASP password controls](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#implement-proper-password-strength-controls).
Pinned LOCAL files, not online Better Auth docs, determine callback compatibility.

## Exact file scope

Created:
- web/src/server/auth/password.ts
- web/tests/integration/password-callbacks.test.ts
- web/vitest.password.config.mts
- web/tsconfig.password.json
- docs/development/AUTH_B1B_PART3B_PASSWORD_REPORT.md

Modified:
- web/src/server/auth/gateway.ts (callback configuration only)
- web/src/server/auth/README.md (password format/policy/limits)
- docs/PROJECT_MEMORY.md (current factual handoff)
- docs/MODULE_CHECKLIST.md (bounded verification and remaining work)

No migration, Part1 source, Part3A tests/report/evidence, dependency/lockfile,
frontend, business fixture or previous experiment changed. Prior ignored work and
known formatting drifts preserved. No staging/commit/push/reset/clean/stash or OS change.
Detailed final Git/preservation/source hashes are in verification-summary.json.

## Remaining gates and next task

Secure atomic two-account provisioning, real login/account verification boundary,
password rotation/revocation/version binding, persistent throttling, session issuance,
HTTP/UI integration and DEPLOYED role isolation are unimplemented.
So are owner recovery/key custody, protected production storage, single-process
deployment supervision, TLS/browser/Electron delivery and target-hardware load/latency.
No framework callback-contract blocker found; no production security approval claimed.
Whole B1b remains incomplete.

Exactly one recommended next task: implement and test owner-authorized atomic two-account
provisioning with distinct-password checks and a permanent provisioning latch, without
adding login or HTTP/UI routes.
STOP for owner review.
