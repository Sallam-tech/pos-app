# Coordinated TEST38 Shop Expenses implementation

12 November 2026, Asia/Karachi. **PASS for the complete approved bounded TEST38 module; production remains disabled.** Owner approved the full A+B contract. Owner acceptance follows delivery; Admin invoice corrections are the next separate module.

Counter-cash-only Add Expense, saved shared History, reason/full-reference/date search, keyset pagination, complete daily/monthly/range totals and paged audit are implemented. One genuine counter withdrawal, including a shop cost initially paid personally, posts one expense and counter deduction. There is no funding/pocket/reimbursement feature, opening balance or purchase/restock expense.

Corrections/reversals require fresh exact Admin authority or a single-use exact Salesperson grant. Signed deltas preserve original records/economic dates and verified actual cash dates. Recording-error corrections and actual later cash movements remain distinct. Historical changes require explicit acknowledgment and disclosure; cross-midnight recovery preserves original requested reasons plus entered reconciliation evidence. Closed-period snapshots are not rewritten: exact38 has no closing writer or saved closing; confirmation remains disabled.

One pinned54-step0038 adds six STRICT append-only tables and preserving extensions of the SAME cash/financial ledgers. Old0001-0037, existing values/rowids, authentication/enrollment/anchor, dependencies and prior recovery stores remain preserved. Hash: f9e4bef63fd6cad0cbdca8a9de76e4bf612d016a2f2e57491175e716a5e54658. Transition is explicit unenrolled disposable TEST37-to38 only; no startup/production migration.

Fourteen bounded capabilities reuse the same gateway, owner, queue and TLS/session checks. Body limit8192 bytes; safe history/audit pages maximum50. Admin-only financial summaries reconcile original sale/return/COGS events and effective expenses; no product allocation or current-cost rewrite. Cash incompleteness is separate from valid recorded profit. Product/time chart limits are explicit; period totals remain complete. Dashboard, profit and closing review use the same source.

Durable intent precedes confirmation. A separate strict IndexedDB marker stores only version/context/key/kind/state, including ATTEMPTED before effects. UNKNOWN never authorizes another handover/key. Displayed cash confirmation is bound to the exact key/context/date, and edited recovery evidence invalidates prior confirmation. Fresh Admin recovery records verified original facts or permanently fences verified no-effect keys; explicit terminal acknowledgment clears storage. No automatic financial retry or RAM fallback. Authority is checked again after final ledger validation. Reads reuse the just-verified same SQLite snapshot only when native change/schema counters are unchanged; every write retains full post-validation. There is no cross-request validation cache.

## Verification

**45 distinct passing checks across focused recorded runs; not one clean45-case whole-suite run.** Prior Sales36/Returns37 full evidence is reused.

| Scope | Distinct cases |
| --- | ---: |
| Native SQLite: accounting, security, migration, failures, concurrency, restart and preservation |27 |
| Real CA-validated HTTPS |7 |
| Real Chromium workflows/storage/crash/relaunch |6 |
| Growing1k/10k/50k native datasets |1 |
|50k real HTTPS and Chromium |1 |
| Selected unchanged Sales36/Returns37 regressions |3 |

Native checks include all54 migration steps/history rollback, failed/uncertain COMMIT, caught-error poisoning, effect rollback, actual immutable-row replacement/update/delete with recursive triggers OFF/ON, unchanged original-key results, nonempty37 refunds/restocks/cancellation preservation, large exact sums, historical dates, stale/expired/revoked authority, and expiry during final post-validation. Browser checks include two-tab admission, retained original key, actual Chromium crash/backend restart, storage denial and explicit Admin recovery. Final input overflow, mobile authoritative logout, period acknowledgment, chart/table preservation and exact-key/cash-date stale-tab confirmation pass in the focused follow-up. Editing recovery facts clears their prior confirmation.

50k synthetic records: real HTTPS History2.93s, expense summary3.35s, financial summary2.16s; complete browser expense summary9.61s on this development machine. Complete totals and indexed pagination passed; source fixture unchanged. These are measurements, not a target-hardware SLA or API-ingestion throughput. Initial fixture timeout, header-test expectation, type/lint/selector diagnostics and earlier builds are retained. Formatting overhead and redundant same-transaction read scans were corrected.

Evidence: [task directory](../../web/test-results/expenses38-17f5380f-5536-48c6-b5db-abc3586cf3a9/), including focused logs, performance JSON, exact build snapshots and [file/preservation manifest](../../web/test-results/expenses38-17f5380f-5536-48c6-b5db-abc3586cf3a9/preservation-final.json). Final scoped TypeScript/zero-warning lint and exact final-source isolated Next build PASS; all268 source files match app-final-source. No final unresolved tested failure. Existing preview fixtures/source documents remain unchanged; normal Next previews do not become production endpoints. No commit/staging, deletion, WSL, installation, OS trust change or production activation.

Physical cash truth cannot be proved by automation. Missing/disputed facts stay blocked. Power loss, target hardware/performance acceptance, protected current-schema anchor maintenance, production key/TLS custody, portable independent Windows restore, EXE/printer and deployment remain release gates. No production shop data was used.

Tested runtime: Windows, Node24.11.0, Next16.4.3, React19.3.0, Better Auth1.7.18, better-sqlite3 13.0.3, Vitest5.0.5 and Playwright1.64.1. Exact installed versions, tested run logs and final source/preservation manifest are in the evidence directory. Scope is TEST; no real cash/production acceptance is implied.

