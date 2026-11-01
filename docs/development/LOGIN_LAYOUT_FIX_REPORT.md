# A01 Login — Vertical Layout and Spacing Fix

Date: 1 November 2026 (Asia/Karachi)  
Status: **Implemented and verified — awaiting owner review.**  
Scope: ONE ISSUE AT A TIME, /login vertical layout/spacing only. No commit.

This addendum records the subsequent layout fix to the [Login UI delivery](LOGIN_UI_REPORT.md). It does not authorize another screen or change the pending owner-review status.

## Change and preservation

Changed styling classes in only the Login page and Login form. A comparison with the pre-task versions after removing className values confirms that their text, markup, metadata and form logic are identical. The existing horizontal card padding and maximum width are preserved.

| Vertical spacing | Before | After |
| --- | --- | --- |
| Header padding per side | 16px | 8px |
| Main padding per side | 16px | 8px |
| Card top/bottom padding | 24px phone / 32px wider | 16px |
| Brand-to-heading gap | 32px | 12px |
| Heading-to-introduction gap | 8px | 4px |
| Gap above preview notice | 24px | 12px |
| Preview-notice vertical padding | 12px | 8px |
| Gap above form | 24px | 16px |
| Form group gap | 20px | 12px |
| Gap above server indicator | 24px | 12px |
| Indicator divider padding | 12px | 8px |
| Gap above secondary preview links | 24px | 12px |
| Footer bottom padding | 24px | 12px |

The validation-summary padding and loading/unavailable feedback gaps are also reduced. Compact supporting/error text uses the existing 14px font with 20px line height, following the UI specification. Font sizes, heading sizes, the 8px label/input gap, 44px input/toggle/theme/retry targets and 56px Sign In action are retained.

Main content now uses a column with auto block margins on the horizontally centered container: spare space centers it, while taller content expands the document from the top. No fixed card/form height, max-height, clipping rule or nested scroll area was introduced. Short/zoomed views keep normal document scrolling.

Shop POS branding, all copy, public preview links, compact connectivity component/probe, Light/Dark/System behavior, validation, error associations, focus movement, password toggle, loading/error preview and credential-handling safeguards are unchanged. No role selector or authentication was added.

## Measured improvement

Measured in both Light and Dark Chromium at 1440px width:

| State | Original card height | New card height | Reduction |
| --- | --- | --- | --- |
| Default | 647px | 523px | 124px |
| Both required fields invalid | 797px | 649px | 148px |
| Sign-in-unavailable preview | 773px | 625px | 148px |

At **1440×600**, the default card now runs from y=68 to y=591 and the Sign In action ends at y=509; previously the card ended at y=739 and the action at y=625. The card and controls fit the viewport, while secondary links/footer remain reachable below it.

At **1440×720**, expanded validation now ends at y=717, with Sign In ending at y=635; originally the card ended at y=889 and the action at y=775. At 720/768px laptop heights the current error cards fit. The complete default document fits 720/768px without vertical scrolling.

These are measured results for the installed system fonts/browser, not a promise that arbitrary future error content or enlarged text can fit without scrolling. On a 600px-high view with expanded errors, narrow phones and high zoom, scrolling remains intentional.

## Files changed for this issue

Modified:

- [Login page](../../web/src/app/login/page.tsx): vertical spacing and safe centering classes only.
- [Login form](../../web/src/components/login/login-form.tsx): form/feedback spacing classes only.

Created:

- [Login layout browser tests](../../web/tests/e2e/login-layout.spec.ts).
- [This report](LOGIN_LAYOUT_FIX_REPORT.md).

All 76 other pre-existing project files are byte-identical to the initial 78-file inventory. This includes the SRS, both matching development guides, UI specification/prototype, AGENTS files, implementation plan/checklist, prior reports, Admin/POS pages/layouts, shared components/tokens/themes, package files, configuration and existing tests. No dependencies were installed or upgraded.

## Verification

Commands ran from D:\pos\web with existing dependencies:

