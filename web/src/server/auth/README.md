# Private authorization/password/setup foundation - B1b Parts 3A/3B/3C/3G/3H/3I/3J/3K/3L/3M

Server-only, unwired foundation. Importing modules creates no account, credential, session,
public authentication handler or production database. Setup requires an explicit private call.
The approved frontend remains a demo and is not protected by this unwired foundation.

## Entry point and ownership

Use openAuthorizationGateway once from a future reviewed single-process server lifecycle.
Without configuration it returns a deny-only gateway. Configured opening requires an already
migrated database, two externally supplied distinct signing secrets, explicit session lifetime
and two HTTPS origins on DIFFERENT hostnames. No signing secret or lifetime policy is inferred.

The returned capability has only verifyAdminPassword, verifySalespersonPassword,
authorizeAdmin, authorizeSalesperson, withAdminTransaction, withSalespersonTransaction
and close, plus private issueAdminSession/issueSalespersonSession and
logoutAdmin/logoutSalesperson and rotateAdminPassword/rotateSalespersonPassword. Verification receipts
grant no authorization without controlled single-use issuance and subsequent SQL checks. Raw Better Auth instances,
handler, API, adapter, token store and native handle are not returned. All files use server-only
poison markers. Do not mount framework routes or add an alternate auth.api path later.

Two private role portals share ONE Kysely/native connection owner. They have distinct cookie
prefixes, signing secrets and volatile stores. Cookies are host-only, Secure, HttpOnly and
SameSite=Strict. This is server-side role separation; local DNS/TLS, browser/Electron cookie-jar
isolation and actual app reopen/Back to Login/role-switch wiring remain unimplemented.

A process-global admission marker rejects a second owner in the same PID, including another
copy of this module. It is not a cross-process lock or a Next.js worker supervisor. Multiple
application workers/processes are unsupported. Production lifecycle/supervision must enforce
one process before this foundation is exposed. No worker or HTTP listener is started here.

## Database and authorization

Explicit maintenance uses the ORIGINAL applyMigrations mechanism with the approved SQL files.
Opening a gateway checks its exact history/checksums/version; it never applies a migration.
No database is created on gateway open. Invalid paths and safety preflight use Part 1 unchanged.

auth_users allows only fixed ADMIN and SALESPERSON IDs, with matching unique role and internal
reserved email identifiers. auth_credentials allows one credential provider/hash per identity;
unused framework OAuth fields are CHECK NULL. auth_principals holds positive int64 credential
version/auth epoch, inactive-by-default state and explicit provisioning marker. A provisioned
Admin cannot be disabled. auth_session_authorizations stores NON-BEARER session IDs, principal,
version, epoch, boot generation, timestamps and revocation. There is no SQL session/token or
verification table.

At most two identities can be inserted; both must have credentials and completed provisioning
before ANY access is possible. Migrations insert nothing. Part3C adds a STRICT singleton
completion latch and private atomic setup; gateway grants require matching provisioning
metadata. The additive validator is unchanged; no trigger grammar or reset API was added.

The pinned official adapter's user/credential field mapping is exercised against this schema.
Framework dates are ISO TEXT and its only numeric column is a constrained 0/1 boolean.
The adapter expects Number booleans. Authorization and callback SQL use native
safeIntegers(true) on EVERY statement and the original signed-int64 binding guard.
REAL results, Number bindings and overflow reject. No financial calculation is implemented.

Every granted operation requires the actual signed-cookie session AND fresh committed SQL
checks: exact role, active principal, two fully provisioned identities, session ID, credential
version, auth epoch, current boot, creation/expiry time and unrevoked registry row. Cached user
roles do not grant permission. Cookie caching and framework session refresh are disabled;
server getSession additionally forces disableCookieCache and disableRefresh.

Protected callbacks run through the real core runWithTransaction and official transaction:true
Kysely adapter. Its SQLite BEGIN is deferred; a no-change principal UPDATE reserves the writer
BEFORE authorization. The callback and final authorization check run under that same reservation.
An independent writer cannot revoke state between the check and COMMIT. Callback/COMMIT failure
rolls back. A callback scope expires before controlled COMMIT; nested gateway calls reject.

