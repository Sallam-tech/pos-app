# Phase 2 — Shared UI Foundation

Date: 1 November 2026 (Asia/Karachi)  
Status: **Implemented and verified; awaiting owner review.** Owner acceptance is not recorded. Phase 3 is unstarted.  
Baseline: `8aebf2135572af36d43bfcd8ad93ef5ed29f59d5` on master. No new commit was created.

## 1. Scope, sources and baseline

Read AGENTS.md, the complete implementation plan/checklist, engineering guide, UI specification, HTML prototype and original SRS before implementation. DOCX ZIP validation/extraction succeeded: 381 non-empty paragraphs, including confirmed Option A, stock-correction and PKR amendments. The unchanged HTML was also rendered for desktop/mobile visual reference.

A clean Git baseline and fresh `npm run test:e2e` passed **2/2** existing tests before code changes. The repaired bundled Chromium revision 1248 was used without changing browser configuration.

The owner's latest instruction authorized the whole bounded Phase 2 delivery. Original guide/specification phase-status text remains a publication-time reconciliation record; the implementation plan/checklist and this report track current progress. No further module is authorized by these results.

## 2. Files created and modified

**30 created files** (24 UI/source files, five test/support files, this report):

- [docs/development/PHASE_2_UI_FOUNDATION.md](../../docs/development/PHASE_2_UI_FOUNDATION.md)
- [web/src/app/admin/dashboard/page.tsx](../../web/src/app/admin/dashboard/page.tsx)
- [web/src/app/admin/layout.tsx](../../web/src/app/admin/layout.tsx)
- [web/src/app/login/page.tsx](../../web/src/app/login/page.tsx)
- [web/src/app/pos/layout.tsx](../../web/src/app/pos/layout.tsx)
- [web/src/app/pos/page.tsx](../../web/src/app/pos/page.tsx)
- [web/src/components/patterns/component-preview.tsx](../../web/src/components/patterns/component-preview.tsx)
- [web/src/components/shell/admin-shell.tsx](../../web/src/components/shell/admin-shell.tsx)
- [web/src/components/shell/connectivity-indicator.tsx](../../web/src/components/shell/connectivity-indicator.tsx)
- [web/src/components/shell/shared.tsx](../../web/src/components/shell/shared.tsx)
- [web/src/components/shell/workspace-shells.tsx](../../web/src/components/shell/workspace-shells.tsx)
- [web/src/components/theme/theme-provider.tsx](../../web/src/components/theme/theme-provider.tsx)
- [web/src/components/theme/theme-selector.tsx](../../web/src/components/theme/theme-selector.tsx)
- [web/src/components/ui/badge.tsx](../../web/src/components/ui/badge.tsx)
- [web/src/components/ui/card.tsx](../../web/src/components/ui/card.tsx)
- [web/src/components/ui/dialog.tsx](../../web/src/components/ui/dialog.tsx)
- [web/src/components/ui/feedback.tsx](../../web/src/components/ui/feedback.tsx)
- [web/src/components/ui/field.tsx](../../web/src/components/ui/field.tsx)
- [web/src/components/ui/icon.tsx](../../web/src/components/ui/icon.tsx)
- [web/src/components/ui/input.tsx](../../web/src/components/ui/input.tsx)
- [web/src/components/ui/select.tsx](../../web/src/components/ui/select.tsx)
- [web/src/components/ui/table.tsx](../../web/src/components/ui/table.tsx)
- [web/src/lib/connectivity.ts](../../web/src/lib/connectivity.ts)
- [web/src/lib/theme.ts](../../web/src/lib/theme.ts)
- [web/src/styles/tokens.css](../../web/src/styles/tokens.css)
- [web/tests/e2e/support/contrast.ts](../../web/tests/e2e/support/contrast.ts)
- [web/tests/e2e/ui-foundation.spec.ts](../../web/tests/e2e/ui-foundation.spec.ts)
- [web/tests/unit/connectivity.test.tsx](../../web/tests/unit/connectivity.test.tsx)
- [web/tests/unit/theme.test.tsx](../../web/tests/unit/theme.test.tsx)
- [web/tests/unit/ui-foundation.test.tsx](../../web/tests/unit/ui-foundation.test.tsx)

**5 modified files:**

- [docs/IMPLEMENTATION_PLAN.md](../../docs/IMPLEMENTATION_PLAN.md)
- [docs/MODULE_CHECKLIST.md](../../docs/MODULE_CHECKLIST.md)
- [web/src/app/globals.css](../../web/src/app/globals.css)
- [web/src/app/layout.tsx](../../web/src/app/layout.tsx)
- [web/src/components/ui/button.tsx](../../web/src/components/ui/button.tsx)

No dependencies were installed or upgraded. Package manifest/lockfile, Playwright configuration, existing foundation unit/browser tests, root/web AGENTS.md, SRS, original UI specification/prototype, both development-guide copies and historical snapshots remain unchanged. The two guide copies still match. The SRS is byte-identical to HEAD (SHA-256 `6bdcbc47ac3f05424e139cdf3c074c0f0e8113b83f356dc597a6c8fadb7a28b6`).

