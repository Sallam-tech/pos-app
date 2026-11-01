# POS Implementation Plan

Updated: 1 November 2026 (Asia/Karachi). **Phase 1 is completed and accepted. Phase 2 foundation and A01 Login are checkpointed at 9cf59d46ddda192a3a1867267955075b9391e518. Login desktop visuals are approved; outstanding manual/overall review remains open. The separately authorized P01 desktop Record Sale prototype at /pos is implemented, verified and owner-approved after all six manual feature checks, including the decimal precision fix; mobile manual refinement is deferred. Other screens and Phases 4–9 remain unstarted.**

The shared UI foundation is recorded in [PHASE_2_UI_FOUNDATION.md](development/PHASE_2_UI_FOUNDATION.md), and A01 in [LOGIN_UI_REPORT.md](development/LOGIN_UI_REPORT.md) and [LOGIN_LAYOUT_FIX_REPORT.md](development/LOGIN_LAYOUT_FIX_REPORT.md). The owner approved Login desktop visuals and created the local checkpoint above; manual accessibility/device and overall acceptance gates remain open. The current ONE SCREEN AT A TIME brief authorizes only P01 /pos with an embedded, explicitly simulated confirmation. Desktop feature review is approved; mobile manual refinement and manual accessibility review remain open; see [POS_RECORD_SALE_UI_REPORT.md](development/POS_RECORD_SALE_UI_REPORT.md). Login and Admin source are unchanged. The owner separately authorizes one local POS checkpoint; no push, deployment, real business functionality or next screen is authorized.

## 1. Source availability, authority and history

All required originals now exist, are non-empty and readable:

| Source | Current status | Authority / use |
| --- | --- | --- |
| AGENTS.md | Present and read | Binding project instructions and review gates |
| docs/requirements/Software Requirements Specification.docx | Present; DOCX extracted successfully, including confirmed amendments | Authoritative business requirements; unchanged |
| docs/development/POS_Complete_Development_Guide.md | Present and read | Canonical engineering guide; section numbers retained |
| docs/design/POS_UI_UX_Prototype_Design_Plan.md | Present and read | UI specification; UI-* labels retained as workstream references |
| docs/design/POS_UI_Prototype.html | Present and read/inspected | Mocked visual reference; unchanged, not a production implementation |

The SRS ZIP integrity check and text extraction succeeded (381 non-empty paragraphs in the verification record). Confirmed Option A reprices all remaining inventory and preserves completed-sale original costs/profits. Inventory-correction audit and default PKR amendments are included. Core functional/non-functional requirements are traceable below; unclear policy is explicitly pending, not invented.

The root POS_Complete_Development_Guide.md is a synchronized convenience copy of the canonical guide. Read the canonical docs/development path first. Prior versions of the plan, checklist and both canonical guides are preserved as exact [historical snapshots](history/pre-master-sequence-2026-11-01/README.md). Earlier empty-file statements describe the original planning period only and are not current blockers. The Phase 1 evidence report remains historical and is not rewritten.

Evidence: S = actual SRS (section references below); A = AGENTS.md; G = engineering guide; U = UI specification or explicit owner instruction; P = proposed engineering/business choice. F/N/D IDs are project planning IDs, not SRS clause numbers.

Git was initialized at D:\pos with accepted foundation checkpoint 8aebf2135572af36d43bfcd8ad93ef5ed29f59d5. The owner subsequently checkpointed the verified UI foundation/Login at 9cf59d46ddda192a3a1867267955075b9391e518. This P01 task began with a clean working tree at that commit. Its initial uncommitted delivery and precision correction now have owner desktop approval and separate local checkpoint authorization. Publication-time statements in earlier reports/source guides are historical; this plan, the checklist and the latest screen report track current execution.

## 2. Functional requirement inventory

The master phases below distinguish mock UI in Phase 3 from real server behavior in Phases 4–8. Database/session foundations are Phase 4, not part of accepted Phase 1.

| ID | Required/proposed capability | Evidence / SRS reference | Master phase |
| --- | --- | --- | --- |
| F01 | Local login/logout, Admin and Salesperson roles, server-enforced access | S §§3/6.2; A/G | 3 mock; 4 real |
| F02 | Secure initial Admin; staff provisioning/disable/local reset if approved | S distinct accounts; administration UX G/P | 3 approved mock; 4 real |
| F03 | Product create/edit/search, optional category, cost, opening quantity and threshold; SKU/archival policy proposed | S §§4.1/4.10; G/P | 3 mock; 5 real |
| F04 | Opening and later stock changes backed by a reconcilable movement ledger | S §§4.2/4.3/6.3; G/P implementation | 4 foundation; 5–7 real events |
| F05 | Receive existing-product stock with quantity, entered cost/date, actor/reference and history | S §4.2 | 3 mock; 5 real |
| F06 | Admin current-cost change applies to all remaining units; completed-sale costs/profits preserved | S confirmed Option A; A | 3 mock; 5 real; 6 race tests |
| F07 | Admin physical stock corrections with before/after, reason, actor/time | S stock-correction amendment; reason G/P | 3 mock; 5 real |
| F08 | Admin stock overview/movements/reconciliation and inclusive low-stock threshold | S §§4.2/4.11/5.1; G/P ledger | 3 mock; 5 real |
| F09 | Salesperson product selection, quantity and flexible PKR selling unit price | S §§3.2/4.4/5.2 + PKR amendment | 3 mock; 6 real |
| F10 | Atomic deduction, cost snapshot, exact revenue/profit and employee/time | S §§4.3–4.5/6.3; A/G | 4 foundations; 6 real |
| F11 | No overselling or duplicate committed sale effects under races/retries | S §§4.3/6.3; A | 4 foundations; 6 real |
| F12 | Salesperson receives no stock quantities, purchase costs or profit through UI/payloads/errors | S §§3/5.2; A/U | 2/3 fixture boundaries; 4–8 server enforcement |
| F13 | Admin searchable/paginated sales history, date/product/reference filters/details | S §4.6; pagination G/P | 3 mock; 7 real |
| F14 | Corrections atomically update inventory/economics and retain originals/revisions | S §4.6/6.3; A/G | 3 mock; 7 real |
| F15 | Daily/monthly/custom/product reports: revenue/profit/units/products/best sellers | S §§4.7–4.10; metric definitions pending | 3 mock; 8 real |
| F16 | Product current stock/cost, sales/receipt/movement/cost/correction history | S §4.10; G/U details | 3 mock; 5 base; 7/8 complete |
| F17 | Admin counts/recent stock, today/month economics, trends/comparison | S §5.1 | 3 mock; 8 real |
| F18 | Responsive, accessible, low-step workspaces, validation/feedback/search/pagination | S §§5.2/6; U/G | 2 shared; 3 mocks; every real module |
| F19 | Light/Dark/System themes, persistence and consistent components | U owner-approved Phase 2 scope | 2 onward |
| F20 | Core operations with WAN unavailable and LAN/server operational; no mandatory cloud | A + user-confirmed architecture; G/U | Local assets throughout; 9 full drill |
| F21 | Encrypted backup, verified restore, local monitoring and handover | G/P engineering requirement | 9 |
| F22 | Audited business/security events and controlled migrations | S §§4.6/6.3 + correction amendment; A/G | 4 foundations; 5–8 writes; 7 views; 9 release |

