# Owner-confirmed expense and net-profit contract

This supplements the original SRS for the approved demo and future local backend; it does not rewrite historical sales or implement production accounting.

- Gross Profit = Net Sales Revenue minus Cost of Goods Sold.
- Net Profit = Gross Profit minus recorded, approved operating expenses for the same business date or reporting period. Keep the two figures separate; allow genuine losses.
- Use exact PKR minor units and Asia/Karachi civil business dates. Never deduct a current-day expense from the fixed 2 November 2026 demonstration profit.
- Each approved expense must be counted exactly once. Durable entry/correction/removal requires authorization, idempotency, atomic writes and audit history. A lost response must be resolved with its original request key.
- Inventory purchases are not operating expenses to deduct again after their cost is recognized under the approved inventory/COGS model. The future backend must enforce expense classification; the existing four demo categories are unchanged.
- Dashboard, Reports and Daily Closing must consume the same authoritative recorded expense source. Salesperson entry must never expose purchase costs or profit calculations.
- Incomplete, missing or mismatched-period sources produce unavailable net profit, never an assumed zero. A complete empty expense set may legitimately mean zero expenses.
- Current expense entries exist only in page memory. Daily/monthly summaries cover those temporary entries; nothing is saved, synchronized with Admin or deducted from historical gross profit. No browser-storage accounting is added.
- The current pure helper requires matching period boundaries and an explicitly complete expense source, rejects duplicate expense identities and returns null when inputs are insufficient. This is not proof of approval, persistence or server authorization.
- Return condition may be unspecified in the demo: disposition remains pending inspection. Good items need an authorized recorded return before restocking; damaged items stay out of sellable stock. The backend must check cumulative prior returns and approved refund/accounting policies transactionally.
- General Salesperson history access remains a future server permission decision. The owner-approved preview exposes only the original allowlisted fictional sale fields. Historical receipt copies stay read-only, and developer credit is presentation-only.


## Owner frontend amendment — 9 November 2026

Ordinary expense entry now requires Amount and a short Reason, with an automatic Asia/Karachi date. No category/date-selection controls appear in entry. The legacy categorized record type remains readable; new page-local entries use its internal Other value for compatibility, without exposing a category choice. Corrections preserve an entry's original date. This is not a finalized production classification scheme.

Gross/net-profit definitions, same-period completeness, duplicate protection and exclusion of purchases/personal withdrawals remain unchanged. The form identifies operating expenses only; durable classification and authorization remain backend responsibilities. Temporary entries do not synchronize with fixed Admin history.

The visible return-condition field is removed. Future returned goods default to pending inspection and must not enter sellable stock before a separate authorized disposition. Multi-line selection uses actual invoice/line identities and original paid snapshots, including discounts and trusted prior returns; missing payment information remains unavailable. Review performs no refund or stock write.
