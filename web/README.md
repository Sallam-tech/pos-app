# Shop POS Web

Phase 1 foundation: Next.js App Router, TypeScript, Tailwind CSS, ESLint,
shadcn/ui, Vitest and Playwright. Shared requirements/design/development documents
remain in `../docs/`; follow `../AGENTS.md` before changes. Authentication,
database setup and business modules are deferred.

Use Node.js 24 LTS (verified with 24.11.0) and npm 11 (verified with 11.6.1).
All commands below run inside `web/`:

```powershell
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
`GET /api/health` is a liveness response only; it checks no database or other service.
No environment variables are required. To disable optional Next.js telemetry in
PowerShell, set `$env:NEXT_TELEMETRY_DISABLED = "1"` before starting/building.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run check` runs lint, type checking and unit tests. `npm run test:watch`
starts Vitest in watch mode. Browser tests require a production build first;
Playwright starts/stops its own production server at `127.0.0.1:3100` and tests
desktop/mobile Chromium. They block public network requests and verify page
rendering, bundled CSS, reload and health navigation. Port 3100 must be free.
Alternatively, use an already installed Microsoft Edge without a browser download:
set `$env:PLAYWRIGHT_CHANNEL = "msedge"` before `npm run test:e2e`.

## Local production mode

```powershell
npm run build
npm start
```

For an explicitly shared development LAN preview, use
`npm run dev -- --hostname 0.0.0.0` and the PC's LAN address. Shop HTTPS, firewall,
DNS, deployment and multi-device outage verification belong to later phases.

## Component and test conventions

`@/*` maps to `src/*`. shadcn/ui uses `components.json`, local source in
`src/components/ui/`, a `cn` helper and neutral CSS variables. The starter Button
follows the official New York registry pattern with native link/button semantics.
System fonts avoid build-time font downloads. Light/dark tokens are available;
the approved UI shell and persistent theme selector remain Phase 4 work.

Vitest tests live in `tests/unit/`; browser tests live in `tests/e2e/` and are
excluded from Vitest. Use browser tests for future async Server Components.
Do not place financial or stock logic in UI components.

See [Phase 1 verification](../docs/development/PHASE_1_FOUNDATION.md) for versions,
commands, results, created files and remaining review gates.
