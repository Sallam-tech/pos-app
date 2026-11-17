# B1b Part 2B - protected session storage feasibility

9 November 2026, Asia/Karachi. **BLOCKED. Stop for owner review.**

The official Better Auth 1.7.18 SQLite adapter does not expose a protected-session-token
configuration. A supported write hook alone does not meet the approved storage requirement.
A full implementation would need a security-critical adapter/storage design covering the
whole lifecycle; this small investigation does not authorize building one or changing internals.

No production login, custom database adapter, encryption implementation, authentication routes,
file database, account credentials or real Admin/Salesperson identities were created.
No dependency installation/upgrade. Part 2A sources and evidence remain unchanged.

## Actual integration exercised

Installed Better Auth/core/official Kysely adapter 1.7.18, Kysely 0.29.0,
better-sqlite3 13.0.3, Windows x64 / Node 24.11.0.
Real native SQLite :memory:, not a mocked database.
Core metadata creates only b2b_test_* tables in memory. One generic fictional principal,
no password account and all password login/sign-up disabled.

The official testUtils plugin creates a real framework session and a signed cookie fixture.
The supported databaseHooks.session.create.before hook applies a keyed HMAC as a deliberately
inadequate negative control. The real internal session adapter and auth.handler process lookup,
update, expiration and revocation. The supported customSession plugin selects a token-free
get-session response. No public routes are added by testUtils; no HTTP listener is started.

Observed failure:

1. The hook changes the initially generated token before insertion.
2. Better Auth returns the inserted row's changed token.
3. The official cookie helper signs that changed value as the session credential.
4. The stored HMAC therefore equals the token component of the issued cookie.
5. Lookup using the initially generated token fails; lookup using the stored replacement succeeds.

This is not protected keyed lookup: the stored replacement became the framework token.
A valid cookie also requires Better Auth's signature. This diagnostic does NOT claim that
someone can forge a valid signed cookie from the database value alone.
The approved no-plaintext-session-token rule is still unmet.

## Pinned contracts reviewed

Relevant installed files, relative to experiments/auth-b1b/:

- node_modules/better-auth/dist/db/internal-adapter.mjs:272 - create/generate/return session.
- Same file:349 - raw token equality lookup and related user join.
- Same file:387 - bulk token IN lookup; results are matched using returned session.token.
- Same file:442 - update selected by token; 483/535/571 - single/user/bulk revocation.
- node_modules/better-auth/dist/cookies/index.mjs:169 - signs session.session.token.
- node_modules/better-auth/dist/api/routes/session.mjs:148 - database lookup, expiry and cleanup;
  subsequent refresh uses the returned token to update and reissue cookies.
- node_modules/better-auth/dist/api/routes/sign-in.mjs:364 - standard password response contains
  token; this disabled login path was inspected, not called.
- node_modules/@better-auth/kysely-adapter/dist/index.d.mts:55 - public config has type,
  debugLogs, usePlural and transaction, not generic protected-token transformation callbacks.
- node_modules/@better-auth/core/dist/db/adapter/factory.mjs:220 - WHERE transformation.
  Generic createAdapterFactory has custom transformation extension points, but using them
  requires constructing a custom adapter. Field write transforms are not a complete query layer.

Creation hooks do not restore a private original token on adapter reads. Simply hashing a field,
encrypting only its writes or marking it absent from JSON cannot supply correct equality/IN
lookups, returned token behavior, refresh, list/select/join, update and revocation.

