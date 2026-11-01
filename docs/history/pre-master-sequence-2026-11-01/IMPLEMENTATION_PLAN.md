# POS Implementation Plan

Prepared: 1 November 2026 (Asia/Karachi). **Status: Phase 1 foundation authorized; business requirements and approved UI remain provisional.**

Current authorization: the owner requested Phase 1 only, with the application in `web/`, shared documentation at the repository root, and no authentication, database, product, sales or reporting implementation. This supersedes the original P00 prerequisite for foundation work and the original P01 database scope. It does not accept P00 or authorize subsequent phases/deployment.

## 1. Source availability and authority

All five requested paths were inspected. Four are empty:

| Requested source | Finding | Planning consequence |
| --- | --- | --- |
| `AGENTS.md` | Read successfully; 2,437 bytes | Binding project instructions and stack available. |
| `docs/requirements/Software Requirements Specification.docx` | 0 bytes | No valid Word content to extract; SRS clauses and amendments cannot be reviewed. |
| `docs/development/POS_Complete_Development_Guide.md` | 0 bytes | Designated development guide unavailable. |
| `docs/design/POS_UI_UX_Prototype_Design_Plan.md` | 0 bytes | Approved UI specifications unavailable. |
| `docs/design/POS_UI_Prototype.html` | 0 bytes | No visual reference to inspect or match. |

A populated `POS_Complete_Development_Guide.md` exists at the project root (64,391 bytes; 1,009 lines) and was read in full. It identifies itself as version 1.0, prepared 31 October 2026, and claims derivation from the SRS and amendments. It is provisional supporting evidence, not a substitute for the unread authoritative SRS. It has not been copied over the empty designated guide. `D:\pos` is not currently a Git repository.

Evidence labels below: **A** = explicit AGENTS.md requirement; **G** = populated root guide, pending SRS reconciliation; **U** = this user request; **P** = proposal. These planning IDs are not SRS clause numbers. This plan covers the requirements discoverable from available evidence. Complete SRS coverage, confirmed exclusions and approved visual fidelity remain unverified. P00 must restore/read the missing sources and map actual SRS clauses before business/schema implementation; the owner has separately authorized the limited foundation work.

The initial task created only this plan and `MODULE_CHECKLIST.md`. The subsequent Phase 1 request authorizes foundation dependencies/configuration, a starter page and tests under `web/`, and updates to planning/development records. No business feature, database setup, migration or deployment is authorized.

## 2. Functional requirement inventory

| ID | Required/proposed capability | Evidence | Phase |
| --- | --- | --- | --- |
| F01 | Local login/logout, Admin and Salesperson roles, server-enforced access | A/G | P03 |
| F02 | Secure initial Admin creation; Admin creates/disables staff and resets credentials locally | G/P | P03, P03U |
| F03 | Product creation/edit/search/archive; optional categories/SKU; cost, opening quantity and threshold | G; cost rule A | P05 |
| F04 | Opening stock and subsequent stock changes backed by a reconcilable movement ledger | G/P | P02, P05 onward |
| F05 | Incoming stock: existing product, quantity, entered purchase cost, receipt date, actor/reference and history | G | P07 |
| F06 | Admin current purchase-cost change applies to all remaining units; old sale costs/profits preserved | A | P06 |
| F07 | Admin physical stock corrections, before/after, reason, actor and timestamp | A/G | P08 |
| F08 | Admin stock overview, movement history, reconciliation and low-stock warnings at/below threshold | G | P08 |
| F09 | Salesperson selects product by name, quantity and flexible selling unit price in PKR | G; exact PKR A | P09 |
| F10 | Sale atomically deducts stock, captures cost, computes revenue/profit and records employee/time | A/G | P09 |
| F11 | Prevent overselling and duplicate sales under simultaneous requests/retries | A | P02, P09 |
| F12 | Salespersons never receive stock quantities, purchase costs or profit through screens/payloads/errors | A | Every module |
| F13 | Admin searchable sales history, date/product/reference filters and details | G | P10 |
| F14 | Admin corrections atomically update inventory/economics and preserve originals/revisions | A/G | P11 |
| F15 | Daily/monthly/custom/product reports: revenue, gross profit, units, distinct products and best sellers | G | P12 |
| F16 | Product detail: current stock/cost, historical sales, receipts, movements, cost and correction history | G | P13 |
| F17 | Dashboard: product/stock/low-stock counts, recent receipts, today/month revenue/profit, trends/comparison | G | P14 |
| F18 | Responsive Admin workspace and focused POS; accessible validation, feedback, search/pagination | G/P | P04 onward |
| F19 | Light/dark UI across screens, forms, dialogs, tables and charts | U/P | P04 onward |
| F20 | Core operations with WAN unavailable and local server/LAN operational; no mandatory cloud | A | P01 onward, P16 |
| F21 | Encrypted backups, verified restore, local monitoring and operational handover | G/P | P15, P16 |
| F22 | Audited business/security events and controlled migrations | A/G/P | P02 onward |

The root guide describes barcode scanning, expenses, customer management and multiple branches as V1 exclusions. Exclusions require verification against the restored SRS. Optional/unconfirmed: report exports, category/SKU rules, taxes, discounts, payments, cash drawer, receipt printing, returns/refunds and baskets. None is silently included. Proposed profit means **gross trading profit**, not business net profit.

## 3. Non-functional requirements

