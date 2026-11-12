# Coordinated TEST Sales36 implementation — owner review

12 November 2026. **PASS for the approved isolated TEST scope. Production remains DISABLED; commercial handover remains PARTIAL/BLOCKED by the release gates below.** No real shop database, credentials or enrollment anchor was used.

## Actual checkpoint and implementation

The interrupted legacy-preservation command had completed:1 passed/42 skipped. No Node process remained. No uncertain financial operation or existing migration was retried. Continuation finished the remaining safeguard, final-source verification and handover work.

- FINAL OPTION2 / per-unit HALF_UP is authoritative: round each product's final discounted unit payable, multiply whole quantity, then sum lines.110 at5%, quantity3=315;500 at0%, quantity2=1000;103 at20%, quantity4=328; invoice1643. Quantity1000 of the first product=105000. No global/extended-line/second-invoice rounding.
- Bounded BigInt/integer-rational helpers, whole-PKR new ordinary inputs/posted charges/tender/change, independent whole-percent discounts, after-rounding current-cost floor and signed-int64 overflow checks. Invalid prices are rejected without adjustment. Cumulative original-paid refund helper101/3=34,33,34 is retained; no refund workflow is implemented.
- Explicit pinned TEST35→36 program: six STRICT append-only Sales tables and a preserving rebuild of the SAME stock_movements. Every old value and physical rowid is compared,0001–0035 remain byte-identical, original auth/latch/binding and history remain unchanged. FK/integrity, ledger conservation, exact DDL/index/trigger metadata and checksum/version checked inside the atomic transaction.
- Native program has42 reviewed steps; checksum f1f884057268602a0a3d53a6712d7760f1893becae849fbb5461b56857d561fd. Generic startup never migrates. Genuine confined TEST connection only; enrolled copies rejected before DDL. A swallowed native program error poisons the transaction, preventing partial COMMIT. Unknown COMMIT is inspected, never automatically retried.
- Same single gateway/owner/writer, real signed Salesperson sessions and current SQLite authorization. Atomic operation+invoice+lines+stock deductions+optional actual payment+safe receipt; historical unit charge, exact rounding evidence, identity/cost snapshots and private COGS/profit immutable.
- Original-key same-command replay returns the original receipt without repricing. Concurrency/overselling/cancellation races serialize. UNKNOWN/404/timeouts never prove failure. Admin can reconcile or permanently fence an uncommitted key; committed invoices cannot be cancelled through this recovery API.
- Durable separate Sales IndexedDB marker contains only version/context/key/kind/state; no cart/customer/cost/credentials/bearer. Atomic cross-tab claim, no RAM fallback/expiry/automatic retry. Restore queries original key; explicit acknowledgement requires fresh authoritative terminal evidence before conditional clearing.
- Eight narrow TEST HTTPS method/path entries (22 cumulative), no raw Better Auth/Next proxy. Same loopback TLS/Host/SNI/Origin/CSRF/cookie gates;8KiB/64-pair headers,64KiB strict duplicate-key-safe JSON,50 lines,100 catalog results/50 history results, generic no-store responses.
- Existing TEST Login now reaches actual protected Sales/cart/history. Original ordinary preview remains available separately. Saved receipts reuse existing layout/print portal/80mm styles; committed invoices read-only. Search uses real catalog/saved snapshots; chronological keyset pagination and stale-search response handling. Admin recovery is genuine Admin-only. No unrelated business pages are enabled.
- Schema36 D05 receive atomically revalues remaining+incoming stock at actual incoming cost, records receipt cost/valuation delta, and preserves previously sold COGS. Schema35 behavior remains supported. Old fractional-price records survive unchanged; new whole-price restrictions do not rewrite them. Blank cash stays UNRECORDED, never assumed paid, zero, credit or settled.

## Focused verification — real installed native/framework facilities

**64 distinct checks have passing results across the recorded runs; this is not a claimed single64-case run.** Repeated targeted checks are not counted twice. Existing52-check Login/Inventory evidence was reused, not rerun as a whole.

