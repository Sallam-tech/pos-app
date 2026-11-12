# Returns & Refunds — TEST schema37 / authorization contract

12 November2026. **OWNER APPROVED, including controls A/B.** The owner explicitly authorized this entire coordinated TEST-only contract in the current conversation. Implemented verification is recorded in [the implementation report](RETURNS_SCHEMA37_COORDINATED_TEST_IMPLEMENTATION_REPORT.md). Earlier proposal wording is historical; production remains disabled.

## Confirmed requirements and inspected compatibility

Inspected actual SRS DOCX/amendments, development/UI guides, architecture sections5.3/5.4/8, current matrix, Sales36 report/contract/schema, gateway/services and existing Returns UI/helpers. Later approved P02/Q3/P06/P07/D05 amend the original SRS; obsolete preview calculations are not production authority.

- Whole PACK/BOX partial/full/repeated returns use original invoice AND immutable sale-line IDs, original rounded unit charges/discounts/costs, never current selling prices.
- Q3: for original ACTUALLY PAID line M whole PKR, sold N, previously returned r/refunded P, returning q: payout=HALF_UP(M*(r+q)/N)-P. Verify prior P=HALF_UP(M*r/N);0<q<=N-r; cumulative cash<=M. Sum independent lines, no second rounding. Full return posts all remaining selected quantities atomically.
- Retain101/3 ->34,33,34 helper vectors. Real Sales36 charges already equal rounded unit*quantity; never fabricate an inconsistent101-for3 native invoice.
- Verified original sale_payments must match complete invoice charge/receipt. Missing/inconsistent payment or prior evidence DENIES refund. Blank cash remains UNRECORDED, not paid/zero/credit. No invented settlement, exchange, fee or new eligibility window.
- Refund reduces revenue on actual refund date. All returned goods start pending inspection, outside sellable stock. Only Admin RESTOCK reverses ORIGINAL sold COGS; damaged WRITE_OFF reverses none and adds no duplicate expense.
- Restock uses current authoritative inventory cost; current-minus-original difference is separate valuation, not profit. Preserve historical costs and archived/selling status.

## Schema37: one preserving TEST36→37 program

One literal/checksummed0037_returns_refunds_and_ledgers.sql; genuine unenrolled disposable TEST connection only, no startup migration or protected-anchor rewrite. Preserve0001–0036 and all old values/physical rowids/auth/latch/history. Exact source/target, actual STRICT/FK/index/trigger/domain checks, backfills and version/history share ONE transaction. Poison failed programs even if errors are caught. Unknown COMMIT requires authoritative inspection, never automatic retry/downgrade. Existing Sales/Inventory recovery contexts, original keys and committed results must survive36?37 unchanged.

Ten new STRICT append-only tables:

| Table | Minimum evidence and constraints |
| --- | --- |
| return_requests | UUID/original-key UNIQUE; REFUND/DISPOSITION; genuine role/session/version/epoch/boot/context; exact target/canonical intent/hash and cumulative-evidence digest; time. |
| return_authorizations | Exact request/action/hash; fresh ADMIN/session/version/epoch/boot; requester binding and issue/expiry. Non-bearer ID, never credentials. |
| return_operations | Request/key UNIQUE, authorization UNIQUE (consume once); executor/authorizer/context/hash; paired committed effect via deferred composite FKs. |
| returns | Unique operation; original invoice/payment FKs; line count/positive whole-PKR total/policy; actual cash date and record time. |
| return_lines | Unique(return,line); exact invoice/product/original quantity/paid/cost bindings; selected quantity and before/after cumulative checkpoints/Q3 evidence; per-line caps. Costs private. |
| refund_payments | Unique return/operation; original payment binding; exact positive payout, physical-handover attestation/provenance/date. No second payout record. |
| return_dispositions | Original return-line/product; whole RESTOCK/WRITE_OFF quantity/reason; original cost, current-cost snapshot/valuation delta; unique(operation,line,decision); disposed<=returned. |
| cash_movements | Unique typed sale-payment OR refund-payment FK, signed whole-PKR net cash/date/time provenance. Sale=tender-change; refund=negative payout. No invented opening/carry. |
| financial_events | Unique typed sale-line/refund-line/restock source; signed revenue/COGS and separate valuation deltas/dates. SALE=(+charge,+COGS), REFUND=(-payout,0), RESTOCK=(0,-original COGS); valuation excluded from profit. |
| return_cancellations | Permanent key/context/kind fence; fresh Admin/time and NO_CASH_PAID or NO_DISPOSITION_APPLIED attestation; mutually exclusive with execution. |

