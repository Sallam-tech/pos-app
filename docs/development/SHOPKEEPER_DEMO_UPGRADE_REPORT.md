# Shopkeeper demo upgrade - verification record

6 November 2026 (Asia/Karachi). **Implemented and verified - awaiting owner review.**

## Preservation and scope

Baseline and final HEAD: `f3a8d840e0bdf9fbf1c4462394c46d4c3dfefc17`, branch `master`. The 15 pre-existing uncommitted demo-entry changes were preserved. This request modifies five existing working files and creates 22 files. Final working tree: 39 pending files; nothing staged, committed or pushed.

Existing page layouts and navigation sections remain recognizable. The POS labels now use 16px text; the prior shared button feedback and demo-entry polish are retained. The only new Admin navigation item is **Demo Tools**. Login validation, Product Management, inventory, reports and chart presentation were not rewritten. Chart visual approval remains deferred.

The original DOCX was extracted, including the confirmed purchase-cost amendment. The source development/design documents and HTML prototype remain unchanged. The other shopkeeper's HTML was read as reference text, not executed or copied. Its browser-storage accounting, financial logic, credentials and stock-cost behavior are not adopted.

## Working additions

| Location | Verified behavior |
| --- | --- |
| /pos | Existing one-product workflow plus optional Discount & cash. Blank/zero discount preserves every original exact total. Percentages 0-100, at most two decimals in this demo. Unsupported fractional-paisa results are rejected, never rounded. Actual selling-price entry and suggested-price guidance remain separate. |
| POS sample receipt | Available only after a valid simulation. Source quantity, unit price, subtotal, discount, total and optional cash/change reconcile. Explicit sample/unsaved context, no official invoice number. Browser print dialog, ordinary and compact 80 mm layouts. |
| /admin/demo | Separate, compact entry to the three owner-requested previews. Public Admin layout preview; no actual authorization. |
| /admin/demo/expenses | Empty initially. Exact non-negative PKR entry, valid dates, correction/removal/reset, selected-day and calendar-month totals. Clearly identified sample starting date. |
| /admin/demo/returns | Original sale selection and quantity review. Rejects missing/zero/excess/unsupported quantities; displays original recorded price comparison. **Refund remains unavailable**, because the original records lack discount/refund terms. No refund, return history or stock movement is fabricated. |
| /admin/demo/investment | Initially Not entered. Optional exact non-negative owner-entered amount and reset; no invented amount or derived valuation. |
| demo/shop-pos-showcase.html | Separate, self-contained light-theme file. Demo entry, Admin/POS, read-only products/stock, original sales/profit summaries, checkout/receipt and temporary Admin tools. All nine embedded helper sources match their SHA256 provenance. |

Main-app Admin entries clear when leaving/reloading their page. Standalone examples remain only in memory until Reset Demo or reload, as stated on screen. Neither uses browser storage as a transaction database. Expenses and investment never alter Gross Profit or reports.

## Verification evidence

| Check | Final result |
| --- | --- |
| Focused Vitest | **157 passed across 11 files**; affected receipt tests rechecked after final text correction: **6 passed**. Includes original sale arithmetic, Login behavior, Product Management/financial invariants, chart helpers and navigation. |
| Main-app Playwright | **10 unique relevant desktop/mobile cases passed**, with affected failures corrected and rechecked. Four existing entry/navigation cases plus six new preview cases. Final new-preview run: five passed, then the single mobile theme-transition assertion passed its focused recheck. |
| Lint | `npm run lint` passed, including new .mjs scripts. |
| TypeScript | `npm run typecheck` passed after final browser assertions. |
| Production build | `npm run build` passed for the final application source. No application edits after that build. |
| Standalone | `node web/scripts/build-demo-showcase.mjs` and `node web/scripts/verify-demo-showcase.mjs` passed. Direct local-file Chromium checks: nine source hashes, 12 invariants, all demo flows, no HTTP requests, runtime errors, cookies or stored records. Node syntax checks and script lint passed. |
| Responsive/accessibility | 320/375/768/1024/1440/1920px; Light/Dark/System in the main app, keyboard search, Enter submission, errors/focus, receipt dialog trap/Escape/restore, contrast and print media checks. Standalone checked at all six widths across eight views. |
| Visual inspection | Actual final POS light desktop/dark mobile, Admin Expenses desktop and standalone desktop screenshots inspected. Normal vertical scrolling remains available. Screenshots/test artifacts are ignored, not staged. |
| Git/safety | `git diff --check` passed; no deletions, conflicts, obvious secret signatures, generated test/build artifacts or unexpectedly large pending files. Nothing staged. |

