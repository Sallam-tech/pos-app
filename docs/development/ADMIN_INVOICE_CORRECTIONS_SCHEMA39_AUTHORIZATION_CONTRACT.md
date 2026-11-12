# Admin Invoice Corrections: coordinated TEST39 approval contract

13 November 2026, Asia/Karachi. **OWNER APPROVED A+B in full; coordinated implementation VERIFIED TEST-only.** Expenses38 and earlier TEST modules are accepted as complete by the latest owner instruction. Production remains disabled.

## Confirmed scope

ONE coordinated module: Admin invoice search/date filters/details, audited revisions, verified counter-cash adjustments, financial ledger and Gross/Net Profit integration, original/revised receipt history and Returns compatibility. Preserve approved prototype structure/styles; add necessary data, confirmation, authorization and recovery states only.

P05 Option A already confirms Admin-only edits to quantity, entered rate and whole-percent discount on the SAME existing logical variant lines. Positive whole packages; no product/customer/date substitution, added SKU, line deletion, zero-total void or below-cost override. Real returned/damaged goods use Returns, not a recording correction. Original invoices, receipts, cost/profit snapshots and every previous revision remain immutable. Added units retain ORIGINAL saved unit cost; quantity delta atomically changes inventory by old minus new. Price/discount-only changes have no stock movement. Repricing never changes committed original-key results.

Existing OPTION2 remains: HALF_UP discounted unit payable, multiply whole quantity, sum lines. Exact BigInt/integer paisa, whole-PKR new postings, original fractional cost/history preserved. Correction revenue/COGS are signed new-minus-prior deltas; COGS uses original saved costs, never current valuation. Purchases/restocks/revaluation do not become operating expenses. Expenses38 COUNTER CASH ONLY remains unchanged.

## Approval A: correction floor and settlement eligibility

**Recommended floor:** each CHANGED line must charge at least quantity times max(original saved unit cost, current approved unit cost), after OPTION2 rounding. Unchanged lines carry forward verbatim; a later cost rise alone does not invalidate them or an existing invoice. No automatic price increase, cross-line subsidy or override. Capture the actual current floor evidence in the new audit; serialize with receiving/repricing and reject stale evidence.

**Recommended settlement scope:** a correction posts only when the original full sale payment and all prior correction settlements are complete, consistent and explicitly verified. The signed cash adjustment equals revised total minus prior settled total. Nonzero delta requires verified actual collection/refund, exact amount, true cash date and evidence; zero delta creates no cash movement. Previously completed, verified adjustment may be recorded without handing money over again. A mere recording mistake is never treated as proof that banknotes moved.

Original UNRECORDED payment, disputed/wrong historical payment evidence, an unpaid difference or unknown adjustment date BLOCK posting; retain the original invoice/stock and show the unresolved reason. No treating missing cash as zero/paid, credit/debt workflow or exceptional bookkeeping-only cash rewrite is implicitly authorized. Such an exception needs its own future explicit evidence contract; this is an eligibility restriction, not an invented settlement.

P05 already selects EVENT-DATE correction deltas: economic posting uses the server-confirmed correction date in Asia/Karachi, not the original sale date. Cash independently uses its verified actual date (on/after original sale date, never future), with later-recorded timestamp and visible disclosure. Original date/figures remain available; as-of reads preserve prior knowledge. Cross-midnight execution/reconciliation must explicitly confirm the effective posting date and verified cash facts; no silently changed quote/date. No closing snapshots are rewritten. Exact38 has no persisted closing writer; unknown future closing schema remains denied. Do not fabricate a prior closing link.

## Approval B: preserving schema, authority and coordinated implementation

One pinned `0039_invoice_corrections_and_ledgers.sql`, explicit unenrolled disposable TEST38-to39 only; no startup/production migration. Eight new append-only STRICT tables:

| Table | Bound evidence |
| --- | --- |
| invoice_correction_requests | Original key/context, Admin session/version/epoch/boot, invoice/expected revision, canonical exact intent and evidence hash |
| invoice_correction_authorizations | Genuine fresh proof, exact request and one-use non-sliding bounded grant; recovery action/evidence |
| invoice_correction_operations | Unique request/key/grant and resulting immutable revision |
| invoice_revisions | Same-invoice predecessor/version, server event date, totals/deltas, reason and safe revised receipt JSON/hash |
| invoice_revision_lines | Original logical sale-line FK, complete revised values/calculation, original cost and current-floor evidence |
| invoice_cash_adjustments | Unique operation/revision, exact signed actual adjustment, true date and attestation; absent for zero |
| invoice_settlements | Revision-bound proof of original recorded net cash plus cumulative actual adjustments equalling revised charge |
| invoice_correction_cancellations | Permanent original-key/context fence, fresh Admin and verified no-effect evidence |