Add supporting UNIQUE source indexes on sale_lines(id,invoice_id,product_id,quantity_q,charged_m,cost_snapshot_m) and sale_payments(id,invoice_id). Their PK-containing collisions remain covered by existing PK guards; verify natively. No existing Sales header/version updates: recheck derived cumulative-evidence digests under the same writer.

Preserving stock_movements rebuild adds nullable-UNIQUE return_disposition_id and positive RETURN_RESTOCK. Legacy-operation, SALE-line and RESTOCK-disposition sources are mutually exclusive with exact product FKs; preserve all ten old columns/rowids, old guard/index definitions and balance chain.

Guard EVERY actual PK/UNIQUE/partial/hidden-rowid conflict, UPDATE/DELETE and nonpositive rowid. Test REPLACE/UPSERT/UPDATE OR REPLACE with recursive_triggers OFF/ON. Metadata budgets may increase only to fit the enumerated exact37 manifest.

Backfill new financial entries only from verified original sale_lines, cash only from verified sale_payments, at original source dates. No inferred cash. Sales37 must append corresponding entries within its existing sale transaction. Verify one-to-one source totals, old-data conservation and all migration steps/COMMIT rollback. Cash remains INCOMPLETE where opening/payments/other flows are unknown; do not claim a known drawer balance or implement Closing.

## Owner-approved controls A/B

**A — Exact-action authorization.** Active signed Admin session plus fresh Admin password for approval/direct refund/disposition/recovery. Reuse existing native verifier,5-failure/30-second cooldown and single-use5-second proof admission. Approved grant maximum5 minutes, non-sliding/capped by both session expiries, exact amount/lines/key/versions and requester session. Logout/rotation/boot, unsafe/rollback clocks or changed cumulative evidence denies it. No Admin password/cookie in Salesperson origin, blanket authority or remote payout. Admit only one unresolved intent per fixed requester role at once; permission expiry never clears an unresolved monetary operation.

**B — Banknotes and uncertain recovery.** Persist intent and verify exact approval BEFORE cash handling. Operator explicitly attests actual handover once when recording; SQLite cannot prove/move banknotes. Never hand over again on timeout/404/reload. Pause THIS return's cash handling during fresh Admin reconciliation:
1. COMMITTED: recover original receipt; no second payout.
2. No commit and confirmed no cash/stock effect: permanent original-key fence, explicit acknowledgement before replacement.
3. No commit but Admin verifies cash already handed over: RECORD_PRIOR_PAYOUT posts the ORIGINAL frozen key/amount once, WITHOUT another handover. Fresh recovery authority, current caps and same-writer mutual exclusion defeat delayed original execution; no revival of expired staff authority.
4. Uncommitted disposition: fresh Admin re-inspects pending goods and records the ORIGINAL decision/quantity once, with current cost/version checks; no duplicate stock effect. Changed/inconsistent evidence stays blocked.
5. Actual cash date and record timestamp remain separate. Delayed recording requires Admin-attested date from persisted intent date through today. Unknown timing stays unavailable for cutoff/closing calculations; never invent today's date or rewrite closing.
6. Inconsistent/unknown physical facts, amounts or caps remain BLOCKED; no forced adjustment or automatic compensation.

