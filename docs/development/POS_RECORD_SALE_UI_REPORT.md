# Salesperson Record Sale UI — P01 review report

Date: 1 November 2026 (Asia/Karachi).
Status: **Implemented and verified — desktop prototype approved by owner; mobile manual refinement deferred.**
Baseline: `9cf59d46ddda192a3a1867267955075b9391e518`.

Only the owner-authorized `/pos` screen and its embedded simulated summary are delivered. The owner has approved all six desktop manual feature checks, including the precision fix, and separately authorized a local checkpoint. No other screen, backend workflow, push or deployment is included.

## Requirements and behavior

| Area | Delivered behavior |
| --- | --- |
| Simple entry | Centered, maximum 640px form; product, quantity, unit selling price and inline total; 56px Record Sale button. |
| Product selector | Five explicitly mock id/name-only products. Case-insensitive search, empty-result message, pointer/touch selection, arrow/Home/End/Enter navigation, Escape dismissal and visible focus. Typed text alone is never accepted as a selected product. |
| Quantity | Editable decimal text input with mobile decimal keyboard hint and 44px +/- one controls. The default is the guide's illustrative 1. Invalid input is not silently coerced. |
| Price | Explicit PKR unit label, flexible decimal entry, strict optional comma grouping, no product-dependent suggested price. |
| Total | Exact BigInt coefficient/scale multiplication and string formatting; no Number/parseFloat financial arithmetic. `2 × 1,200.50 = Rs. 2,401.00`; `0.125 × 0.10 = Rs. 0.0125`. |
| Validation | Required product/price, positive quantity, malformed/negative/over-limit numeric messages, associated labels/errors, invalid-field semantics and first-error focus. Correcting a field clears its previous message; submitting validates again. |
| Confirmation | Same-page **Sale simulation complete** summary: product, quantity, PKR unit price and simulated total. It explicitly says no sale was recorded. No fabricated transaction ID, committed status or server timestamp. Focus moves to its heading. |
| Reset | New Sale clears product/query, price, errors and the prior simulated result; quantity returns to 1 and focus returns to product search. |
| Duplicate interactions | The form is removed on completion and a synchronous ref guard blocks repeated submit handling until New Sale. This is UI behavior, not production idempotency. |
| Themes/responsiveness | Existing tokens, locally rendered branding/icons and Light/Dark/System behavior. POS-only header uses the existing compact advisory indicator; Login/Admin/shared source remain unchanged. Normal vertical scrolling handles narrow/short/error/zoom states. |
| Safe fallback | Inputs and submission are disabled in server HTML until hydration. Without JavaScript, an explanation stays visible and no native submission can be made through the disabled controls. |

The generated confirmation is a local calculation snapshot with `kind: "simulation"`. It is deliberately distinct from the planned server `SaleConfirmation` contract. The future `/pos/success/[id]` route is not created by this task.

## Illustrative rules and remaining decisions

The visible About this preview disclosure explains that one-product entry, fractional quantities, zero-price examples and +/- one adjustments are illustrative. These do not resolve D02 (single product/basket), D03 (quantity/unit/precision/rounding) or D07 (zero/below-cost/override policies).

The preview accepts positive quantities and zero-or-positive prices, with up to 12 whole-number digits per input, 6 quantity decimal places and at most 2 selling-price decimal places (32 raw characters). It retains every product decimal place and displays at least two; there is no rounding or silent truncation of totals. These are bounded UI demonstration choices, not approved domain constraints or a production PKR settlement rule. Sub-paisa results intentionally remain exact until the owner selects the real rounding policy. No purchase-cost data or below-cost comparison exists in the preview.

The SRS examples and prototype informed the form sequence and appearance. The prototype's floating-point arithmetic, integer-only/positive-price assumptions and demo transaction reference were not copied as approved behavior. The owner's simulation brief overrides real-commit confirmation requirements for this explicitly labeled preview only. Authoritative real sale/idempotency/confidentiality requirements remain unchanged.

## Initial screen verification (historical)

All commands ran from `D:\pos\web` with the existing packages and Playwright Chromium runtime.

| Command | Final result |
| --- | --- |
| `npm run lint` | PASS, zero ESLint warnings |
| `npm run typecheck` | PASS, Next route types and TypeScript |
| `npm test` | PASS, **54 tests / 7 files**, including 18 new POS cases |
| `npm run build` | PASS, production compile, TypeScript and prerendering; existing route set unchanged |
| `npm run test:e2e -- --workers=2` | PASS, **130 tests**, desktop Chromium and Pixel 7 mobile Chromium; 32 new POS cases plus 98 existing regressions |