| ID | Requirement | Acceptance / measurement |
| --- | --- | --- |
| N01 | Exact PKR and historical/stock integrity (A) | Decimal arithmetic and DB constraints; rollback/concurrency/reprice fixtures; no floating-point financial calculations. |
| N02 | Server validation and role confidentiality (A) | Direct page/action/API tests; inspect HTML, React server payloads, JSON, errors and caches. Navigation hiding is insufficient. |
| N03 | Safe retries and partial failure (A/P) | Duplicate keys, key/payload mismatch, concurrent retries, response loss and interrupted transactions produce at most one effect. |
| N04 | Internet independence (A) | Disable WAN before fresh login/reload; core workflows work across two LAN devices with local assets. |
| N05 | Durability/recoverability (G/P) | Committed data survives restart; isolated restore reconciles. Owner chooses RPO, RTO and retention before release. |
| N06 | Responsive/accessibility/theme quality (G/U/P) | Proposed WCAG 2.2 AA target; keyboard, focus, labels, announced outcomes and contrast in both themes at 360px phone, tablet and desktop sizes. |
| N07 | Performance/capacity (P) | Proposed starting benchmark: 10,000 products, 1,000,000 sales, five active terminals; p95 LAN search/commit <=1s and reports <=3s on agreed hardware. Owner must confirm targets. |
| N08 | Maintainability/testability (A/G) | Strict TypeScript, separate services, versioned migrations, relevant Vitest/PostgreSQL/Playwright checks and production build. |
| N09 | Local security (G/P) | HTTPS, secure sessions, local recovery, no public signup, active-account checks, rate limits, origin/CSRF validation, secret-safe logs and private DB. |
| N10 | Auditability (A/G/P) | Actor, server time, request reference, reason and before/after values; append-only application history; no silent repairs/history deletion. |
| N11 | Local availability/timekeeping (A/G/P) | Stable DNS/IP, UPS for server/router, health/restart checks and accurate local time; UTC storage and agreed Karachi report boundaries. |

Numerical performance/accessibility targets and recovery objectives are proposals, not verified SRS promises. Offline runtime does not require offline development: dependencies/images may be prepared during an approved setup phase; installed production operation and recovery must use local artifacts.

## 4. Stack review and application architecture

Retain the mandated stack. Propose a modular monolith on one shop-local server and a single PostgreSQL primary; all stock-related consistency belongs in that database.

| Technology | Responsibility / condition |
| --- | --- |
| Next.js App Router + TypeScript | Node server, authenticated pages/actions/route handlers. Static export cannot supply this backend. Authorize every entry point. |
| Tailwind + shadcn/ui | Local component source and semantic themes; adopt approved prototype once restored. |
| PostgreSQL + Prisma | Transactions, constraints, row locks, exact money and migrations; reviewed parameterized SQL where locking requires it. |
| Better Auth | Local credentials and DB-backed sessions; generate auth models for selected configuration. |
| Zod + React Hook Form | Shared form contracts; independent server parsing remains mandatory. |
| Recharts | Admin charts with accessible tables; chart coordinates never determine financial totals. |
| Vitest + Playwright | Unit/domain, real PostgreSQL integration and browser acceptance. Mocks/SQLite cannot verify PostgreSQL locks. |
| Docker Compose | Local app/DB/proxy, persistent volumes, health/restart configuration. Deployment needs separate approval. |
| Caddy (guide proposal) | Local HTTPS/internal CA and device trust; no public certificate dependency. |

