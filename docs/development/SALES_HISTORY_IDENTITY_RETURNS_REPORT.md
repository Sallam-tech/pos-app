# Sales History, receipts, product identity and safe returns

6 November 2026 (Asia/Karachi). **Implemented and verified - awaiting owner review.**

Continued the existing project on master at `f3a8d840e0bdf9fbf1c4462394c46d4c3dfefc17`, preserving all 73 pre-existing pending files and the latest UI redesign. No commit, push, dependency installation, global redesign, authentication or database work.

## Delivered behavior

**Sales History - /pos/history:** A fourth direct Salesperson destination, preserving Make a Sale, Return Item and Shop Expenses and all existing routes. Displays exactly the eight original sales. Combined reference/product/date filters, clear/reset focus and empty states work. IDs remain explicitly DEMO references, not official receipt numbers. Simulated Make a Sale confirmations never enter this history.

**Historical receipts:** Each row opens View Receipt. The existing receipt dialog/layout/print presentation is shared with Make a Sale. Historical copies show only recorded demo ID, business date, product, sold quantity, historical unit selling price and exact derived line total. Missing official receipt numbers, discount, cash, change, tax and time of day are identified as Not recorded. Current suggested prices are never used. Ordinary and 80 mm sample printing use the browser dialog; no printer connectivity or persistent invoice is claimed.

**Optional Product Code:** Add suggests the first unused POS-0001-style code from the available catalog, independently of product name. Admin can edit it or clear it. Blank is valid. Nonblank codes are checked case-insensitively against known codes, excluding the current stable ID during Edit. Invalid/conflicting codes prevent confirmation and focus the field. The demo format allows 1-32 ASCII letters/numbers/dots/hyphens/underscores, starting with a letter/number; this is not a settled production SKU policy. Existing fixtures contain no codes, so none are invented for the seven products. Product list searches name or supplied code; names remain primary. Unsaved code proposals do not become available in POS.

**Category and Unit:** Reuses the existing optional free-text Category. Optional unit labels are metadata only; Add defaults to the selectable Piece label, while existing products with no recorded unit display Piece (display fallback). Edit can preserve a supplied existing category or custom unit. Admin confirmations show proposed metadata. No quantity precision, conversions, cost or stock behavior changed.

**Identity and duplicate names:** Existing internal IDs remain stable; Edit displays the unchanged ID. Current validation does not reject duplicate names; no such rule was removed or replaced. Different ID variants remain separate rows with code/category/unit information. Production duplicate-name/variant policy remains unresolved; the preview does not merge inventory or history by name.

**Return Item:** Reuses the existing component and unchanged exact quantity/recorded-amount helper. Sale-ID lookup filters genuine IDs; official receipt lookup cannot be offered for records that have no official receipt number. Positive quantity and original-sale caps remain. Required Good / Resellable or Damaged / Not Resellable condition displays the proposed treatment:
- Good: May be returned to available stock after approval.
- Damaged: Do not return to available stock.

Preview shows original demo ID, product, quantity, condition, proposed treatment and refund status. It retains **Refund amount not available for this demo sale.** Confirmation states **Demo only — no refund or stock change was saved.** Prior returns are explicitly not recorded; cumulative-return enforcement is not claimed. Neither condition changes any records.

## Scope and authority

The original SRS was read/extracted successfully. Salesperson access to all eight fictional historical sales, sample receipts, optional identity metadata and condition-based return review are explicit owner-requested demo extensions. They do not grant production history/return permissions or decide accounting policy. Original source documents are unchanged.

Admin navigation/access and all reports remain unchanged. Salesperson DTOs allowlist only sale ID, business date, product name, quantity sold and historical unit selling price. No stock, thresholds, purchase costs, historical costs, profits or investment data are sent into the new history client. No real role enforcement is claimed.

## Verification

| Check | Result |
| --- | --- |
| Focused unit/component cases | 133 verified passing across 10 files |
| Affected unit subsets | 81 passed after updating old input counts/types; final five identity tests rechecked after interaction fix; not additional unique totals |
| npm run lint | PASS; final browser-only adjustment also checked with local ESLint |
| npm run typecheck | PASS on final saved code |
| Production build | PASS, including /pos/history; 32 generated pages |
| Existing browser regressions | 10 PASS, desktop/mobile, Light/Dark/System coverage |
| New feature browser cases | 4 PASS, desktop/mobile in Light/Dark; final run 33.3 seconds |
| Financial and source preservation | PASS, SHA-256 checks of original data/helpers/documents |
| Visual review | Three focused actual screenshots inspected |