Initial new-file TypeScript compatibility issues, a literal text escape, ambiguous alert selectors and a theme-transition timing assertion were corrected before the final results above. No production configuration or original financial helper was changed to bypass checks. No dependencies were installed.

Disk space remained sufficient for verification (approximately 4.7 GB free on C: and 18.1 GB on D: at the last pre-final audit).

## Unchanged financial/inventory invariants

| Measure | Preserved value |
| --- | --- |
| Products / stock / low stock | 7 / 123 units / 3 |
| Original sales / quantity / different products sold | 8 / 42 units / 6 |
| Revenue / fictional demo COGS / demo Gross Profit | Rs. 25,690.00 / Rs. 20,550.00 / Rs. 5,140.00 |
| Diapers revenue / Gross Profit / suggested selling price | Rs. 7,499.50 / Rs. 1,299.50 / Rs. 1,250.00 |

The SRS, both matching development-guide copies, UI specification/prototype, inventory/sales/historical-cost fixtures, original POS/report helpers and manifest/lockfile match their starting SHA256 hashes. Historical costs remain explicitly fictional.

## Exact files changed by this request

Modified existing working files:

- `docs/MODULE_CHECKLIST.md`
- `docs/SHOPKEEPER_DEMO_GUIDE.md`
- `web/src/components/pos/record-sale-form.tsx`
- `web/src/components/shell/admin-shell.tsx`
- `web/tests/unit/admin-navigation.test.tsx`

Created:

- `demo/shop-pos-showcase.html`
- `demo/showcase.template.html`
- `docs/development/SHOPKEEPER_DEMO_UPGRADE_REPORT.md`
- `web/scripts/build-demo-showcase.mjs`
- `web/scripts/verify-demo-showcase.mjs`
- `web/src/app/admin/demo/expenses/page.tsx`
- `web/src/app/admin/demo/investment/page.tsx`
- `web/src/app/admin/demo/page.tsx`
- `web/src/app/admin/demo/returns/page.tsx`
- `web/src/components/demo/admin-demo-page.tsx`
- `web/src/components/demo/admin-expenses-preview.tsx`
- `web/src/components/demo/admin-investment-preview.tsx`
- `web/src/components/demo/admin-return-preview.tsx`
- `web/src/components/demo/checkout-options.tsx`
- `web/src/components/demo/sample-receipt.tsx`
- `web/src/lib/demo/admin-preview.ts`
- `web/src/lib/demo/checkout.ts`
- `web/src/lib/demo/money.ts`
- `web/tests/e2e/shopkeeper-upgrade.spec.ts`
- `web/tests/unit/admin-demo-previews.test.tsx`
- `web/tests/unit/demo-checkout-form.test.tsx`
- `web/tests/unit/demo-checkout.test.ts`

Other pending files belong to the preserved preceding demo-entry task, rather than new rewrites in this request.

## Review limits and use

- Return refund amount/confirmation is intentionally unavailable until original selling terms and a return policy are supplied. The displayed price comparison is not a promised refund.
- Discount precision here is an illustrative preview limit, not approval of production discount allocation, rounding, tax or payment policy.
- Real authorization, database storage, durable transactions, stock/refund movements and audit recording remain future work. No real credentials, payments or authoritative records are accepted by these previews.
- The portable file is a smaller showcase: full approved Product Management and detailed report workflows remain in Next.js. It does not replace that application.
- Manual screen-reader/native zoom/device checks and physical printer output remain open. No production readiness or final chart visual approval is claimed.

Start the primary app from `D:\pos\web`: `npm run dev -- --port 3000`; open `http://localhost:3000/`. Open `D:\pos\demo\shop-pos-showcase.html` directly for the separate portable demo. See [the walkthrough](../SHOPKEEPER_DEMO_GUIDE.md).

Standalone final SHA256: `bd8c96f4d16e3c80b15e02e7ee7607b77f944e5df208f79b64c2ec60979c0a59` (61,983 bytes).