Callback SQL is a TRUSTED server-side repository capability, not a user query API. It accepts
bound SELECT/WITH reads and INSERT/UPDATE/DELETE writes only. Future services must choose the
correct role method, validate their own business permissions and return safe DTOs. Never accept
SQL or required roles from browser input. A standalone authorize result is only a snapshot;
use the transaction callback for all future protected database mutations.

Operations serialize within this one owner. close rejects new admission, awaits admitted work,
clears RAM and closes the connection. It does not delete identities/authorization rows or
reset shop data. In-process reopen loses old sessions; fresh-process framework behavior is
also covered by the earlier isolated Part 2C evidence, not a current deployment certificate.

## Password callbacks - B1b Part 3B

Both private Better Auth 1.7.18 contexts explicitly use passwordCallbacks.hash AND
passwordCallbacks.verify from password.ts, through the supported emailAndPassword.password
interface. enabled:false and disableSignUp:true remain. No default verifier or public
login endpoint is enabled. Part3I adds private verification and Part3J controlled session
issuance. The pinned default's NFKC/hex-equality behavior is deliberately unused.

Policy: BOTH ADMIN and SALESPERSON use8-128 Unicode scalar values, max512 UTF-8 bytes.
Part3G owner approval supersedes the shared15-character minimum and initial-release PIN.
password-policy.ts is the SINGLE bounds validator used by crypto and offline screening.
Exact well-formed strings only:
no normalization, trim, case conversion, truncation or composition rules. Spaces and NUL
are significant. Rejecting unpaired UTF-16 surrogates prevents replacement-character
collisions. The frozen login form is a presence-only demo, unchanged and unwired.
Both prospective role passwords use the reviewed Part3E46,483-entry corpus and weak-value
screen via offline-password.ts; admin-password-policy.ts retains the Admin API by delegation.
Screening lowercases only a rejection-policy COPY. ORIGINAL credential bytes reach scrypt.
Existing15+329-entry data is historical only; never use it as the Salesperson-only screen.
Bounds apply in BOTH hash/verify callbacks; common/weak screening belongs to trusted
setup/password change, not ordinary verification against a newly changed blocklist.
No PIN credential path, public login/signup or raw handler/API is enabled.
The corpus is bounded/historical; passing it is not proof of strength. Remote Admin
must later require an additional strong factor, never this password alone.

Version001 encoding preserves the existing SQL constraint (161 lowercase-hex/colon chars):
saltHex(32) + ":" + hex(ASCII "POSPW001")(16) + derivedKeyHex(112).
The full salt is16 cryptographically random bytes; the marker occupies eight bytes of the
old64-byte payload, leaving a56-byte (448-bit) native scrypt result. All parameters are
fixed by this version: N=131072,r=8,p=1,maxmem=192MiB. No SQL/checksum changes or custom
adapter are needed. This is NOT compatible with the default's unversioned output and
has no legacy fallback. Unknown versions and embedded work parameters reject.

Derivation uses asynchronous node:crypto.scrypt over exact UTF-8 buffers and raw salt.
Only timingSafeEqual compares derived keys, always56-byte binary buffers. At most two
native jobs run; extra attempts fail closed immediately, with no pending queue.
Expected native working memory is about128MiB per job plus overhead, bounded by maxmem.
Hashing errors are generic without native causes; verification returns false on invalid
input, native errors and saturation. Temporary buffers are cleared; JavaScript strings,
pagefiles/dumps and OS memory erasure are not controlled here. Invalid-format rejection
is intentionally early; this is not a whole-login constant-time or throttling guarantee.

Callbacks do not open/write a database or log credentials. Future reviewed provisioning
may persist hashes ONLY in auth_credentials. No production account exists. No session
bearer or signing key is stored by this module. Key custody and production hardware
capacity/latency remain unverified.

## Explicit first-run provisioning - B1b Part 3C

runTrustedFirstRunSetup(config, readPasswords) is a PRIVATE server-only entry. It is
never called by an import, gateway open, startup or endpoint. readPasswords must be a
one-shot RAM reader supplied by a future trusted owner setup lifecycle; a function/type
does not establish owner identity. No CLI/env password input or signing key is needed.

Apply reviewed migrations through0007 explicitly in maintenance first. The function
requires the exact reviewed seven-migration schema and completely empty authentication
state; it refuses existing/partial/unknown data rather than adopting or repairing it.
Both passwords pass the Part3G shared8+ policy, reviewed pinned offline common-password screen
and exact-byte distinctness check. Hashing/self-verification run before the writer lock.

