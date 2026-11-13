# Daily Closing + Cash Management: consolidated TEST approval contract

13 November 2026, Asia/Karachi. **OWNER APPROVED A+B in full. Coordinated implementation verified TEST-only; [evidence and limits](DAILY_CLOSING_CASH_SCHEMA40_TEST_IMPLEMENTATION_REPORT.md). Production DISABLED.**

Starting checkpoint: accepted Reports40 TEST PASS, 69017771ac448bdc35083b80dc9ea75798eea610, unchanged schema39. Reports40 introduced no migration40. The approved preserving migration/schema is40; reuse accepted Sales36/Returns37/Expenses38/Corrections39/Reports40.

## Settled scope and source findings

P08 already approves Karachi calendar midnight, continued next-day sales with earlier closing pending, Admin late counts and signed-flow reconstruction. Whole-PKR new amounts, exact INTEGER paisa/BigInt, immutable original fractional history/cost/profit, counter-cash-only Expenses38 and event-date Corrections39 remain approved. No repeat approval requested.

Preserve existing six cards, date control, Counter Cash Summary and Actual Cash flow. Add necessary opening/count timing, authorization, recovery and history controls. Closing never resets sales/stock or depends on public internet. Shared Salesperson is not an individually identified employee.

Read authority: root/web AGENTS; memory/checklist/matrix; original DOCX/amendments; relevant development/UI guide/prototype; approved financial/Expenses38/Corrections39 contracts; architecture sections4.4/5.5; affected source. Earlier PostgreSQL/container proposals and initial expense exclusion have already been superseded by accepted SQLite TEST work/Expenses38. Architecture count/variance/schema proposals are not existing approvals.

Source findings at the starting checkpoint (the implementation below adds the approved cash/closing capabilities):
- SAME cash_movements has typed SALE, REFUND, EXPENSE and INVOICE_CORRECTION sources. Sum actual SIGNED deltas: net received after change, paid refunds, and cash corrections. Expense corrections can return cash; never subtract every expense-labelled amount absolutely.
- financial_events and Reports40 already reconcile period/as-of revenue, original COGS, gross/expenses/net profit. Reuse them. Variance is not profit or an operating expense.
- cash_date is an actual calendar date where verified; recorded_at_ms is recording time. Delayed postings/recovery cannot establish intraday handover timing from those fields alone.
- Sales can have genuinely UNRECORDED payment. Returns/Expenses/Corrections have durable intents/grants/recovery. Sales have original-key recovery but no pre-handover admission. No opening anchor/count/final closing/portable backup service exists.

## Owner-approved A — cash rules

**1. Verified opening and completeness.** Fresh Admin plus explicit physical-count/evidence confirmation establishes the first anchor, including zero, at its real observed cutoff/time. A mid-day count is a prospective starting point, not a fabricated midnight opening. An untouched day's initial opening needs explicit evidence that no earlier counter movement occurred. Later openings are provenance-bound continuous carries, without extra cash movements or daily manual balances. Prior unknown periods remain unknown.

Known expectations require a verified anchor and complete source evidence for the interval. Unknown payment/date/cutoff membership, possible unresolved handover or asserted off-system movement without approved evidence makes affected cash figures unavailable. UNRECORDED never means zero/paid/credit and never manufactures sale_payments or refund eligibility. No owner funding/drawings, historical-payment settlement or stock-purchase payment subsystem is added; stock receiving/revaluation alone is not evidence of cash paid. Legitimate subsequent sales continue.

**2. Physical cutoff and timing.** Add source-bound durable cash admission BEFORE an operator may confirm physical collection/payout, retaining original source keys and existing grants. Wire paid Sales and cash-affecting Returns/Expenses/Corrections/recovery. Admission is permission, not proof money moved. An unresolved possible handover cannot disappear by timeout/new tab/new key: fresh Admin reconciles the original source outcome or verifies no effect; missing facts stay unresolved.

Start one counter-wide count only after all admitted handovers have terminal source-bound outcomes and Admin confirms no unposted physical movement. Atomically capture source/cash cutoff and start a non-renewing **180-second** lease. Briefly pause new physical cash admissions; hold no SQL transaction during physical counting. Non-cash work continues. Record the actual amount with lease/cutoff/completeness/authority checks through COMMIT, then resume admissions immediately. Cancel/expiry/restart invalidates unfinished observation and requires recount. Yesterday's pending close never causes a pause.

Source evidence establishes true cash date and before/after-count membership, not a fictional exact handover timestamp. Crossing midnight requires explicit true-date confirmation; unknown blocks verified reconciliation. New-schema sale cash date may differ from economic invoice date when verified handover and posting straddle midnight. Preserve old rows/semantics. Historical date-only evidence stays date-only unless fresh Admin supplies defensible timing/cutoff evidence. Later discovery appends a newly recorded fact.

