# A01 — Login Page UI Report

Date: 1 November 2026 (Asia/Karachi)  
Status: **Implemented and verified — awaiting owner review.**  
Route: /login · Browser title: **Login | Shop POS**  
Git baseline: 8aebf2135572af36d43bfcd8ad93ef5ed29f59d5. No commit was created.

## Scope and preservation

The current owner instruction authorizes one screen only: A01 Login UI. This maps to the Login portion of UI-5/master Phase 3, without authorizing another screen or implying acceptance of all Phase 2/3 work. The prior [Phase 2 report](PHASE_2_UI_FOUNDATION.md) remains unchanged as its historical delivery record.

Read AGENTS.md/root and web guidance, the original SRS including amendments, Login and shared rules in the UI specification, HTML prototype, engineering guide and implementation plan before editing. The initial SRS console extraction encountered a Unicode encoding error; Unicode-safe extraction then succeeded. No SRS content was guessed or changed. Installed Next.js metadata/client-boundary documentation was consulted.

Git status was inspected first and a SHA-256 inventory recorded for all 74 existing non-ignored project files. Existing uncommitted Phase 2 work was preserved. Admin Dashboard, Salesperson POS, their layouts, global tokens/styles, theme implementation, original documents, package manifest/lockfile and browser configuration were not changed by this task. The two development-guide copies still match.

## Implementation and preview behavior

- Centered, flat Shop POS card, locally bundled inline store icon, consistent labels/spacing, full-width fields and 56px Sign In action.
- Username and masked Password inputs, keyboard-operable Show/Hide control, required-field validation on submit, error summary and linked inline descriptions. Focus moves to the first invalid field.
- Light/Dark/System use the existing provider, token palette and preference persistence; no additional theme store or remote assets.
- Local-server indicator reuses the real existing permission-safe health probe. Its new opt-in compact rendering hides the long advisory caption visually while preserving it for assistive technology. The default presentation on other shells is unchanged.
- UI preview notice explicitly asks for made-up details. The existing Admin/Salesperson shell links remain outside the form, labeled as other public UI previews requiring no sign-in. They do not depend on form submission.
- Nonempty input only starts a **700ms loading-state preview**, labeled “Loading preview only. No sign-in request is sent.” It ends at the same URL with “Sign-in is unavailable in this UI preview” and “No credentials were checked. Nothing was sent or saved.”
- Both entered values are discarded immediately before the loading preview. The password returns to masked mode. No actual identity/password validity, account existence, account-disabled status or successful authentication is simulated.
- No authentication endpoint, credential request, database, cookie/session, role grant or automatic workspace redirect exists. The only validation is UI field presence; no password length/complexity/account policy was invented.
- Inputs have no native serialization names; the fieldset remains disabled in server HTML until the client handler is hydrated. Explicit server-rendered guidance remains visible if JavaScript does not execute. The handler always prevents native submission, guards repeat submits and cleans up its preview timer.
- Browser autocomplete is discouraged for this preview. Password managers can apply their own policies, so the instruction to use made-up values remains visible; no guarantee about third-party password-manager behavior is claimed.

## Files changed in this task

Modified relative to the preserved pre-task working tree:

- [Login page](../../web/src/app/login/page.tsx): replaces only the shared Login placeholder, adds static route metadata and scoped layout.
- [Connectivity indicator](../../web/src/components/shell/connectivity-indicator.tsx): optional compact presentation, default false; probe behavior unchanged.
- [Shared-shell browser tests](../../web/tests/e2e/ui-foundation.spec.ts): skip-link now reaches Username before the existing keyboard Admin-navigation assertion. All other coverage retained.
- [Implementation plan](../IMPLEMENTATION_PLAN.md): records A01-only authorization/status and stop point.
- [Module checklist](../MODULE_CHECKLIST.md): records verified Login work separately from unstarted screens and pending owner acceptance.

Created:

- [Login form](../../web/src/components/login/login-form.tsx).
- [Login unit/component tests](../../web/tests/unit/login-form.test.tsx).
- [Login browser tests](../../web/tests/e2e/login.spec.ts).
- [This report](LOGIN_UI_REPORT.md).

No dependencies were installed or upgraded. Source documents, prior reports, historical copies and existing data were not deleted or overwritten.

## Verification results

All commands ran from D:\pos\web with existing dependencies.

