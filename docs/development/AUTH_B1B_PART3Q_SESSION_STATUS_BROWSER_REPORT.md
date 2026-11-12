# B1b Part3Q - HTTP review, session status and browser isolation

11 November2026. **A: PASS / B: PASS / C: PASS for isolated TEST operation.**
Production authentication remains DISABLED. Owner acceptance is pending.

## A - focused security review

Reviewed only Part3P's dispatcher, trusted TLS host and gateway connection.
No demonstrated Critical/High/Medium defect remains in this scope; no rewrite
or change to prior password/session/rotation/SQLite foundations was needed.
Host/SNI/Origin/CSRF and forwarding checks, bounded strict JSON/headers, fixed
role selection, duplicate-cookie rejection, secure cookie publication AFTER
registry COMMIT, abort/logout/shutdown compensation and generic errors remain.

13 selected real HTTP regressions pass: pre-COMMIT cookie withholding, native
registration/revocation failure, one KDF admission, logout/issuance cancellation,
shutdown, post-COMMIT disconnect, missing/duplicate Origin, bounded chunked input,
absolute body deadline, ambiguous cookies/content and TEST-only activation.
This focused review is not an independent production security certification.

## B - actual endpoint

Exact GET /api/auth/session joins the SAME private TEST dispatcher/gateway.
Role comes only from verified TLS/Host/SNI. No role/query/body input, other method,
raw Better Auth/Next route, returned internal Actor or unrestricted auth API.
Bodyless GET permits absent Origin (normal same-origin browser fetch); supplied
Origin/Fetch Metadata, duplicate cookies/headers and body framing are checked.
Existing transport bounds remain8KiB/64 headers with loopback-only TLS.

The actual signed cookie and authoritative SQLite authorization transaction run
on EVERY check. Only {"authenticated":true} or false, no-store/nosniff and no
Set-Cookie are returned. Missing/stale/expired/wrong-role/tampered/revoked sessions,
version/epoch changes or unavailable SQL deny. Shutdown/abort cannot publish a
late positive result. Status is a snapshot, NOT authorization for later page/API
or business work, which must use the gateway again.

Activation confinement is unchanged: validated existing isolated TEST path AND
NODE_ENV=test. Persistent production configurations remain health-only; no switch
or production activation path was added.

## C - actual browser evidence and trust limitation

Installed Chromium156.0.8078.4, isolated profiles/in-memory browser contexts and
real HTTPS login/logout/session requests: both roles, before/after login/logout,
separate host-only cookies, Secure/HttpOnly/SameSite=Strict/session-only flags,
cross-origin/cross-role replay denial, old-cookie logout denial and backend
restart invalidation. document.cookie and local/session storage, IndexedDB,
Cache Storage, JSON and URLs expose no credentials. Cookies remain the required
browser credential; they are not ordinary JSON or JavaScript-readable storage.
No screenshot, trace, video, storageState export or existing user profile used.

Browser trust was one disposable leaf-key SPKI allowlist with
ignoreHTTPSErrors=false; no global ignore-certificate-errors or Windows trust
change. [Chromium's contract](https://chromium.googlesource.com/chromium/src/+/HEAD/services/network/ignore_errors_cert_verifier.h)
skips certificate validation for the pinned key. Real negative controls reject
the unpinned TEST CA and another certificate. Node clients separately perform
normal CA/hostname validation. Browser pinning is a scoped TEST exception,
NOT proof of normal Windows production trust or acceptable deployment key custody.

## Verification and preservation

**22 distinct new checks PASS (19 real-socket +3 browser),13 selected regressions
PASS;0 unresolved failures. Scoped TypeScript and ESLint PASS.**
Real installed Next/Better Auth/official adapter/native SQLite; previous tiny
Next build reused. No new build, dependency, migration, frontend or full suite.

Initial failures retained:2 incorrect TEST setups (provisioned Admin cannot be
deactivated by schema; undefined Node request header) and3 browser command-line
inspection failures (explicit automation flag required). Corrected TEST setup
only;19 socket cases and3 browser cases then pass. Counts merged by case.

Separate ignored evidence:
web/test-results/auth-b1b-part3q-0d7d7e10-ebd7-4a0b-9ac6-73e379d3147e/
contains baseline.json, socket-initial.*, endpoint-browser.*, browser-correction.*,
http-regressions.*, initial/final scoped check logs and verification-summary.json.
Fresh disposable databases/certificates and safe browser-version metadata are
under new test-results/sqlite-b1b-part1/http3p-* directories.
Previous evidence and both formatting drifts are preserved.

Modified:
- web/src/server/hosting/auth-http.ts
- web/src/server/hosting/https.ts
- web/src/server/hosting/README.md
- web/tests/integration/http-authentication.test.ts
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

Created: docs/development/AUTH_B1B_PART3Q_SESSION_STATUS_BROWSER_REPORT.md.
HEAD/index unchanged;6 tracked modified +130 untracked files, no staging/commit/
push/reset/clean/stash. Exact preservation hashes/status: verification-summary.json.

Remaining gates: owner enrollment/recovery/restore, protected production
certificate/signing-key custody and trust, production activation, UI/page/API
authorization, fresh Back to Login/role-switch/window-reopen integration,
desktop lifecycle/EXE and target-hardware acceptance. Whole B1b is incomplete.
The approved8+ passwords and five-failure/30-second cooldown are unchanged.

Exactly ONE recommended next grouped task: production bootstrap gate covering
owner-approved enrollment and protected TLS/signing-key custody, with activation
kept disabled until its focused acceptance checks pass. STOP for owner review.