| Scope | Actual result / retained evidence |
| --- | --- |
| Core arithmetic/schema/service |46 distinct passing: core-complete (41), catalog-history-cash (2), maintenance-confinement (3). Includes17 arithmetic cases; native constraints, atomicity, source rejection, D05, persistence, role denial, int64 and original-key recovery. |
| Native replacement protection | Two core cases strengthened and rerun PASS: every actual PK/UNIQUE/partial/hidden-rowid insert/REPLACE/UPSERT and UPDATE OR REPLACE collision across seven immutable tables, recursive_triggers OFF/ON. |
| Final affected atomic regressions |5 PASS: populated preserving upgrade, failed native COMMIT, every42 program steps plus history-write failure, second-line rollback, concurrent original-key execution. |
| Actual HTTPS |11 distinct PASS: http-corrected (10) plus http-commit (1). Includes actual30-second cooldown wait, signed role sessions, transport/CSRF/JSON attacks, original-key loss after actual COMMIT, SQL failure, shutdown/restart and restricted outputs. |
| Final Chromium build |5/5 PASS in browser-final: mixed invoice1643 + actual PDF/shared print portal + searched history/logout; lost-response Browser.crash + persistent-profile relaunch; two-tab one-write coordination; Admin UNKNOWN fence/ack; failed IndexedDB denies mutation. Certificate validation stays enabled with leaf-scoped TEST trust; Node interception uses explicit TEST CA. |
| Existing Inventory compatibility |2 selected real-gateway/native regressions PASS; every existing mutation/replay, recursive_triggers OFF/ON. Other75 historical cases were intentionally not rerun. |
| Final build / static checks | Isolated app-verified Next16 build PASS; scoped TypeScript PASS; scoped ESLint zero warnings PASS. Final source must match this build in preservation-final.json. |

Evidence directory: web/test-results/sales36-1655e67f-fbc0-4931-8d83-72a01dd887a4/.
Key logs: core-complete-3c27b5c0-6e30-4199-918f-ead0272ae940.log; catalog-history-cash-c8af7086-2040-4178-a1dd-65692c918e2d.log; maintenance-confinement-55fabbd9-69fa-4f4a-b17e-b6212eae2099.log; native-update-replace-641b83a9-3c69-4858-9c10-2a9340b6ad18.log; final-atomic-regressions-4df6405c-fa20-4edf-b02a-b2def011d979.log; http-corrected-42b14ef6-0759-4a03-b8fd-0e0f78ff788e.log; http-commit-04457685-a3ba-4fdf-a8d8-206831730bae.log; browser-final-0e5abf30-eb31-4c85-aa49-19ce69fd7ec1.log; inventory-regression-8e07f46a-1da3-4693-927f-57f3f0f5a253.log; build-8c7000b0-9838-4cd0-bcab-0c57669e1541.log; lint-8009b03d-84fe-420d-916f-140f61899753.log. Latest type log is recorded in preservation-final.json.

Earlier diagnostic failures are retained. Fixed: migration file-vs-directory path validation, unsafe malformed-body error classification, incorrect test host/clock assumptions, unsupported browser assertions/CA interception and crash-response waiting, React effect dependency warning. One early Playwright TLS-error diagnostic echoed a disposable TEST cookie: redacted in this task's new failure log, runtime closed, CA-scoped transport corrected and runner diagnostic redaction added. No real credentials or production secrets were involved. Prior historical evidence was not rewritten. Final affected tests have no unresolved failures.

## Critical self-review and remaining limits

Reviewed all changed sources and affected path from fixed-role request through migration admission, exact arithmetic, SQL commit, saved receipt and original-key recovery. Confirmed real rollback/COMMIT-loss behavior, fresh authorization, cost privacy, historical-row conservation, concurrency and restart persistence. No known unresolved Critical/High defect in this verified TEST slice; this is not a promise of zero possible bugs.

Not verified/implemented: production owner ceremony/current-schema protected-anchor maintenance, portable encrypted backup/key custody and independent Windows restore; production TLS/signing keys/activation; Electron/window reopen while backend survives; target hardware power loss/performance/thermal printer; refunds/disposition, invoice correction, expenses, cash ledger/closing and complete financial reports. P08 policy approval is not a closing implementation. A missing actual-payment record cannot become evidence of payment or authorize a future refund.

Browser recovery depends on retained origin/profile/IndexedDB. Eviction, manual clearing or lost devices are not covered by the no-duplicate proof. Trigger guards are not cryptographic protection against a privileged coherent disk rewrite. History validation is deliberately conservative and may become expensive on large target data; target-size acceptance remains required.

All518 pre-task nonignored files are retained. Exact changes, HEAD/index, migrations, dependency/drift hashes and final source/build comparison are in preservation-final.json. No Git staging/commit/reset/clean/stash/push, installation, OS change or production activation.

## Exact changed files

The companion changed-files-final.json enumerates every modified and created nonignored file relative to the pre-task manifest, including this report. Ignored disposable TEST databases/builds/browser profiles/logs/PDFs are additional new evidence only; existing source databases and prior evidence are preserved.

## One recommended next task

Owner review of this TEST Sales delivery, then a separately approved bounded Returns/Refunds schema and authorization contract based on original paid invoices and cumulative Q3 limits. Do not implement that next module automatically.