Generated build/test outputs and screenshots remain Git-ignored. Nothing was staged, committed, pushed or deployed.

## 3. Components and routes

| Foundation | Implemented behavior |
| --- | --- |
| Tokens | Approved semantic light/dark palette, system fonts, spacing, typography, numeric figures, radii and subtle dialog shadow; shadcn surface/card/popover/status aliases |
| Buttons | Existing shadcn Slot/CVA setup retained; variants, 44px minimum target, 56px large size, loading/busy, disabled and disabled link behavior |
| Fields | Native labeled input/select, helper/error regions, invalid/disabled states; no product, quantity or money rules |
| Containers | Cards, headings, badges, alerts, skeleton/loading and empty states; named scrollable table region, caption, column headers and cells |
| Dialog / drawer | Controlled native HTML modal, accessible title/description, initial focus, Tab/Shift+Tab containment, Escape, close controls, body-scroll lock and opener focus restoration |
| Shell patterns | Brand, breadcrumbs, skip link, page header, preview notice/footer, desktop sidebar and mobile drawer |
| Themes | Shared provider/selector, early initialization and browser preference store |
| Connectivity | Real local health probe, advisory indicator, retry and four explicit states |
| Component preview | Generic appearance-only dialog in the Admin shell; no saved data or business actions |

The native dialog/select deliberately avoid new Radix or theme packages. They share the existing shadcn/Tailwind tokens and button foundation. Inline SVG icons are local; no icon font or remote asset is fetched.

| Route | Delivered scope |
| --- | --- |
| /login | Shared login shell with theme/status controls and clearly labeled links to mock workspace layouts; no account fields or credential handling |
| /admin/dashboard | Responsive Admin shell/sidebar/header/navigation, generic empty content and reusable-component preview |
| /pos | Minimal Salesperson header/content shell and sale-entry placeholder; no entry form, private fields or submission |
| /api/health | Existing endpoint reused unchanged for advisory liveness |

All three page routes are public prototypes. They provide no authentication/authorization boundary. Product/inventory/sales/report navigation labels are visibly planned, noninteractive placeholders; no broken links or extra business routes were implemented. Original root foundation page remains unchanged.

## 4. Themes and design decisions

- UI-spec canvas/surface/text/green-action/status/focus colors replace the neutral scaffold palette. System fonts, 4/8/12/16/24/32/48px spacing tokens, 240px desktop sidebar, 1440px content maximum and 8/12/16px control/card/dialog radii follow the written design.
- Light/Dark/System selection is stored as presentation-only `pos-theme` in localStorage. It survives client navigation and refresh; storage events synchronize other tabs.
- System is the provisional default, including missing/invalid stored values. OS preference changes apply live only in System mode. Owner review of this presentation fallback remains D12.
- A constant, local head script sets the root class, data attributes and color-scheme before body paint. Provider hydration reads current browser values instead of overwriting the early theme with its neutral server snapshot. Browser tests sample initial frames and check for hydration errors.
- Denied storage falls back safely to System; explicit changes work in memory during the current tab's client navigation. They cannot persist across a full refresh when storage is denied. No credentials, sale intent or private data are stored.
- Contrast-driven deviation: decorative borders retain #D9E1E9 / #394653; a distinct input-outline token uses **#7A8795 light / #8797A7 dark** for visible control boundaries. Actual rendered text/control pairs pass the applicable 4.5:1 or 3:1 checks.
- Screenshot review found inherited center alignment in the generic dialog. Its own left alignment now makes labels independent of the trigger container; the final production build/browser run passed afterward.

## 5. Connectivity behavior

Initial state is Checking. A same-origin `/api/health` fetch uses no-store, a five-second abort deadline, a 30-second visible-tab recheck, retry control, and visibility/online/offline events that trigger a local probe. Superseded requests are aborted and cannot overwrite newer results; timers/listeners clean up on unmount.

| State | Meaning / visible message |
| --- | --- |
| checking | A local probe is pending: “Checking shop server…” |
| connected | Expected local status/service response: “Shop server connected” |
| disconnected | Probe failed/timed out or service returned an unsuccessful status: “Cannot reach shop server” |
| unknown | A successful HTTP response could not be verified as the expected service: “Shop server status unknown” |

navigator.onLine never decides this status. Tests prove local success still displays connected when that browser hint is false. Indicators always explain that connection status does not confirm a transaction. There is no sale outcome lookup, sale submission, offline write queue or false success/failure message in Phase 2. Original request-key recovery remains a later sales requirement.

## 6. Responsive and visual verification

Both Light/Dark modes passed in **desktop Chromium and mobile Chromium** for all three routes:

| Width | Admin arrangement | Login / Salesperson | Result |
| --- | --- | --- | --- |
| 320px | Header and modal navigation drawer | Stacked, wrapping controls | PASS |
| 375px | Header and modal navigation drawer | Stacked | PASS |
| 768px | Tablet header/drawer, two-column secondary content | Responsive centered content | PASS |
| 1024px | 240px desktop sidebar | Responsive centered content | PASS |
| 1440px | Desktop sidebar and spacious content | Centered content | PASS |

