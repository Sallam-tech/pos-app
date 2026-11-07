# Application UI simplification - 7 November 2026

**Status: UI-only implementation verified - awaiting owner visual review.** Basket/customer/settings gaps below remain unimplemented.

Read root/web AGENTS, extracted the complete original SRS including amendments, reviewed the engineering/design documents and prototype, all application routes, current controls/themes, receipts/print behavior and financial fixtures/helpers. Started on master at f3a8d840e0bdf9fbf1c4462394c46d4c3dfefc17 with 87 existing pending files. Existing work was preserved.

## Screen checklist

| Screen / route | Result | Change or reason retained |
| --- | --- | --- |
| Login /login | Unchanged | Already compact and centered, with validation, password toggle and honest Admin/Salesperson preview access; reviewed in both themes. |
| Make a Sale /pos | Improved | One connected form replaces two panels. Quantity/price share a row; one prominent TOTAL; meaningful discount breakdown remains secondary. Main action is Preview Invoice. |
| Sales History /pos/history | Improved | Compact combined filters and five essential columns; quantity appears under product. All eight original references and View Receipt retained. |
| Sample/historical receipts | Improved | White document, item table, exact aligned values, TOTAL, thank-you, Print and Done. Unknown historical fields remain unknown. No invented IDs or payment/date records. |
| Return Item /pos/returns | Improved | Linear form, shorter labels and Review Return. A review appears only after valid input, replacing the permanent empty panel. Condition, quantity and refund/restocking limitations remain. |
| Shop Expenses /pos/expenses | Improved | Compact supported form, shorter guidance and Add Expense (Demo). Temporary list, corrections/removals/reset and daily/monthly totals preserved. |
| Admin Shop Expenses /admin/expenses | Improved / added | Read-only daily review, supported monthly total, date/reason/amount columns and explicit absence of shared recorded data. Salesperson entry stays separate. |
| Dashboard /admin/dashboard | Improved | View Details is consistent; repeated mock labels removed; Today's Gross Profit is explicit. All five original values and links retained; a sixth Shop Expenses card shows an honest unavailable state. |
| Products /admin/products | Improved | Five main columns; code/category/unit available in accessible Details. Name/code search, stock status, price guide and Edit preserved. |
| Add Product /admin/products/new | Improved | Required fields visible; optional category/code/unit under More Details (Optional). Concise hints and centered form retained. |
| Edit Product /admin/products/[productId]/edit | Improved | Same optional grouping; clear read-only stock/current-cost information. All seven IDs verified. Correct Stock and Stop/Resume Selling remain separate. |
| Available Stock /admin/inventory/available-stock | Improved | Simple overall totals strip replaces extra summary cards; search/status filters and all quantities preserved. |
| Low Stock /admin/inventory/low-stock | Unchanged | Already a clear three-row table with thresholds and zero-stock status. Both themes and Inventory highlighting reviewed. |
| Sales Report /admin/sales/today | Improved | Period/search controls together; simple totals strip; filtered subtotal appears only when searching. Overall scope unchanged. |
| Profit Report /admin/profit/today | Improved | Same compact controls; revenue, cost of sold items and gross profit stay distinct. Missing-cost and invalid-period behavior preserved. |
| Reports Home /admin/reports | Improved | Two restrained choices; decorative icons/accent borders removed. Existing destinations retained. |
| Sales/Profit Charts /admin/reports/sales and /admin/reports/profit | Improved | Supporting filters/totals simplified. Charts, Show All, single-period summary and multi-period presentation retained; algorithms unchanged. Visual approval remains pending. |
| Total Investment /admin/investment | Improved | One linear owner-entry form/result; separate from inventory value. Not entered remains distinct from zero. |
| Settings | Unchanged / absent | No functional Settings route exists. Persistent Light/Dark/System controls remain in headers. Other settings stay pending requirements; no fake actions added. |
| Product not found | Unchanged | Clear recovery link retained and verified. |
| Root + four /admin/demo bookmarks | Unchanged | All five existing redirects verified; no Demo Tools hub. |
| /api/health | Unchanged | Existing endpoint responds; compact connectivity indicator retained. |

Admin Sales now opens its existing report directly, avoiding a one-item submenu. Inventory keeps its two real destinations. All four Salesperson destinations and Admin investment/report placement remain unchanged.

## Interaction safeguards

Product arrows/Enter/Escape, Tab order, visible focus, dialog trapping and receipt focus restoration remain functional. Selecting a product does not submit the invoice. Invalid optional product fields reveal More Details before receiving focus; required fields stay visible.

Browser regression checks found a real mobile defect: blur validation could move Save between pointer-down and click. Blur rendering now defers when focus moves to Save/Cancel; Save still executes the same full validation. Other typing/blur validation and all validation rules remain unchanged. Both desktop/mobile Edit regressions pass.

## Whole-application verification before the expense addition

