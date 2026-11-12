# B1b Part3P - real HTTPS login/logout integration

11 November2026. **Task A: PASS / Task B: PASS for confined TEST operation.
Production authentication DISABLED; owner review pending.**

Two exact paths: POST /api/auth/login and POST /api/auth/logout. ADMIN uses the
verified localhost origin; SALESPERSON uses127.0.0.1. The direct TLS host resolves
the role from its validated socket/Host/SNI boundary, never JSON/query/forwarded
metadata. No raw Better Auth or general Next route is exposed.

## Actual implementation

- One private dispatcher closes over the SAME runtime gateway; no new DB/gateway,
  auth.api/handler, default verifier, testUtils, session/token protocol or migration.
  Existing native callback, five-failure/30-second persisted role cooldown, receipt
  consumption, registry transaction, RAM sessions and SQL authorization remain.
- POST plus exact unambiguous Origin, JSON content type, optional same-origin
  Fetch Metadata, bounded headers and strict cookie names. No CORS. Login body is
  exactly one literal password member; logout body is {}. Extra/duplicate/escaped
  identity keys, bad UTF-8/BOM/JSON, body encodings and invalid input reject.
- Streaming body cap2KiB, absolute5-second read deadline; approved8..128 Unicode
  scalars/max512 UTF-8 bytes reused exactly. No trimming/normalization or screening/
  crypto policy change. One admitted verify/receipt/issuance flow; no KDF queue.
- Framework success Response is validated; multiple Set-Cookie headers stay separate
  in Node's response array. Only fixed ok JSON is sent. Publication follows confirmed
  registry COMMIT; a failed registration has no usable cookie. Connection/shutdown
  failure after issuance attempts private revocation before HTTP work finishes.
- Logout reuses real signed-session lookup and confirmed targeted SQL revocation/
  RAM cleanup/cookie expiry. Repeats are safe. A foreign-role cookie cannot revoke
  an unrelated role; unmatched/already-absent sessions follow the existing safe
  unauthenticated/logout semantics, not a claim that an unknown row was revoked.
- HTTP admission/drain and ownership are unchanged. SQL uncertainty denies rather
  than reporting success. Host forwarding/TLS/SNI/loopback/guard checks remain.

## Activation boundary

Dispatcher registration occurs ONLY after the existing TEST path validator accepts
mode=test, NODE_ENV=test and an already-existing isolated workspace TEST database.
The confinement is revalidated; an env flag or mode alone cannot enable it.
Persistent database configurations retain health-only routing and
authenticationEnabled=false. Runtime exposes no gateway or activation switch.
TEST runtimes report authenticationEnabled=true; this is NOT production activation.

## Focused verification

**40 distinct HTTP cases pass +6 selected host regressions;0 unresolved failures.**
Scoped TypeScript/ESLint pass. Real installed Next16.4.3, Better Auth1.7.18/official
adapter, better-sqlite3 13.0.3, native scrypt and HTTPS sockets, with only disposable
generated credentials/certificates and explicitly scoped client CA trust.

Verified: both real HTTP logins, separate signed cookies/no remembered cookie expiry,
fresh private SQL authorization and cross-role denial; exact Unicode/whitespace;
both durable cooldowns/correct-password denial/reopen/expiry/reset; cookie staging
before real COMMIT; native registration rollback; both logouts/repeat/isolation/
SQL uncertainty; native admission/concurrent logout/issuance cancellation/shutdown;
post-COMMIT disconnect compensation; restart; missing/ambiguous Origin, Host/SNI,
forwarding, CSRF/content/encoding/JSON/body/5-second deadline attacks; anonymous/
raw framework/Next denial, test-only activation and credential non-disclosure.
All grant checks use existing private gateway methods; NO protected business/test
inspection HTTP endpoint was added. Browser automation/cookie-jar isolation is untested.

Initial run:36pass/2fail, both expiry TESTS advanced only wall time. Existing limiter
correctly uses monotonic elapsed time during uptime. TEST clocks now advance together;
production limiter/native policy unchanged. Corrected run executes20 affected/new
cases (20 others filtered), all pass. Counts are merged by case, not summed.
Six directly affected Part3O host cases pass, including a real independent Node
runtime. The old test changes only its TEST activation expectation/title.
Part3O's tiny Next build was reused; no new build, old experiment or frontend suite.

Separate ignored evidence: `web/test-results/auth-b1b-part3p-8ed433a0-25cb-494b-ba26-dd7f7cc75f85/`:
baseline.json; http-initial.json/txt; http-corrections.json/txt;
host-regressions.json/txt; initial/correction scoped check logs;
verification-summary.json. Initial failures retained. New TEST files/certificates
remain under ignored test-results/sqlite-b1b-part1/http3p-* and hosting3o-*.
No generated password, key, raw bearer or signed-cookie value is in this report.

## Exact project files

Created:
- web/src/server/hosting/auth-http.ts
- web/tests/integration/http-authentication.test.ts
- web/vitest.http-auth.config.mts
- web/tsconfig.http-auth.json
- docs/development/AUTH_B1B_PART3P_HTTPS_AUTHENTICATION_REPORT.md

Modified:
- web/src/server/hosting/https.ts
- web/src/server/hosting/runtime.ts
- web/src/server/hosting/README.md
- web/tests/integration/local-hosting.test.ts
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

Auth/SQLite source, approved migrations, dependencies/lock/scripts, frontend,
original fixtures, earlier reports/evidence and both formatting drifts preserved.
HEAD/index unchanged; exact final status/hashes are in verification-summary.json.

## Remaining gates and one next task

No production enrollment, trusted certificate/signing-key custody or deployment
activation path. No UI wiring or browser/Electron reopen/role-switch guarantees;
no production security approval. Existing compiled custom-host/normal Next packaging,
shop hardware, filesystem protections, recovery and restore gates remain.
The TEST gate deliberately does not provide a way to log into a persistent shop DB.
Whole B1b is incomplete.

Exactly ONE recommended next task: independent security review of the Part3P HTTP
boundary and its confined activation gate before production activation or UI wiring.
STOP for owner review.
