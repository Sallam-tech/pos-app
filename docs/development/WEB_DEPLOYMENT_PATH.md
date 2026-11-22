# Web deployment path (design note, nothing built)

Status: **planning only.** The product ships as the Windows desktop EXE. This note records what a future web edition
would need, so that today's work does not close the door. Requested by the owner on 19 Nov 2026.

## What is already portable

The business services in `web/src/server/{inventory,sales,returns,expenses,invoices,cash,reports}` depend only on the
`AuthorizationGateway` / `AuthorizedTransaction` interfaces and the SQL layer. They import nothing from
`bootstrap/`, `desktop/`, `backup/` or `hosting/` and never spawn a process.
`web/tests/unit/server-boundaries.test.ts` enforces this, so the boundary cannot drift silently.
The UI talks to the server with plain same-origin `fetch` to `/api/*` (no Server Actions), which any host can serve.

## What is desktop-only today (would be replaced, not reused)

| Concern | Today | Where |
| --- | --- | --- |
| Runtime admission | win32 + x64 + Node 24.x only | `db/connection.ts` (`openDatabase`), `hosting/runtime-policy.ts`, `bootstrap/windows.ts` |
| Secrets / key custody | Windows DPAPI through inbox PowerShell | `desktop/operation-keys*`, `desktop/tls*`, `backup/storage*`, `bootstrap/windows-*.ps1` |
| Hosting | custom HTTPS server on loopback, two fixed role origins | `hosting/runtime.ts`, `hosting/https.ts` |
| Auth origins | per-role cookie hosts (`localhost` / `127.0.0.1`) | `auth/*`, `hosting/https.ts` |
| Backup | local encrypted archives, USB export | `backup/*`, `bootstrap/portable-origin41.ts` |
| Database | one SQLite file, single owner process (`acquireRuntimeOwnership`) | `hosting/ownership`, `auth/database.ts` |

## Work a web edition would require (each needs its own owner approval)

1. A second host adapter (`platform/web`): normal HTTPS from a reverse proxy, cookie sessions with one origin, secrets
   from the platform secret store instead of DPAPI.
2. A database decision. SQLite with one writer works for one shop; multi-shop or hosted use means PostgreSQL. Kysely is the
   query layer, but the services use SQLite-specific SQL, triggers and `pragma` checks, so this is a port, not a switch.
3. A backup/restore design that does not rely on local USB custody (for example Supabase encrypted storage, which is
   already planned for the desktop edition).
4. Re-running the security review: the desktop threat model (local Windows user, DPAPI, loopback) does not carry over.

## Rule for current work

Keep new business logic inside the portable service folders and keep Windows-specific code out of them.
Do not add win32/Node-24 checks to services; they belong in the host/runtime layer.
