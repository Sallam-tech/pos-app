# Shop Expenses: preserving TEST38 approval contract

12 November 2026, Asia/Karachi. **OWNER APPROVED A+B in full; coordinated TEST38 implementation authorized and in progress.** No production activation. Returns37 remains verified TEST-only. Detailed verification is recorded in the implementation report when finished.

## Settled rules and scope

- ONE complete Expenses module: Add Expense, saved shared History, reason/reference search and date filters, daily/monthly/range totals, audited corrections/reversals, counter-cash ledger and same-period Net Profit integration. Preserve approved forms, summary dialog, tables, themes and navigation; add only necessary data, authorization, confirmation and recovery states. Admin invoice corrections are the next separate module.
- FINAL OWNER RULE: **COUNTER CASH ONLY.** Salesperson enters positive whole-PKR Amount + Reason when counter money is taken for a genuine shop expense. A shop cost initially paid personally is entered once when counter money is taken; no separate personal-payment entry. One entry reduces counter cash and Net Profit once. No pocket/source selector, owner funding, reimbursement subsystem, invented opening cash/balance, purchases/restocks or personal drawings as expenses.
- Retain integer paisa/BigInt, approved bounds, whole-PKR posting and server Asia/Karachi dates. Preserve old fractional data. New entries use the server cash-confirmation date; corrections retain the original expense date. Gross Profit is unchanged by expenses; Net Profit = Revenue - historical COGS - effective operating expenses, allowing losses. Revaluation is not profit/expense.
- Confirmed P07 already grants shared SALESPERSON creation/history, with no standing edit/reversal permission. ADMIN acts directly with fresh exact authority or authorizes one exact Salesperson correction/reversal. Reuse Returns37 proof/grant safeguards and existing password/session policies. These permissions are not reopened.
- Original SRS/guides exclude expenses and propose PostgreSQL; later owner amendments authorize Expenses and local SQLite. Preserve original documents and frozen previews.

## Approval A: preserving schema38

One pinned `0038_shop_expenses_and_ledgers.sql`, explicit unenrolled disposable TEST37 -> exact TEST38 only. Six new append-only STRICT tables:

| Table | Purpose and essential constraints |
| --- | --- |
| `expense_requests` | Immutable CREATE/REVISE/REVERSE intent; unique original key/context; actor/session/epoch; target/expected revision; normalized amount/reason/audit reason and cash-evidence intent/hash. |
| `expense_authorizations` | Fresh exact-action Admin grant; both current sessions/versions/epochs/boot; non-sliding maximum five minutes; unique atomic consumption. Ordinary CREATE needs no grant. |
| `expense_operations` | Unique committed request/key/hash/result and actor/authorizer linkage; success only after confirmed COMMIT. |
| `expenses` | Stable identity, original date/creator/operation; indexed chronological shared history. |
| `expense_revisions` | Unique expense/revision/predecessor; original/effective amount, reason/status, audit reason, signed expense/cash deltas and verified cash date/evidence; actor/authorizer/operation. No forks/gaps/duplicate effects. |
| `expense_cancellations` | Admin permanent original-key no-effect fence with verified cash facts; cannot cancel committed expenses or erase actual withdrawals. |

Extend the **same** `cash_movements` and `financial_events` through reviewed preserving rebuilds. Add typed expense-revision FKs, exclusive source checks and unique once-only links; add signed expense delta to financial events, zero for old records. Preserve original columns/values, physical rowids, IDs, migration bytes0001-0037, unrelated guards/indexes, auth/enrollment/latch/anchor and existing recovery contexts. Recreate affected guards/indexes with equivalent protection; reject PK/unique/partial/hidden-rowid replacement/UPSERT with recursive triggers OFF/ON. Keep FK ON, atomic migration/history, rollback and poisoned-error handling. Update exact manifests/admission, reconciliation and dependent Sales/Returns writers together. No parallel ledger, automatic startup or real-shop migration.