Targeted checks preceded the single final full-suite verification. A later Git formatting audit found extra EOF blank lines; only trailing newlines were normalized, with an explicit comparison guarding against any other change. Targeted ESLint passed after that formatting cleanup; the expensive browser suite was not repeated for newline-only changes. The initial targeted unit run passed 18 tests. Development builds caught ES2017-target incompatibility with BigInt literal syntax; constructor syntax fixed it without changing TypeScript configuration. Initial new browser tests needed named/scoped selectors to distinguish the theme selector, product selector and Next route announcer. The no-JavaScript explanation was changed from noscript-only markup to the existing hydration-safe conditional pattern and verified. The corrected targeted cases passed before final verification.

Browser coverage includes 320, 375, 768, 1024 and 1440px in Light/Dark, System OS changes/reload persistence, touch product selection, keyboard/focus, search/no matches, validation, exact fractional/large totals, illustrative zero price, simulations/reset/repeated entry, no draft/result storage, no mutation requests, and no external runtime requests. It checks actual text/control contrast, 44px controls, the 56px primary action, horizontal overflow, 200% CSS-scale reflow at a 640×600 viewport, long totals, expanded notes and short-screen scrolling. An advisory health failure does not disable a clearly local simulation and cannot produce a real sale confirmation.

## Screenshot evidence

Real Chromium screenshots were opened and inspected for alignment, spacing, readability, focus/error display and overflow. Representative final artifacts:

- [Desktop, Light, 1440px](../../web/test-results/pos-POS-light-at-1440px-entry-errors-simulation-and-reset-chromium/pos-entry-light-1440.png)
- [Desktop, Dark, 1440px](../../web/test-results/pos-POS-dark-at-1440px-entry-errors-simulation-and-reset-chromium/pos-entry-dark-1440.png)
- [Tablet, Light, 768px](../../web/test-results/pos-POS-light-at-768px-entry-errors-simulation-and-reset-chromium/pos-entry-light-768.png)
- [Mobile, Light, 320px validation](../../web/test-results/pos-POS-light-at-320px-entry-errors-simulation-and-reset-mobile-chromium/pos-errors-light-320.png)
- [Mobile, Dark, 375px confirmation](../../web/test-results/pos-POS-dark-at-375px-entry-errors-simulation-and-reset-mobile-chromium/pos-confirmation-dark-375.png)
- [Dark, 200% CSS reflow](../../web/test-results/pos-POS-200-percent-scale--317e1-nded-notes-remain-reachable-chromium/pos-dark-200-percent.png)

The screenshot review led to a compact POS-only header and smaller form gaps. The large primary action fits the inspected 1440×768 desktop viewport. Narrow/error/expanded states scroll normally. Screenshots and test artifacts are ignored local evidence, not committed assets, and later Playwright runs may replace them.

## Changed files

| File | Purpose |
| --- | --- |
| `web/src/app/pos/page.tsx` | Replace placeholder with Record Sale preview and page title |
| `web/src/app/pos/layout.tsx` | Compact POS-only header using existing shared elements |
| `web/src/components/pos/product-combobox.tsx` | Accessible searchable mock selector |
| `web/src/components/pos/record-sale-form.tsx` | Entry, errors, exact summary, simulation and reset |
| `web/src/lib/pos-preview.ts` | Safe fixtures, bounded parsing, exact decimal helpers and simulation snapshot |
| `web/tests/unit/pos-preview.test.ts` | Arithmetic/formatting/validation/fixture boundary tests |
| `web/tests/unit/record-sale-form.test.tsx` | Search, focus, validation, confirmation and reset tests |
| `web/tests/e2e/pos.spec.ts` | POS responsive/theme/keyboard/touch/safety/browser coverage |
| `web/tests/e2e/ui-foundation.spec.ts` | Replace two obsolete POS placeholder assertions: allow PKR and require its form; preserve confidentiality checks |
| `docs/IMPLEMENTATION_PLAN.md` | Current one-screen scope/status, preview assumptions and future P02 distinction |
| `docs/MODULE_CHECKLIST.md` | P01 evidence/review gate; preserve manual accessibility and future workflow checks |
| `docs/development/POS_RECORD_SALE_UI_REPORT.md` | This report |

Dependencies installed/upgraded: **none**. No migration, authentication, database configuration or deployment files were created. Manifest/lockfile and test configurations are unchanged.

## Integrity, limitations and review gate

The screen delivery and precision fix started from the stated baseline. Their initial uncommitted status is historical; the owner has separately authorized a local checkpoint of the 12 reviewed delivery files. Original SRS, both matching development-guide copies, UI specification, HTML prototype and AGENTS files remain byte-for-byte unchanged. Login/Admin and shared design-system source are unchanged. Generated output, screenshots and local test artifacts are ignored.

Functional now: local search/selection, input controls, validation, exact calculation, theme behavior, simulated summary and reset. Simulated only: the sale outcome. There is no real authentication/permission boundary, stock availability check, inventory mutation, persistence, transaction, audit, production duplicate prevention, request-key/outcome recovery or committed confirmation. Reload discards the preview and unsaved entries. Core local-asset/browser checks do not certify a physical shop LAN/WAN outage drill.