| Check | Final result |
| --- | --- |
| npm run lint | PASS |
| npm run typecheck | PASS |
| npm test | PASS — 36 tests across 5 files |
| npm run build | PASS |
| npm run test:e2e | PASS — 98 tests in 4.1 minutes, desktop and mobile Chromium |

The new layout matrix covers **320, 375, 768, 1024 and 1440px widths × 600, 720 and 768px heights × Light/Dark × default, both-field validation and unavailable-error states × two browser projects**: 180 measured state combinations. It checks centering, no horizontal overflow, no clipped/nested-scroll ancestors, laptop fit where space permits, unchanged control sizes, actual rendered contrast and full document-scroll reachability for errors, controls, branding and footer.

Four additional theme/device checks cover 200% CSS scaling at 640×600 (a 320px-wide effective layout), reduced motion, Tab/Enter/Space form operation, password visibility, invalid/error focus, unobscured focused feedback, scroll-to-bottom/top and unchanged /login pathname. Existing tests separately verify System theme changes/persistence, normal keyboard/focus, loading/error behavior, no-JavaScript safeguards and no credential requests/storage. All existing foundation/Admin/POS regressions also pass.

Initial verification corrected a missing measurement-row type in the new test, allowed the legitimate skip-link URL fragment, and replaced unreliable browser Home/End-shortcut assumptions with direct document-scroll/reachability checks. Full-page zoom screenshots are captured from the document top to avoid stitching off-screen fixed elements into the image. No application behavior or browser configuration was changed to satisfy these corrections.

Selected actual screenshots were inspected before and after the fix across every requested width, both themes, laptop heights, expanded errors and zoom. No further vertical alignment/spacing issue was found.

### Screenshot evidence

- [Light validation, 1440×720](../../web/test-results/login-layout-Login-vertical-layout-light-at-1440px-chromium/login-light-1440x720-validation.png)
- [Dark default, 1440×600](../../web/test-results/login-layout-Login-vertical-layout-dark-at-1440px-chromium/login-dark-1440x600-idle.png)
- [Dark validation, 1024×720](../../web/test-results/login-layout-Login-vertical-layout-dark-at-1024px-chromium/login-dark-1024x720-validation.png)
- [Light default, 768×768](../../web/test-results/login-layout-Login-vertical-layout-light-at-768px-chromium/login-light-768x768-idle.png)
- [Light unavailable error, 375×720](../../web/test-results/login-layout-Login-vertical-layout-light-at-375px-chromium/login-light-375x720-unavailable.png)
- [Light validation, 320×600, full scrollable page](../../web/test-results/login-layout-Login-vertical-layout-light-at-320px-chromium/login-light-320x600-validation-full.png)
- [Dark 200% full page](../../web/test-results/login-layout-Login-vertica-f0662-oard-at-200-percent-in-dark-chromium/login-dark-200-percent-full.png)
- [Dark 200% focused error viewport](../../web/test-results/login-layout-Login-vertica-f0662-oard-at-200-percent-in-dark-chromium/login-dark-200-percent-error-viewport.png)
- [Measured layout data](../../web/test-results/login-layout-Login-vertical-layout-light-at-1440px-chromium/layout-measurements.json)

Artifacts are Git-ignored and regenerated by Playwright.

## Limits and stop point

At constrained heights or zoom, supporting links/footer and expanded content may require scrolling; this is deliberate. Native single-line inputs may crop long text/placeholders at narrow/high-zoom sizes; labels, actions and required messages remain accessible. This issue changes vertical spacing only and preserves horizontal padding.

CSS-scale/reflow automation is not native OS/browser zoom or a manual assistive-technology certification. Those device checks and other browser engines remain owner/device review items. Real authentication remains absent, as in the accepted UI scope.

Git HEAD remains 8aebf2135572af36d43bfcd8ad93ef5ed29f59d5. All changes remain unstaged; no reset, commit, push, deployment or other screen work occurred. Existing documents/data remain intact.

Nonblocking inherited messages: FORCE_COLOR/NO_COLOR conflict, Vitest jsdom performance advice and Git LF/CRLF notices. The sandbox process launcher was unavailable; authorized operations used the normal Windows account, without Windows Administrator elevation.

Stop here for owner review of this single layout issue.

