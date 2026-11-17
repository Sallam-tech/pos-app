# B1b Part 2C - memory-only session security proof

10 November 2026, Asia/Karachi. **PASS for this disposable proof only.**
Production authentication and any architecture/policy change remain unapproved.
STOP for owner review. No next feature is authorized.

## Result and design actually exercised

Pinned Better Auth/core/official Kysely adapter 1.7.18, Kysely 0.29.0,
better-sqlite3 13.0.3; actual Windows x64, Node 24.11.0, ABI137/N-API10,
SQLite 3.53.4. No installation, upgrade, upstream change or custom database adapter.

Official testUtils creates actual framework sessions and signed cookies for ONE generic TEST
principal. Password login/sign-up remain disabled. No real credentials or password hashes
were created. Tests exercise real auth.handler Request/Response processing, auth.api.getSession,
and the framework session create/single+bulk lookup/update/refresh/expiry/delete lifecycle.
A fresh Node child process exercises restart. There is no listening network server or Next.js route.

The supported secondaryStorage interface is implemented by a bounded process-local Map,
with TTL and all five pinned single-key methods. It has no file/persistent backend.
storeSessionInDatabase=false; generated framework metadata omits the SQL session table.
The disposable SQL file contains only c_test_principal, empty c_test_unused_account,
c_test_authority and c_test_access. Access rows contain non-bearer session IDs, version,
boot generation, expiry and revocation state. There is no token or token lookup hash in SQL.

A custom TEST-only private request gateway is essential. It permits only:
GET /api/auth/get-session, GET /proof/protected, POST /api/auth/sign-out.
Every allowed request first reads committed SQLite state; successful access additionally
requires the real signed cookie/session, active principal, matching epoch/registry/boot,
unrevoked authorization and unexpired SQL/framework session. Public JSON selects only
authenticated/principal or fixed success/denial fields. Credentials travel in cookies only.

The raw framework handler/API remain private to the test host; privileged test controls
are not exposed routes. This is application authorization around supported framework APIs,
not a claim that Better Auth implements our SQLite authorization policy automatically.

## Tests and evidence

Final focused suite: **26 passed / 0 failed**, including preservation.
25 behavioral checks plus the separate preservation check; counts are not added across runs.

Evidence: [final summary](test-results/suite-7a720cd7-b209-4f39-828d-6ef20cf6c753/summary.json).
It records fixed test names, assertions' results, versions, counts and exact tested source hashes.
No raw credentials, request headers, cookies, SQL dumps or captured log contents are persisted.

Verified:

- Real session works in the running host; Secure/HttpOnly/SameSite=Strict cookie fixture properties.
- Live main/WAL/SHM files scanned for every generated token, signing key and known cookie
  representation; no match. No persistent secondary store exists. Non-bearer registry IDs
  cannot authenticate as unsigned cookies.
- Forced termination and a genuinely fresh process reuse the SAME SQL file and signing key.
  All THREE old signed cookies, including actual framework-generated cache cookies, fail;
  committed authorization rows survive; a fresh session works. RAM starts empty.
- Credential-version/authorization-epoch changes atomically revoke older registry rows.
  New sessions use the new version. Inactive principals are denied.
  These are generic version markers, NOT a real password-change endpoint or password verification proof.
- Real framework bulk RAM revocation deliberately fails, leaving a findable live RAM session.
  SQLite still denies its cookie. Failed logout cleanup likewise cannot restore access.
- Failed SQLite version/revocation transaction restores every earlier value/row; the prior
  valid session still works. Failed registry insertion rolls back and does not publish a
  cookie; even its intentionally retained RAM session lacks access.
- Stale pre-verification version, independent SQLite revocation during awaited real session
  creation, and concurrent issue/revoke/stale-issue operations cannot preserve usable old access.
  Cookie publication follows the checked registry commit.
- All allowed requests, including missing credentials, RAM failure and SQL failure, consult
  SQLite or fail attempting that read. A closed authorization reader and RAM read failure deny access.