The REAL official adapter transaction reserves the writer, rechecks pristine state and
creates BOTH user/account/principal records, three initial login-attempt buckets and
STRICT singleton completion latch.
All commit together; failure rolls back and a still-pristine attempt can retry. No
credential overwrite, latch reset, partial activation, session or raw adapter return.
Setup and gateway share the same existing per-PID owner fence.

Every gateway grant now also requires the completion latch and matching principal
provisioning timestamps. A surviving RAM session cannot bypass a missing latch.
The latch references BOTH principals with RESTRICT FKs; no supported delete/reset API.
Privileged database edits and restoring an entire pre-setup image are not prevented by
a SQLite-only record. Backups must retain the COMPLETE atomic identity/latch/history set.
Do not clear the latch to recover a password or repair a restore.

Permanent device/enrollment custody, trusted owner ceremony, lost-Admin recovery and
encrypted portable backup/restore are unresolved production gates. No recovery bypass
is provided. This is PARTIAL overall and must not be invoked on real shop storage yet.
See [Part3C scope/recovery report](../../../../docs/development/AUTH_B1B_PART3C_PROVISIONING_REPORT.md)
and [active shared offline policy](admin-policy/README.md).

## Persistent credential verification - Parts3H/3I

The gateway privately constructs createLoginAttemptProtection with its EXISTING owner,
SAME serialized queue, official runWithTransaction and a fixed trusted credential verifier.
verifyAdminPassword/verifySalespersonPassword accept only the submitted password value.
They select no identity/hash/verifier from request metadata. No second owner or route.

BOTH roles use the approved5 CONSECUTIVE failures then30-second cooldown. A correct input
cannot bypass an active cooldown. Success clears only that ROLE streak; expiry starts
a fresh allowance. Blocked calls do not extend cooldown. No escalation/permanent lockout.

The unapproved GLOBAL10-attempt/15-minute policy is INACTIVE. It previously could deny
one role because of failures against the other, including a correct password. The GLOBAL
row remains only for existing schema/format validation, synchronized revision/security
time and pruning of historical entries; it is never newly charged or used for admission.
No migration, role-counter reset or deletion of old evidence is needed. Active runtime
policy exports only5 failures/30 seconds. Overall protection is one in-flight credential
verification across both roles, fail-fast rejection of other attempts and no KDF queue.
Any extra device/global rate policy requires separate owner approval.

Each admitted attempt reserves the SQLite writer, checks completed two-account provisioning,
fixed identity/provider, active principal, credential version/epoch, and reads the trusted
hash. The atomic durable ROLE charge commits BEFORE real native scrypt; no SQL transaction
spans scrypt. Both actual private Better Auth1.7.18 contexts use the exact approved native
callbacks, verified at startup, with no default verifier or public sign-in/checkPassword API.

The second short transaction reserves the SAME writer and rechecks the trusted credential
hash/update metadata, provisioning, active state, version and epoch before resetting the
streak. Changed/corrupt/unavailable state or finalization/COMMIT failure denies generically
and retains the original charge. Encoded-hash equality detects changed DB state only;
password verification always uses the native callback and binary timingSafeEqual.

A successful check returns only a private frozen receipt with an AbortSignal. It reveals
no role/hash/version/secret and grants no session, Actor or database authority. Private
WeakMap metadata binds the exact receipt identity to the verified credential state,
role/version/epoch/boot and a bounded five-second monotonic deadline. A timer aborts/deletes it; a new verification or close also
invalidates it. Timer/signal alone must NEVER become authorization. Part3J now consumes
it once and rechecks identity/deadline/boot plus authoritative SQLite state under its writer
transaction. The final check is linearized at COMMIT; every later protected operation
still checks authoritative versions/revocation.

Credential work is tracked across queue waits, native scrypt and finalization. close
rejects new work, invalidates receipts, drains admitted verification, denies its late
result and then closes the SAME owner. Nested verification rejects without disturbing
an existing protected transaction. A stalled native job retains its slot; releasing it
on a timer could queue work and is not done. No automatic credential/account/state repair.

