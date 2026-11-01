# Phase 1 — Project Foundation

Date: 1 November 2026 (Asia/Karachi). **Status: Phase 1 implemented and verified; awaiting owner review.**

## Authorized scope

The owner explicitly authorized the Next.js foundation in `web/` while keeping
documentation in the repository root. This narrows the original Phase 1 plan:
no PostgreSQL/Prisma/Compose, authentication, products, sales or reports. The four
empty source documents remain unresolved; no business requirements or approved
visual fidelity are claimed. Stop after verification for owner review.

## Structure and files

- Root `.gitignore`: local secrets, dependencies and generated-output exclusions.
- `web/package.json`, `web/package-lock.json`, `web/.npmrc`, `web/.node-version`:
  exact direct dependency versions, npm lockfile and Node/npm/tool scripts.
- `web/next.config.ts`, `web/tsconfig.json`, `web/eslint.config.mjs`,
  generated `web/next-env.d.ts`, `web/.gitignore`: framework/build/type/lint settings.
- `web/AGENTS.md`: framework-generated Next.js instructions added on first dev
  startup; root `AGENTS.md` remains unchanged and governs project scope.
- `web/components.json`, `web/src/lib/utils.ts`,
  `web/src/components/ui/button.tsx`: shadcn/ui configuration and local primitive.
- `web/src/app/{layout.tsx,page.tsx,globals.css,favicon.ico}`:
  foundation page, application metadata, local system fonts and semantic CSS.
- `web/src/app/api/health/route.ts`: liveness JSON only.
- `web/vitest.config.mts`, `web/tests/setup.ts`,
  `web/tests/unit/foundation.test.tsx`: starter React unit-test harness.
- `web/playwright.config.ts`, `web/tests/e2e/foundation.spec.ts`:
  production-server smoke with desktop/mobile Chromium and external requests blocked.
- `web/README.md`: local startup and verification instructions.
- `web/THIRD_PARTY_NOTICES.md`: provenance and upstream license reference for
  the local shadcn/ui source.
- Scaffold assets under `web/public/` are bundled locally and unused by the starter.
- Updated `docs/IMPLEMENTATION_PLAN.md` and `docs/MODULE_CHECKLIST.md` for the
  authorized directory layout, narrowed Phase 1 and review state.

Generated/ignored: `web/node_modules/`, `web/.next/`, TypeScript build metadata,
Playwright traces/screenshots/reports and test-results. No Git repository or commit
was created; the scaffold was explicitly run with `--disable-git`.

## Tooling approach