- Full lint and TypeScript: PASS after final application corrections.
- Unit/component: 418 passing cases across 34 files, combining one full run with focused failure reruns. Final product-form recheck: 81 passing cases. Original financial/validation assertions retained.
- Production build: PASS, 32 generated pages. A second build was necessary after the browser-discovered mobile focus fix. No application source changed afterward.
- Browser: 19 distinct relevant cases PASS: all-route Light/Dark review (2), System/reflow (1), ordinary workflows (4), stock/status operations (4), original history/identity/returns (4), original Add/Edit validation (4). Three deliberate project exclusions avoid duplicate route screenshots/responsive runs. No claim that the full Playwright suite ran.
- All 17 main screens and product-not-found visually inspected in Light/Dark at 1440px; all seven edit IDs and five redirects verified. Reflow checks cover 320/375/768/1024px and short-height 512px equivalent for 200% reflow; product regressions also exercise expanded forms at narrower widths.
- Rendered text/control contrast, keyboard focus, exact discounts/cash/change, historical receipts, print media, search, empty/invalid report periods, return limits and reset behavior checked.
- Full-page capture of a native dialog sometimes omitted dark receipt paint. Independent before/after-print/reopen checks and final viewport/document screenshots rendered correctly. Invoice screenshots now use normal viewport capture. Physical printer compatibility is not claimed.
- Early stale presentation assertions/test locators were corrected; one unit timeout passed with limited workers. The actual mobile focus defect was fixed. No outstanding failure in the verification above. Passing unaffected results were reused.

## Financial and data preservation

| Invariant | Preserved |
| --- | --- |
| Products / available units / low-stock | 7 / 123 / 3 |
| Original sales | 8 |
| Revenue | Rs. 25,690.00 |
| Fictional demo COGS | Rs. 20,550.00 |
| Demo gross profit | Rs. 5,140.00 |
| Diapers revenue / gross profit | Rs. 7,499.50 / Rs. 1,299.50 |
| Diapers suggested price | Rs. 1,250.00 |
| Units / different products sold | 42 / 6 |

Starting SHA-256 checksums confirm no changes to any src/lib helper/fixture, original SRS, either development-guide copy, original UI specification/prototype, dependency manifests or standalone showcase. No prior file deleted. Safe Salesperson projections unchanged; confidential fixture fields absent in browser page checks. No backend/database, authentication, mutation API, persistence or real transaction introduced.

## Remaining scope limitations

The current checkout has no multi-product draft, Add Item, item edit/remove or customer name/phone. Adding them would introduce functionality and calculations beyond this UI-only instruction and the pending checkout-cardinality decision. These acceptance items remain unfulfilled pending separately approved functional work; no basket behavior was invented. Single-product exact arithmetic, including illustrative fractional/sub-paisa totals, remains unchanged.

No Settings screen exists. Real authorization, persistence, transactions, audit history, production policies and reporting remain future work. Returns do not refund/restock, expenses do not deduct reported profit, and investment is not inventory valuation. The separate HTML showcase is unchanged in this Next.js pass. Manual screen-reader/cross-browser/device review and hardware printing remain outstanding. No owner visual approval is claimed.

## Admin Shop Expenses addition - current owner requirement

Implemented and verified; awaiting owner visual review. This addition preserves the entire application-wide screen review and UI changes above. Only five application files changed in this addition; unrelated screen source was left byte-for-byte unchanged. The original SRS excludes expenses from initial v1; the owner explicitly authorized this separate demo UI extension, with no production permission or accounting policy implied.

- Dashboard now has six matching cards in a simple three-by-two desktop grid. Shop Expenses has a keyboard-accessible View Details link to /admin/expenses. Its scope is the existing fixed demo business day, 2 November 2026, shown on the card.
- Actual expense entry remains local React state on /pos/expenses and clears on leaving/reloading. There is no recorded/shared Admin dataset. The card and daily/monthly review totals therefore display Unavailable, never an invented amount or a misleading Rs. 0.00. No cross-page synchronization or persistence was added.
- Admin review has a business-day selector, date/reason/PKR amount columns, daily and monthly totals, and Back to Dashboard. It has no Add/Edit/Delete controls. Dashboard remains active as the parent drilldown; no duplicate Admin entry menu was added.
- The new review adapter reuses the existing demoExpenseTotals exact-paise helper and entry contract. Valid supplied records can be reviewed by day/month; a known empty dataset can yield zero. Missing or invalid data yields unavailable totals, not partial invented totals. Synthetic expense amounts exist only in tests, never application fixtures.
- Expenses are never deducted from gross profit. Sales revenue Rs. 25,690.00, fictional COGS Rs. 20,550.00 and gross profit Rs. 5,140.00 remain unchanged, as do all other recorded invariants above.