**3. Variance and late-count calculation.** For elapsed day D: E_D = known expected midnight boundary; C_T = physical later count; M_D_T = actual signed physical flows after that boundary through proven count cutoff; B_D_T = already accepted non-profit count bridges within that interval.

- Reconstructed physical boundary A_D = C_T - M_D_T; explicitly reconstructed, never claimed counted at midnight.
- Expected at count = E_D + M_D_T + B_D_T.
- New unallocated variance = C_T - expected at count. Show raw boundary difference and previously accepted bridges separately.

Example without an earlier bridge: E_D Rs1,000, later flows +Rs300, count Rs1,280 => reconstructed Rs980, shortage Rs20. Negative flows work identically. An intervening accepted -Rs20 bridge is not a physical payout in M_D_T and cannot cause another -Rs20 posting. Negative reconstructed physical cash or ambiguous interval stays unreconciled.

**Approved authority:** fresh Admin may explicitly accept a nonzero shortage/excess with reason/evidence by ONE uniquely count-linked COUNTER_RECONCILIATION balance bridge. Store observation date/time, approval/recording time and pre-bridge expectation separately. This observed ledger normalization is not physical money movement, revenue, expense, profit adjustment or blame assigned to an employee/day. Zero creates no movement. Closing does not imply accepting variance. Future expectations use a bridge once, separately from physical flows.

Unknown expectation cannot produce a numeric variance/bridge. A fresh count may instead establish a clearly prospective anchor, preserving the earlier unknown interval. Activation accounts for proven intervening flows; it cannot silently replace a known anchor/accepted variance. Repeats/recovery cannot duplicate bridges or carry the same shortage as a new expense.

**4. Finalization and immutable history.** Approved final calendar-day closing only AFTER the Karachi date ends; today supports live review/counting. A VERIFIED closing uses a count at the target midnight boundary or later; an earlier count is only a prospective/live observation. Next-day sales continue independently.

Fresh Admin saves ONE immutable financial snapshot per date with source digest/cutoffs, actual confirmation time, count reference/method and separate cash status. VERIFIED requires complete aligned evidence and reconciled cash; an observed mismatch remains explicitly UNRECONCILED until separately accepted. Admin may explicitly save an UNRECONCILED financial closing when opening/count/flow evidence is missing, with null unavailable cash fields and reasons. Never claim verified cash, zero variance, backup or approved write-off. Later facts/reconciliation append supplements; original snapshot/status stays immutable.

Source-linked later closing adjustments commit atomically with affected existing source writes. Preserve economic date, actual cash date and recorded time; link every affected closed date once per source effect. Expose saved figures versus current adjusted figures. Proven post-cutoff events do not invalidate a completed count; newly discovered pre-cutoff facts cause visible supplements/recomputation, never silent history edits or arbitrary balancing.

## Owner-approved B — preserving schema, source integration and authorization

One byte/checksum-pinned 0040_daily_closing_and_cash.sql, explicit **unenrolled disposable TEST39-to40 only**, using reviewed maintenance transaction/rollback/history controls. No startup/production/shop migration. Preserve all0001-0039 bytes, existing columns/values/physical rowids, receipts/operations, auth/enrollment/anchor and unrelated work. Require exact40 schema/history/guard admission throughout affected services; preserve exact39 behavior under its existing flags.

Approved14 new STRICT tables, append-only with bounded fields, exact source FKs/indexes/guards:

| Table | Bound evidence / uniqueness |
| --- | --- |
| cash_action_requests | Original key/context, Admin action/target, canonical payload/digest, session/version/epoch/boot |
| cash_action_authorizations | Exact fresh Admin proof; one-use non-sliding grant, maximum5minutes; no stored password/token |
| cash_action_operations | Unique request/key/grant and committed typed result/time |
| cash_action_cancellations | Permanent original-key/context no-effect fence, fresh verified evidence |
| counter_cash_admissions | Original source key/kind/payload binding, authenticated role/session, admitted interval/counter generation |
| counter_cash_admission_resolutions | One source-bound terminal outcome or verified no-effect per admission; no automatic expiry |
| cash_flow_evidence | Typed existing cash-source FK, true date/interval/cutoff provenance; predecessor chain for later evidence |
| cash_count_sessions | Count intent/date, start/cutoff/digest/lease/boot; serialized checks prevent overlapping live counts |
| cash_counts | One terminal RECORDED/ABORTED/EXPIRED outcome per session; physical amount/count time only for RECORDED; every outcome has recording time |
| cash_anchors | Verified count/cutoff, prospective activation/provenance, unique accepted anchor per observation |
| cash_reconciliations | Unique count/operation, accepted signed delta/reason, pre-bridge evidence and distinct observation/recording times |
| daily_closings | Unique date/operation, immutable financial/cash snapshot/digest/cutoffs/status; unavailable cash fields nullable |
| closing_adjustments | Unique closing/source-effect link; actual source-derived deltas or evidence supplements |
| closing_backup_jobs | Unique closing-linked backup request, BLOCKED_NOT_CONFIGURED until separately approved verified backup service |