Coverage includes all eight history rows/totals; combined searches/date/empty/reset; safe DTO keys; historical price versus current suggestion; absent metadata; print styles/focus/return; a simulated sale leaving history unchanged; editable/blank/invalid/duplicate codes; auto-suggestion collision avoidance; stable-ID same-name variants; free category and unit fallback/proposal; unchanged original product validation; positive/excess/fractional return constraints; required condition; both treatments; unavailable refund; no mutations; Login, Admin, inventory, reports, expense and checkout/receipt regressions.

Responsive checks cover 320/375/768/1024/1440/1920px. Theme, text/control contrast, keyboard focus, contained table scrolling and zero horizontal page overflow passed. No non-GET business requests, extra storage or cookies were produced.

Old hard-coded Add/Edit textbox counts were updated for the approved new field. A browser assertion's Unicode encoding was corrected without changing the required UI sentence. Browser testing also found that first-blur code validation could move Save during a click; validating this new field during typing/pasting fixes that interaction without changing its rules. Only affected feature cases were rerun. The build was repeated only after that actual application correction.

Commands used the installed npm/Vitest/Playwright infrastructure. No unrelated full suite was run.

## Unchanged invariants

| Metric | Value |
| --- | --- |
| Products / available stock / low stock | 7 / 123 units / 3 |
| Original sales / units sold / products sold | 8 / 42 / 6 |
| Revenue | Rs. 25,690.00 |
| Fictional historical demo COGS | Rs. 20,550.00 |
| Demo gross profit | Rs. 5,140.00 |
| Diapers revenue / gross profit | Rs. 7,499.50 / Rs. 1,299.50 |
| Diapers suggested selling price | Rs. 1,250.00 |

All original files under web/src/lib/ remain unchanged, including product/money/quantity/discount/return validators, sales/inventory fixtures and historical-cost/profit helpers. The Make a Sale implementation, global design tokens/styles, Login form, Admin shell, original SRS/guides/prototype, dependency manifests and standalone showcase/scripts are unchanged. The new helpers add only scoped preview identity/filter/condition and exact historical-line presentation.

## Files changed in this task

Created (12):

```text
docs/development/SALES_HISTORY_IDENTITY_RETURNS_REPORT.md
web/src/app/pos/history/page.tsx
web/src/components/demo/receipt-preview.tsx
web/src/components/pos/historical-receipt.tsx
web/src/components/pos/sales-history-preview.tsx
web/src/lib/product-identity-preview.ts
web/src/lib/return-condition-preview.ts
web/src/lib/sales-history-preview.ts
web/tests/e2e/sales-history-identity.spec.ts
web/tests/unit/product-identity.test.tsx
web/tests/unit/return-condition.test.tsx
web/tests/unit/sales-history.test.tsx
```

Modified (11):

```text
web/src/components/admin/add-product-preview.tsx
web/src/components/admin/product-list-preview.tsx
web/src/components/demo/admin-return-preview.tsx
web/src/components/demo/sample-receipt.tsx
web/src/components/shell/salesperson-shell.tsx
web/tests/e2e/role-workflows.spec.ts
web/tests/unit/add-product.test.tsx
web/tests/unit/admin-demo-previews.test.tsx
web/tests/unit/edit-product.test.tsx
web/tests/unit/products-preview.test.tsx
web/tests/unit/salesperson-navigation.test.tsx
```

Lists are relative to the preserved pending state at the task's start, not only HEAD. Earlier unmodified pending work remains present.

## Visual evidence

- [Sales History Light](../../web/test-results/history-identity-feature/sales-history-identity-ori-b8337-ty-and-safe-return-in-light-chromium/history-light.png)
- [Product identity Light](../../web/test-results/history-identity-feature/sales-history-identity-ori-b8337-ty-and-safe-return-in-light-chromium/product-identity-light.png)
- [Return condition Dark](../../web/test-results/history-identity-feature/sales-history-identity-ori-e2728-ity-and-safe-return-in-dark-chromium/return-condition-dark.png)

No obvious alignment or clipping defect remained in the inspected states. These images are ignored local test output.

## Remaining decisions and limitations

- Production history ownership, roles, authorization and Admin access to Salesperson workflows remain undecided/unimplemented.
- Database-enforced SKU uniqueness, final code format and duplicate-name/category/variant identity policy still need approval. Suggestions only cover known demo codes; no global guarantee or persistent reservation.
- Quantity precision, unit semantics and conversion policies remain unresolved. Labels do not enable new fractional behavior.
- Refund entitlement/amount, prior-return history/cumulative limits, approval, restocking/damage treatment, report attribution, atomic transactions and audits require approved backend rules. No refund or stock movement is implemented.
- Existing historical payment/receipt metadata is absent and remains absent. No fabricated discounts, cash, timestamps or invoice numbers.
- Product metadata and return previews are unsaved. Historical data is read-only; real persistence is future work.
- Physical printing, manual screen-reader/native zoom/device checks and owner visual review remain outstanding.
- No standalone update or chart redesign was performed.

Stop for owner review. No commit or push.