Very long values scroll inside editable inputs at narrow widths/200% scaling; read-only totals wrap without losing digits. Manual screen-reader, native browser/OS zoom and physical device/Safari/Firefox review remain outstanding. Automated Chromium keyboard/contrast/reflow checks are not WCAG certification. Business policies above still need owner approval before real integration. A01's earlier manual review gates remain open.

To review locally: `cd D:\pos\web`, then `npm run dev` and open `http://localhost:3000/pos`; alternatively use the verified production build with `npm run start`.

Rollback is a later reviewed, scoped reversion of these POS/test/progress-document changes. No rollback, reset or deletion was performed. The initial delivery created no commit; the owner now authorizes its local checkpoint. **Stop after that checkpoint; no next screen is authorized.**

## Subsequent single-issue correction — selling-price precision

Status: **Implemented and verified — desktop prototype approved by owner; mobile manual refinement deferred.**

Root cause: unit prices shared the quantity parser's six-decimal limit. Selling prices now have an explicit maximum of two decimal places in parsing, live input validation and simulation creation. Excess precision displays exactly **"Enter a price with no more than 2 decimal places."** Invalid text stays unchanged, the total is unavailable and neither click nor Enter can create a simulated confirmation. Valid prices retain exact BigInt arithmetic; no rounding or truncation was added. Quantity precision and total calculation behavior are unchanged.

Regression results: 100, 100.5, 100.50 and 100.99 are accepted; 100.999 and 0.001 are rejected. Extra trailing decimals such as 100.000 are also rejected. 1250.25 × 2 produces **Rs. 2,500.50**. Desktop/mobile browser cases verify real typing and clipboard paste in Light/Dark, invalid click/Enter attempts, correction, confirmation and reset.

Verification for this correction only:

- `npm test -- --run tests/unit/pos-preview.test.ts tests/unit/record-sale-form.test.tsx`: **30 passed**.
- `npm run lint`: **PASS**.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**, one production build.
- `npm run test:e2e -- tests/e2e/pos.spec.ts --grep "POS price precision|POS numeric errors|POS keyboard" --workers=2 --output=test-results/price-precision`: **8 passed**, one relevant browser run.

The full suite and screenshot matrix were not repeated. Existing screenshot artifacts were preserved; successful focused cases take no new screenshots. Earlier 54/130 figures above describe the initial screen delivery, not a full-suite rerun for this correction.

Files changed by this correction: `web/src/lib/pos-preview.ts`, `web/src/components/pos/record-sale-form.tsx`, `web/tests/unit/pos-preview.test.ts`, `web/tests/unit/record-sale-form.test.tsx`, `web/tests/e2e/pos.spec.ts`, `docs/IMPLEMENTATION_PLAN.md` and this report. Only precision-related copy changed; no layout/classes, Login/Admin, shared components, source requirements or dependencies changed. Before the separately authorized checkpoint, all pre-existing uncommitted work remained intact and the precision correction performed no staging or commit.

Policy discrepancy: the supplied request refers to an existing positive-price policy, but the inspected baseline actually permits zero-price previews and tests that behavior. This correction preserves that existing acceptance behavior and does not introduce a separate price-sign rule. Fractional quantities can still produce exact totals with more than two decimals; only unit selling-price precision is restricted here. Validation remains mock/client-side, with no real transaction or server enforcement. Other business decisions and manual review gates remain unchanged.

## Owner desktop approval and local checkpoint

The owner confirmed that all six desktop POS manual feature checks passed, including the selling-price decimal precision fix, and authorized one local commit named `feat: complete reviewed salesperson POS prototype`. Mobile manual refinement is deferred. Desktop approval does not close manual screen-reader/native browser zoom/physical-device review or confer overall phase/production acceptance.

The checkpoint covers exactly the 12 POS source/test/progress-document files listed above. A read-only comparison confirmed that all saved source, tests, dependency files and configuration match the previously verified final precision-fix state: lint and TypeScript passed; 30 focused unit/component tests passed; the production build passed; 8 relevant desktop/mobile browser tests passed. Initial screen delivery evidence remains 54 unit/component and 130 browser passes. No code changed during checkpoint preparation, so those expensive checks were not repeated.

Login/Admin, shared UI, AGENTS, original SRS, both matching development guides, UI specification, HTML prototype and dependency files remain intact. The DOCX archive is valid. The reviewed candidate files contain no detected secrets, private credentials, screenshots, generated build/test output or unexpectedly large files; those local artifacts remain ignored.

All real-backend obligations remain outstanding: authentication and server permissions, persistence, atomic stock deduction/no overselling, exact stored PKR and historical cost/profit preservation, request-key idempotency and uncertain-outcome recovery, corrections/audit history and shop LAN/internet-outage verification. D02/D03/D05/D06/D07/D09 and other undecided business policies remain pending. Desktop UI approval does not decide zero/below-cost rules, quantity/rounding policy, checkout cardinality, receipt costs or correction/report attribution. No push, dependency installation, UI change or next screen is authorized by this checkpoint.