Primary references:
[session source](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/better-auth/src/db/internal-adapter.ts),
[official adapter](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/kysely-adapter/src/kysely-adapter.ts),
[adapter extension API](https://better-auth.com/docs/guides/create-a-db-adapter),
[official test utilities](https://better-auth.com/docs/plugins/test-utils).

## Options and trade-offs

| Option | Security and implementation assessment |
| --- | --- |
| Keyed token hash only | A proper keyed verifier need not recover the token. It requires incoming-token hashing on every lookup and must never be issued as the new credential. The write-only hook demonstrably fails. The pinned framework also uses recoverable token values in refresh/list/bulk/revocation flows, so a hash-only design needs further maintained support. |
| Randomized authenticated encryption only | Protects stored values and detects ciphertext tampering, with correct key/nonce/associated-data handling. Randomized ciphertext cannot directly satisfy equality lookups of the incoming raw token. Key loss and compromise require explicit recovery/rotation policy. |
| Separate keyed lookup plus authenticated encrypted token | Best match for the approved architecture: independent lookup/encryption keys, lookup index and authenticated record binding, decrypt only inside trusted server operations. Requires a thoroughly reviewed adapter mapping all operations and transactions; not implemented or certified here. |
| Protected official secondaryStorage | A supported smaller key/value boundary is worth separate review. Every key and value, including token-bearing session lists, must be protected. Its interface has no multi-key/cross-SQL transaction contract; mirrored session revocation can run after commit. It is not an automatic substitute for Part 2A atomicity. |
| Encrypted cookie cache / disk encryption | Useful for their own threat models. They do not implement protected SQLite token lookup, ensure response redaction, or satisfy per-request database revocation by themselves. |

Authenticated encryption is discussed in the
[OWASP cryptographic storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).
Browser credential and cookie controls are discussed in the
[OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Recommendation: retain the architecture's keyed lookup + authenticated encrypted token as a
design requirement, but keep implementation blocked. Request a maintained/maintainer-reviewed
Better Auth adapter design covering this lifecycle. Alternatively, separately review a maintained
session/authentication solution with native protected token verification and local SQLite support.
A protected local secondary store is another candidate, subject to atomic revocation/rollback proof.
No framework switch, storage redesign or extra dependency is authorized by this report.

## Diagnostic results and limits

**8 diagnostic checks passed; 0 diagnostic/harness checks failed.**
**The required protected-storage security gate FAILED. Overall verdict: BLOCKED.**
The runner deliberately exits 1. These are not eight passing protected-storage acceptance tests.

Verified:
1. Real session creation through official testUtils and the supported write hook.
2. The write-only-HMAC failure above, including original/replacement lookup behavior.
3. Real get-session lookup and token-free JSON using supported customSession.
4. Secure/HttpOnly/SameSite=Strict cookie fixture properties, and actual request rejection
   when the cookie is absent or its signature is altered.
5. Actual session update, expiration rejection and expired-row removal.
6. Actual session deletion/revocation invalidates the existing signed cookie.
7. Actual session update/create rollback on deferred-FK COMMIT failure; no partial records.
8. Captured framework logs contain none of the ephemeral credential values.

The negative control necessarily held its changed active token in the in-memory database.
No file database was created and no token, cookie, HMAC value or key was persisted in evidence.
This does NOT verify encrypted database-at-rest protection.
AEAD ciphertext/tag/record-swap tampering rejection and protected-adapter rollback are UNTESTED:
no risky custom adapter/encryption proof was built after the blocker was confirmed.
Cookie attributes were checked through official test helpers and requests through the real handler;
browser enforcement, actual TLS delivery and automatic cookie renewal were not certified.
The selected get-session JSON is redacted; other framework response paths are not certified.
The browser/client still needs a valid session credential; it cannot authenticate with no cookie.
Server memory necessarily holds credentials while processing them.

No Part 2A/Part 1/frontend/browser suite or application build rerun.
Existing Part 2A 18-test and Part 1 30-test results remain separate, unchanged evidence.

Evidence: ../test-results/session-review-2026-11-09T17-07-13-715Z/{preservation.json,summary.json}.
Evidence contains only fixed check names, booleans/counts, source hashes and preservation metadata.
Raw console/logger captures and generated secrets are never written.
Only fake records are used; no actual shop data is read.

## Remaining gates and exact files

Protected storage is unresolved. Persistent role/device/global throttling, genuine Admin cookie
isolation, production migration/STRICT/type mapping, key custody/recovery, password normalization,
server permissions/CSRF/origin/TLS/session policy and B2 remain separately gated.
Do not copy this deliberately failing hook into production.

Created only:
1. experiments/auth-b1b/session-review/contracts.mjs
2. experiments/auth-b1b/session-review/run.mjs
3. experiments/auth-b1b/session-review/REPORT.md

Generated evidence stays under the existing ignored test-results/ directory.
Shared project memory and the original Part 2A report are preserved; this report is the Part 2B handoff.

Git began on master at 1456ce4df2c6ff7d1c4d61833a019b0cbcee36a1, with 6 modified tracked files,
34 untracked paths and an empty index. Final expected status adds only these 3 untracked files.
The diagnostic matched all 678 snapshotted existing files; final preservation/link/Git checks
are recorded separately beside its summary. Both known formatting drifts remain untouched.
No stage, commit, push, reset, clean, stash, package or Windows changes. STOP for owner review.