The three STRICT security rows remain bounded and must be initialized only with trusted
atomic provisioning. Missing state never auto-initializes. Existing enrolled-v6 databases
and incompatible old15-minute TEST state need separately reviewed maintenance, never
re-provisioning or deleting shop data.0001-0007 and provisioning source are unchanged here.
Monotonic uptime/persisted high-water clock behavior is retained; privileged file/clock
rollback, target power loss, recovery/restore freshness and deployment remain gates.

No public login, HTTP/UI, recovery or business behavior is implemented. Part3J implements
only controlled private RAM-session issuance, described below. Fresh
password entry on reopen/logout/Back to Login/role change remains a future lifecycle gate.
See [Part3I scope/evidence](../../../../docs/development/AUTH_B1B_PART3I_PRIVATE_CREDENTIAL_GATEWAY_REPORT.md);
the original [Part3H report/evidence](../../../../docs/development/AUTH_B1B_PART3H_LOGIN_ATTEMPT_PROTECTION_REPORT.md)
is preserved as history.

## Controlled RAM-session issuance - Part3J

issueAdminSession/issueSalespersonSession accept only a genuine private receipt object.
Consumption removes it from the WeakMap and aborts it BEFORE any later failure; forged,
serialized, expired, reused, cross-role or aborted values deny generically. No retry can
reuse a consumed receipt. Its five-second monotonic deadline is checked independently
of timer delivery. A new password check is required after failure.

Issuance and verification cannot run concurrently. Issuance uses the SAME owner/queue,
rejects inherited framework adapter contexts, and verifies its native transaction is live.
It reserves the writer before authoritative provisioning/role/active/hash/version/epoch
checks. Supported AuthContext.internalAdapter.createSession generates ID/bearer and joins
the current official adapter transaction; there is no token generator or testUtils here.
Only its NON-BEARER ID and int64 version/epoch/boot/created/expiry bindings reach SQLite.

The exported createAuthEndpoint.serverOnly helper has NO URL and is NOT registered on
a router or plugin. It provides the actual endpoint context for official setSessionCookie.
The secure signed cookies and no-store JSON success Response are staged privately while
the writer transaction remains open. No response is returned until registration COMMIT
completes. The cookies are host-only, Secure, HttpOnly, SameSite=Strict and have no persistent
Max-Age/Expires. SQL and RAM expiry use the existing explicit configured lifetime, with no
refresh; the framework's remember-me24h default is overridden by the trusted fixed expiry.
A browser MUST possess the cookie credential; RAM-only describes server storage.

RAM and SQLite are separate stores. Rollback can leave an orphaned RAM entry. Failure
discards staged headers and attempts framework deletion, then role-store clearing. A
possibly committed registration is revoked in another owned transaction. If SQL state or
compensation is uncertain, the entire gateway closes/quarantines and denies access. Even
if BOTH RAM cleanup methods fail, absent/revoked SQL authorization or a closed gateway
prevents access. No raw framework context/API, bearer JSON or unguarded path is returned.

Every protected request still needs signed-cookie lookup plus fresh SQL authority.
The writer excludes external revocation before registration COMMIT; later revocation is
enforced on the next protected operation. close drains issuance, discards late results,
clears RAM and closes the same owner, retaining persisted account/registry/shop records.
A restart requires fresh authentication. Browser/app window reopen while the backend
continues running still needs the future reviewed logout/role-transition lifecycle.

See [Part3J exact scope/evidence](../../../../docs/development/AUTH_B1B_PART3J_CONTROLLED_SESSION_ISSUANCE_REPORT.md).
No HTTP/UI/enrollment/recovery/remote Admin is activated.

## Private logout and revocation - Part3K

logoutAdmin/logoutSalesperson resolve identity only through the corresponding real signed
cookie lookup, bypassing cache/refresh. They accept no role/account/session-ID input.
The SAME queue and official transaction reserve the writer, verify exact registry bindings
and confirm targeted SQL revocation COMMIT BEFORE RAM cleanup/cookie expiry/success.
These private capabilities support future Back to Login/role-switch handlers without
wiring a UI. Pending receipts abort; earlier native verification/issuance cannot publish.

Supported deleteSession and exact-key RAM fallback are best effort. Surviving RAM cannot
authorize revoked SQL. Other sessions are untouched in normal logout. Repeat/no-session
logout confirms SQL availability/provisioning before clearing cookies, without guessing
an identity. Lookup/SQL/COMMIT uncertainty denies and quarantines BOTH roles until trusted
close/reopen. Shutdown drains logout; no accounts or shop records are deleted or reset.