Checks cover page overflow, visible navigation, control bounds, 44px targets, contrast and labels. The run generated **64 screenshots**: 60 route/theme/width/project captures plus four dialog captures. Selected desktop/light/dark and narrow mobile screens were visually inspected, including the corrected dialog.

Representative local artifacts (Git-ignored; regenerated by the browser suite):

- [Admin light, 1440px](../../web/test-results/ui-foundation-light-shells-at-1440px-chromium/admin-light-1440.png)
- [Admin dark, 1440px](../../web/test-results/ui-foundation-dark-shells-at-1440px-chromium/admin-dark-1440.png)
- [Login light, 320px mobile](../../web/test-results/ui-foundation-light-shells-at-320px-mobile-chromium/login-light-320.png)
- [Salesperson dark, 375px mobile](../../web/test-results/ui-foundation-dark-shells-at-375px-mobile-chromium/pos-dark-375.png)
- [Shared dialog dark](../../web/test-results/ui-foundation-dialog-label-24241--restoration-in-both-themes-chromium/dialog-dark.png)

## 7. Accessibility verification

**Verified automatically:** accessible labels/descriptions/invalid-field errors; native select behavior; disabled/loading semantics; live advisory status; skip-link/keyboard navigation; visible 3px focus; real-browser dialog/drawer initial focus, Tab/Shift+Tab containment, Escape, close actions and opener restoration; mobile navigation; 44px touch targets; actual rendered normal/large text, placeholder and control-boundary contrast; reduced motion and 200% CSS-scale/reflow access to controls.

The independent contrast helper measures rendered colors and composites alpha against ancestor surfaces. Disabled controls/decorative dividers are not treated as active control-boundary failures. This is scoped verification, not a complete WCAG certification.

Unit dialog tests stub missing jsdom modal APIs only to verify the controlled contract. Real Chromium tests separately verify native modality and keyboard behavior; existing tests were not changed.

**Still requires human review:** NVDA/other assistive technology, native browser/OS zoom on shop devices, other browser engines and final visual acceptance. The automated 200% CSS zoom plus narrower layout checks are evidence of scale/reflow behavior, not a substitute for that device review.

## 8. Commands and results

Commands ran from D:\pos\web using existing Node 24.11.0/npm 11.6.1 dependencies, Next.js 16.4.3, TypeScript 5.9.3, Vitest 5.0.5 and Playwright 1.64.1 / Chromium revision 1248.

| Command | Result |
| --- | --- |
| npm run test:e2e (unchanged baseline) | PASS — 2 tests |
| npm run lint | PASS — zero errors/warnings |
| npm run typecheck | PASS |
| npm test | PASS — 27 tests across 4 files (2 original + 25 new) |
| npm run build | PASS — /, /login, /admin/dashboard, /pos, existing /api/health and framework not-found output |
| npm run test:e2e (final production build) | PASS — 40 tests (2 original + 38 new), desktop/mobile; 1.1 minutes |

Browser scenarios block public requests and fail on unexpected external requests, page exceptions or hydration errors. The three mock routes returned HTTP 200, with no Salesperson private-data fields in rendered server output. Both original foundation tests remain unchanged and pass.

An initial type check reported three TS2352 diagnostics in new browser-only window instrumentation. Its type declaration was corrected; subsequent type checking, build and browser tests passed. The dialog alignment issue found in visual review was corrected and the final build/full browser suite rerun. No failures remain in these automated checks.

Nonblocking runner messages: inherited FORCE_COLOR/NO_COLOR conflict and Vitest jsdom environment performance advice. No dependency or configuration changes were made to suppress them. Sandbox process/patch setup was unavailable, so approved operations used the normal Windows account outside that sandbox; no Windows Administrator elevation was required.

## 9. Limits, deferred work and review

Phase 2 is implemented/verified and awaiting owner review. It is not accepted automatically and must not be used for real shop operations.

No real authentication, sessions, permissions, database/Prisma/Compose, products, inventory mutations, money/profit calculations, sales, reports, transactions or audit writes were implemented. No mandatory cloud service, external font/CDN, deployment or browser-side sales queue was introduced.

**Phase 3 deferred:** complete approved mock login and business screens, product search/selection/forms, inventory/correction previews, POS entry/confirmation flows, report/chart mocks and their screen-specific interactions. Real server roles/data/operations remain Phases 4–8; physical LAN/WAN and recovery drills remain Phase 9.

All five Pending Business Decisions remain unresolved: different-cost receiving, below-cost/zero prices, quantity units/precision, correction scope/date attribution and single-product/basket cardinality. Generic component samples do not choose those policies. Theme fallback/locale/design sign-off (D12) and other retained decisions also remain owner review items.

To inspect locally:

```powershell
Set-Location D:\pos\web
npm run dev
```

Open http://localhost:3000/login, then use the Admin/Salesperson preview links. The Admin placeholder includes “View shared components” for dialog/control review. /admin/dashboard and /pos also open directly. The root URL retains the accepted foundation screen.

Review this phase, its screenshots, theme fallback and accessibility limits before authorizing any further module. No Phase 3 work or Git commit has been made.
