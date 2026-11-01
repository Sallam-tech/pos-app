# Admin dashboard — five summary cards

Date: 1 November 2026 (Asia/Karachi).
Status: **Implemented and verified — desktop visuals owner-approved on 2 November 2026. Manual accessibility/device review remains pending.**

Checkpoint update — 2 November 2026: the owner approved the dashboard summary cards, low-stock preview and sidebar navigation fix and authorized one local checkpoint. The original delivery evidence below is historical; the subsequent shared-fixture low-stock count/list and pathname highlight fix are recorded in [LOW_STOCK_CARD_REPORT.md](LOW_STOCK_CARD_REPORT.md).
Baseline: `f2f6296e83a4e30e9ba46d911d48e791cf3392d5`.

Only the five owner-authorized overview cards at `/admin/dashboard` are implemented. The broader A02 dashboard remains planned.

| Card | Fixed mock display |
| --- | --- |
| Total Products | 6 |
| Available Stock | 123 |
| Low Stock Products | 2 |
| Today's Sales Revenue (PKR) | Rs. 25,690.00 |
| Today's Profit (PKR) | Rs. 4,860.00 |

These are independent illustrative display values, explicitly labeled **Mock data** on each card and described together as examples, not live shop records. No sum, threshold query, revenue/profit calculation, reporting date or timezone boundary is invented. Currency is stored in the example as exact decimal/display strings with PKR labels and two displayed decimal places; no financial arithmetic or floating-point conversion is performed.

The existing Card primitive, semantic color/type tokens and numeric style are reused. Labeled groups within a definition list associate each heading with its value and mock-data description. Values use tabular figures and remain readable without truncation. The five-card subset uses one/two/three/five columns as space permits, with one aligned row at 1440px; the full UI specification's broader dashboard/card/chart layout is not implemented here.

The old placeholder and two shell-explanation cards were replaced by these five cards. The pre-existing shared-component preview control remains available below them so existing foundation dialog checks keep working. Its component source is unchanged. No new chart, table, filter, navigation or dashboard action was added.

## Verification

- `npm run lint`: **PASS**; targeted lint of the final page and two new tests also passed after the breakpoint correction.
- `npm run typecheck`: **PASS**. An initially unsupported unit-test query option was corrected before the production build.
- `npm test -- --run tests/unit/dashboard-summary.test.tsx`: **2 passed** for accessible labels/mock context, the exact five count/PKR values and absence of business controls in the overview.
- `npm run build`: **PASS**, including TypeScript and prerendering.
- Final `npm run test:e2e -- tests/e2e/dashboard-summary.spec.ts --workers=2 --output=test-results/dashboard-summary-cards`: **6 passed**, desktop Chromium and Pixel 7 mobile Chromium.
- **6 existing Admin shell regression cases passed**: dialog focus/Escape/restoration, mobile drawer behavior and 200% scale/reduced-motion checks, on both browser projects. These ran in the initial focused pass and were not unnecessarily repeated.

The first card browser pass caught a mixed px/rem breakpoint ordering issue that kept three columns at 1440px. The page-local breakpoint was changed to matching rem units; the final dashboard-only pass then verified the correct five-card row, aligned value baselines, no clipped values, actual contrast and no horizontal overflow. It exercised 320, 375, 768, 1024, 1280 and 1440px in Light/Dark, System OS changes and persisted preference. Local-only request checks passed with no mutation or external runtime requests. The entire browser suite was not run.

Actual final desktop screenshots were opened and inspected for alignment, spacing and readable numbers:

- [Light, 1440×900](../../web/test-results/dashboard-summary-cards/dashboard-summary-Dashboard-summary-cards-in-light-chromium/dashboard-light-1440.png)
- [Dark, 1440×900](../../web/test-results/dashboard-summary-cards/dashboard-summary-Dashboard-summary-cards-in-dark-chromium/dashboard-dark-1440.png)

Screenshots are ignored local review artifacts; earlier POS evidence was preserved by using a separate output directory.

## Files and limits

- `web/src/app/admin/dashboard/page.tsx` — five static labeled mock cards in the existing shell.
- `web/tests/unit/dashboard-summary.test.tsx` — two focused rendering/accessibility tests.
- `web/tests/e2e/dashboard-summary.spec.ts` — responsive, formatting, alignment, contrast and theme checks.
- `docs/IMPLEMENTATION_PLAN.md` — current A02 subset and review gate.
- `docs/MODULE_CHECKLIST.md` — subset verification; full A02 remains unchecked.
- `docs/development/ADMIN_DASHBOARD_SUMMARY_REPORT.md` — this report.

Login, Salesperson POS, Admin shell/sidebar, shared components/styles, source SRS/design/development guides, dependency manifests and tooling configuration remain unchanged from baseline. No dependencies, database, authentication, migrations, real business records or transactions were added. No commit or staging was performed.

Remaining limitations: these public preview values are not live metrics, and the page provides no real Admin authorization. Actual aggregation, local-shop reporting dates, server permissions, financial integrity and remaining business policies still belong to later approved work. Manual screen-reader, native zoom and physical-device review are not certified by the automated Chromium checks. Desktop visual review of these five cards is now approved. Remaining manual accessibility/device checks stay open; the owner authorized only the local checkpoint, with no next feature or push.
