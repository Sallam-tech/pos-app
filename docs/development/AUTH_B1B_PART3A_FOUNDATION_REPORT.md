# B1b Part 3A - production auth schema and private gateway foundation

10 November 2026, Asia/Karachi. **PASS for this bounded foundation; owner review pending.**
Not a working login, protected frontend, whole-B1b completion or production security approval.

## Implemented

Five additive reviewed SQL migrations use the ORIGINAL Part 1 runner unchanged: exact-byte
checksums, contiguous numbering, atomic application, actual STRICT metadata verification,
history/version checks and safe repeat. No migration or database opens automatically.

- auth_users: only ADMIN/SALESPERSON fixed IDs and matching unique roles/internal identifiers.
- auth_credentials: one credential-only account per identity, FK, pinned salted-scrypt encoding;
  unused official-adapter OAuth token fields are constrained NULL.
- auth_principals: positive int64 credential version/auth epoch, default inactive, explicit
  provisioning marker; provisioned Admin cannot be disabled.
- auth_session_authorizations: non-bearer ID, principal FK, version, epoch, boot generation,
  creation/expiry and revocation, plus a principal/revocation index.

No rows, default passwords, real accounts, production secret or shop data were created.
SQL caps identities at two; the gateway additionally requires EXACTLY two complete provisioned
identities with credential records before authorizing. Secure bootstrap and its permanent
creation/deletion latch remain pending. No unsupported trigger/migration grammar was added.

Server-only TypeScript gateway owns ONE Kysely/native connection. Private Better Auth role
portals use separate HTTPS hostnames, signing secrets, cookie prefixes and bounded volatile
stores. No raw handler/API/context, session issuer or token is exposed. No HTTP route was added.
Missing configuration yields a deny-only gateway; real configuration must supply existing
migrated storage and protected keys explicitly.

Authorization checks the actual framework cookie/session, fresh SQL active/role/version/epoch,
registry, boot, timestamps and revocation. Client roles and cookie caches are not authority.
SQL/session errors produce a generic AuthorizationDenied without nested causes.

Protected mutation callbacks use actual core runWithTransaction and the official Kysely
transaction:true adapter. A no-change UPDATE obtains SQLite writer reservation before the
check; authorized effects and final recheck share the transaction. Async callbacks are awaited;
callback/COMMIT failures roll back and escaped scopes reject. Close drains admitted work and
clears RAM, preserving committed records. One owner is admitted per PID; no process is spawned.

Part 1's synchronous guards, raw-handle privacy and path protection are unchanged. The new
native handle belongs exclusively to Kysely; it never wraps Part 1's handle. Framework booleans
use its expected Number mapping, while ALL authorization/callback SQL opts into exact BigInt
reads and Part 1 int64 parameter validation. REAL/Number/overflow escapes reject.

## Actual verification

Final focused auth suite: **27 passed / 0 failed / 0 skipped/pending**.
Focused TypeScript and scoped ESLint passed. An initial four-case subset and earlier full
27-case run also passed; the final run adds every-fixture persistent-secret checks. Counts
are not summed. Initial TypeScript-only annotation errors were corrected before tests.

Evidence: web/test-results/auth-b1b-part3a-61aad68c-b807-434d-8169-7b4c755aa23e/
{baseline.json,initial-focused.json,auth-foundation-full.json,auth-foundation-final.json}.
Final preservation/source-manifest evidence is saved separately in the same directory.

The real installed Better Auth/core/official adapter 1.7.18, Kysely 0.29.0 and native
better-sqlite3 13.0.3 run against fresh disposable files. The official testUtils plugin is
injected ONLY by the test module to issue actual sessions. Production has no test helper,
session issuance or password login. Actual adapter writes/reads verify schema/boolean/date
compatibility; pinned metadata also matches every user/account column and omits SQL sessions.

Tests cover migration repeat/fresh and later failure rollback with existing TEST accounts,
STRICT/FK/uniqueness/hash/no-token constraints, default denial, real signed sessions,
missing/tampered/unsigned cookies, disabled/incomplete/expired/revoked/stale-version/boot state,
Staff-to-Admin forgery/origin denial, schema-unavailable SQL, history changes, no raw export,
atomic awaited writes, callback/deferred-FK COMMIT failure, expired/nested capabilities,
int64/configuration escapes, concurrency, independent-writer revocation contention, closing,
reopen without data reset and credential-free actor/database/gateway output.