SRS §7 explicitly excludes barcode scanning, expense tracking, customer management/purchase histories and multiple branches. Taxes, discounts, payments, cash drawer, printer receipts, returns/refunds and export are unspecified, not automatically included. Category is optional per SRS; SKU, archive UX and account/settings management remain proposals where not approved. Profit is trading gross profit under SRS §4.5; expense-based net-profit accounting is outside the initial scope.

## 3. Non-functional requirements

| ID | Requirement | Acceptance / measurement |
| --- | --- | --- |
| N01 | Exact PKR and historical/stock integrity (A) | Decimal arithmetic and DB constraints; rollback/concurrency/reprice fixtures; no floating-point financial calculations. |
| N02 | Server validation and role confidentiality (A) | Direct page/action/API tests; inspect HTML, React server payloads, JSON, errors and caches. Navigation hiding is insufficient. |
| N03 | Safe retries and partial failure (A/P) | Duplicate keys, key/payload mismatch, concurrent retries, response loss and interrupted transactions produce at most one effect. |
| N04 | Internet independence (A) | Disable WAN before fresh login/reload; core workflows work across two LAN devices with local assets. |
| N05 | Durability/recoverability (G/P) | Committed data survives restart; isolated restore reconciles. Owner chooses RPO, RTO and retention before release. |
| N06 | Responsive/accessibility/theme quality (G/U/P) | UI-spec WCAG 2.2 AA target; keyboard, focus, labels, announced outcomes and contrast at 320/375/768/1024/1440px in light/dark, plus System preference changes. |
| N07 | Performance/capacity (P) | Proposed starting benchmark: 10,000 products, 1,000,000 sales, five active terminals; p95 LAN search/commit <=1s and reports <=3s on agreed hardware. Owner must confirm targets. |
| N08 | Maintainability/testability (A/G) | Strict TypeScript, separate services, versioned migrations, relevant Vitest/PostgreSQL/Playwright checks and production build. |
| N09 | Local security (G/P) | HTTPS, secure sessions, local recovery, no public signup, active-account checks, rate limits, origin/CSRF validation, secret-safe logs and private DB. |
| N10 | Auditability (A/G/P) | Actor, server time, request reference, reason and before/after values; append-only application history; no silent repairs/history deletion. |
| N11 | Local availability/timekeeping (A/G/P) | Stable DNS/IP, UPS for server/router, health/restart checks and accurate local time; UTC storage and agreed Karachi report boundaries. |

Numerical performance/capacity and recovery objectives remain proposals; accessibility/theme criteria come from the UI specification and approved Phase 2 scope, not an invented SRS clause. Offline runtime does not require offline development: dependencies/images may be prepared during an approved setup phase; installed production operation and recovery must use local artifacts.

## 4. Stack review and application architecture

Retain the mandated stack. Propose a modular monolith on one shop-local server and a single PostgreSQL primary; all stock-related consistency belongs in that database.

| Technology | Responsibility / condition |
| --- | --- |
| Next.js App Router + TypeScript | Node server, authenticated pages/actions/route handlers. Static export cannot supply this backend. Authorize every entry point. |
| Tailwind + shadcn/ui | Local component source and semantic themes; apply the readable UI specification/reference with owner review. |
| PostgreSQL + Prisma | Transactions, constraints, row locks, exact money and migrations; reviewed parameterized SQL where locking requires it. |
| Better Auth | Local credentials and DB-backed sessions; generate auth models for selected configuration. |
| Zod + React Hook Form | Shared form contracts; independent server parsing remains mandatory. |
| Recharts | Admin charts with accessible tables; chart coordinates never determine financial totals. |
| Vitest + Playwright | Unit/domain, real PostgreSQL integration and browser acceptance. Mocks/SQLite cannot verify PostgreSQL locks. |
| Docker Compose | Local app/DB/proxy, persistent volumes, health/restart configuration. Deployment needs separate approval. |
| Caddy (guide proposal) | Local HTTPS/internal CA and device trust; no public certificate dependency. |