## Approval B: correction/reversal cash evidence

Require expected revision, audit reason and exact Admin authority. Amount corrections post only new effective amount minus prior effective amount; reason-only corrections have zero economic/cash effect. Reversal preserves history and compensates the remaining effective amount once; no delete/reset/repeated reversal.

Admin distinguishes a verified **recording error** from an **actual later cash adjustment**. An old flow correction uses its verified actual cash date without claiming a new handover; money physically returned/taken later uses that actual date. Economics stay on the original expense date; retain actual recorded-at audit time. A genuine expense cannot be reversed merely to improve profit while its expense/cash remains out. Missing/disputed facts block posting; no invented refund/balancing movement.

Examples: recorded Rs500 but actually Rs300 -> expense delta -200, cash correction +200 on the verified original cash date. Actual extra Rs200 taken tomorrow -> expense delta +200 on the original expense date, cash -200 tomorrow. This is correction evidence, not a funding selector.

## Coordinated implementation after approval

- Reuse SAME gateway/native owner/write queue and trusted fixed-role HTTPS dispatcher. Strict bounded inputs, server calculations/current SQL authorization, existing Origin/CSRF/cookie/Host/SNI controls, safe errors/no-store DTOs. Salesperson receives expense data only: no cost, inventory quantities, profit, drawer balances or Admin/session internals.
- Narrow capabilities: shared GET context/history/detail/summary; Salesperson POST immutable intent/execution; Admin GET pending requests and POST fresh approval/direct restricted intent/execution; original-key GET outcome and Admin GET/POST reconciliation/fence; Admin-only GET period financial/cash summary. Publish exact method/path/input/output bounds in the API inventory during implementation. Validated date ranges, chronological keyset pages maximum50, bounded reason/reference search; searches do not silently change daily/monthly totals.
- Persist exact server intent before confirmation/effects. Keep Amount+Reason, automatic date and necessary counter-cash confirmation. Separate strict IndexedDB marker stores only version/context/original key/kind/state, with atomic cross-tab admission and no RAM fallback. Refresh/disconnect/lost response/crash/restart retain the original key. UNKNOWN blocks another handover/replacement. Admin reconciles verified prior cash without another handover or permanently fences verified no-effect keys; explicit authoritative terminal acknowledgement before clearing. Serialize competing revisions/unresolved cash actions across roles before physical handling.
- One transaction consumes authority and posts revision/operation/audit/financial/cash effects, reconciled to typed sources. Receiving/restocking never generates an expense. Confirmation/audit retain the declared operating purpose; free text alone cannot prove real-world classification.
- Use one persisted period service for Admin expense review, existing Dashboard expense figures, profit summaries and Daily Closing expense/cash review. Net Profit is period-wide; product search does not allocate expenses to products. Recorded sale revenue/COGS remain valid when cash receipt is UNRECORDED; cash incompleteness is separate. Complete empty expense periods equal zero; incomplete financial sources mean unavailable. Gated TEST pages use matching persisted periods or show unavailable; never mix saved expenses with demo sales/profit. Show recorded cash movement, never invented drawer balance. Closing/count/variance and broader reporting modules remain separate.
- Test alongside implementation: whole-PKR/large sums/overflow, Karachi midnight/filters/totals, corrections/reversal/replay, stale/expired/forged grants/leaks, reconciliation, concurrent operations, every migration-step rollback/uncertain COMMIT, retained-key crash/relaunch/backend restart, real SQLite/HTTPS/Chromium and growing1k/10k/50k datasets with query plans/measured timings. Run focused affected Sales36/Returns37 regressions, scoped type/lint and final isolated build; reuse existing PASS evidence. Report unverified hardware/power-loss/volume limits honestly.

No commit, destructive operation, WSL, installation or production activation. Protected-anchor maintenance, independent Windows restore/key custody and hardware release gates remain. Approval of A+B authorizes this complete coordinated TEST module, followed by review before Admin invoice corrections.
