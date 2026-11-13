# Admin Products + Settings: coordinated TEST41 contract

13 November2026, Asia/Karachi. **OWNER APPROVED IN FULL; implementation and focused verification IN PROGRESS. Production DISABLED.** Parent: verified TEST40,4ebfd614.

Existing approvals remain settled: eight inventory mutations, immutable identity/unit/code, whole PACK/BOX and whole-PKR new prices, current buying-cost floor/no override, D05 incoming cost reprices remaining and received inventory atomically, immutable historical sold costs, archive without deletion or clearing stock, inclusive low-stock threshold and separate out-of-stock state. Preserve frozen UI. No invented cash flow/expense/profit from receiving, correcting or revaluing stock. Existing signed Admin authority and optimistic product/balance versions apply; no extra password ceremony is proposed for already-approved product edits.

Actual source defect: inventory mutations' salesProfile includes36–38 but omits39/40, wrongly disabling D05 and omitting whole-PKR checks there. Fix and test under existing approved rules. Reuse the existing eight-kind service/audit/idempotency/recovery; expose bounded named endpoints for edit, selling price, status, archive, buying cost and stock correction, and existing paged events/movements. Existing receipt/stock/financial history stays intact. Price below a newly raised buying cost remains visibly needs-review; never auto-raise it or change historical profit.

## Single approval: Settings persistence, receipt provenance and secure authority

Approve ONE preserving, byte-pinned0041 explicit **unenrolled disposable TEST40→41** migration, additive tables/indexes/guards only;0001–0040 and all old values/rowids/auth/anchors preserved. No startup/shop/production migration. Exact41 admission under a new TEST flag plus all prior TEST gates; schema40 still works under its existing flag.

| New STRICT append-only table | Evidence and constraints |
| --- | --- |
| shop_settings_operations | Unique original key/id/context; expected revision; canonical allowlisted payload/hash; unique resulting revision; exact safe result/hash; Admin/session and recorded time. |
| shop_settings_revisions | Unique monotonic revision/id, predecessor and operation FK; shopName80/address240/phone32/footer160, ordinary/compact layout, PKR/Asia/Karachi fixed; reason, Admin/session and recording time. No secrets. |
| shop_settings_cancellations | Unique original key/context and action kind; fresh Admin verified-no-effect evidence/time/session; permanent fence for settings/password operations. |
| invoice_shop_snapshots | Unique existing invoice FK; saved settings revision FK, exact public branding payload/hash/format/time; no backfill or rewriting of historical invoice snapshots. |
| shop_password_operations | Unique original key/context/target; existing before/after credential versions and epochs, Admin executor/session, recording time; no password/hash/token or plaintext input stored here. Effect recorded atomically inside the existing credential rotation transaction. |

All new tables reject updates/deletes/REPLACE/UPSERT/hidden-rowid collisions with recursive triggers OFF/ON; unique source links and checked versions. Source-ledger reconciliation includes both directions, not only aggregate totals. Preserve the sole writer, full exact metadata/financial validation and current SQL authorization.

Settings are the approved public fields only: name/address/phone/receipt message/layout; currency and timezone fixed. An Admin explicitly saves the first revision; do not import browser values or invent a saved revision. Until then retain the already configured TEST shop name and show other saved details as unrecorded. Edits require current signed Admin + fresh one-use Admin password verification, expected revision, explicit reason and original key. History/recovery are Admin-only; signed Staff receives only selected public receipt/branding fields. Login may read only public shop name, never settings history or financial data.

New invoices capture exact current saved branding; paid-sale admissions freeze that revision before possible handover. Later settings changes cannot alter an admitted sale, original-key recovery, historical receipt or corrected receipt. Older invoices retain their recorded shop name; absent address/phone/footer provenance stays absent, never substituted from today's/browser settings. ordinary/compact remains an existing presentation choice.

Wire both existing password Change controls through the accepted private rotation gateway: signed Admin + fresh current Admin proof for either role, unchanged8–128 exact-input/screening/distinctness/5-failure30-second policy, final authority checks and target-role revocation. Admin self-change requires fresh login. No reset/enrollment/recovery-kit authority or production activation. Durable browser markers hold context/key/kind/state only; no settings/payment/password payload, automatic retry or expiry. After uncertain password COMMIT, use fresh login and original-key recorded outcome; never automatically submit another change. Explicit fresh Admin permanent cancellation fences a proven absent operation.

Expose only fixed bounded Products/Settings/password/history/original-key routes in the existing trusted HTTPS runtime, strict8KiB bodies/1024-byte URLs/allowlisted fields, exact-origin CSRF/no-store/safe errors and bounded50-row cursor history. Add actual implemented method/path inventory with tests. Backup/Restore and remote/cloud remain disabled.

## Implementation and verification

Implement UI/API/SQLite/recovery as one module after approval; reuse completed services. Real SQLite/HTTPS/Chromium: all eight product effects, stale versions/D05/sold costs/cost floor/stock correction/archive/low+out, shared settings and frozen old/new/admitted receipts, both password targets, role privacy, failures/rollback/concurrency/uncertain COMMIT/process/browser restart/original-key fencing, all migration/guard cases, and focused Sales/Returns/Expenses/Reports/Cash regressions. Scoped type/zero-warning lint/exact-source build.

Performance work is already authorized independently: profile actual validation/SQL/JSON and UI request repetition, reuse retained1k/10k/50k sources through read-only checks or NEW disposable backups; preserve originals. Optimize proven bottlenecks without cross-request authority/financial caches, partial validation or relaxed lease/authentication/audit. Measure before/after native/HTTPS/Chromium cash count/close and invoice history; test forgery at final source rows. Report residual latency and hardware limits honestly.

After PASS, review explicit related paths/hashes/staged diffs and commit LOCALLY only; preserve33 unrelated paths, secrets/data/migrations. No push/reset/clean/deploy or production activation.