Official reference URLs from the original review remain engineering references: [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma), [Prisma 7 transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions) and [current transaction documentation](https://www.prisma.io/docs/orm/fundamentals/transactions). Do not mix Prisma API generations. Phase 1 app/tool versions are pinned in web/package.json and verified in the accepted [foundation report](development/PHASE_1_FOUNDATION.md); database/auth versions remain a Phase 4 compatibility gate. No package upgrade or new compatibility research is performed during this reconciliation.

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

Later proposals (not Phase 1): `web/src/features/{auth,users,products,inventory,sales,reports,dashboard}`, `web/src/lib/{db,security,money,time}`, `web/prisma/migrations` and integration tests. Production Docker/backup files will be located explicitly in Phase 9 while preserving root documentation. Route groups do not confer permissions.

UI renders role-specific DTOs. Server actions/handlers validate session, permissions and input, then call services. Domain services own calculations, idempotency and transaction boundaries. Repositories/helpers use the caller's transaction client. No financial logic in components, nested independent writes or remote calls inside transactions. Dashboard/reports share definitions. Confidential data must not enter shared response caches or service-worker caches; verify logout/back-navigation and role changes do not reveal prior private data.

## 5. Proposed database architecture

This is a logical design, not a final Prisma schema. Quantity, basket, receipt-cost and correction decisions in section 9 must precede final migrations. Single-product Sale is a historical guide example, not an approved policy; D02 must settle the sale/header/item model before Phase 4 schema approval.

| Entity | Data and relations | Integrity / access |
| --- | --- | --- |
| Auth User/Session/Account/Verification | Provider-generated tables; role and active state on user | Unique normalized login; local credentials; disable/revoke sessions instead of deleting referenced staff. |
| Category (conditional) | Name, active state; one-to-many products | Optional scope and naming policy await approval. |
| Product | Name, optional category/SKU, current cost, balance, threshold, archive time, version | Finite nonnegative cost/stock/threshold; Admin private fields; unique SKU if approved. |
| StockReceipt | Product, positive units, entered cost, occurrence date, recorded time, actor/reference | Immutable receipt cost is distinct from current product cost. |
| PurchaseCostChange | Product, before/after cost, actor/reason/time | Immutable; link to receipt if coupled operation approved; no quantity movement. |
| StockAdjustment | Product, before/after quantity, delta, actor/reason/version | Idempotent count correction; expected version rejects stale forms. |
| Sale | Product/name snapshot, quantity, selling unit price, original cost snapshot, amount/profit, actor, original timestamp, revision | Exact money; never derive old profit from current product cost. |
| SaleCorrection | Sale, prior/new revision, before/after snapshots, actor/reason/time | Unique sale/revision; initial revision and every subsequent change retained. |
| StockMovement | Product, signed delta, balance after, ordered event/source reference, actor/time | Append-only opening/receipt/sale/correction/count events; no movement for price-only correction. |
| OperationRequest (P) | Operation/key, actor, normalized payload hash, committed result reference | Unique operation/key; atomic with business write; authorized replay and mismatch rejection. |
| AuditLog | Action/entity, actor/server time, request reference, before/after and reason | Admin-only append-only history; excludes passwords/tokens; business audits commit with state. |

Product has many sales/receipts/movements/cost changes/adjustments; Sale has many corrections; User is actor for business events. OperationRequest links its committed result. Ledger sources use typed foreign keys and exactly-one-source checks where applicable, rather than orphan-prone generic string IDs. Generic entity labels are acceptable for audit search, not as the only enforcement of ledger integrity.

### 5.1 Money, quantities and time

- Proposed money: PostgreSQL `NUMERIC(18,2)` / Prisma Decimal. PostgreSQL recommends exact numeric for money ([numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html)). Accept decimal strings; reject excess precision, non-finite values, overflow and excessive amount/quantity products. DTOs serialize decimal strings, not binary floating-point calculations.
- Revenue = quantity x unit selling price; gross profit = quantity x (selling price - original cost snapshot). Negative profit may be valid under approved below-cost policy. Fractional quantities/taxes require an explicit rounding policy before implementation.
- Quantity type is pending D03. Historical examples use bounded whole units; do not turn that example into an approved integer schema. Agree unit/quantity precision, limits and money rounding before migration.
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
5. **Sale correction:** lock sale/product using a documented lock order; check expected revision; `stockDelta = oldQuantity - newQuantity`; prevent overselling when quantity increases; calculate under the approved correction policy (same-product quantity/price examples retain the original cost); append correction/movement if needed/audit and update projection atomically. Price-only correction has no movement. Test races with receipts, repricing, sales and physical counts.

If operations later touch multiple products, lock them in deterministic order. Keep transactions short and pass their client through every helper. No network timeout or DB error can be converted into optimistic success.

## 6. Canonical routes, roles and sale confirmation contract

These remain the canonical route conventions. Phase 2 implements only /login, /admin/dashboard and /pos as public mock shells, alongside the existing /api/health liveness endpoint. Other screen routes below are planned, with unavailable navigation shown as noninteractive placeholders. All role restrictions in the table describe future server-enforced permissions, not protection provided by these previews. Application files belong under web/src/app; route-group folder names do not appear in URLs or confer authorization.

| Screen / purpose | Canonical route | Access and scope |
| --- | --- | --- |
| A01 Login | /login | Both roles; real authentication in Phase 4 |
| A02 Dashboard | /admin/dashboard | Admin |
| A03 Products | /admin/products | Admin |
| A04 Add product | /admin/products/new | Admin |
| A05 Product detail/history | /admin/products/[id] | Admin |
| A06 Edit product metadata | /admin/products/[id]/edit | Admin; not a bypass for stock/cost changes |
| Inventory overview | /admin/inventory | Admin |
| A07 Receive stock | /admin/inventory/receive | Admin |
| A08 Reprice remaining inventory | /admin/inventory/reprice | Admin |
| A09 Correct stock | /admin/inventory/adjust | Admin |
| A10 Stock movements | /admin/inventory/movements | Admin |
| A11 Low stock | /admin/inventory/low-stock | Admin |
| A12 Sales history | /admin/sales | Admin |
| A13 Sale detail/audit | /admin/sales/[id] | Admin |
| A14 Correct sale | /admin/sales/[id]/correct | Admin |
| A15 Daily/monthly/custom reports | /admin/reports | Admin |
| A16 Product reports | /admin/reports/products | Admin |
| A17 Accounts | /admin/accounts | Admin; operational feature scope still requires approval |
| A18 Settings | /admin/settings | Proposed operational screen; theme controls themselves are required in Phase 2 |
| Dedicated audit search | /admin/audit | Reserved Admin route if a separate viewer is approved; required audit trails also appear in A10/A13 |
| P01 Record sale | /pos | Salesperson; Admin POS access remains D10 |
| P02 Sale confirmation | /pos/success/[id] | Safe confirmation for the submitting Salesperson; real authorization in Phase 4/6 |
| Local-server liveness | /api/health | Existing permission-safe liveness endpoint; advisory, not sale/database confirmation |

Here [id] is the resource ID; the confirmation route uses saleId. No general Salesperson history route is approved. Logout/own-credential actions belong to the authenticated account controls; they are not extra business screens. The currently authorized P01 preview stays at /pos and renders its simulated summary in place. It creates no saleId or success route; the planned P02 /pos/success/[id] committed-confirmation route remains unimplemented.

| Superseded name | Canonical replacement | Migration note |
| --- | --- | --- |
| /admin/users | /admin/accounts | Documentation alias only; no application redirect implemented |
| /admin/inventory/receipts | /admin/inventory/receive | Receipt history remains in inventory/product views |
| /admin/products/[id]/cost | /admin/inventory/reprice | Product actions can preselect the product; no second cost-edit endpoint |
| /api/health/connectivity | /api/health | Reuse existing liveness; readiness is separately scoped |

Admin shell: responsive navigation, page headers/actions, breadcrumbs, filters and details. Salesperson shell: compact identity/theme/account header and sale-relevant content. Neither the shell nor hidden navigation is an authorization boundary. Phase 2 may preview shells using explicitly labeled safe fixtures; server-enforced roles and data access arrive in Phase 4. Private stock/cost/profit must never be delivered in Salesperson DTOs, HTML, React server payloads, errors, diagnostics or caches.

### 6.1 Safe product and request boundaries

Salesperson product options contain id and name only; any optional category field needs an agreed DTO change. Actor/role values come from the server session, never submitted form fields. Metadata updates cannot accept arbitrary stockOnHand or currentCost. Receiving, repricing, stock correction and sale correction remain dedicated services.

requestKey is the canonical name for the idempotency/request key; older idempotencyKey examples are terminology aliases, not a second key. Bind each key to operation, actor and normalized payload; changed payloads conflict. A key persists for the same intended sale across timeout, reload, reconnect and retry.

### 6.2 Sale confirmation response requirements

The canonical future recordSale result is SaleConfirmation below, returned only after the transaction commits. getSaleConfirmation(saleId) and getSaleRequestOutcome(requestKey) must use the same role-safe projection and recheck session/ownership. Internal saleId and recordedAt replace older transactionId/soldAt aliases in UI examples.

```ts
type SaleInputItem = {
  productId: string;
  quantity: string;
  unitSellingPrice: string;
};

type RecordSaleInput = {
  requestKey: string;
  items: SaleInputItem[];
};

type SaleConfirmationItem = {
  productId: string;
  productName: string;
  quantity: string;
  unitSellingPrice: string;
  lineTotal: string;
};

type SaleConfirmation = {
  status: "COMMITTED";
  requestKey: string;
  saleId: string;
  recordedAt: string;
  currency: "PKR";
  items: SaleConfirmationItem[];
  totalAmount: string;
};
```

This is a transport/display contract, not a database schema or approval for baskets. The item-list encoding does not select checkout cardinality: one-product versus basket workflow remains D02. Quantity strings likewise do not approve decimal stock; allowed precision remains D03. Mock fixtures must label their assumed cardinality/precision as non-binding.

Required meaning: a stable transaction reference, server recording time, product identity/name for each displayed item, sold quantity, entered selling unit price, line amount and transaction total in PKR. Monetary and quantity values travel as validated exact strings; stored/rounding precision awaits the applicable decision. Product names and amounts come from persisted sale/confirmation data, not merely a browser echo or optimistic calculation.

Use an explicit allowlist: no purchase cost, cost snapshots, unit/total profit, available/remaining stock, thresholds, inventory movements or Admin audit objects. Only the submitting Salesperson may read their confirmation; Admin financial access uses separately authorized Admin views. Admin POS creation rights remain D10.

The outcome lookup distinguishes COMMITTED (with SaleConfirmation), UNCONFIRMED (no proof of the transaction outcome yet), and an authoritative REJECTED result with safe failure information. A missing/not-yet-found record during an in-flight request is not proof of rejection. A missing response leaves the original request unconfirmed: check/retry using the original requestKey. Never create a replacement sale with a new key merely because a response was lost. Retain the original intent until the server resolves it; a health check cannot do so. A deliberately corrected new submission after a definitive rejection is a separate intent, not a timeout workaround.

In Phase 3 a mock confirmation must visibly say it is a simulation, return no claim of a real commit and not create authoritative sales. Real recordSale/confirmation/outcome operations are Phase 6 work.

## 7. Light, dark and system UI implementation plan

The readable UI specification and HTML prototype supply the flat retail layout, green action accent, semantic surfaces and system-font baseline. Phase 2 now implements these shared foundations; the neutral scaffold palette has been replaced. The [Phase 2 report](development/PHASE_2_UI_FOUNDATION.md) records implementation details, contrast-driven input-outline adjustments, screenshots and limitations. Section 10 remains the acceptance criteria; visual/owner acceptance is still pending.

Map UI surface/surface-subtle/danger/focus tokens consistently to shadcn card/muted/destructive/ring semantics rather than mixing competing palettes. Verify contrast, 44px targets and focus behavior; the HTML's simplified dialogs/small controls are not compliance evidence. No external fonts/icons/CDNs. Apply labels/icons as well as color to warnings, losses and validation. Later Recharts views need readable legends/tooltips and exact-value table alternatives.

Screen-specific forms, search, dialogs, report mocks and confirmation flows are Phase 3. Real authorized data and transaction outcomes are integrated in Phases 4–8. The complete theme/viewport/state matrix is tested per module; full LAN/WAN and recovery acceptance is Phase 9. Theme preference contains presentation state only and does not authorize an operational settings feature.

## 8. Offline LAN operation and recovery

This is target behavior for the completed system, not a claim that Phase 1/2 implement sales, authentication, deployment or recovery.

The server hosts Next.js, Better Auth, PostgreSQL and the reverse proxy. Shop devices use its reserved LAN IP and a hostname resolved by local DNS even without WAN. Caddy can use an internal CA ([TLS documentation](https://caddyserver.com/docs/caddyfile/directives/tls)); each client must trust that root. Persist/protect CA state, DB data and application secrets. Maintain a reasonably accurate server/client clock for sessions and certificates.

An internet failure leaves LAN requests and local database transactions working. Staff can log in, receive stock, reprice, sell, correct and report. WAN restoration needs no synchronization: authoritative data was always local. Bundle runtime assets; public OAuth, remote DBs, external fonts/CDNs, online password recovery, telemetry/license checks or public certificate issuance must not block core use. Optional encrypted off-site backup runs asynchronously when connectivity allows.

LAN/server failure prevents authoritative sales confirmation. The POS must distinguish:

| State | Behavior |
| --- | --- |
| Submission definitely never started | Keep input and state it has not been submitted. |
| Server rejects and confirms rollback | Show safe validation/availability failure and retain editable input. |
| Request sent, response lost/timed out | Show **Outcome unconfirmed. Reconnect to check this sale.** Preserve minimal intent/key and retry/query with that same key. Never create a replacement sale with a new key merely because its response was lost. |
| Committed result received or recovered | Show confirmed reference and clear pending intent. |

A health check cannot prove an interrupted sale failed. Pending intent storage is a retry aid, not an offline sales queue; bind it to the submitting account and agree retention/shared-terminal handling. Store only public sale input/key, never private inventory/cost/profit. Prevent blind replacement of an unresolved sale. Provide Admin reconciliation if browser storage is lost. A service worker is unnecessary for WAN-only offline use; disconnected-device selling and later conflict resolution require separately approved architecture.

Operations proposal: dedicated SSD server, stable wired LAN where possible, UPS for server and router, private DB network, LAN HTTPS firewall access, health/restart policy and protected secrets. Preload tested app/DB/proxy images, migration artifacts and recovery tools for offline restart/reinstallation. Encrypted scheduled backups go to separate physical storage; choose retention, recovery point objective (RPO: tolerated data loss) and recovery time objective (RTO: tolerated downtime). Restore into an isolated DB, verify auth/ledger/report totals and preserve existing live data. Rollback must account for schema compatibility; reverting an app image cannot undo arbitrary migrations.

## 9. Reconciliation and Pending Business Decisions

The restored SRS, including its confirmed amendments, has been read. The following are current resolutions; the pre-reconciliation findings and proposed defaults remain preserved in the historical snapshot.

| ID | Finding | Current disposition |
| --- | --- | --- |
| C01 | Earlier missing-source blocker | Resolved: all four documents and AGENTS.md exist, are non-empty and readable. The DOCX extracted successfully. |
| C02 | Unsafe timeout wording | Resolved in current contracts/guides: missing response means unconfirmed, checked with the original key; no replacement key merely after response loss. |
| C03 | Historical preservation versus explicit sale corrections | Repricing never changes completed-sale cost/profit; authorized corrections adjust effective values with original/revision history. Detailed correction policy remains pending. |
| C04 | Different receipt cost | Pending D05; no automatic FIFO, weighted-average or coupled reprice rule selected. |
| C05 | Generic product update bypass | Dedicated metadata/receive/reprice/count/correction services remain required. |
| C06 | Below-cost checks and confidential-cost inference | Pending D07; never expose hidden costs or a minimum-cost threshold in errors. |
| C07 | Opening balance reconciliation | Sum all movements including opening exactly once; equivalent to opening plus post-opening movements. |
| C08 | Version/bootstrap examples and root documents | web/ is the application root; Phase 1 versions are pinned/verified. Guide commands are scoped to later approved work and do not authorize installation. |
| C09 | Visual-source blocker | Resolved as source availability: specification/prototype readable. Visual acceptance of future implementation still requires review. |
| C10 | Competing phase numbers | Owner's master Phases 1–9 govern. Legacy P00–P17, guide phases 0–8 and UI-0–UI-7 are cross-reference labels only. |
| C11 | Conflicting routes and confirmation DTOs | Section 6 is canonical; guide/UI contracts adopt the same routes, requestKey and safe SaleConfirmation. |

### 9.1 Pending Business Decisions

All five groups below are **PENDING — no business default approved**. Historical recommendations and HTML examples do not resolve them. They need not block pure Phase 2 design tokens/shells; do not embed them as product policy. Before dependent Phase 3 form interactions, label illustrative assumptions; resolve them before the affected Phase 4 schema or Phase 5–8 real workflows.

| Decision IDs | Required owner decision | What remains unselected | Gate |
| --- | --- | --- | --- |
| D05 — Stock receiving at a different purchase cost | Receipt-only recording, explicit linked receive-and-reprice, or another behavior consistent with confirmed Option A; receipt date/error correction policy | Whether a differing receipt cost automatically changes the current cost. No FIFO/weighted-average replacement for Option A. | Receipt schema/contracts and Phase 5 receiving |
| D07 — Below-cost and zero selling prices | Allow/block loss-making sales; whether zero is permitted; any override permissions and safe feedback | No assumed positive-only or below-cost prohibition. Flexible pricing is confirmed, minimum-price policy is not. | Mock validation decisions and Phase 6 server price validation |
| D03 — Integer versus decimal stock quantities | Whole units or fractional units; unit type, quantity precision, limits and rounding | Examples using packets/integers do not settle all shop quantity types. | Phase 4 schema and all quantity forms/services |
| D06/D09 — Sale correction scope and reporting date attribution | Editable quantity/price/product/date, void/return scope, original snapshot treatment for additional units, original-date versus correction-date reporting | Same-product quantity/price-only and original-date attribution remain proposals. Original audit/history preservation is mandatory. | Phase 4 revision/report model; Phases 7/8 behavior |
| D02 — Single-product sale versus multi-product basket | Checkout cardinality, confirmation layout and atomicity across items | Neither the historical one-product proposal nor a list-shaped DTO approves a basket workflow. | Checkout mock behavior, Phase 4 schema and Phase 6 processing |

The confirmed rule is not pending: Admin repricing applies immediately to all remaining units including older purchases and future stock; previously completed sales keep their original purchase costs/profit. A deliberate correction is recorded separately with before/after audit history. Exact PKR, no overselling, no duplicate committed effects and server-side role validation remain mandatory.

### 9.2 Other retained decisions and statuses

The original D01–D16 identifiers remain stable for history and review. Suggestions below are not implicit approvals.

| ID | Topic | Current status / proposal retained for review | Before |
| --- | --- | --- | --- |
| D01 | Source restoration/canonical source | Resolved for availability/reading: SRS authoritative, canonical guide under docs/development, UI under docs/design. Root guide is a synchronized convenience copy. | No longer a missing-file blocker |
| D02 | Sale cardinality | Pending; see section 9.1 | Checkout/schema |
| D03 | Quantity type/precision | Pending; see section 9.1 | Quantity forms/schema |
| D04 | Duplicate names, category/SKU and archival | Pending naming/disambiguation and archive policy; optional category is in SRS, SKU/archival UX are proposals | Products/schema |
| D05 | Receipt cost/date/correction | Pending; see section 9.1 | Inventory/schema |
| D06 | Correction/void/return policy | Pending; see section 9.1 | Revision model/corrections |
| D07 | Zero/below-cost and suggested price | Pending; see section 9.1; no silent last-price suggestion | POS validation |
| D08 | Taxes/discounts/payments/cash/printing/export | Not specified by SRS; no scope approval granted here | Scope/schema if requested |
| D09 | Calendar/day cutoff, correction attribution, ranking | Asia/Karachi calendar-day reporting and ranking by units are retained proposals; correction attribution pending | Reporting contracts |
| D10 | Admin POS access and Salesperson own history | Pending; submitting user's confirmation is required, general own-history convenience is not approved | Authentication/POS |
| D11 | Login identifier/reset/sessions/Admin management | Admin provisioning/local recovery proposed; username/email-shaped identifier, timeouts and management scope need review | Phase 4 |
| D12 | Theme/locale/design review | Three modes/persistence implemented. System is the provisional default/fallback; denied storage retains selection only for the current tab. Owner review of fallback, locale/language and screenshots remains pending. | UI acceptance |
| D13 | Hardware/devices/DNS/TLS/capacity | Dedicated Linux server/UPS and benchmark remain proposals | Deployment/performance |
| D14 | Backup/retention/RPO/RTO/key custody | Nightly encrypted separate-disk backup is a proposal; objectives/retention need approval | Phase 9 |
| D15 | Pending-intent retention/shared terminals | Original-key recovery is mandatory; safe storage/retention and lost-storage recovery need review | Phase 6 |
| D16 | Existing-data/import/rollout | No import/deletion assumed; confirm opening data source and rollout | Schema/products/release |

Approve outcomes in a decision log before dependent implementation. Major architecture changes, destructive operations and deployment require separate permission under AGENTS.md. This documentation task authorizes none of them.

## 10. Master development sequence and acceptance gates

This is the sole current development sequence, established by the owner. Historical phase numbers and UI-* labels remain cross-references. Phase 1 is accepted. Phase 2 and A01 are verified/checkpointed, with Login desktop approval recorded and manual/overall review still open. The current explicit brief authorizes only P01 /pos and its embedded simulated summary within Phase 3. The desktop prototype is owner-approved after all six manual feature checks, including the precision fix; mobile manual refinement is deferred. All other mock screens and Phases 4–9 remain planned and unstarted; completing checks does not authorize the next screen or grant overall acceptance.

Begin each module with a short plan. Each large phase is split into the reviewable modules below; complete tests/review for the current approved module before implementing the next. Finishing one phase does not automatically authorize the next.

| Phase | Master title | Status |
| --- | --- | --- |
| 1 | Project Foundation | Completed and accepted |
| 2 | Shared UI Design System, Themes and Application Shells | Implemented and verified; awaiting owner review |
| 3 | Complete Mock UI Screens and Interactions | A01 desktop visuals approved; manual review pending. P01 /pos desktop approved; mobile manual refinement deferred. Other screens unstarted |
| 4 | Database and Authentication | Planned; not started |
| 5 | Products and Inventory | Planned; not started |
| 6 | Sales Processing and Profit | Planned; not started |
| 7 | Sales Corrections and Audit History | Planned; not started |
| 8 | Reports and Analytics | Planned; not started |
| 9 | Local Offline Deployment and Final Testing | Planned; not started |

### Phase 1 — Project Foundation

- Status: completed, verified and accepted by the owner.
- Delivered: isolated web/ Next.js App Router/TypeScript/Tailwind/ESLint app, shadcn/ui base setup, liveness endpoint, pinned dependency manifest/lockfile, Vitest/Playwright starter configuration and local-start documentation.
- Evidence: [Phase 1 report](development/PHASE_1_FOUNDATION.md) and subsequent verification: lint/type checking, two unit tests, production build and two desktop/mobile production browser tests passed. Native compiler installation issues were repaired and reported.
- Boundaries: no authentication, DB, sales, products or reports delivered. Git initialization followed Phase 1 as the separate verified checkpoint 8aebf2135572af36d43bfcd8ad93ef5ed29f59d5. Historical report wording about awaiting review records its publication state, not current Phase 1 acceptance.

### Phase 2 — Shared UI Design System, Themes and Application Shells

- Depends on: accepted Phase 1, readable sources and a separately authorized Phase 2 module brief. UI-1 is the reference workstream. No business decision is selected by the design system.
- Status: implemented and verified, awaiting owner review; see [Phase 2 evidence](development/PHASE_2_UI_FOUNDATION.md). The owner authorized this whole bounded phase as the current delivery. Tokens/themes, primitives and responsive shells/connectivity are its internal work groups; owner review remains required before Phase 3.
- Evidence: 27 unit/component tests; 40 desktop/mobile Chromium browser tests; lint, type checking and production build pass. Browser coverage includes the three routes at five widths in light/dark, System changes, first paint/persistence/storage denial, focus/keyboard, advisory connectivity, actual contrast/control bounds and 200% CSS-scale/reflow checks. Manual screen-reader/native-browser zoom review remains outstanding.
- Shared design tokens: implement the UI specification's surface/text, green action, muted, border, focus, success/warning/danger, spacing, typography, radius and numeric styles; map surface tokens to shadcn card/popover semantics. Use one consistent token system for controls, dialogs and later charts. Record any contrast-driven deviation.
- Themes: Light, Dark and System work; System responds to OS preference changes. Persist explicit browser preference across navigation/reload, restore before first paint without flash/hydration mismatch, and handle unavailable preference storage safely. Confirm default/fallback at UI review. Never persist credentials or private business data as theme state.
- Reusable components: accessible buttons, inputs, selects, labels/help/error regions, table/card primitives, dialogs, alerts/status, loading/empty/error patterns, breadcrumbs and navigation. Enforce clear disabled/loading semantics and 44x44px minimum interactive targets, with POS primary actions planned at 52–56px.
- Keyboard/focus: logical tab sequence, visible focus in both themes, operable menus/drawers, dialog focus trap, Escape close, focus restoration to opener and announced errors/status. Support reduced motion and 200% zoom. Test actual foreground/background contrast against the UI target; do not treat the prototype as accessibility proof.
- Shells: responsive Admin sidebar/header/content layout and compact Salesperson header/content layout. Preview uses canonical routes and labeled safe fixtures; no real accounts/permissions claimed. Do not bundle stock/cost/profit fixtures into Salesperson views. A shell is not server-side authorization.
- Connectivity: Checking, Shop server connected and Cannot reach shop server states use the local liveness contract /api/health plus request outcomes, or explicitly labeled fixtures for failure previews. WAN loss alone cannot block the UI. The indicator is advisory and cannot confirm whether a sale committed; uncertain-sale guidance uses the original key.
- Exclusions: no real sales, database/Prisma/Compose, authentication, inventory mutations, financial processing, business screens or full POS workflow. A17/A18 operational modules are not approved merely because theme controls are required.
- Acceptance evidence: component/keyboard tests and Playwright screenshots/checks at 320, 375, 768, 1024 and 1440px in light/dark; exercise System preference changes, stored preference restoration, dialog/drawer focus, loading/error/connectivity states, no page overflow and 200% zoom. No external fonts/CDNs/runtime assets. Run lint/type checking, relevant unit/browser tests and production build; report limitations and obtain owner review. No physical shop outage or business-transaction acceptance is claimed here.

### Phase 3 — Complete Mock UI Screens and Interactions

- Previously delivered A01 /login (UI-5): Username/password, visibility control, required validation, loading/unavailable feedback, compact advisory connectivity and themes remain unchanged. Desktop visuals are owner-approved; manual accessibility/device checks remain open. It is a public preview with no credential checking, storage, submission or successful login. Username is the owner's presentation instruction, not a final D11 policy. See [Login UI report](development/LOGIN_UI_REPORT.md).
- Reviewed screen scope: **P01 /pos only** (UI-2 reference), including an in-place simulated confirmation. Delivered: searchable id/name-only mock products, keyboard combobox, quantity +/- controls, PKR entry, exact decimal totals, field validation/first-error focus, clearly simulated summary and New Sale reset/focus. The POS-only header is compact; shared components, Login and Admin are unchanged. See [POS screen report](development/POS_RECORD_SALE_UI_REPORT.md).
- Preview assumptions are explicitly non-binding: one product, positive fractional examples, zero-price examples, +/- one convenience, up to 12 whole-number digits per input, 6 quantity decimals and the owner-required maximum 2 selling-price decimals, and exact unrounded totals (including sub-paisa results). D02/D03/D07 still require owner decisions before domain/schema validation. No costs or confidential price thresholds are present. No new dependencies, real authentication, database, inventory effects, business requests, request-key recovery, or persisted confirmation are implemented.
- ONE SCREEN AT A TIME: all six P01 desktop manual feature checks passed, including the selling-price precision fix. The owner authorizes this local checkpoint only; stop after it. Mobile manual refinement and manual accessibility review remain open. The planned standalone P02 route, other Phase 3 screens and all real workflows remain outside this task. Initial screen verification passed lint/type/build, 54 unit/component tests and 130 desktop/mobile Chromium tests. The subsequent precision fix passed lint/type/build, 30 focused unit/component tests and 8 relevant desktop/mobile browser tests. Saved source/test/configuration hashes match those verified versions; this documentation/checkpoint task requires no repeated browser run. Screenshots cover 320/375/768/1024/1440px in Light/Dark, with System changes, touch/keyboard, errors, exact totals, simulation/reset, no overflow and 200% CSS reflow. Manual screen-reader/native zoom/device review remains outstanding.

- Depends on: reviewed Phase 2 and approved screen/module brief. Uses UI-2 through UI-5 as workstream references; no backend integration.
- Reviewable modules: (a) Salesperson P01/P02 flow and safe simulated confirmation, (b) products/inventory A03–A11, (c) dashboard/sales/corrections/reports A02/A12–A16, (d) login A01 and separately approved operational account/settings screens. Reuse Phase 2 themes and shells.
- Scope: complete approved required screens, navigation, forms, filter interactions, confirmation previews and idle/loading/empty/invalid/error/conflict/unconfirmed/mock-success states with local fixtures. Apply the canonical route map and DTO boundaries.
- Acceptance: desktop/tablet/phone and both themes usable by keyboard; no private fields in Salesperson markup/mock DTOs; receipt/reprice distinctions and correction deltas explicit; original versus corrected figures clear; report mock filters/charts labeled and accessible; no broken placeholder actions in approved screens.
- Pending rules: quantity/cardinality/pricing/correction assumptions must be explicitly labeled illustrative and non-binding; resolve the relevant interaction brief before hard-coding policy-dependent behavior.
- Verification: component/Playwright flows, double-click prevention, timeout/key retention simulation, stale-correction preview, a11y/focus and responsive screenshots; lint/type/build. Every mutation says it is simulated and creates no real sale, inventory/audit entry, account or database record. Mock role switching must stay out of production authorization.
- Stop after each reviewed mock module; no implied approval of new business features.

### Phase 4 — Database and Authentication

- Depends on: approved Phase 3 and closure of schema-affecting pending decisions (especially cardinality and quantity precision), plus a reviewed schema/module plan.
- Reviewable modules: (a) PostgreSQL/Prisma/Compose development persistence and migrations, (b) exact PKR/time/transaction/idempotency/ledger/audit infrastructure, (c) Better Auth local login/session/roles/bootstrap, (d) separately approved staff provisioning/reset/disable controls.
- Acceptance: tested compatible versions; empty/prior-schema migration checks; constraints/FKs/uniqueness and full rollback; local credentials and DB sessions with no public signup/online reset requirement; no secrets committed. Salesperson cannot obtain Admin data through pages/actions/APIs/React payloads/errors/caches. Disable/reset revokes stale access; last-Admin safeguards follow approved policy.
- Verification: Vitest money/time/DTO/permission tests; isolated real PostgreSQL migration/constraint/request-key/transaction tests; auth integration and direct unauthorized-call tests; WAN-off fresh login; lint/type/build and relevant browser checks.
- No product/sale business mutations are implied by shared persistence infrastructure. Do not finalize financial or quantity policies from historical examples.

### Phase 5 — Products and Inventory

- Depends on: reviewed Phase 4, catalog/receipt/quantity/import decisions and approved mock UI.
- Reviewable modules: product metadata/search/archival and opening ledger; current-cost repricing/history; incoming receipts; stock overview/movements/reconciliation/count correction/low stock. Guide §§6–9/14 remain engineering references.
- Acceptance: opening 50 creates one +50 event; receipt +20 yields 70 once; repricing 1,000 to 1,100 changes current remaining-stock cost without changing old sale fixtures; physical count 48 to 45 creates -3 once; stale count forms rejected. Exact threshold is low stock; restock above clears it. Metadata edits cannot bypass cost/count services.
- Verification: permission/DTO tests, exact values, duplicate/mismatched request keys, concurrency/rollback, immutable history and ledger reconciliation. Browser receiving/reprice/count workflows use server-confirmed results; WAN-independent requests. Seed old-sale fixtures for repricing tests; add actual sale/reprice/count races in Phase 6.
- Acceptance depends on approved differing-receipt-cost policy, not silent weighted-average/FIFO or automatic reprice assumptions.

### Phase 6 — Sales Processing and Profit

- Depends on: reviewed Phase 5 and approved cardinality/quantity/zero/below-cost policies and pending-intent recovery design.
- Scope: connect approved POS to atomic server sale processing, exact PKR revenue/profit, preserved cost/name snapshots, signed movements/audit and the safe confirmation/outcome contract.
- Acceptance: using illustrative whole-unit values under the approved quantity policy, two units at 1,200 and cost 1,000 yield revenue 2,400/profit 400/stock -2; no confidential payload reaches Salesperson. Oversell changes nothing. Two simultaneous last-unit sales yield one success. Parallel identical-key requests yield one sale/movement and the same committed result. Changed payload conflicts.
- Verification: real PostgreSQL concurrency, sale/reprice/receipt/count races, whole-transaction retry/fault rollback and exact arithmetic. Browser duplicate clicks, response loss after commit, reload/relogin/reconnect and original-key recovery; WAN-off fresh load/sale and LAN/server loss without false success/failure. Extend fixtures to approved fractional/basket rules if selected.
- Success reflects persisted committed data; a missing response never justifies a replacement sale/key.

### Phase 7 — Sales Corrections and Audit History

- Depends on: reviewed Phase 6 and approved correction/void/return/date-attribution policy.
- Reviewable modules: Admin paginated sales/detail/search; immutable original/revision and related audit views; correction preview/reason/version checking and atomic stock/economics updates. Separate audit search only if its UI scope is approved.
- Acceptance: 5 to 2 restores 3 once; price-only correction has no stock movement; quantity increases cannot oversell; stale Admin revisions rejected; cost snapshot follows approved correction policy and cannot be rewritten by repricing. Original and corrected values and actors/times remain inspectable; no hard deletion.
- Verification: retry/mismatch/stale/rollback and concurrent-edit tests; correction versus stock count/sale/reprice races; retained old revisions; Admin-only query/action/browser checks, responsive/a11y screenshots and consistent report-facing corrected state.
- Product/date edits, voids and refunds are not enabled until their exact behavior is approved.

### Phase 8 — Reports and Analytics

- Depends on: reviewed Phase 7 and approved timezone/cutoff/correction-date attribution/metric definitions.
- Reviewable modules: daily/monthly/custom/product aggregate queries/screens; per-product complete history/analytics; Admin dashboard and charts.
- Acceptance: exact revenue/profit/units/products/best-seller totals reconcile across equivalent windows and effective corrected sales. Old sales are not recalculated from today's cost. Correct local midnight/month-end placement, archived-product history, no-sales/loss states, and no join multiplication. Dashboard low-stock/recent-stock/count/trend metrics agree with reports.
- Verification: decimal/date/leap-day/month-end/custom windows, correction attribution and multiple receipt/movement fixtures; actual PostgreSQL plans/performance against approved capacity; accessible chart tables, authorization/payload, responsive/theme and WAN-off checks. Report export is not automatically included.

### Phase 9 — Local Offline Deployment and Final Testing

- Depends on: reviewed Phase 8, approved hardware/DNS/TLS/recovery targets and closed release-blocking decisions.
- Reviewable modules: production app/DB/proxy packaging and local HTTPS trust; scheduled encrypted backups/isolated restores and monitoring; integrated UAT/training/handover; separately approved shop rollout.
- Acceptance: preloaded local artifacts start/restart without WAN; DB private to server network; protected secrets and persistent TLS CA/DB state; separate physical backup and local failure/freshness notices. Timed isolated restore meets approved RPO/RTO and reconciles auth/stock/sales/reports.
- Verification: complete unit/PostgreSQL/E2E/lint/type/build suite; two LAN devices fresh-login and perform all core flows with WAN disconnected; restart preserves commits; separate LAN/server and lost-response drills resolve original keys safely. Verify themes/a11y/performance, disk/backup failure handling and staff recovery demonstration.
- Deployment remains a separately approved final action with maintenance window, verified pre-change backup, controlled migrations, rollback/schema compatibility and owner sign-off. No destructive live restore, deletion or automatic deployment is authorized by the sequence.

## 11. Detailed history, guide references and UI-* mapping

Original detailed requirements/acceptance cases are preserved both in the current architecture/phase criteria and as exact [pre-reconciliation historical copies](history/pre-master-sequence-2026-11-01/README.md). Old phase defaults or missing-source claims are historical only. Section numbering in the development guide is retained; its module numbers identify topics, not master phase order.

| Master phase | Legacy plan/checklist IDs | Development-guide references | UI workstream references |
| --- | --- | --- | --- |
| Phase 1 | P01 | §21 legacy guide phase 1 foundation subset; §22 tooling | UI-0 source preparation (prerequisite work) |
| Phase 2 | P04 (moved earlier) | §16 usability; §3 layering; current master map | UI-1 shared design system and shells |
| Phase 3 | Newly explicit mock-screen phase; visual portions of P05–P14/P03/P03U | §§5–17 screen/contract references, not backend implementation | UI-2 POS, UI-3 products/stock, UI-4 dashboard/sales/reports, UI-5 login and approved operational mocks |
| Phase 4 | P02, P03, P03U | §§3–5/17; legacy guide phase 1 DB subset and phase 2 auth; prompts A/B | UI-6 integration foundation/auth |
| Phase 5 | P05, P06, P07, P08 | §§6–9/14; legacy guide phases 3/4; prompts C/D | UI-6 products/inventory integration |
| Phase 6 | P09 | §10; legacy guide phase 5; prompt E | UI-6 sale/confirmation integration |
| Phase 7 | P10, P11 | §11/17; legacy guide phase 6; prompt F | UI-6 history/corrections integration |
| Phase 8 | P12, P13, P14 | §§12–15; legacy guide phase 7; prompt G | UI-6 reporting/analytics integration |
| Phase 9 | P15, P16, P17 | §§18–20/24; legacy guide phase 8; prompt H | UI-7 offline QA/release |

Legacy P00 / guide phase 0 / UI-0 are preparatory source/decision gates, not a tenth master phase. Source restoration/reading is complete; still-pending business decisions remain explicit gates on dependent modules. Old guide phase 1 included DB/auth libraries; that scope now belongs to Phase 4, not completed Phase 1. Old guide phase 2 means authentication, while UI-2 means mock POS; neither should be called simply "Phase 2" in current tasks.

The standalone HTML remains unchanged as a mocked visual reference. Its role switch, floating-point demo calculations, simplified search/filters/charts and focus limitations are not production contracts. Phase 2 must meet the written focus/theme/a11y criteria rather than copy the prototype's missing behavior.

## 12. Testing, evidence and immediate next step

Use Vitest for pure input/money/time/DTO/revision logic, real isolated PostgreSQL for migrations/constraints/locks/transactions and Playwright for browser workflows/themes/connectivity. Separate DB connections and controlled overlap must prove races; sequential mocks cannot prove no overselling. Inject failures between writes to verify full rollback. Fixtures include zero/last-unit stock, exact money/bounds, archived products, old-cost/corrected sales, local midnight/month-end and approved loss/fractional/basket policies.

Each executable module requires relevant tests, lint/type checking, production build, reviewed migration SQL if changed, permission/DTO evidence, UI screenshots against the specification, changed-file report, unresolved issues and next-step proposal. Record actual commands/results and review approval; planned tests are not passing tests. Use isolated test data; no production reset or destructive restore without explicit permission.

Historical reconciliation verification covered documents and preservation only. The later, explicitly authorized Phase 2 delivery has now passed the checks recorded in its [report](development/PHASE_2_UI_FOUNDATION.md). No new dependencies were installed. Original SRS/design/guide files, baseline tests and package/configuration files remain unchanged. No Git commit or Phase 3 implementation was made.

Next: owner reviews the implemented Phase 2 UI-1 foundation, screenshots, provisional theme fallback and accessibility limits. Do not start Phase 3 or create a Git commit without the owner's instruction.
