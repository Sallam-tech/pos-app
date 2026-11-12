# B2 Part5 current extension

Validated isolated TEST storage now admits the bounded Admin Products/Inventory API, four approved pages and authenticated static assets through the SAME host/gateway. Every business operation/page checks exact schema18 and authoritative Admin SQL state. Persistent production remains health-only. Normal Next exposes previews, never these private APIs. See docs/development/INVENTORY_B2_PART5_TEST_API_UI_REPORT.md for exact paths, browser/restart proof and limitations. Earlier sections below describe the preserved Parts3O-Q foundation; their health/auth-only TEST allowlist is superseded only by this bounded extension.

# Private local host - B1b Parts3O/3P/3Q

Explicit server-only entry: startLocalRuntime in runtime.ts. Importing it starts
nothing. Supply an existing validated/migrated database, normal Next production
build directory, explicit session lifetime, distinct externally obtained signing
secrets and TLS material in RAM. No defaults, env loader, credentials, provisioning,
migration, certificate generation or production launcher is provided.

One direct Node HTTPS listener binds ONLY 127.0.0.1, never an internal HTTP backend.
The fixed role hosts are ADMIN=https://localhost:<port> and
SALESPERSON=https://127.0.0.1:<port>, with the same explicitly configured port
(1024..65535). These are different cookie hosts, not same-host port isolation.
Startup resolves actual localhost IPv4 and requires only127.0.0.1. The development
laptop resolves both; admin.localhost/salesperson.localhost did NOT resolve.
Target-machine resolution must pass again; IPv6 is not a listener/fallback.

TLS input: bounded PEM Buffers key/certificate/trustAnchor. One leaf signed directly
by the explicit CA, valid dates, matching private key and SANs for DNS localhost
AND IP127.0.0.1 are required. MinTLS1.2/Node defaults. Admin requires SNI localhost;
the numeric Salesperson host requires NO SNI, as standard clients use for IP URLs.
Incorrect/unknown Host/SNI, duplicate Host, cross-origin Origin and all Forwarded/
X-Forwarded-* or alternate routing headers reject before Next. Node TEST socket clients use an explicit CA with normal certificate/hostname
validation. Browser TEST trust is separately scoped as documented in Part3Q below;
no Windows trust store is modified. Production CA/private-key custody, issuance/
rotation and trusted browser/Electron bootstrap remain gates.

The transport caps headers at8KiB/64 fields, sockets at64, TLS handshake/headers at
5s and incoming requests at10s. Raw header names are checked even beyond parsed
limits. Upgrade sockets are destroyed before Next can handle them. Only exact
GET/HEAD /api/health reaches the actual installed Next production handler.
Part3P adds two POST auth paths; Part3Q adds a GET status path. These are ONLY
for validated isolated TEST storage;
persistent deployments and all unrelated paths/queries/business/UI routes stay closed.
Responses are no-store; errors never reflect inputs or SQL. Health is liveness,
not authentication/authorization or ongoing SQLite readiness.

The runtime opens the existing gateway ONCE and retains it privately. Its returned
capability contains only address/origins/authenticationEnabled/close. The flag is
true only for confined TEST storage, false for persistent deployment. No raw
Better Auth object, gateway, token, secret or HTTP auth handler is exposed.

Ownership has both an in-process fence and a FIXED OS-held TCP guard on
127.0.0.1:36917. The guard immediately closes connections and serves no HTTP/API.
This application namespace is machine-wide, deliberately stricter than per-user:
another cooperating runtime cannot evade it with another DB/HTTPS port. It releases
on process exit without a stale lock file. Do NOT change the namespace, probe/fall
back on collision, enable reusePort or run two application versions simultaneously.
A reserved/occupied guard port denies startup; target-machine availability remains
a deployment check. This is cooperative runtime exclusivity, not an ACL, SQLite file
lock against arbitrary tools or protection from a hostile same-user/admin process.

Startup: validate config/path/build -> acquire guard -> validate TLS -> existing
gateway/schema/history/quick checks -> Next prepare -> loopback HTTPS listen.
No request is accepted before completion. Partial failures close acquired resources;
uncertain closure retains fencing and returns only LocalRuntimeRejected.
Shutdown: stop HTTP admission -> drain admitted responses/work -> gateway close
(reject/drain auth, clear RAM, close SQLite) -> Next close -> guard release last.
The installed Next custom-server prepare leaves process error listeners; this
single-owner host tracks exact listeners it installed and removes them after close.
No forced timeout tears down an admitted database operation. A hung trusted operation
can delay shutdown; native KDF cancellation/limits remain the existing gateway's.

Supported Next API: next({dev:false,httpServer,...}), prepare/getRequestHandler/close.
Custom host files are NOT traced into standalone output. This runtime rejects
standalone/export artifacts, requires a normal .next build and does not change
npm scripts. Future Windows packaging must separately compile the server-only host
and resolve poison markers for a Node-only bundle, include pinned Node24/native
SQLite and all normal Next assets/dependencies, and test relocatability/clean Windows.
TEST subprocesses use the pre-existing Node24 type transformer and TEST-only
server-only resolution hook; these are NOT a production bootstrap or installer.

