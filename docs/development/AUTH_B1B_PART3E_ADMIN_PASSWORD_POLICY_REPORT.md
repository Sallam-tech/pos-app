# B1b Part 3E - ADMIN password policy and offline screening

10 November2026. **PASS for this bounded module; owner review pending.**
No authentication integration or production-security approval.

## Implemented / verified

Private server-only adminPasswordPolicy/assertAdminPassword accepts prospective ADMIN
passwords of8..128 well-formed Unicode scalar values, maximum512 UTF-8 bytes.
Exact input, including spaces/NUL, is preserved; no trim/normalization/truncation or
composition rule. Nonstring/malformed/oversized inputs reject before corpus IO.
No password/hash/account/session is created or returned.

Separate MIT SecLists subset extends the existing reviewed immutable source to8+:
46,483 unique screening hashes;46,993 source records cover8..14 characters.
All329 previous entries are included. [Provenance, algorithm, limits and license](../../web/src/server/auth/admin-policy/README.md).
Reads are fixed-size/bounded, authenticated by code-pinned SHA-256 and structure,
with closure and generic fail-closed IO/crypto errors; no runtime internet/cache.
Whole-value short cycles and complete repeated units reject; no substring/class rules.
Only a screening COPY is lowercased. SHA-256 membership is not credential hashing.
Existing scrypt parameters/encoding/random salts/timingSafeEqual are untouched.

FINAL focused suite: **21 passed /0 failed /0 skipped/pending**.
Scoped TypeScript and ESLint PASS, zero warnings. Real asset/crypto/IO exercised;
explicit fault injection covers unavailable/non-file/oversized/short/growing/tampered
assets, metadata/read/close/crypto errors and handle closure.
Tests include7/8/128/129 scalar bounds,512 bytes, astral/malformed Unicode, exact
spaces/NUL, canonical/compatibility differences, no character classes, actual listed
members at EACH8..14 length, case variants, unlisted repetitions and no sensitive
outputs/console. Import performs no policy IO or bootstrap.

Initial run13 passed/8 failed because the TEST secret detector treated a public weak
word occurring in generic messages/filenames as disclosure. Corrected public-vector
tracking; one unused test import corrected after lint. The passing run was followed
by test-only random-vector hardening; FINAL21 remains the count, runs are not summed.
All earlier evidence is preserved. No database, fixture credential or token was created.
No previous auth/frontend/browser/full-project suite was repeated.

Commands from web:
- node node_modules/vitest/vitest.mjs run --config vitest.admin-password.config.mts
- node node_modules/typescript/bin/tsc --project tsconfig.admin-password.json --noEmit
- node node_modules/eslint/bin/eslint.js src/server/auth/admin-password-policy.ts tests/integration/admin-password-policy.test.ts vitest.admin-password.config.mts --max-warnings=0

Separate ignored evidence: web/test-results/auth-b1b-part3e-d683ae48-34d2-4a3c-89cf-5b9241927d02/
baseline.json, admin-policy-focused.json, admin-policy-verified.json,
admin-policy-final.json and verification-summary.json. No submitted secret values.

## Exact file scope

Created:
- web/src/server/auth/admin-password-policy.ts
- web/src/server/auth/admin-policy/.gitattributes
- web/src/server/auth/admin-policy/common-passwords.sha256
- web/src/server/auth/admin-policy/manifest.json
- web/src/server/auth/admin-policy/README.md
- web/tests/integration/admin-password-policy.test.ts
- web/vitest.admin-password.config.mts
- web/tsconfig.admin-password.json
- docs/development/AUTH_B1B_PART3E_ADMIN_PASSWORD_POLICY_REPORT.md

Modified:
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

## Pending integration - NOT implemented here

| Area / exact file | Separately reviewed change needed |
| --- | --- |
| password.ts | Role-specific supported Better Auth callbacks must accept ADMIN8..128, preserving exact UTF-8, V001 encoding, salt/work/memory/concurrency bounds and timingSafeEqual. Current shared callbacks still require15 for BOTH roles. No fallback. Verify byte-distinct8..14 authentication then; this module validates only. |
| offline-password.ts / provision.ts | Invoke this screen for ADMIN during trusted enrollment/change; retain atomic two-identity creation and real credential distinctness. Current provisioning still requires15 for BOTH. Do not weaken it to activate a PIN. |
| gateway.ts | Select the reviewed ADMIN callback pair and appropriate framework length bounds (scalar validation plus max256 UTF-16 units). Keep raw handler/API hidden, signup/login disabled until authorized, mandatory authoritative SQL and role isolation. |
| auth_credentials / future migrations | ADMIN V001 format already fits unchanged0002; this policy needs NO migration. Any device-bound PIN credential metadata/verification requires its own architecture review and additive migration, not editing applied history or saving an offline-guessable PIN hash. |
| web/src/components/login/login-form.tsx; web/src/app/login/page.tsx | Later authorized role-aware wiring, generic errors, matching character/byte bounds and fresh credential entry on all required transitions. LIVE frozen form is a presence-only demo, not an enforced8-character policy; older preview descriptions are historical. Preserve layout, no prefill/convenience storage. |
| tests / operational boundary | Prove actual supported role-specific callbacks/provisioning, persistent throttling, revocation/rotation binding, role denial and fresh-login lifecycle before routes/UI. No shop/closing reset. |

## Remaining concerns / stop

Owner policy is ADMIN minimum8, no composition requirements. Shared code is still15;
do not claim an8-character Admin credential can already be provisioned/verified.
The new bounded historical corpus cannot catch every leaked/weak variant. Eight
characters alone is not strong-auth assurance or a single-factor compliance claim.
Target Windows work/latency, packaged asset/license inclusion, key/owner recovery,
portable encrypted restore and deployed role isolation/TLS remain unverified.
Four-digit Salesperson local-authenticator security is BLOCKED; no PIN activated.
No real login/logout/session issuance, persistent throttling, password rotation,
enrollment/recovery or HTTP/UI integration is implemented by this task.

Git master/HEAD unchanged; index empty. Existing six tracked modifications retained;
nine new untracked files for this task. Bounded baseline verifies all prior files except
the two authorized handoff updates; known formatting drifts and prior evidence preserved.
No install, Windows change, staging/commit/push/reset/clean/stash.

Exactly ONE recommended next task: an owner-authorized feasibility proof of a supported,
device-bound Salesperson PIN authenticator with persistent attempt limits and resistance
to offline guessing, before integrating the two role credential paths.
STOP for owner review.