Official references inspected on 1 November 2026: Next.js documents self-hosting and recommends a reverse proxy ([self-hosting](https://nextjs.org/docs/app/guides/self-hosting)). Better Auth's adapter guide uses Prisma 7/PostgreSQL; propose that documented integration as the starting point ([adapter guide](https://better-auth.com/docs/adapters/prisma)). Verify installation/import paths together for the chosen releases. Prisma 7 has a separate transaction API; the general documentation describes changed Prisma 8 APIs ([Prisma 7 transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions), [general transactions](https://www.prisma.io/docs/orm/fundamentals/transactions)). Do not mix generations. Exact Node/React/Next.js, Prisma CLI/client/driver, Better Auth, PostgreSQL and test versions remain unpinned until compatibility checks in the authorized foundation phase. No runtime compatibility was tested here.

```text
Admin / Salesperson browsers
           | local DNS + LAN HTTPS
      Caddy reverse proxy
           | private Docker network
      Next.js server
           | session -> permission -> validation -> service -> repository
      PostgreSQL primary
           | scheduled backup process
      Encrypted separate physical backup storage
```

Repository structure: shared documentation and `AGENTS.md` remain in `D:\pos`; the Next.js project, npm manifest/lockfile and app tooling live in `D:\pos\web`. Application commands run from `web/` (or use `npm --prefix web ...` from the root). No nested repository is created by the scaffold.

```text
pos/
  AGENTS.md
  docs/                         shared requirements, plans, design and verification
  POS_Complete_Development_Guide.md
  web/
    package.json
    package-lock.json
    components.json             shadcn/ui configuration
    src/app/                    App Router and foundation page
    src/components/ui/          local shadcn/ui source
    src/lib/                    shared helpers
    tests/                      unit and browser smoke tests
    public/                     bundled local assets
    next.config.ts
    eslint.config.mjs
    tsconfig.json
    vitest.config.mts
    playwright.config.ts
```

Later proposals (not Phase 1): `web/src/features/{auth,users,products,inventory,sales,reports,dashboard}`, `web/src/lib/{db,security,money,time}`, `web/prisma/migrations` and integration tests. Production Docker/backup files will be located explicitly in P15 while preserving root documentation. Route groups do not confer permissions.

UI renders role-specific DTOs. Server actions/handlers validate session, permissions and input, then call services. Domain services own calculations, idempotency and transaction boundaries. Repositories/helpers use the caller's transaction client. No financial logic in components, nested independent writes or remote calls inside transactions. Dashboard/reports share definitions. Confidential data must not enter shared response caches or service-worker caches; verify logout/back-navigation and role changes do not reveal prior private data.

## 5. Proposed database architecture

This is a logical design, not a final Prisma schema. Quantity, basket, receipt-cost and correction decisions in section 9 must precede final migrations. Single-product Sale is the root guide's proposal; approved baskets require a Sale header and SaleItem records before schema approval.

| Entity | Data and relations | Integrity / access |
| --- | --- | --- |
| Auth User/Session/Account/Verification | Provider-generated tables; role and active state on user | Unique normalized login; local credentials; disable/revoke sessions instead of deleting referenced staff. |
| Category (conditional) | Name, active state; one-to-many products | Optional scope and naming policy await approval. |
| Product | Name, optional category/SKU, current cost, balance, threshold, archive time, version | Finite nonnegative cost/stock/threshold; Admin private fields; unique SKU if approved. |
| StockReceipt | Product, positive units, entered cost, occurrence date, recorded time, actor/reference | Immutable receipt cost is distinct from current product cost. |
| PurchaseCostChange | Product, before/after cost, actor/reason/time | Immutable; link to receipt if coupled operation approved; no quantity movement. |
| StockAdjustment | Product, before/after quantity, delta, actor/reason/version | Idempotent count correction; expected version rejects stale forms. |
| Sale | Product, quantity, selling unit price, original cost snapshot, amount/profit, actor, original timestamp, revision | Exact money; never derive old profit from current product cost. |
| SaleCorrection | Sale, prior/new revision, before/after snapshots, actor/reason/time | Unique sale/revision; initial revision and every subsequent change retained. |
| StockMovement | Product, signed delta, balance after, ordered event/source reference, actor/time | Append-only opening/receipt/sale/correction/count events; no movement for price-only correction. |
| OperationRequest (P) | Operation/key, actor, normalized payload hash, committed result reference | Unique operation/key; atomic with business write; authorized replay and mismatch rejection. |
| AuditLog | Action/entity, actor/server time, request reference, before/after and reason | Admin-only append-only history; excludes passwords/tokens; business audits commit with state. |

Product has many sales/receipts/movements/cost changes/adjustments; Sale has many corrections; User is actor for business events. OperationRequest links its committed result. Ledger sources use typed foreign keys and exactly-one-source checks where applicable, rather than orphan-prone generic string IDs. Generic entity labels are acceptable for audit search, not as the only enforcement of ledger integrity.

### 5.1 Money, quantities and time

- Proposed money: PostgreSQL `NUMERIC(18,2)` / Prisma Decimal. PostgreSQL recommends exact numeric for money ([numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html)). Accept decimal strings; reject excess precision, non-finite values, overflow and excessive amount/quantity products. DTOs serialize decimal strings, not binary floating-point calculations.
- Revenue = quantity x unit selling price; gross profit = quantity x (selling price - original cost snapshot). Negative profit may be valid under approved below-cost policy. Fractional quantities/taxes require an explicit rounding policy before implementation.
- Proposed quantities are bounded whole-number integers. Weighted/fractional stock requires approved unit precision and money rounding before migration.
- Store server timestamps as UTC/timestamptz. Keep receipt occurrence date separately from server recording time. Proposed report boundaries are Asia/Karachi half-open `[start,nextStart)` intervals. Backdated receipt entry must not silently rewrite prior inventory/cost history.
- Preserve sale revision 1 and all corrections; the current Sale is an atomically updated latest-state projection. Repricing cannot change historical sales. Authorized audited corrections may change effective quantity/revenue/profit according to an approved policy.

### 5.2 Constraints, indexing and migration discipline

Use primary/foreign keys, restricted deletion for business history, positive sale/receipt quantities, nonnegative stock/cost/threshold, finite bounded decimals, valid roles/types, unique operation keys and unique source/revision links. Row-local checks enforce stored revenue/profit formulas where possible; services enforce cross-row workflow/ledger invariants. Add reviewed SQL where Prisma cannot express constraints. Application credentials cannot update/delete immutable event tables; migration credentials remain separate. This is application audit protection, not protection against an unrestricted DB administrator.

Indexes: product name/search and active/archive; sale `(createdAt,id)`, `(productId,createdAt,id)`; movements `(productId,eventSequence)`; receipts product/occurrence time; cost history product/recorded time; audit entity/time and actor/time; unique key/revision lookups. Per-product sequence/version orders events sharing timestamps. Add specialized search indexes only after query-plan evidence.

Reconciliation: `SUM(all signed movements including OPENING) = stockOnHand`; do not count opening stock twice. Balances are controlled projections. A read-only diagnostic flags mismatches; repairs require reviewed audit entries. Test migrations on an empty DB and representative prior schema/data. No production schema push, destructive reset or unreviewed DB major-version switch. Production migrations require verified backup and explicit approval.

### 5.3 Transaction protocols

1. **Sale:** authenticate/validate; claim/check operation key; conditionally deduct enough stock on an active product, locking the same row repricing uses; capture cost from that serialized state; write sale/original revision, movement, audit and committed request result atomically. Commit before success; failure rolls back everything.
2. **Retry:** unique-key conflicts resolve to the original committed result after rollback/wait; first verify actor authorization and matching payload hash. Concurrent same-key requests must return the same success even when the first consumed the last unit. Use bounded whole-transaction retries for deadlocks/serialization failures. Extend idempotency to receipts, count changes, repricing and corrections.
3. **Reprice:** lock product, update one current cost/version and append before/after history/audit; never update sale snapshots. A parallel sale uses either valid before or after cost according to transaction order.
4. **Receipt/count:** lock product, validate policy/version, update quantity and receipt/adjustment plus movement/audit/request result atomically. Expected version protects physical-count forms made stale by a sale.
5. **Sale correction:** lock sale/product using a documented lock order; check expected revision; `stockDelta = oldQuantity - newQuantity`; prevent overselling when quantity increases; calculate with the original cost; append correction/movement if needed/audit and update projection atomically. Price-only correction has no movement. Test races with receipts, repricing, sales and physical counts.

If operations later touch multiple products, lock them in deterministic order. Keep transactions short and pass their client through every helper. No network timeout or DB error can be converted into optimistic success.

## 6. Admin and Salesperson application structure

| Route / operation | Admin | Salesperson |
| --- | --- | --- |
| `/login`, logout, own credentials | Yes | Yes |
| `/pos`: name-only selector, quantity, price, outcome | Proposed yes; confirm | Yes |
| `/admin/users` | Local staff management | Denied |
| `/admin/products`, `/admin/products/[id]` | Product management and history | Denied |
| `/admin/products/[id]/cost` | Current-cost change/history | Denied |
| `/admin/inventory`, `/admin/inventory/receipts` | Counts, receiving, movements, corrections, low stock | Denied |
| `/admin/sales`, `/admin/sales/[id]` | History and correction | Denied |
| `/admin/reports`, `/admin/dashboard` | Revenue/profit and analytics | Denied |
| `/admin/audit` (P) | Searchable event history | Denied |
| Operational backup/health status (P) | Sanitized status; restore is controlled operator work | No administration |

Admin shell: responsive navigation, page titles/actions, filters, tables/cards, details and explicit correction confirmations. Final composition awaits the approved UI files. Salesperson shell: compact identity/theme/logout header, large product search, quantity and PKR price, submit and outcome. It contains no stock/cost/profit, low-stock alerts or Admin metrics.

Salesperson product DTO is `{id,name}`. Proposed committed-result DTO is `{saleId,recordedAt,success}` plus already-submitted public values if needed. Quantity errors reveal no remaining balance. Submitted role/actor IDs are never trusted. Every page, action, query, export and auth endpoint checks permissions; inspect React server payloads as well as JSON. Pending own-operation status is restricted to the submitting user (or Admin); general salesperson history remains an open decision.

## 7. Light and dark UI implementation plan

Light/dark support is requested, but the palette/layout cannot be approved without the missing UI plan/prototype.

1. Read the restored UI files, map every screen/state to routes, and extract typography, spacing, density, color, border, radius and navigation rules. Leave source designs unchanged.
2. Use semantic CSS variables for surface/text, primary actions, muted states, borders/inputs/focus, success/warning/error, sidebar and chart series. Pair light/dark tokens instead of hard-coding component colors. This follows [shadcn theming](https://ui.shadcn.com/docs/theming).
3. Propose Light / Dark / System selector, stored per browser with a non-sensitive cookie for server-compatible first paint; avoid flash/hydration mismatch and provide storage-unavailable fallback. Owner confirms default. Theme operation needs no internet.
4. Theme tables, forms, dropdowns, dialogs, toast/status messages and Recharts axes/tooltips. Supply chart tables/formatted exact values. Use text/icons as well as color for low stock, losses and errors.
5. Bundle assets/fonts/icons locally. Maintain keyboard navigation, visible focus, dialog focus restoration, contrast, reduced motion, usable tap targets and zoom readability.
6. Verify login, both workspaces, POS, product/receipt/reprice/count/correction forms and reports, including empty/loading/error/unconfirmed states, in both themes at phone/tablet/desktop sizes. Each module includes owner screenshot review against the restored prototype.

## 8. Offline LAN operation and recovery

The server hosts Next.js, Better Auth, PostgreSQL and the reverse proxy. Shop devices use its reserved LAN IP and a hostname resolved by local DNS even without WAN. Caddy can use an internal CA ([TLS documentation](https://caddyserver.com/docs/caddyfile/directives/tls)); each client must trust that root. Persist/protect CA state, DB data and application secrets. Maintain a reasonably accurate server/client clock for sessions and certificates.

An internet failure leaves LAN requests and local database transactions working. Staff can log in, receive stock, reprice, sell, correct and report. WAN restoration needs no synchronization: authoritative data was always local. Bundle runtime assets; public OAuth, remote DBs, external fonts/CDNs, online password recovery, telemetry/license checks or public certificate issuance must not block core use. Optional encrypted off-site backup runs asynchronously when connectivity allows.

LAN/server failure prevents authoritative sales confirmation. The POS must distinguish:

| State | Behavior |
| --- | --- |
| Submission definitely never started | Keep input and state it has not been submitted. |
| Server rejects and confirms rollback | Show safe validation/availability failure and retain editable input. |
| Request sent, response lost/timed out | Show **Outcome unconfirmed. Reconnect to check this sale.** Preserve minimal intent/key and retry/query with that same key. |
| Committed result received or recovered | Show confirmed reference and clear pending intent. |

A health check cannot prove an interrupted sale failed. Pending intent storage is a retry aid, not an offline sales queue; bind it to the submitting account and agree retention/shared-terminal handling. Store only public sale input/key, never private inventory/cost/profit. Prevent blind replacement of an unresolved sale. Provide Admin reconciliation if browser storage is lost. A service worker is unnecessary for WAN-only offline use; disconnected-device selling and later conflict resolution require separately approved architecture.

Operations proposal: dedicated SSD server, stable wired LAN where possible, UPS for server and router, private DB network, LAN HTTPS firewall access, health/restart policy and protected secrets. Preload tested app/DB/proxy images, migration artifacts and recovery tools for offline restart/reinstallation. Encrypted scheduled backups go to separate physical storage; choose retention, recovery point objective (RPO: tolerated data loss) and recovery time objective (RTO: tolerated downtime). Restore into an isolated DB, verify auth/ledger/report totals and preserve existing live data. Rollback must account for schema compatibility; reverting an app image cannot undo arbitrary migrations.

## 9. Conflicts, gaps and business decisions

No definitive SRS-versus-design comparison is possible while those files are empty. The following findings come from available evidence and must be revisited when sources are restored.

| ID | Finding / conflict | Proposed resolution / decision gate |
| --- | --- | --- |
| C01 | Required SRS, designated guide and both UI sources are empty; root guide asserts SRS derivation without inspectable original | Restore originals and verify amendments before business/schema work. Owner explicitly authorized foundation only despite this gap. Do not overwrite documents automatically. |
| C02 | Root guide section 16 says an unreachable server should say no sale was recorded, but transaction-response loss can leave a committed sale | Use the unconfirmed state and original request key in section 8; do not assert failure without evidence. |
| C03 | Historical profits must be preserved, while authorized sales corrections must adjust profits | Repricing never changes past economics; explicit audited corrections may change effective values while preserving original revisions. Confirm correction scope. |
| C04 | Receipts record unit cost, while one current cost applies to all remaining units | Explicit linked Receive + Reprice or separate reprice policy; do not silently apply FIFO/weighted average. Resolve before receipt/schema finalization. |
| C05 | Metadata, stock and current cost share a product record, so generic CRUD could bypass history (implementation hazard; the guide already warns against this) | Dedicated receive/reprice/count/correct services; metadata edit cannot directly change balance/current cost. |
| C06 | Below-cost rejection may reveal information about confidential cost through repeated probing | Owner chooses pricing policy and acceptable inference risk; no costs/minimum values in errors. A below-cost guard is not assumed harmless. |
| C07 | Guide reconciliation is opening plus post-opening movements; opening is also a ledger event (equivalent conventions, not a business conflict) | Use the equivalent sum of all movements including opening in section 5.2; never add opening twice. |
| C08 | Guide version-specific examples and bootstrap commands may differ from installed packages; root contains project documents | Pin a tested version set; scaffold without overwriting documents. Do not execute guide snippets as approved commands. |
| C09 | Responsive/theme proposals cannot be checked against approved visual reference | Restore/review design in P00; visual acceptance blocked until that happens. |

Decisions are **pending**, not defaults accepted by silence. Resolve applicable business decisions first from the restored SRS; ask the owner only where it remains ambiguous. Suggested choices:

| ID | Decision | Recommendation for review | Needed before |
| --- | --- | --- | --- |
| D01 | Restore documents and identify canonical guide/amendments | Restore four populated originals and reconcile root guide without deleting either | Business/schema implementation; foundation exception explicitly authorized |
| D02 | Single product per sale or basket? | Single-product only if SRS confirms; basket needs header/items and multi-product locking | Schema/POS |
| D03 | Whole units or weighted/fractional quantities? | Whole units if shop does not sell by weight; otherwise define units/precision/rounding | Schema |
| D04 | Duplicate names, categories/SKU, archives | Archive history-linked products; choose disambiguation before POS name-only search | Product schema/UI |
| D05 | New receipt cost differs from current cost; receipt correction/backdating | Explicit receive-and-reprice confirmation if coupled; immutable entered cost, dates and linked events; define receipt-error correction | Schema/receipts |
| D06 | Permitted sale corrections/voids/returns and retained cost | Initially quantity/unit-price only on same product with original snapshot and reason; product/date changes and refunds need explicit policy | Schema/corrections |
| D07 | Zero/below-cost prices; salesperson price source | Positive price proposed; owner selects below-cost rule and whether any suggested price is stored. No silent last-price suggestion | Schema/POS |
| D08 | Taxes, discounts, payments, cash/receipts/printing, export | Confirm V1 inclusion/exclusion; core proposed amount is quantity x entered price only | Schema/scope approval |
| D09 | Reporting calendar and correction date attribution | Asia/Karachi calendar days; corrected amounts in original sale date bucket, correction date in audit; confirm best-seller ranking | Report contracts |
| D10 | Admin sale access, salesperson own history | Admin may sell; Salesperson sees only own pending/committed operation result unless further access approved | Auth/POS |
| D11 | Login identifier, account recovery, sessions, Admin administration | Local username or email-shaped login without online verification; Admin-controlled reset; choose password/timeout and last-Admin safeguards | Auth/users |
| D12 | Theme default, language/locale, final visual approval | Light/Dark/System; PKR/en-PK display proposed; follow restored prototype | UI |
| D13 | Hardware/OS, devices, DNS/TLS, terminals/data volume, performance | Dedicated Linux server/UPS and trusted LAN devices proposed; agree benchmark | Foundation/release |
| D14 | Backup retention/frequency, RPO/RTO, storage/key custody, audit retention | Nightly encrypted separate-disk baseline proposed; more frequent recovery may need additional measures | Operations/release |
| D15 | Pending request retention, shared terminals and storage loss | Preserve original key across reload/relogin for same user; Admin reconciliation if lost | POS |
| D16 | Existing data/import and rollout | Confirm whether opening quantities are manual or an import module is needed; no imports or deletes assumed | Schema/products/release |

Record approved outcomes and their SRS references in a future decision log. Business/schema blockers are D01-D08 and D16 where applicable; auth/UI/operational choices can be resolved before their dependent phase. Major architecture changes and deployment require explicit approval under AGENTS.md.

## 10. Proposed implementation order and phase acceptance

Order: P00 -> P01 -> P02 -> P03 -> P03U -> P04 -> P05 -> P06 -> P07 -> P08 -> P09 -> P10 -> P11 -> P12 -> P13 -> P14 -> P15 -> P16 -> P17.

This expands the root guide's bundled inventory, reporting and production phases into smaller reviewable modules. Each phase has its own brief implementation plan and owner review. **Stop after completing the approved module; do not implement the next one until the current module has been reviewed.** Dependencies below are minimum technical dependencies, not permission to work ahead.

### P00 — Requirements, decisions and design baseline

- Depends on: restored source files and owner input; documentation only.
- Scope: read the complete SRS including amendments, both canonical guides/design sources, reconcile conflicts and update F/N IDs with true SRS references. Settle schema/scope decisions and approve UI mapping. Plan Git setup without overwriting documents.
- Acceptance: every SRS functional/non-functional clause maps to an included phase, explicit exclusion or unresolved decision; no schema-critical ambiguity remains; owner approves this plan and first coding module.
- Verification: source/readability inventory, source-to-plan review and decision log. Currently blocked by four empty sources. This planning pass is not P00 acceptance.

### P01 — Foundation and development verification

- Depends on: explicit owner authorization for foundation only (received); unresolved P00 work remains visible and blocks later business/schema phases.
- Scope: preserve root documentation; scaffold Next.js/TypeScript/App Router/Tailwind/ESLint in `web/`; configure shadcn/ui, lint/type checking, Vitest and Playwright starter smoke tests; bundle runtime assets locally and provide startup documentation. Do not create auth, database/Prisma/Compose, products, sales or reports. Repository initialization/commits are outside this narrowed request.
- Acceptance: npm manifest/lockfile and all application configuration are inside `web/`; starter app serves successfully; lint, type check, starter tests and production build pass; browser smoke verifies the production app loads without public network requests. UI is a neutral foundation placeholder, not the approved application workspace.
- Verification: record installed versions, exact commands/results, development and production HTTP startup, Vitest and Playwright smoke in `docs/development/PHASE_1_FOUNDATION.md`. No DB readiness/login tests or physical WAN/LAN outage claim in this phase. Stop for review after Phase 1.
- Current result: implemented and verified; lint/type checking, two unit tests, development page/health HTTP checks, production build and two desktop/mobile production browser checks passed. Awaiting owner review; see [Phase 1 evidence](development/PHASE_1_FOUNDATION.md). P02 has not started.

### P02 — Persistence and transaction infrastructure

- Depends on: reviewed P01 and schema decisions D02-D08/D16.
- Scope: after separate authorization and P00 resolution, set up local development PostgreSQL/Compose (deferred from P01), approved logical schema, auth-compatible models, migration SQL constraints/indexes, exact-money/time helpers, operation keys, audit/movement persistence contracts and shared transaction boundaries. No feature screens or live-data migrations.
- Acceptance: migrations apply on empty DB and representative prior schema; invalid stock/money/FKs rejected; exact formula fixtures pass; unique request/revision rules and rollback behavior verified.
- Verification: Vitest decimal/date/validation tests; isolated real PostgreSQL migration/constraint/rollback/idempotency primitives; application type check/build. Seeded historical fixtures are tests, not imported shop data.

### P03 — Local authentication and role enforcement

- Depends on: reviewed P02; D10/D11.
- Scope: Better Auth local login/logout, secure one-time Admin bootstrap, no public signup, session/role/active-account guards, origin checks, safe DTO boundaries and role-aware routing.
- Acceptance: two roles sign in locally; anonymous requests denied; Salesperson cannot invoke Admin interfaces directly; auth responses contain no private business data; WAN-off sign-in/logout work; invalid/expired sessions rejected.
- Verification: real auth integration, direct URL/action/API probes, origin/session tests and browser login/logout/back-navigation checks. Never rely only on middleware/layout guards.

### P03U — Local staff administration

- Depends on: reviewed P03; account policies approved.
- Scope: Admin create/disable Salespersons, local password reset, own password change and account audit. Additional Admin creation/role changes only within approved policy.
- Acceptance: Salesperson cannot manage users; disable/reset revokes existing access; credentials never appear in logs; no online recovery requirement; last-Admin/bootstrap safeguards enforced.
- Verification: auth-provider integration for reset/revocation, stale-session requests, permission tests, browser creation/disable/reset and WAN-off recovery. Review before P04.

### P04 — Approved UI shell and themes

- Depends on: reviewed P03U and restored approved UI; D12.
- Scope: Admin/Salesperson layouts, navigation, shared local assets, semantic light/dark tokens, theme preference and shared accessible form/table/dialog/status primitives.
- Acceptance: layouts follow restored reference; no private Admin navigation/data in salesperson workspace; persistent theme across reload; both themes support keyboard/contrast/responsive states without hydration flash.
- Verification: Playwright light/dark phone/tablet/desktop screenshots, keyboard/dialog focus and logout checks; external resource-request audit; lint/type/build. Use isolated visual fixtures only, not fake operational metrics.

### P05 — Product catalog and opening inventory

- Depends on: reviewed P04; naming/category/archive/import decisions approved.
- Scope: Admin metadata create/edit/search/archive, configured thresholds, transactional opening balance/movement/audit; minimal salesperson selector query.
- Acceptance: create 50 units yields balance 50 and one opening +50; retries cannot duplicate product opening effects; metadata edit cannot bypass cost/count services; archived products unavailable for new sales but historical links preserved.
- Verification: validation/uniqueness/archive tests, injected-failure rollback, ledger reconciliation, product payload leakage probes and responsive browser forms. No direct current-cost/quantity edits through generic metadata update.

### P06 — Purchase-cost changes

- Depends on: reviewed P05.
- Scope: dedicated Admin reprice service/form, current-stock cost rule, cost history/audit and idempotent request handling.
- Acceptance: 1,000 -> 1,100 changes current cost for remaining stock, not quantity or historical sale snapshots/profit; all before/after values and actor retained; retries have one effect.
- Verification: seeded old-sale fixtures, rollback/replay and concurrent product-lock/reprice tests; Admin-only UI/endpoint tests. Add actual sale/reprice race coverage in P09.

### P07 — Incoming stock receipts

- Depends on: reviewed P06 and D05.
- Scope: receiving form/history, quantity/date/entered-cost validation, atomic receipt/movement/audit; linked repricing only per approved policy.
- Acceptance: receiving 20 onto 50 gives 70 and one +20 movement; retry remains 70; receipt cost/date preserved; cost differences follow explicit approved behavior, not silent costing substitution.
- Verification: same-key/different-payload conflict, simultaneous receipts, rollback, linked-reprice atomicity and WAN-off browser receipt flow. Invalid/backdated/future-date rules tested against approved policy.

### P08 — Inventory control and low stock

- Depends on: reviewed P07.
- Scope: Admin balance/ledger views, physical-count correction with expected version/reason, read-only reconciliation and low-stock filter.
- Acceptance: 48 -> 45 creates -3 movement with before/after and actor; duplicate has no second effect; stale count rejected; ledger balances match; exact threshold is low stock and restock above it clears warning.
- Verification: adjustment/race/negative-target tests, reconciliation across opening/receipt/count fixtures, inclusive threshold boundaries and role/payload tests. Extend real sale/count races in P09.

### P09 — Salesperson POS and transactional sales

- Depends on: reviewed P08; D07/D10/D15 resolved.
- Scope: approved form, flexible PKR selling price, safe product query, atomic stock/cost snapshot/profit sale service, committed confirmation and pending-key recovery.
- Acceptance: sell 2 at PKR 1,200 with cost 1,000 gives revenue 2,400, gross profit 400 and stock -2; no sensitive fields reach salesperson. Oversell changes nothing. Two last-unit sales yield one success. Identical-key parallel requests yield one sale/movement and same safe result. Changed payload/key conflicts safely.
- Verification: real PostgreSQL concurrent cashiers, duplicate-last-unit, sale/reprice/receipt/count races, fault injection and rollback. Playwright tests timeout after commit, reload/relogin and retry with original key, denied price rules, WAN-off fresh load/sale and server loss with unconfirmed outcome. UI must never promise a failed sale solely from timeout.

### P10 — Sales and audit history

- Depends on: reviewed P09.
- Scope: Admin paginated history, date/product/reference filters, details with original revision/cost and related audit events; read-only audit search for implemented actions.
- Acceptance: committed sales are immediately discoverable; private original costs/profits accessible only to Admin; filters agree with stored fixtures; no unbounded history download or history deletion control.
- Verification: filter/pagination/order integration, authorization at query/action/API levels, request-payload inspection and keyboard/responsive browser detail flows in both themes.

### P11 — Audited sales corrections

- Depends on: reviewed P10 and D06/D09.
- Scope: approved quantity/price correction, preview/reason, expected revision, immutable original and correction snapshots, stock delta and recalculated economics. Product/date edits, voids or returns only if specifically approved.
- Acceptance: 5 -> 2 restores 3 units once; price-only correction changes no stock; increased quantity cannot oversell; stale edit rejected; original cost retained despite reprice; before/after and correction actor/time preserved; failure leaves no partial revision.
- Verification: retry/stale/rollback tests, same-sale concurrent Admin edits, correction versus stock count/sale/reprice races, old-revision retrieval and browser confirmation/denial flows. Corrections are reversible only through a subsequent authorized audited correction, never deletion.

### P12 — Reporting engine and screens

- Depends on: reviewed P11 and D09.
- Scope: daily/monthly/custom/product aggregate services and Admin report filters, revenue/profit/units/distinct products/best sellers; approved date attribution. Export only if separately included.
- Acceptance: period totals reconcile to effective corrected sales and each other; old sales unaffected by current-cost changes; Karachi midnight/month-end assigned correctly; archived products retained; empty ranges work; no multiplying totals through joined receipts/movements.
- Verification: exact-decimal fixture totals, midnight/leap-day/month-end/custom boundaries, invalid ranges, correction-date attribution, no-sales and negative-profit cases; permission/E2E checks and agreed-volume query-plan/performance measurement.

### P13 — Product history workspace

- Depends on: reviewed P12.
- Scope: per-product current overview plus paginated sales, receipts, movements, cost changes and corrections; daily/monthly trends using existing query definitions.
- Acceptance: product totals match filtered global reports; current cost distinguished from sale snapshots; stock ledger/receipt history aligns; archived products remain inspectable by Admin only.
- Verification: multiple-receipt/multiple-sale join fixtures, reprice/correction history, pagination/filters, role denial and both-theme responsive detail screens.

### P14 — Admin dashboard and analytics

- Depends on: reviewed P13.
- Scope: count/stock/low-stock summaries, recent receipts, today's/month's revenue/profit, trends, best sellers and product comparison using report services.
- Acceptance: cards/charts/tables agree with reports; threshold warnings refresh after stock changes; empty states and loss values render clearly; no Admin metrics in POS or its payloads.
- Verification: fixed-date/timezone dashboard fixtures and post-write refresh; Recharts table alternatives and both-theme screenshots; role/leakage and WAN-off smoke; performance against approved dataset.

### P15 — Production packaging, backup and recovery

- Depends on: reviewed P14 and D13/D14.
- Scope: proposed Linux Dockerfile/Compose/Caddy, trusted local DNS/TLS, private DB, health/restart/secrets, offline installation bundle, scheduled encrypted backups, local monitoring and migration/rollback/restore runbooks. Prepare in an isolated acceptance environment.
- Acceptance: clean offline start/restart works from supplied artifacts; backups stored separately and their freshness visible; isolated restore meets approved RPO/RTO and reproduces auth/ledger/report totals. CA/secrets persist securely and DB is inaccessible on LAN.
- Verification: image/config review, fresh-host/offline-restart drill, TLS/device trust, local DNS without upstream, process failure/disk-pressure/backup-failure handling and timed restore. Never restore over live data or deploy to shop in this phase.

### P16 — Integrated acceptance and handover readiness

- Depends on: reviewed P15 and all module evidence.
- Scope: full production-mode acceptance on representative hardware/clients, operating/training/recovery instructions, source/decision/test traceability and release review.
- Acceptance: two LAN devices perform fresh login, products, receipts, repricing, sales, corrections, history and reports while WAN is disconnected; restart retains commits; LAN failure preserves unconfirmed keys; recovery and agreed performance targets pass. Staff demonstrate operation; all critical defects closed.
- Verification: complete unit/integration/E2E/lint/type/build suite, separate WAN and LAN/server failure drills, backup restore, multi-role payload review and signed UAT record. Restore internet and verify no synchronization required. Review readiness before seeking deployment approval.

### P17 — Separately approved shop rollout

- Depends on: accepted P16 and **explicit deployment approval**; this planning request gives no such approval.
- Scope: maintenance window, preserve existing data, verified pre-change backup, controlled migrations and client setup, operator training and post-deployment monitoring.
- Acceptance: owner verifies both roles and a controlled sale/stock/report flow, backup schedule and recovery access; retained original data and rollback evidence; handover acknowledged.
- Verification: approved shop smoke/health checks, WAN-off LAN smoke and backup freshness. Destructive operations, live restores and major architecture changes require their own explicit authorization. Do not claim completion from packaging alone.

## 11. Testing strategy and review evidence

Use Vitest for money/date/input/DTO/revision logic, real isolated PostgreSQL for constraints/locks/transactions and Playwright for role workflows/themes/connectivity. Fixtures include zero/one-unit stock, PKR decimals and upper bounds, archived products, negative-profit cases if allowed, old-cost sales, corrected sales and local midnight/month-end. Concurrent integration tests use separate DB connections and controlled overlap, not only repeated sequential calls. Inject failures after writes to prove full rollback.

Core named scenarios: AUTH (direct unauthorized calls and stale sessions); MONEY (exact amount/profit); STOCK (opening/receipt/count reconciliation); COST (history stable under reprice); SALE (oversell/last-unit/key replay); CORR (5->2, increased quantity, price-only, stale revision); REPORT (same-window agreement and time boundaries); UI (both themes/keyboard/viewports); OFF (WAN-off success, lost response, LAN/server outage); BACKUP (timed isolated restore). Record actual command/output, fixture revision, package versions, environment and reviewer for each executed case. Planned cases are not passing tests.

Each executable module gate requires relevant tests, lint, type check and production build, reviewed migration SQL if changed, security/DTO evidence, screenshots against approved UI, changed-file list, unresolved issues and next-step proposal. Re-run broader tests when dependencies or new failures justify it. Avoid tests that merely mirror component implementation; prioritize money, permissions, concurrency and recovery. Run the complete suite at P16. Test data/DBs are isolated from shop data; destructive reset commands never target production.

The initial planning-only pass verified source availability/integrity, phase/requirement cross-references and official references, before an app existed. That did not accept any module. Current Phase 1 implementation and actual test/build/startup results are recorded separately in `docs/development/PHASE_1_FOUNDATION.md`; P00 requirements reconciliation remains pending.

Documentation checks performed: all 19 phase headings agree in order across both files; all F01-F22, N01-N11 and D01-D16 identifiers appear in both; C01-C09 are recorded in this plan; Markdown fences/table rows were checked. SHA-256 comparison confirmed all six pre-existing files (AGENTS.md, root guide and four empty requested documents) unchanged. These checks validate document consistency and preservation, not SRS completeness or application behavior.

## 12. Immediate next steps

1. Review the completed, verified Phase 1 evidence. Work stops here pending owner review.
2. Restore the four empty sources, identify the canonical guide and reconcile the requirements/design/decision inventory.
3. Review Phase 1 and resolve P00/schema blockers before separately authorizing P02. No next-module implementation is implied.