Focused verification: 80 unit/component tests PASS across 7 files; scoped ESLint PASS; TypeScript PASS; one necessary production build PASS with 33 generated pages; 6 focused browser cases PASS across desktop/mobile Chromium, Light/Dark and System persistence. Browser checks cover six-card alignment, keyboard navigation, unknown data, invalid dates, responsive 320/375/768/1024/1280/1440px, existing Salesperson entry and truthful lack of synchronization. Both Dashboard and Admin review screenshots were inspected in Light/Dark; no clipping/alignment issue found. Prior unaffected whole-application results were reused; no full suites repeated.

Screenshot evidence remains ignored under web/test-results/admin-expense-review/browser: dashboard-summary-Dashboard-summary-cards-in-light-chromium and dashboard-summary-Dashboard-summary-cards-in-dark-chromium, each containing the final Dashboard and expense-review PNGs. No backend, database, authentication, expense fixture, historical sale or original financial-helper changes. Real shared expense records/authorization remain future work.

## Exact files changed in this task

- docs/development/APPLICATION_UI_SIMPLIFICATION_REPORT.md
- web/src/app/admin/dashboard/page.tsx
- web/src/app/admin/expenses/page.tsx
- web/src/app/admin/products/new/page.tsx
- web/src/app/admin/reports/page.tsx
- web/src/app/globals.css
- web/src/app/pos/page.tsx
- web/src/components/admin/add-product-preview.tsx
- web/src/components/admin/available-stock-preview.tsx
- web/src/components/admin/expense-review-preview.tsx
- web/src/components/admin/product-list-preview.tsx
- web/src/components/admin/report-charts-preview.tsx
- web/src/components/admin/today-profit-preview.tsx
- web/src/components/admin/today-sales-preview.tsx
- web/src/components/demo/admin-expenses-preview.tsx
- web/src/components/demo/admin-investment-preview.tsx
- web/src/components/demo/admin-return-preview.tsx
- web/src/components/demo/checkout-options.tsx
- web/src/components/demo/receipt-preview.tsx
- web/src/components/demo/sample-receipt.tsx
- web/src/components/pos/historical-receipt.tsx
- web/src/components/pos/record-sale-form.tsx
- web/src/components/pos/sales-history-preview.tsx
- web/src/components/shell/admin-shell.tsx
- web/src/components/shell/workspace-page.tsx
- web/src/lib/admin/expense-review-preview.ts
- web/tests/e2e/application-simplification.spec.ts
- web/tests/e2e/available-stock.spec.ts
- web/tests/e2e/dashboard-summary.spec.ts
- web/tests/e2e/demo-entry.spec.ts
- web/tests/e2e/edit-product.spec.ts
- web/tests/e2e/low-stock.spec.ts
- web/tests/e2e/pos.spec.ts
- web/tests/e2e/products-preview.spec.ts
- web/tests/e2e/reports-home.spec.ts
- web/tests/e2e/role-workflows.spec.ts
- web/tests/e2e/sales-history-identity.spec.ts
- web/tests/e2e/shopkeeper-upgrade.spec.ts
- web/tests/e2e/today-profit.spec.ts
- web/tests/e2e/today-sales.spec.ts
- web/tests/unit/add-product.test.tsx
- web/tests/unit/admin-demo-previews.test.tsx
- web/tests/unit/admin-expense-review.test.tsx
- web/tests/unit/admin-navigation.test.tsx
- web/tests/unit/dashboard-summary.test.tsx
- web/tests/unit/demo-checkout-form.test.tsx
- web/tests/unit/demo-profit-costs.test.tsx
- web/tests/unit/low-stock.test.tsx
- web/tests/unit/product-identity.test.tsx
- web/tests/unit/products-preview.test.tsx
- web/tests/unit/record-sale-form.test.tsx
- web/tests/unit/return-condition.test.tsx
- web/tests/unit/sales-history.test.tsx
- web/tests/unit/today-profit.test.tsx
- web/tests/unit/today-sales.test.tsx
- web/tests/unit/ui-simplification.test.tsx

Task-relative inventory; earlier pending work is separate. Screenshots/traces/review artifacts remain ignored under web/test-results. No package installation, Git staging, commit or push occurred. Branch and HEAD unchanged.

Admin expense addition file inventory (17 files):

- docs/development/APPLICATION_UI_SIMPLIFICATION_REPORT.md
- web/src/app/admin/dashboard/page.tsx
- web/src/app/admin/expenses/page.tsx
- web/src/components/admin/expense-review-preview.tsx
- web/src/components/shell/admin-shell.tsx
- web/src/lib/admin/expense-review-preview.ts
- web/tests/e2e/application-simplification.spec.ts
- web/tests/e2e/available-stock.spec.ts
- web/tests/e2e/dashboard-summary.spec.ts
- web/tests/e2e/low-stock.spec.ts
- web/tests/e2e/products-preview.spec.ts
- web/tests/e2e/today-profit.spec.ts
- web/tests/unit/admin-expense-review.test.tsx
- web/tests/unit/admin-navigation.test.tsx
- web/tests/unit/dashboard-summary.test.tsx
- web/tests/unit/low-stock.test.tsx
- web/tests/unit/products-preview.test.tsx