These operational/security controls were explicitly approved and are implemented in the bounded TEST module. Physical handover still requires truthful operator/Admin attestation; automated tests cannot prove movement of banknotes. Confirmed rounding, cost/loss and permissions are unchanged.

## Approved coordinated implementation

Same gateway/owner/queue/lifecycle and fresh SQLite authority. Replays check genuine committed result before consumed/expired-grant rejection. Changed intent/key/context conflicts. Refund atomically consumes approval and writes return/lines/payout/cash/revenue/audit; success only after COMMIT. Separate Admin inspection atomically writes disposition, conditional stock/version/value update, SAME stock movement, original-COGS reversal and valuation evidence. No duplicate refund/restock, partial write or damaged-stock increase. Bounded decimal strings/BigInt/int64; no financial Number arithmetic.

Reuse existing Returns search/select-all/quantity/review design; add necessary live status/approval/cash confirmation/inspection only. /pos/returns stays Salesperson; new /admin/returns uses existing Admin shell/presentation. Return DTO supplies genuine sale_line_id (existing receipt has productId only); staff never sees shop stock/cost/profit. Preview helpers/fixtures remain untouched.

Fourteen narrow TEST method/path entries (36 cumulative):
- Both trusted role hosts, safe DTO: GET /api/returns/context; GET /api/returns/invoices; POST /api/returns/quote.
- Salesperson: POST /api/pos/returns/requests; POST /api/pos/returns/:requestId/execute; GET /api/pos/return-operations/:key.
- Admin: GET /api/admin/returns/requests; POST /api/admin/returns/requests/:id/approve (approve/deny); GET/POST /api/admin/returns; GET /api/admin/returns/:id; POST /api/admin/returns/:id/dispositions; GET/POST /api/admin/return-operations/:key/recovery.

Same TLS/Host/SNI/Origin/CSRF/cookies/header/strict-JSON/no-store controls. Max50 selected/disposition inputs,64KiB body, bounded keyset lists. A disposition input may split pending quantity into restock/damaged. No caller-supplied role/session/hash/cost/refund authority or raw framework/Next endpoint.

IndexedDB claims original key/context/kind/state before mutation, no payload/credentials. Atomic cross-tab coordination; storage failure denies, no RAM fallback/expiry/automatic replacement. Requests/approvals move no money/stock. UNKNOWN/404/expired grant is not terminal failure; fresh login after restart preserves original-key recovery. Clear only after fresh authoritative terminal evidence and explicit acknowledgement; uncertain physical outcomes require Admin reconciliation.

Files: new0037/exact37 runner/manifest, server/returns service/contracts/ledgers, HTTPS dispatcher/render context, client/recovery/UI and focused tests/configs. Modify dependent gateway fresh-Admin admission, pins/validators, Sales ledger writes, Inventory source/reads, runtime/page allowlists, existing Returns/Shell wiring and new Admin page. No dependency, historical migration, unrelated module or production changes.

Focused real SQLite/Better Auth/HTTPS/browser tests: partial/full/repeated/multi-line/Q3/OptionB/overflow; payment/cost preservation/caps; inspection/partial restock/damage; every uniqueness path; grant replay/expiry/revocation/roles/leaks; refund/disposition/receive concurrency; migration/transaction rollback and uncertain COMMIT; lost response/crash/restart/two tabs; permanent fence vs delayed execution; prior-paid original-key recovery with no new handover. Verify Sales/Inventory compatibility, scoped type/lint and final isolated build; reuse64-check evidence, no unrelated suites/screenshots.

**Approval record:** the owner approved the complete coordinated TEST37 contract including controlsA/B. This is not approval for production activation, real-shop migration or another module. The implementation additionally blocks overlapping unresolved payout lines across both roles and durably admits inspection intent before atomic effects; these enforce the approved safety/recovery requirements.