Known generated TEST passwords/keys/tokens are scanned in EVERY fixture's main/WAL/SHM files;
main-file read failures cannot silently pass. Errors contain no original SQL causes. No real
business fixture is imported. No real database, working login or protected shop endpoint exists.

Earlier Part 1's 30 cases, Part 2A's 18 and Part 2C's 26 remain unchanged separate evidence,
not rerun or added to this count. This suite uses the original Part 1 API extensively.
In-process gateway reopen is tested; the earlier isolated proof supplies fresh-process
framework restart evidence. Current Next/TLS/browser/EXE deployment is not tested.
No frontend/browser/full application suite/build or package installation was run.

## Remaining security gates

- Actual password verification/change, atomic secure two-account provisioning/immutability,
  distinct passwords, version-bound login issuance, logout and fresh-password reopen/Back to
  Login/role switching remain unimplemented. Existing frontend remains an unprotected demo.
- PINNED PASSWORD FINDING: @better-auth/utils 0.5.1 password.node.mjs normalizes NFKC and uses
  hex-string === comparison. The architecture calls for no password normalization and
  constant-time-sensitive verification. Its default verifier must NOT be enabled unchanged.
  Supported Better Auth hash/verify callbacks need separate review/tests; none invented here.
- Persistent role/device/global throttling, owner recovery, key custody and exact Admin grants.
- Actual local hostname/TLS and browser/Electron partition isolation. Distinct-origin/key/cookie/
  RAM namespaces are implemented/tested server-side, not a deployed browser-isolation claim.
- Cross-process writer/session supervision, maintenance/verified recovery, disk-full/power-loss,
  Windows ACL/TOCTOU and OS pagefile/dump protection. The per-PID fence is not a multi-process lock.
- Future business callbacks are trusted repository code, not a SQL permission sandbox; each
  service must select its correct role boundary and validate safe inputs/DTOs. No business
  permissions/calculations/closing behavior changed.
- Explicit absolute lifetime is a caller configuration; idle/freshness/production values are
  not finalized here. Production Next native bundling and SQL-file packaging remain unverified.
- Existing dependency-install evidence records seven moderate lint-chain audit findings and
  optional Tailwind WASM diagnostics. No dependency/security repair was attempted here.

Memory-only sessions are owner approved for this bounded foundation; the latest owner policy
supersedes older persistent-token-storage proposals. No silent security requirement reduction.
Whole B1b, real authentication, UI wiring and B2 remain incomplete.

## Exact source/document scope

Created:
1. web/src/server/db/migrations/0001_auth_users.sql
2. web/src/server/db/migrations/0002_auth_credentials.sql
3. web/src/server/db/migrations/0003_auth_principals.sql
4. web/src/server/db/migrations/0004_auth_session_authorizations.sql
5. web/src/server/db/migrations/0005_auth_session_principal_index.sql
6. web/src/server/auth/types.ts
7. web/src/server/auth/storage.ts
8. web/src/server/auth/database.ts
9. web/src/server/auth/gateway.ts
10. web/src/server/auth/README.md
11. web/tests/integration/auth-foundation.test.ts
12. web/tsconfig.auth.json
13. web/vitest.auth.config.mts
14. docs/development/AUTH_B1B_PART3A_FOUNDATION_REPORT.md

Modified:
- web/src/server/db/migrations/README.md (current auth definitions and retained constraints)
- docs/PROJECT_MEMORY.md (accurate current handoff)
- docs/MODULE_CHECKLIST.md (bounded verification/pending acceptance)

New TEST databases/results are ignored and retained. All other existing source/fixtures,
dependency files, B1a/Part 1 code, experiments/evidence and known formatting drifts are preserved.
No stage/commit/push/reset/clean/stash, Windows setting, WSL, Docker or virtualization change.
Git remains master at 1456ce4df2c6ff7d1c4d61833a019b0cbcee36a1; index empty.
No existing changes were discarded. Final detailed Git/hash checks are in verification evidence.

Recommended next task: review and test the supported password hash/verify callbacks against
the approved normalization and timing requirements, before implementing provisioning or login.
STOP for owner review.
