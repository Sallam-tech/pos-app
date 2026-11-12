# B1b Part3O - local HTTPS and controlled gateway lifecycle

11 November2026. **Task A: PASS for isolated HTTPS foundation.
Task B: PASS for controlled runtime foundation. Owner review pending.**
Production authentication remains disabled; no login/logout or frontend wiring.

## Implemented and verified

- Supported Next16.4.3 custom server, normal production build, direct Node HTTPS,
  ONLY127.0.0.1; no internal HTTP backend. Actual installed Next health handler
  serves both ADMIN localhost and SALESPERSON127.0.0.1 origins. Real IPv4 DNS
  resolution was checked; admin.localhost/salesperson.localhost returned ENOTFOUND.
- Actual certificate chain/hostname validation with a disposable CA trusted only
  by test clients; matching key, both SANs and validity checked at startup.
  No insecure certificate-validation override or Windows trust-store changes.
  Strict Host/SNI/Origin/raw-header checks, forwarding rejection,8KiB/64-header/
 64-socket limits and TLS/header/request time bounds; upgrades/plain HTTP deny.
- Private start/close API, same existing gateway/native owner. Explicit migrated
  DB/configuration only; no auto-create/setup/migration. Both per-PID fence and
  fixed application-wide OS TCP guard127.0.0.1:36917; another cooperating process
  with the SAME or ANOTHER DB/HTTPS port rejects. No guard fallback/stale deletion.
- Startup becomes reachable only after preparation succeeds. Shutdown stops new
  HTTP admission, drains responses/work, closes gateway/RAM/SQLite and Next,
  then releases ownership. Partial failures clean acquired resources. Uncertain
  closure keeps fencing. Exact Next-owned process error listeners are removed.
- Only GET/HEAD /api/health is mounted; no raw Better Auth/login/logout/Admin/
  business route. Returned runtime exposes no gateway, secret or session capability.

## Focused results

**34 distinct checks passed;0 unresolved failures.** Scoped TypeScript and ESLint pass.
32-case focused run passed, then10 directly affected ownership/cleanup regressions
and3 actual full-process cases passed; overlapping cases are NOT added as distinct.
No historical auth/frontend/browser suite rerun. ONE tiny isolated production Next
build was reused. Actual pinned Better Auth/official adapter/native SQLite and real
TLS sockets are used. Complete startup in an independent Node process also succeeds,
so duplicate-process denial is not inferred solely from a failing child program.
Private real signed sessions for BOTH roles fail after runtime restart. Credentials,
latch, migration history and unrelated TEST sentinel persist; no secret output found.

Preserved failed/investigation evidence: first harness run interrupted because a
frozen-method spy left a TEST response barrier held; corrected with unconditional
barrier release. Next listener warning led to actual host cleanup correction.
Next completed run31pass/1safe-denial: OS EACCES at an excluded Windows port;
confirmed by read-only reserved-range query. Final fixed application namespace uses
36917, rejects collisions and cannot be bypassed by changing DB/port.
An added positive child proof initially lacked Node's existing TypeScript transformer
flag and denied before runtime start; corrected flag/IPC cleanup, then all3 real
process cases pass. No failed run is represented as passing evidence.

Evidence: `web/test-results/auth-b1b-part3o-4be11e2c-fc9e-435b-9243-aed8958fe032/`.
baseline.json; interrupted-run.json; hosting-correction.json; hosting-final.json;
application-owner-focused.json; full-process-positive.json; full-process-corrected.json;
final scoped check logs and verification-summary.json. Initial logs remain.
Disposable certificates/build/DBs remain under ignored test-results/sqlite-b1b-part1/
hosting3o-*; values and keys are excluded from this report.

## Exact project files

Created:
- web/src/server/hosting/ownership.ts
- web/src/server/hosting/https.ts
- web/src/server/hosting/runtime.ts
- web/src/server/hosting/README.md
- web/tests/integration/local-hosting.test.ts
- web/tests/helpers/runtime-ownership-child.mjs
- web/vitest.hosting.config.mts
- web/tsconfig.hosting.json
- docs/development/AUTH_B1B_PART3O_LOCAL_HOSTING_REPORT.md

Updated handoff/documentation only:
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md
- docs/development/BACKEND_SQLITE_ARCHITECTURE_V1.md

Auth/DB source, migrations, package/lock/scripts, frontend, original fixtures,
previous reports/evidence and both formatting drifts are unchanged. HEAD/index
preservation and exact final status are recorded in verification-summary.json.

## Deployment limits and one next task

This proves a configured TEST foundation, not production TLS/key custody, actual
shop-machine availability, browser cookie/role isolation or app-reopen behavior.
Only liveness is exposed; it does not promise ongoing SQL readiness. Same-user/admin
hostile code and direct SQLite tools remain outside cooperative runtime fencing.
Port collision/reservation fails closed. No forceful cancellation of trusted admitted
work is introduced. Production launcher/signals/supervision and filesystem ACL/TOCTOU
controls remain deployment gates.

Custom Next hosting CANNOT use standalone/server.js. Earlier standalone packaging
proposal must be revised: separately compile the private Node host with correct
server-only resolution, bundle normal Next assets/dependencies and pinned Node24/
Windows x64 native SQLite, then prove clean-machine relocatability and Electron
lifecycle/trust. The independent Node TEST uses the existing type-transformer/marker
hook; it is not proof of a compiled installer. No Electron/installer/Windows change.

Exactly ONE recommended next task: resume the bounded Part3N private HTTP login/logout
boundary on this host, retaining the auth-disabled production gate until trusted
certificate/key provisioning and deployment acceptance. STOP for owner review.