Revision1 remains the existing source, not a duplicate financial posting. Preserve all0001-0038 bytes, existing columns/values/physical rowids, authentication/enrollment/anchor and all prior operation/recovery contexts. Extend the SAME stock_movements, cash_movements and financial_events with exclusive typed correction sources, source FKs/unique indexes and full guards. A preserving rebuild may add revision/settlement source bindings to SAME returns, return_lines and refund_payments. Old returns retain original source bindings; new revised returns bind immutable revised line/settlement snapshots. No shadow legacy tables, mutable original invoice totals or arbitrary inventory ADJUST substitute. Pin exact39 object/history/index/trigger manifests; guard PK/UNIQUE/hidden-rowid replacement and UPSERT with recursive triggers OFF/ON.

After ANY posted refund, ordinary invoice corrections remain blocked. Also serialize/reserve unresolved refund and correction intents against each other across both roles. After a settled correction, Returns uses the pinned effective revision quantities/paid line charges, existing cumulative Q3 allocation/caps and ORIGINAL cost reversal on inspected sellable restock. Old refunds/dispositions are never rewritten. Changed revision/evidence invalidates stale quotes/grants; no second allocation stream or payout.

Reuse the same gateway/native owner/writer queue/TLS and existing password policies. Every mutation/recovery is Admin-only with genuine fresh proof and exact one-use grant, rechecked through final validation. Salesperson receives safe current/original receipt/history and eligible refund fields only; never cost, stock, floor, profit, private audit/evidence or correction authority. Preserve original sale/recovery result DTOs; identify revised receipts explicitly and show original payment plus actual adjustments rather than inventing revised tender/change.

Bounded capabilities: Admin context/history/detail/audit/quote/prepare/execute/status/reconcile; safe effective receipt/history integration in existing Sales reads; revised Returns integration. Explicit exact method/path inventory, strict bounded JSON, date/query validation and keyset pages max50. No generic Next/raw auth/SQL route. Dashboard/profit/closing-review services consume source-linked event-date deltas once, including product/day breakdowns and complete period totals; no invented balance and no expense double count.

Durable intent precedes physical confirmation. Separate minimal IndexedDB original-key/context/kind/state marker, atomic cross-tab admission and ATTEMPTED before execute. No automatic retry, payload/password storage, marker expiry or RAM fallback. Unknown COMMIT/restart is inspected by ORIGINAL key; UNKNOWN is never permission for another cash handover/key. Fresh Admin records verified prior facts once or permanently fences verified no-effect; explicit authoritative terminal acknowledgement clears storage. Missing/disputed facts stay blocked.

## Verification and local checkpoint

Develop/test together: exact whole-PKR examples and limits; repeated/reversed corrections; migration with nonempty Sales/Returns/Expenses and every-step rollback; all new/rebuilt immutable guards; role/session/CSRF/origin/body restrictions; stale proofs/quotes, expiry during validation, parallel sales/repricing/corrections/refunds; stock/cash/financial source reconciliation; statement/COMMIT failure, lost acknowledgement, genuine process/browser crash and restart; indexed growing1k/10k/50k data and measured real HTTPS/Chromium workflows. Reuse previous PASS evidence; only focused affected regressions, scoped type/lint and exact-source isolated build. Do not claim operational physical-cash proof or production acceptance.

After verified PASS, inspect the mixed existing work and dependencies, review an explicit safe file manifest and secret/database exclusions, then make a LOCAL checkpoint only if isolatable. Never blindly stage. Current HEAD1456ce4df2c6ff7d1c4d61833a019b0cbcee36a1; index empty;27 tracked modified files and324 untracked files pre-proposal. No commit before new-module PASS, push/reset/clean, deletion, WSL, install or production activation. If isolation is unsafe, report the exact reason and leave Git intact.

Owner explicitly approved the complete A+B contract. Continue the full coordinated implementation and focused verification; do not repeat this approval request. Actual stock evidence must be validated, with current valuation separate from original COGS. Verification now PASS for this TEST module; see [implementation/evidence](INVOICE_CORRECTIONS_SCHEMA39_COORDINATED_TEST_IMPLEMENTATION_REPORT.md). Production and physical acceptance gates remain separate.