Official pathless serverOnly/deleteSessionCookie returns secure expired cookies and only
{"ok":true} no-store JSON; no raw API/handler/route is exposed. Browser/window reopen with
a live backend remains a future desktop lifecycle gate.
See [Part3K scope/evidence](../../../../docs/development/AUTH_B1B_PART3K_SESSION_REVOCATION_REPORT.md).

## Private Admin-controlled password rotation - Part3L

Both fixed-target rotation methods require an active signed ADMIN session AND a fresh
genuine single-use ADMIN receipt. No account/role/hash/authorization flag is input.
The receipt burns before later failure and must stay fresh through the initial authorized
SQL snapshot (five seconds). Owner-approved Part3M then starts a private fixed30-second
operation deadline; the consumed proof/session lifetimes are not extended.
Return value is void: no session, hash or cookie is issued. Self-rotation requires login.

Same owner/queue: an authorized snapshot transaction, exact8+ offline policy/reuse checks
and new salted native hash OUTSIDE the writer, then one atomic credential/version/epoch/
role-wide revocation transaction. BOTH account states and Admin authority are rechecked.
The supported pinned updateAccount helper joins getCurrentAdapter inside that transaction.
Reuse checking shares the native constant-time comparison core but throws on errors;
a false/error login verifier is never taken as proof of credential non-reuse.

Confirmed COMMIT precedes supported deleteUserSessions and target-only RAM clearing.
All old target cookies deny even if RAM survives. Other valid Admin sessions survive
Salesperson rotation. No provisioning, business, latch, migration or throttle reset.
One rotation at a time; competing KDF/issuance admission denies. Logout/shutdown/expiry
or stale SQL cancel. COMMIT uncertainty quarantines both roles, never claims success.
Shutdown now closes SQLite even when RAM clearing throws; old closed gateways deny.

Native work and final queue delay count against30 seconds after the authorized snapshot,
with monotonic rollback/overflow checks and unchanged final SQL/session-expiry checks.
Logout/shutdown/revocation/stale state still deny. A running native job cannot be forcibly
cancelled: late results reject, with admission held until completion. Target-hardware
capacity remains a deployment gate. Own cookie expiry/wiring is a future handler responsibility;
the retained old cookie grants no access. No lost-password/recovery bypass is provided.
See [Part3L evidence/files/limits](../../../../docs/development/AUTH_B1B_PART3L_PASSWORD_ROTATION_REPORT.md)
and [Part3M timeout correction](../../../../docs/development/AUTH_B1B_PART3M_ROTATION_TIMEOUT_REPORT.md).

## Security work deliberately pending

Private atomic setup, credential verification, throttle binding, receipt consumption and
controlled RAM-session issuance, private logout/revocation and Admin-controlled rotation
are implemented. Trusted owner
enrollment and recovery/restore approval remain gates. No deployed reopen/role-transition
lifecycle, real login HTTP/UI,
owner recovery service, one-use Admin grants, deployed role isolation/idle policy,
key custody or restore/supervision is provided. Every later protected operation must retain the
authoritative SQL gateway. Do not expose framework routes/API as an alternate path.

No OS pagefile/hibernation/dump protection, hostile filesystem race defense, real TLS/browser
delivery, Next production bundling or packaged Windows behavior is certified here.

## Focused checks

From web, with already installed dependencies:

- node node_modules/vitest/vitest.mjs run --config vitest.auth.config.mts
- node node_modules/typescript/bin/tsc --project tsconfig.auth.json --noEmit
- node node_modules/eslint/bin/eslint.js src/server/auth tests/integration/auth-foundation.test.ts vitest.auth.config.mts --max-warnings=0

All database files are fresh TEST fixtures in the existing permitted test-results area.
Official testUtils instrumentation exists ONLY in the integration test, never production modules.
See [the report](../../../../docs/development/AUTH_B1B_PART3A_FOUNDATION_REPORT.md).
Part3B only: use vitest.password.config.mts and tsconfig.password.json for the password suite;
its exact commands and evidence are in [the Part3B report](../../../../docs/development/AUTH_B1B_PART3B_PASSWORD_REPORT.md).
Part3C scoped commands/evidence and the recovery gate are in its report above.
STOP for owner review; do not provision real accounts, wire login or start the next module.
