# Low Stock Products card interaction

Date: 2 November 2026 (Asia/Karachi).
Status: **Implemented and verified — desktop visuals owner-approved on 2 November 2026. Manual accessibility/device review remains pending.**
Git baseline: `f2f6296e83a4e30e9ba46d911d48e791cf3392d5`, with the preceding uncommitted dashboard-summary delivery preserved.

## Delivered scope

Only the **Low Stock Products** overview card is a real link, at `/admin/dashboard`, to the canonical `/admin/inventory/low-stock` route. The full card is clickable, reachable with Tab and activated with Enter; its visible View list hint and existing 3px focus outline identify the interaction. The other four summary cards retain their values and have no links or actions.

An Admin-only mock inventory fixture and pure filter are shared by the dashboard count and list. The inclusive SRS §4.11 rule is **quantity <= configured threshold**. Six illustrative products contain two low-stock entries:

| Product | Remaining quantity | Low-stock threshold | Status |
| --- | ---: | ---: | --- |
| Diapers | 5 | 5 | Low stock |
| Milk Powder | 3 | 5 | Low stock |

The dashboard count is consequently **2**. Four products above their thresholds are excluded. No duplicate low-stock count or second list fixture is maintained. The other dashboard figures remain display examples; no financial aggregation or reporting date logic is introduced.

The read-only list has semantic column/row headings, a textual warning badge with local icon, explicit mock-data context and Back to Admin Dashboard navigation. Existing Light/Dark/System themes, components, local assets and Admin shell are reused. The sidebar's items, layout and visual design are preserved. A subsequent scoped fix makes the active highlight pathname-aware: Dashboard on `/admin/dashboard`, Inventory on `/admin/inventory/low-stock`. Dashboard uses `aria-current="page"` on its route and Inventory uses `aria-current="location"` on the low-stock route. Planned entries remain non-clickable.

The UI specification/prototype's broader receive-stock actions are outside this brief and remain unimplemented. Whole-number fixture examples do not settle pending quantity precision or any other business policy.

## Verification

Final saved code:

| Command (from web/) | Result |
| --- | --- |
| `npm test -- tests/unit/low-stock.test.tsx tests/unit/dashboard-summary.test.tsx` | **7 passed** across two files: five new low-stock tests and two existing summary tests |
| `npm run lint` | **PASS**, no warnings |
| `npm run typecheck` | **PASS**, including generated canonical route types |
| `npm run build` | **PASS**, including prerendering the new route |
| `npm run test:e2e -- tests/e2e/low-stock.spec.ts tests/e2e/dashboard-summary.spec.ts --workers=2 --output=test-results/low-stock-card-final` | **12 passed** (40.4s), desktop Chromium and Pixel 7 mobile Chromium |

Unit cases cover below/equal/above/zero threshold boundaries, healthy/empty fixtures, exactly one card link, exact canonical URLs, mock labels and all list/count/fixture values. Browser cases cover mouse and keyboard card navigation, visible full-card focus, direct route loading, return navigation, excluded healthy products, table semantics, actual text contrast, no page overflow, System changes/persistence and local GET/HEAD-only runtime requests. The list is checked at 1440, 768, 375 and 320px; unchanged dashboard layout is also checked at 1280 and 1024px.

The first focused browser pass had eight passes and four failures: the existing exact Mock data locator included the newly nested View list text. The mock label was placed in its own span without changing styling; final focused unit/lint/type/build and all 12 browser cases then passed. No full browser-suite run was needed. Non-failing environment warnings about FORCE_COLOR/NO_COLOR were emitted.

Final screenshots were opened and inspected for alignment, spacing, readable labels/numbers and visible focus:

- [Dashboard card — Light, 1440px](../../web/test-results/low-stock-card-final/low-stock-Low-stock-card-n-4e1f5--and-filtered-list-in-light-chromium/dashboard-card-light.png)
- [Dashboard card — Dark, 1440px](../../web/test-results/low-stock-card-final/low-stock-Low-stock-card-n-7031f-n-and-filtered-list-in-dark-chromium/dashboard-card-dark.png)
- [Low-stock list — Light, 1440px](../../web/test-results/low-stock-card-final/low-stock-Low-stock-card-n-4e1f5--and-filtered-list-in-light-chromium/low-stock-light-1440.png)
- [Low-stock list — Dark, 1440px](../../web/test-results/low-stock-card-final/low-stock-Low-stock-card-n-7031f-n-and-filtered-list-in-dark-chromium/low-stock-dark-1440.png)
- [Low-stock list — Light, 375px](../../web/test-results/low-stock-card-final/low-stock-Low-stock-card-n-4e1f5--and-filtered-list-in-light-chromium/low-stock-light-375.png)
- [Low-stock list — Dark, 375px](../../web/test-results/low-stock-card-final/low-stock-Low-stock-card-n-7031f-n-and-filtered-list-in-dark-chromium/low-stock-dark-375.png)

Screenshots are ignored local review artifacts. Separate output directories preserve earlier screenshot evidence. Narrow layouts use a focusable, horizontally scrolling table region; all four columns are not simultaneously visible on small phones. Arrow-key scrolling was verified and the document itself does not overflow.

## Files changed for this feature

- `web/src/app/admin/dashboard/page.tsx` — only low-stock count/link behavior; preserve prior five-card work.
- `web/src/app/admin/inventory/low-stock/page.tsx` — canonical read-only mock list and return link.
- `web/src/lib/admin/mock-inventory.ts` — one Admin fixture and inclusive filter.
- `web/src/components/shell/admin-shell.tsx` — route-aware current announcements and the subsequent active-highlight fix.
- `web/tests/unit/admin-navigation.test.tsx` — subsequent route-transition/highlight regression; no unrelated test changes.
- `web/tests/unit/low-stock.test.tsx` — focused filter/card/list regression coverage.
- `web/tests/e2e/low-stock.spec.ts` — focused navigation, keyboard, theme, responsive and consistency checks.
- `docs/IMPLEMENTATION_PLAN.md` and `docs/MODULE_CHECKLIST.md` — bounded delivery, verification and pending owner review.
- `docs/development/LOW_STOCK_CARD_REPORT.md` — this record.

The preceding dashboard summary report and its two test files are preserved unchanged. Original SRS, development guides, design specification/prototype, AGENTS instructions, Login/POS source/tests, styles/shared primitives and dependency/configuration files are unchanged from the task's starting state.

## Remaining limits and review gate

This is a public, read-only UI preview with illustrative data, not real Admin authorization or inventory management. Database reads/writes, threshold editing, receiving, other card actions and production role confidentiality belong to later approved work. Pending receiving-cost, quantity, price, correction/reporting and basket decisions remain open. Manual screen-reader, native browser zoom and physical-device review remain outstanding.

At the original feature delivery, no dependencies were installed, files staged, commit created or further feature begun.

## Desktop approval and checkpoint — 2 November 2026

The owner approved the desktop design of the five dashboard cards, low-stock list and sidebar navigation fix and authorized one local checkpoint. Manual screen-reader, native zoom and physical-device checks remain outstanding; all real-backend requirements and pending business policies remain open.

The sidebar fix passed `npm test -- tests/unit/admin-navigation.test.tsx` (**1 passed**), `npm run lint` and `npm run typecheck`. Source and tests are unchanged since those checks; the preceding **7 focused component tests and 12 focused browser cases** are retained as feature-delivery evidence. The browser run predates only the separately tested sidebar highlight fix. No full browser-suite rerun is needed. The final checkpoint `npm run build` also **passed**, including the saved sidebar fix, TypeScript checking and route prerendering. No application source or tests changed during checkpoint preparation.

This checkpoint authorizes no push, design change or further feature. Earlier no-commit/review-pending statements describe their original delivery state.