Extend SAME cash_movements with exclusive typed reconciliation FK/kind, preserving old rows/rowids and rejecting duplicate/source-free bridges. No variance financial/stock event. Auxiliary timing evidence never rewrites a payment or grants refund eligibility. Test replacement/UPSERT/hidden-rowid bypasses with recursive triggers OFF/ON.

Reuse native owner/writer queue, current SQL signed fixed-role gateway, password policies, full source reconciliation, TLS/Origin/CSRF/body/header/no-store controls and final authority checks. Opening, count start/acceptance, closing, variance, disputed timing and recovery require Admin plus exact fresh grant. Recording may consume the original still-live count grant; expiry is no extension. Salesperson receives only safe own-source admission/status and brief paused/available status, never balances/counts/variance/profit/private audit or closing history.

Implemented and verified TEST-only method/path capabilities (12 added;78 cumulative API entries):

| Method/path | Authority / bounded effect |
| --- | --- |
| GET /api/counter-cash/status | Both; admission availability only, no amounts/private reason |
| POST /api/counter-cash/admissions | Existing source role/authority; original key/context/payload binding before permitted handover |
| GET /api/counter-cash/admissions/:uuid | Same source authority; safe original-key outcome |
| GET /api/admin/cash/context | Admin; non-bearer namespace/current Karachi date/supported actions |
| GET /api/admin/cash/summary | Admin; date/count/cutoff-bound signed totals/completeness/provenance |
| GET /api/admin/cash/history | Admin; filtered50-row source-bound keyset and evidence/drilldown |
| GET /api/admin/closings | Admin; date-filtered50-row history/status |
| GET /api/admin/closings/:uuid | Admin; immutable snapshot, paged supplements, honest backup-request status |
| POST /api/admin/cash-actions | Fresh Admin; exact OPEN_ANCHOR/START_COUNT/RECORD_COUNT/ABORT_COUNT/ACCEPT_VARIANCE/CLOSE_DAY/RESOLVE_EVIDENCE or admission resolution intent/grant |
| POST /api/admin/cash-actions/:uuid/execute | Admin; original context/grant/evidence/confirmation; atomic effect |
| GET /api/admin/cash-operations/:uuid | Admin; original-key/context COMMITTED/CANCELLED/UNKNOWN |
| POST /api/admin/cash-operations/:uuid/recovery | Fresh Admin; original facts or verified no-effect fence, never assumed repeat cash/count |

Strict8192-byte bodies/1024-byte URLs, duplicate/unknown-key rejection, valid bounded dates/reasons and max50 keysets. Existing source extensions retain established source limits. The completion matrix records the verified implemented inventory; no generic cash adjustment/raw SQL/framework proxy.

Separate minimal IndexedDB context/key/kind/state markers, atomic cross-tab claims and ATTEMPTED before possible effect; no payload/password persistence, automatic retry, expiry or RAM fallback. Retain existing source recovery markers/keys. UNKNOWN requires original-key authority and explicit terminal acknowledgment; an unfinished count requires recount. Unresolved cash evidence blocks certification, not all subsequent sales. Snapshot/audit/blocked backup request commit atomically. No backup success is claimed or portable backup subsystem added.

## Implementation and verification after A+B approval

Complete one coordinated module: preserving schema/calculations/source contracts alongside focused tests; existing writer/admission/count/close/recovery services and secure APIs; approved UI/history wiring. No separate module or redesign.

Mandatory real SQLite tests: zero/verified opening/carry; actual signed corrections/refunds/expenses; missing/date-only evidence; exact large money; midnight handovers and several pending dates; late counts/inherited variance; expiry/restart; duplicate closing/count/bridge; concurrent cash/sales/refunds/expenses/repricing; stale sources and later pre/post-cutoff facts; immutable history/supplements. Every migration step/history and effect-write/COMMIT rollback, lost acknowledgment, actual killed writer/browser crash/restart, original-key reconciliation, final grant expiry and Admin-only/no-leak HTML/API behavior.

Use real HTTPS/Chromium; growing1k/10k/50k SQLite with measured native/API/browser count/close/history latency and final-row forgery rejection. Reuse old PASS/volume evidence, selected affected Sales/Returns/Expenses/Reports regressions, scoped type/zero-warning lint and exact-source isolated build. Fix actual defects before PASS; record diagnostics and limits. Banknote testimony and actual target-hardware/power-loss capacity are not software-test proof.

After verified PASS, review explicit related source/docs/tests path/hash manifests and staged diffs, exclude33 prior unrelated paths plus secrets/DBs/TLS/logs/evidence, then commit LOCALLY only if safely isolatable. No push/reset/clean/stash/amend, install/deployment or production activation. A+B approval and coordinated TEST verification are complete; production, portable backup, custody/restore and target-hardware gates remain separate. See the linked implementation report for actual evidence.