- Actual signed cookie cache is deliberately enabled in adversarial fixtures. A PRIVATE
  framework diagnostic accepts stale cached data after revocation/RAM loss; the exposed gateway
  rejects it. The gateway forces disableCookieCache=true and checks SQL independently.
  Default proof config disables cookie caching. **Never expose the raw handler/API as a bypass.**
- 42 alternate endpoint/path/method variants are rejected by the exact allowlist; caller query
  flags cannot override the gateway's storage lookup. This does not authorize exposing other
  framework routes later.
- Actual wall-clock expiry, actual refresh and actual logout work. Refresh cannot extend the
  independent SQL expiry. Missing/tampered/unsigned cookies fail.
- 100 ordinary JSON responses, five framework log entries, child stdout/stderr and runner console
  were checked for generated credentials; no leak. The private negative-control response is
  inspected only in RAM and is never an exposed response or saved evidence.
- SQLite integrity/FK checks and host cleanup run for every local integration fixture.

Initial fixture smoke setup incorrectly expected the framework to retain a SQL verification table;
the pinned secondaryStorage metadata intentionally omits it. Only the new fixture was corrected,
then smoke passed. An initial 26/26 run was retained separately. After strengthening the universal
SQL-read assertion and failure-path fixture cleanup, the final 26/26 run above passed.
No existing Part 1/2A/2B/frontend suite or application build was rerun.

## Suitability and limits

This approach is feasible for further POS design review if logout on EVERY server restart
is acceptable and the application retains a single mandatory authorization boundary.
Browser credentials remain necessary; no cookie means no authentication.

No unsupported framework patch was necessary. However, the tested private gateway,
SQL registry, credential-version binding, serialization and cookie publication rules are
custom security code requiring independent review before production use. The testUtils
issuance capability is privileged TEST code and must never ship as login.

Still unverified/unimplemented: actual password verification/rotation/recovery atomically
bound to the version change, exactly two accounts/role permissions, persistent throttling,
Admin/Staff cookie isolation, one-use Admin grants, production STRICT migrations/host integration,
real TLS/browser/Electron behavior, protected key custody/owner recovery, backup/restore and
multi-process writer supervision. Generic credential-version markers do not certify password hashing.

Single-process operation serialization and one separately connected revocation writer were tested,
not arbitrary multi-host scheduling, crash during every operation, disk-full or hardware power loss.
SQL failure used a genuinely closed reader, not every corruption/I/O failure mode.
No OS paging/hibernation/crash-dump guarantee is made; application-level volatile storage does
not certify Windows cannot page credentials to disk. No Windows setting was changed.
Test path checks assume a trusted workspace and are not a production filesystem sandbox.

Any replacement of the approved persistent encrypted-session design, restart-login policy,
production gateway/API surface and credential-rotation implementation requires owner approval.
Memory-only sessions are conditionally suitable, not production accepted. Part 2/B2 remain stopped.

## Exact files and preservation

Created only under experiments/auth-b1b/memory-session-proof/:

1. .gitignore
2. storage.mjs
3. host.mjs
4. worker.mjs
5. proof.mjs
6. run.mjs
7. README.md
8. REPORT.md

Generated TEST databases and safe baseline/run/verification evidence remain ignored under
test-results/. The final verification and artifact manifest enumerate their exact paths/hashes.
No existing source file was modified. Shared project memory/checklists remain untouched because
the owner restricted writes to this new proof directory; this report is the Part 2C handoff.

Preservation: all 692 snapshotted pre-existing files and three links unchanged, including prior
evidence, native/lock provenance, Part 1/2A/2B, frontend and fixtures. Git outside this proof
matches the task-start status. The cloud-plan formatting drift, B1a package ending drift and
previously identified Part 2B runner line21 trailing space are all untouched.

Git: master, HEAD1456ce4df2c6ff7d1c4d61833a019b0cbcee36a1, empty index.
Six prior tracked modifications and 37 prior untracked paths preserved; eight new untracked
proof files make 45 untracked paths. No stage, commit, push, reset, clean or stash.