The app was created with the official Next.js scaffold. shadcn/ui is configured
manually with local component source, following the
[manual setup](https://ui.shadcn.com/docs/installation/manual) and
[New York Button registry](https://ui.shadcn.com/r/styles/new-york/button.json).
No global shadcn CLI or cloud service is needed. Neutral token scaffolding is not
an approved final UI or completed theme-selection module.

The test configuration follows the
[Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest) and
[Playwright configuration guide](https://playwright.dev/docs/test-configuration).
Node.js 24.11.0 and npm 11.6.1 were available; no global tool upgrade was performed.

## Commands and results

The initial registry lookup failed under the sandbox with EACCES and was repeated
with approved network access. The official scaffold's package install stalled
after most downloads and was interrupted. Resuming installed the dependencies,
but checks found a truncated SWC binary (106,931,680 bytes versus a required PE
section end at 110,271,488 bytes) and missing optional native bindings. Retrying
checks outside the sandbox confirmed that package integrity, not just permissions,
needed repair. After restoring optional dependency entries, `npm ci` reinstalled
only the generated `web/node_modules` directory from the lockfile. The resolved
target was checked as `D:\pos\web\node_modules` first. No source/document/data
directory was deleted, and no manual binary modification was used.

Final checks passed after repair; initial failed attempts are recorded here rather
than treated as passing verification. The development server initially failed a
generated-file rename under the sandbox; restarting the same command with approved
execution outside the sandbox resolved that EPERM error. Production build and
browser-server checks also used approved execution outside the sandbox.

Setup commands (PowerShell, root unless noted):

```powershell
node --version
npm --version
git --version
npm view create-next-app version --fetch-timeout=20000 --fetch-retries=0
npx --yes create-next-app@16.4.3 web --typescript --tailwind --eslint --app --src-dir --import-alias '@/*' --use-npm --disable-git --yes
npm view shadcn version --fetch-timeout=20000 --fetch-retries=0
cd web
npm install --save-exact class-variance-authority clsx tailwind-merge @radix-ui/react-slot tw-animate-css --no-audit --no-fund --fetch-timeout=60000 --fetch-retries=1
npm install --save-dev --save-exact vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @playwright/test @types/node@24 --no-audit --no-fund --fetch-timeout=60000 --fetch-retries=1
npm view eslint-plugin-react@latest peerDependencies --json --fetch-timeout=20000 --fetch-retries=0
npm install --include=optional --no-audit --no-fund --fetch-timeout=60000 --fetch-retries=1
npm ci --include=optional --no-audit --no-fund --fetch-timeout=60000 --fetch-retries=1
```

Additional read-only commands inspected files, package metadata, native binary
headers and source hashes. A local Node script pinned scaffold versions and
added npm scripts/engine requirements. The shadcn version lookup was informational;
configuration/components were added manually, not via that CLI.

## Installed direct dependency versions

| Runtime | Version | Development | Version |
| --- | --- | --- | --- |
| next | 16.4.3 | eslint-config-next | 16.4.3 |
| react | 19.3.0 | eslint | 9.39.5 |
| react-dom | 19.3.0 | typescript | 5.9.3 |
| @radix-ui/react-slot | 1.5.0 | tailwindcss | 4.3.3 |
| class-variance-authority | 0.7.1 | @tailwindcss/turbopack | 4.3.3 |
| clsx | 2.1.1 | vitest | 5.0.5 |
| tailwind-merge | 3.7.0 | @vitejs/plugin-react | 6.1.2 |
| tw-animate-css | 1.4.0 | jsdom | 29.1.1 |
| | | @testing-library/react | 16.3.3 |
| | | @testing-library/dom | 10.4.2 |
| | | @testing-library/jest-dom | 7.0.1 |
| | | @playwright/test | 1.64.1 |
| | | @types/node | 24.19.2 |
| | | @types/react | 19.3.0 |
| | | @types/react-dom | 19.3.0 |

All direct versions are exact and transitive versions are locked. The scaffold's
ESLint 9.39.5 emits an upstream deprecation notice. The current React ESLint
plugin declares support through ESLint 9, so the compatible scaffold version is
retained rather than forcing an unsupported ESLint 10 override. Track its upgrade
when the Next.js lint plugin chain supports it. No dependency audit result is
claimed by the install commands above (`--no-audit` was used during setup).

`npm ls --depth=0` exited 0 with the versions above. It also lists automatically
installed optional Sharp WASM support (`@img/sharp-wasm32@0.35.5` and
`@emnapi/runtime@1.11.3`) as extraneous; these are generated install artifacts,
not application imports or direct manifest dependencies. The lockfile reinstall
and native-binding probes succeeded. No database/auth/business dependencies were added.

## Final verification results

| Command / check | Final result |
| --- | --- |
| `npm ci --include=optional ...` | Exit 0; 550 packages installed from the lockfile. |
| Native `require` probes for SWC and Rolldown | Both load successfully after reinstall. |
| `npm run lint` | Exit 0; no warnings/errors under `--max-warnings=0`. |
| `npm run typecheck` | Exit 0; Next route types generated and `tsc --noEmit` passed. |
| `npm test` | Exit 0; one test file, two tests passed (25.16s). |
| `npm run dev -- --hostname 127.0.0.1 --port 3200` | Ready; page and health endpoint both HTTP 200. Health body matches `{status: "ok", service: "pos-web"}`; page heading present. Server stopped after check. |
| `npm run build` | Exit 0; optimized build compiled in 7.6s; built-in TypeScript passed in 6.9s; static page generation and optimization completed. |
| `npm run test:e2e` with `PLAYWRIGHT_CHANNEL=msedge` | Exit 0; two tests passed in 11.7s: desktop and mobile Chromium using installed headless Microsoft Edge. Temporary production server managed/stopped by Playwright. |

Build routes: `/` and `/_not-found` static; `/api/health` dynamic. There are no
authentication, database or business routes. The browser tests assert HTTP 200,
title/heading, the health link and JSON, loaded Tailwind/shadcn display styles,
no horizontal overflow, successful reload, zero public requests and zero browser
runtime errors. They demonstrate starter asset independence from public requests,
not a physical shop WAN/LAN outage acceptance test.

Verification commands (inside `web/`):

```powershell
npm ls --depth=0
node -e "require('@next/swc-win32-x64-msvc'); require('@rolldown/binding-win32-x64-msvc'); console.log('Native compiler and test bindings load successfully')"
npm run lint
$env:NEXT_TELEMETRY_DISABLED = '1'
npm run typecheck
npm test
npm run dev -- --hostname 127.0.0.1 --port 3200
# In a second terminal while dev is running:
Invoke-WebRequest -Uri 'http://127.0.0.1:3200/api/health' -UseBasicParsing
Invoke-WebRequest -Uri 'http://127.0.0.1:3200/' -UseBasicParsing
# Stop the dev process, then:
npm run build
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

The actual HTTP smoke command additionally asserted status codes, JSON output and
the page heading. No extra browser was installed: the existing Microsoft Edge was
used through Playwright. On a machine without Edge, the configured default uses
Chromium after `npx playwright install chromium`; that alternative download command
is documented but was not executed here. Shell color-variable warnings from the
browser runner were informational; the runner exited successfully.

## Start locally

From the repository root:

```powershell
cd D:\pos\web
npm ci
npm run dev
```

Open `http://localhost:3000`. For local production mode, stop dev, run
`npm run build`, then `npm start`. No database, credentials or environment file is
required for this foundation. Both verification servers have been stopped.

## Preservation and review

Original root `AGENTS.md`, populated root guide and all four requested source
documents retain their original SHA-256 hashes. The four requested SRS/guide/design
files remain empty; the foundation authorization does not resolve those gaps.
The implementation plan and checklist now reflect `web/`, deferred database work
and Phase 1 review readiness. No deployment, Git initialization/commit or next
module implementation was performed.

Final document checks passed: matching phase order and requirement/decision IDs,
well-formed Markdown tables/fences, manifest/lockfile direct-version agreement and
no authentication/database dependencies. Local TCP probes confirmed both QA ports
(3100 production and 3200 development) no longer accept connections.

## Remaining limits

This phase verifies only the application foundation. Full SRS/design reconciliation,
real WAN/LAN multi-device drills, database/authentication/security/business checks,
and deployment are not Phase 1 acceptance claims. Owner review is required before
the next module. Original SRS/design/guide files must remain unchanged.