| Command | Final result |
| --- | --- |
| npm run lint | PASS — zero errors/warnings |
| npm run typecheck | PASS |
| npm test | PASS — 36 tests in 5 files (27 existing + 9 Login tests) |
| npm run build | PASS — production output includes the three existing page routes and unchanged health endpoint |
| npm run test:e2e | PASS — 74 tests in 2.0 minutes, 37 desktop Chromium + 37 mobile Chromium (40 existing + 34 Login checks) |

Browser scenarios cover Light/Dark at **320, 375, 768, 1024 and 1440px**; title/branding; aligned full-width fields/button; horizontal overflow; placeholder text bounds; 44px targets; actual rendered text/input-boundary contrast; theme reload/System/live OS behavior; skip link, Tab order and 3px focus; password visibility; required-field focus/descriptions; loading/repeat-submit guard; error focus; no-JavaScript disabled controls; 200% CSS scale/reflow and reduced motion; compact local connectivity/retry. Existing Admin/POS shell regressions also pass.

Public-origin requests are blocked and unexpected external calls/page exceptions/hydration errors fail the browser checks. The loading/error scenario verifies that requests stay GET-only, no authentication endpoint or entered test values occur in URLs/bodies, no credentials appear in browser storage/cookies, and the URL remains /login. Unit tests separately verify no fetch/storage writes, input clearing, duplicate-submit guarding and unmount cleanup.

The final browser run produced 96 ignored screenshots: 64 shared-foundation captures, 20 dedicated Login viewport/theme captures and 12 Login validation/loading/unavailable captures. Selected final captures spanning every requested width, both themes and all feedback states were visually inspected.

Representative artifacts:

- [Light, 320px mobile](../../web/test-results/login-Login-light-at-320px-mobile-chromium/login-light-320.png)
- [Light, 375px](../../web/test-results/login-Login-light-at-375px-chromium/login-light-375.png)
- [Dark, 768px](../../web/test-results/login-Login-dark-at-768px-chromium/login-dark-768.png)
- [Light, 1024px](../../web/test-results/login-Login-light-at-1024px-chromium/login-light-1024.png)
- [Dark, 1440px](../../web/test-results/login-Login-dark-at-1440px-chromium/login-dark-1440.png)
- [Dark, 320px mobile](../../web/test-results/login-Login-dark-at-320px-mobile-chromium/login-dark-320.png)
- [Validation and first-field focus](../../web/test-results/login-Login-validation-and-loading-error-preview-in-light-chromium/login-validation-light.png)
- [Loading preview](../../web/test-results/login-Login-validation-and-loading-error-preview-in-dark-chromium/login-loading-dark.png)
- [Unavailable preview](../../web/test-results/login-Login-validation-and-loading-error-preview-in-dark-chromium/login-unavailable-dark.png)

Screenshots/build outputs are Git-ignored and regenerated by tests, not committed source artifacts.

## Findings corrected before final verification

- Replaced a brittle jsdom timer-count assertion with observable validation behavior. The final 36-test unit suite passes.
- Scoped a new browser alert locator to the Login form because Next.js also adds a route-announcer alert.
- Made disabled/pre-hydration guidance explicit in server-rendered content; the no-JavaScript browser test now passes.
- Visual review found a clipped long password placeholder at 320px and excess outer vertical padding. Shortened both preview placeholders and tightened Login-only layout padding; added placeholder-bound checks. The final screenshots show complete placeholder text, aligned controls and no horizontal overflow.
- The first browser run was 68 passed/6 failed; all six scoped failures above were resolved before the final 74/74 passing production run. No tests were skipped and browser configuration was not changed.

Nonblocking inherited runner output: FORCE_COLOR/NO_COLOR conflict and Vitest jsdom performance advice. Git may report LF/CRLF conversion notices. The sandbox process launcher was unavailable, so authorized commands used the normal Windows account outside it; no Windows Administrator elevation was needed.

## Limits and review stop

This is an appearance/interaction preview, not functional login. Real authentication, server permissions, credential policies, account-disabled/session-expired outcomes and role-based routing remain future Phase 4 work. D11 identity/session/provisioning policies and all other pending business decisions remain open. No further screen is authorized.

Manual assistive-technology testing, native OS/browser zoom on shop devices and engines other than Chromium remain unverified. Automated contrast/keyboard/CSS-scale checks are scoped evidence, not a complete accessibility certification. Local health indication does not prove database readiness, permissions or transaction success.

To review:

```powershell
Set-Location D:\pos\web
npm run dev
```

Open http://localhost:3000/login. Use made-up details to inspect required-field, password visibility and loading/unavailable feedback. Stop for owner review before changing another screen. No Git commit, push or deployment was performed.