Focused tests: vitest.hosting.config.mts / tsconfig.hosting.json. Existing Git-bundled
OpenSSL generates disposable one-day TEST CA/leaf keys under ignored test-results;
it is NOT a runtime dependency. One tiny isolated Next build copies the existing
health route, not the frozen application. TEST setup explicitly provisions generic
random credentials before startup; runtime never provisions. Real HTTPS, actual Next/
Better Auth/native SQLite, full child-process startup/competition, restart denial,
faults and preserved TEST sentinels/history are exercised. No testUtils.

Production auth remains disabled even with valid supplied material. Confined TEST
HTTP login/logout/CSRF and TEST browser cookie isolation now work as described below.
enrollment/recovery/key custody, production activation, desktop reopen/signal
supervision and EXE acceptance still require separately reviewed work.

## Confined HTTP authentication - Part3P

Only validated isolated TEST databases register POST /api/auth/login and
POST /api/auth/logout. Persistent storage ALWAYS keeps authenticationEnabled=false
and health-only dispatch. confinedTestAuthentication repeats the original TEST path
checks (including NODE_ENV=test); neither an env switch nor a DB mode flag alone
activates it. There is no production activation option or enrolled shop credential.

Both hosts use the same paths. The host passes its validated fixed role/origin
and live-transport closure privately; JSON cannot select a role/hash/account/session.
Login accepts only {"password":"..."} (one literal, unescaped key); logout accepts {}.
Content-Type application/json (optional charset=utf-8), exactly one matching Origin
and POST are required. Missing/ambiguous Origin, foreign Fetch Metadata, duplicate
cookie names/content types, body encodings, malformed JSON/UTF-8/BOM and extra keys
reject. Health remains GET/HEAD. All other paths, queries, raw framework and Next
routes remain closed, apart from the Part3Q status snapshot below. No permissive
CORS/preflight or internal-record/token inspection endpoint.

The dispatcher reads at most2048 bytes over at most5 seconds, uses existing exact
8..128 scalar/max512-byte validation, then one admitted real gateway verification/
receipt/issuance flow. Existing durable five-consecutive-failure30-second cooldown
and native work parameters are unchanged. Malformed requests never reach KDF.
Authenticated logout commits targeted SQL revocation before volatile/cookie cleanup.
An unmatched foreign-role cookie grants nothing and cannot revoke another role;
existing repeated/no-live-session logout semantics remain idempotent.

Only validated framework cookie headers and fixed {"ok":true} reach success output.
Node receives a Set-Cookie ARRAY, preserving individual headers, after the existing
registry COMMIT. No bearer/hash/password in JSON/errors/logs. Publication failure or
closed/shutting-down connection after issuance attempts private revocation; SQL
uncertainty quarantines the existing gateway. HTTP drain waits for that work.
An aborted request before issuance leaves no session; its private unused receipt
expires/is invalidated by existing gateway lifecycle. No network-delivery guarantee
or duplicate-password-request idempotency/session reuse is claimed.

Wire-issued signed cookies were checked through the real private SQL gateway.
This adds no protected business resource or cookie-inspection HTTP API. Browser
TEST cookie-jar behavior is now covered in Part3Q below. UI clearing/fresh role
transitions, target Windows trust,
compiled deployment/enrollment/custody/activation and production acceptance remain
unverified gates. npm scripts still do not launch this protected foundation.

## Confined session status and browser evidence - Part3Q

The exact GET /api/auth/session path is added to the SAME TEST-only dispatcher.
It accepts no query, role argument or body; all other methods reject with Allow:GET.
A normal browser GET may omit Origin; any supplied Origin/Fetch Metadata must
match the validated role host. Duplicate cookies/Origin, body framing, oversized
headers, forwarded routing and wrong Host/SNI reject. No CORS is enabled.

The signed cookie is checked through existing authorizeAdmin/authorizeSalesperson,
including the authoritative SQL transaction and provisioning/version/epoch/boot/
expiry/revocation checks. Only {"authenticated":true} or false is returned with
no-store/nosniff and NO Set-Cookie. Unavailable SQL, invalid/stale/missing cookies
deny identically. A shutdown/abort after the check cannot publish true.
This snapshot is NOT authorization for any later page/API/business operation:
those operations must still call the private gateway themselves.

22 new checks (19 real-socket +3 real Chromium) and13 selected HTTP regressions
pass; scoped TypeScript/ESLint pass. Browser156.0.8078.4 used isolated profiles,
in-memory contexts, no traces/screenshots/storageState exports and no UI changes.
Real cookie jars enforce Secure/HttpOnly/SameSite=Strict, exact host-only routing
and session cookies; document.cookie/localStorage/sessionStorage/IndexedDB/Cache
Storage reveal no credential. Wrong-host cookie replay, logout and backend restart
deny, with unaffected shop sentinels/history.

Browser trust is ONLY a disposable leaf SPKI allowlist in that TEST browser
process, with ignoreHTTPSErrors=false and no global ignore-certificate-errors.
Chromium's supported switch skips certificate validation for the allowlisted key:
https://chromium.googlesource.com/chromium/src/+/HEAD/services/network/ignore_errors_cert_verifier.h
Unpinned access and another certificate fail; Node socket clients independently
validate the TEST CA and hostnames normally. This scoped TEST exception does NOT
prove normal Windows/browser production trust and MUST NOT become deployment
configuration. No Windows trust store or installed user browser profile changed.

Persistent production remains health-only. Enrollment/recovery, real certificate
and signing-key custody/trust, production activation, UI/page/API authorization,
Back to Login/role switch/window reopen, desktop lifecycle and packaged Windows
acceptance remain gates. No new launch script or production activation flag.
