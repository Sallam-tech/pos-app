# OFFLINE POS SYSTEM
## Complete Development and Implementation Guide

**Project:** Inventory, Stock & Sales Management System  
**Guide version:** 1.0 | **Prepared:** 31 October 2026  
**Implementation target:** Offline during an *internet* outage, with a functioning local shop server and LAN  
**Source:** Supplied Software Requirements Specification (SRS), Version 1.0, including confirmed amendments

> **Deliverable definition.** This is an actionable engineering blueprint: what to build, where it belongs, how the modules interact, how to test them, and how to direct Codex. It is **not** a claim that application source code has been implemented or tested. Sample code and SQL are illustrative and must be adapted and verified against the actual installed package versions.

---


## Current master sequence — owner reconciliation, 1 November 2026

The owner-defined Phase 1–9 sequence in docs/IMPLEMENTATION_PLAN.md and docs/MODULE_CHECKLIST.md governs all work. Phase 1 is completed and accepted; Phase 2 has not started. This reconciliation is documentation only. Sections 1–25 and module/test identifiers below remain stable engineering references; old phase numbers in section 21 are explicitly historical. The original text is preserved under docs/history/pre-master-sequence-2026-11-01/.

| Master phase | Current title | Engineering / UI mapping |
| --- | --- | --- |
| 1 | Project Foundation | Accepted web/ scaffold; old guide phase 1 foundation subset |
| 2 | Shared UI Design System, Themes and Application Shells | UI-1; guide §16; no business transactions |
| 3 | Complete Mock UI Screens and Interactions | UI-2–UI-5; §§5–17 screen references only |
| 4 | Database and Authentication | §§3–5/17; old guide phase 1 DB subset and phase 2 auth |
| 5 | Products and Inventory | §§6–9/14; old guide phases 3/4 |
| 6 | Sales Processing and Profit | §10; old guide phase 5 |
| 7 | Sales Corrections and Audit History | §11/17; old guide phase 6 |
| 8 | Reports and Analytics | §§12–15; old guide phase 7 |
| 9 | Local Offline Deployment and Final Testing | §§18–20/24; old guide phase 8; UI-7 |

All required sources are present, non-empty and readable: original DOCX SRS (successfully extracted with amendments), this guide, the UI specification, HTML prototype and AGENTS.md. SRS business authority is unchanged. Canonical screens/contracts are defined in implementation-plan §6 and UI-spec §§2.3/8.3. Use web/ for application files and commands, with shared docs at the root. The root guide is a synchronized convenience copy.

# 1. Executive architecture decision

## 1.1 What the SRS actually requires

The SRS describes a single-shop web-based system with two roles, **Admin** and **Salesperson**. Admins manage products, initial and additional stock, purchase costs, inventory corrections, sales corrections, dashboards, low-stock alerts, and reports. Salespersons record a product, quantity, and flexible selling price; they must **not** receive remaining stock or confidential purchase/profit data. Every sale automatically decreases inventory, captures its purchase cost and profit, and appears in sales history. Reports must support daily, monthly, custom-date, and product-level views. Default currency is **PKR**. Screens must work on desktops, laptops, tablets, and phones.

The late SRS amendments are authoritative: when Admin changes a product purchase cost, **all remaining inventory adopts that new current cost**, and **previously completed sales retain their saved historical cost and profit**. Admin can also correct stock counts, with who/when/before/after audit information. Barcode scanning, expense tracking, customer management, and multi-branch support are **outside version 1**.

## 1.2 What “offline” means in this project

The user confirmed that the POS must continue working **without internet**. This guide commits to the following practical interpretation:

- A **shop-local server** runs the application and PostgreSQL; the shop's **local router/switch/LAN** connects salesperson devices.
- No request involved in a sale, stock update, login, or report should need the public internet. Production assets must be bundled locally; do not rely on external CDNs, internet-hosted fonts, Google OAuth, remote databases, or cloud APIs.
- When the shop's internet connection fails but its **LAN and local server still work**, the POS continues normally; transaction confirmations come from the local database.
- When the shop server or LAN fails, network-connected devices **cannot** make authoritative sales. Standalone disconnected-device sales and later conflict resolution would require a separate synchronization project, **not** promised by this guide.
- Optional off-site backups or remote administration may run when internet returns but must never block sales.

## 1.3 Final recommended stack

| Concern | Chosen technology | Why |
|---|---|---|
| Web UI and backend | Next.js App Router + TypeScript | One codebase for admin, sales, server routes, and server-rendered screens |
| Visual components | Tailwind CSS + shadcn/ui | Accessible forms and responsive management tables |
| Relational database | PostgreSQL on shop-local server | Transactional stock and sales consistency |
| Database access | Prisma ORM **7-compatible generation** | Typed data access; check compatibility before upgrading to Prisma 8 |
| Login and sessions | Better Auth + local database-backed sessions | No dependency on an online identity provider |
| Validation | Zod + React Hook Form | Identical browser/server input contracts |
| Charts | Recharts | Admin visualizations without external connectivity |
| Test automation | Vitest + Playwright | Unit, database integration, and browser flows |
| Development | VS Code + OpenAI Codex + Git | Iterative, reviewable feature-by-feature changes |
| Deployment | Docker Compose on local Linux mini-PC/server | Repeatable offline deployment and persistent storage |
| LAN reverse proxy | Caddy with internal TLS CA | HTTPS for local clients; clients must trust local root certificate |
| Backups | Scheduled PostgreSQL logical backups + encrypted external destination | Recover from hardware or data loss |

**Version compatibility note (October 2026):** The Prisma documentation currently distinguishes Prisma 7's `PrismaClient` APIs from Prisma 8's new runtime. The established Better Auth Prisma integration guide targets Prisma 7. **Pin and test compatible versions**, record them in the lockfile, and do not casually copy Prisma 8 transaction syntax into a Prisma 7 application. See references at the end.

## 1.4 Architecture diagram

```text
              INTERNET NOT REQUIRED FOR DAILY OPERATION

 ADMIN PC / TABLET                     SALESPERSON PC / PHONE
       |                                         |
       +------------------ LOCAL LAN -----------+
                            |
                    SHOP LOCAL SERVER
                            |
                 Caddy reverse proxy (HTTPS)
                            |
                     Next.js application
                  /          |           \
          Better Auth     Business       Reports
          (sessions)      services       / charts
                            |
                     Prisma ORM v7
                            |
                    Local PostgreSQL
                  /        |          \
              products    sales     ledgers / audit
                            |
                Encrypted scheduled backups
                (separate disk; optional cloud copy)
```

**Engineering principle:** all business-critical writes run on the server and commit in one database transaction. The React UI never updates authoritative inventory directly.

---

# 2. Scope, definitions, and release gates

## 2.1 Modules to implement

1. Foundation, configuration, deployment, and project structure.
2. Local login, account management, and Admin/Salesperson access control.
3. Product and optional category master data.
4. Initial inventory and incoming stock receipts.
5. Purchase-cost changes and cost-history preservation.
6. Inventory ledger, low-stock state, and Admin stock corrections.
7. Salesperson POS and server-side sale processing.
8. Sales history, Admin corrections, and audit trail.
9. Daily, monthly, custom-range, and product-wise reports.
10. Admin dashboard and visual analytics.
11. Search, validation, error handling, and responsive UX.
12. Backup, restore, monitoring, offline/LAN deployment, and operational support.
13. Automated testing, migration discipline, acceptance testing, and handover.

## 2.2 Requirements that remain unspecified in the SRS

**No unsupported business rule is selected.** The Pending Business Decisions register in implementation-plan §9.1 is authoritative for decision status. The five groups below remain pending; historical defaults and code/schema snippets are conditional examples, not permission to enforce whole units, one-item checkout, positive-only pricing or a receipt-cost policy. Pure Phase 2 tokens/themes/shells may proceed only when separately authorized; affected mocks/schema/business logic require their applicable decision/review.

| Open question | Current decision status / retained proposal | Why confirmation matters |
|---|---|---|
| One sale = one product, or multi-line basket? | **PENDING D02:** checkout cardinality not selected | Multi-item checkout changes sales schema/UI |
| Quantity type | **PENDING D03:** whole versus fractional units, precision and rounding | Weight-based goods need decimals and different inventory constraints |
| Can salesperson sell below cost or at zero? | **PENDING D07:** owner chooses below-cost/zero/override rules; no positive-only or cost-floor default | Flexible selling price does not automatically authorize loss-making sales |
| Different cost on newly received stock | **PENDING D05:** receipt-only versus explicit linked repricing and date/correction policy | SRS records receipt price but separately defines current-price changes; relationship is unspecified |
| Timezone/day cutoff | Proposed `Asia/Karachi`, calendar-day boundaries; confirm before reports | Prevents misleading daily reports |
| Returns/refunds/voided sales | **PENDING D06/D09:** decide correction/void/return scope; no standalone workflow approved | Not included explicitly |
| Taxes, discounts, cash drawer, payment methods, printed receipts | No additional feature scope approved; retain as D08 decisions | Not in SRS |
| Deleting products with history | Proposed archive UX under D04; preserve referenced history regardless | Preserves historical reporting |
| Who can create salesperson accounts? | Admin-only provisioning proposed; exact management/reset scope remains D11 | Matches two-role controlled system |
| Sale product or date edit | **PENDING D06/D09:** correction fields, additional-unit cost and reporting date attribution | Affects historical integrity and reports |
| Hardware ownership and outage tolerances | Proposed dedicated local server, stable LAN and UPS; hardware/recovery targets remain D13/D14 | Determines actual offline reliability |

**Release gate:** resolve the questions that affect data integrity (quantity type, cost-on-receipt, sale corrections) before finalizing migrations. Clearly record decisions in `docs/decisions/`.

## 2.3 Definitions

- **Current cost**: product's purchase-cost rate that applies to all units *currently remaining* following the confirmed SRS rule.
- **Cost snapshot**: the purchase cost captured permanently on an individual sale when recorded.
- **Stock on hand**: currently available quantity for a product.
- **Stock movement**: immutable event that changes stock, e.g., receipt `+20`, sale `-2`, correction `+3`.
- **Gross profit**: `(sale unit price − sale cost snapshot) × quantity` (not business net profit; expenses are out of scope).
- **Idempotency key**: client-generated unique identifier to stop the same action being applied twice.

---

# 3. Repository design and coding conventions

## 3.1 Directory plan

This original logical tree is retained for module references. Application paths shown as src/, prisma/, tests/ and package/config files are under web/ in this repository. Shared docs/ and AGENTS.md remain at the repository root. Production packaging paths are finalized in master Phase 9. Do not recreate the project at the root.

```text
pos-system/
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (admin)/admin/dashboard/page.tsx
│   │   ├── (admin)/admin/products/page.tsx
│   │   ├── (admin)/admin/inventory/page.tsx
│   │   ├── (admin)/admin/sales/page.tsx
│   │   ├── (admin)/admin/reports/page.tsx
│   │   ├── (sales)/pos/page.tsx
│   │   └── api/auth/[...all]/route.ts
│   ├── components/ui/               # shadcn components
│   ├── components/shared/           # tables, alerts, date selectors
│   ├── features/auth/               # service, permissions, schemas
│   ├── features/products/           # UI, actions, service, repository
│   ├── features/inventory/          # receipt, reprice, adjustments
│   ├── features/sales/              # create, correct, search
│   ├── features/reports/            # queries, aggregations
│   ├── lib/db/                      # Prisma client, transactions
│   ├── lib/validation/              # Zod reusable inputs
│   ├── lib/security/                # session and RBAC enforcement
│   ├── lib/time/                    # timezone and reporting windows
│   └── generated/prisma/            # generated; never edit manually
├── prisma/schema.prisma
├── prisma/migrations/
├── tests/unit/
├── tests/integration/
├── tests/e2e/
├── docker/Caddyfile
├── scripts/backup/
├── docs/requirements/Software Requirements Specification.docx
├── docs/decisions/
├── docs/runbooks/
├── AGENTS.md
├── Dockerfile
├── compose.yaml
├── prisma.config.ts
├── .env.example
└── package.json
```

**Route-group warning:** `(admin)` and `(sales)` folder names do *not* appear in URLs. The explicit `/admin/...` and `/pos` folders determine URLs.

## 3.2 Layering pattern for every feature

- **Page/component:** render authorized data; collect input; show feedback; no financial logic.
- **Server Action or Route Handler:** parse input; obtain session; verify permissions; call service; return sanitized DTO.
- **Service:** enforce domain rules; coordinate transactions and ledgers; throw typed errors.
- **Repository/query:** database reads/writes using a passed Prisma transaction client where needed.
- **Schema:** Zod input validation, plus database constraints.
- **Tests:** pure validation tests + transaction integration + browser acceptance.

**Rule:** every write service that adjusts stock must be transaction-aware; helper methods must accept the current transaction, not open a second independent one.

## 3.3 Coding standards

- Strict TypeScript; no `any` around money, IDs, or permissions.
- Never import database clients into browser components.
- Use PKR minor units or `Decimal(18,2)` consistently. Prefer `Decimal` in DB, decimal-safe operations on server, formatted money strings in DTO. Never calculate prices using JS floating-point arithmetic.
- UTC timestamps in PostgreSQL; convert to `Asia/Karachi` when applying local-day filters.
- Do not store an independently editable dashboard profit total; derive from sales or validated aggregates.
- Standard error codes: `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `INSUFFICIENT_STOCK`, `DUPLICATE_REQUEST`, `CONFLICT`, `NOT_FOUND`.
- Transactions are immutable in the audit sense: supersede/correct with logged events; preserve original values or revision history.

---

# 4. Database and constraints

## 4.1 Entity plan

| Entity | Essential fields | Rules / indexes |
|---|---|---|
| `User` / `Session` / `Account` / `Verification` | Provided by compatible Better Auth schema; add `role`, `isActive` to user safely | Unique login identifier, no anonymous signup |
| `Category` | id, name, active | Optional; uniqueness strategy defined |
| `Product` | id, sku?, name, categoryId?, currentCost, stockOnHand, lowStockThreshold, archivedAt?, createdAt, updatedAt | `currentCost >= 0`, `stockOnHand >= 0`, threshold >= 0; name/search indexes |
| `StockReceipt` | id, productId, units, unitCostEntered, recordedAt, recordedById, referenceNote? | units > 0; immutable receipt record |
| `StockMovement` | id, productId, delta, stockAfter, type, referenceId, recordedAt, actorId | immutable; unique reference/event key; per-product chronological index |
| `PurchaseCostChange` | id, productId, oldCost, newCost, effectiveAt, actorId, reason? | immutability; new price affects only stock not completed sales |
| `Sale` | id, requestKey, productId, quantity, unitSellPrice, unitCostSnapshot, amount, grossProfit, createdAt, createdById, currentRevision, status | unique requestKey; quantity > 0, exact decimals; date/product indexes |
| `SaleCorrection` | id, requestKey, saleId, priorRevision, beforeJson, afterJson, reason, actorId, correctedAt | unique requestKey and `(saleId, newRevision)` |
| `StockAdjustment` | id, productId, beforeQty, afterQty, reason, actorId, adjustedAt, requestKey | unique requestKey; server-only |
| `AuditLog` | id, action, entityType, entityId, actorId, beforeJson, afterJson, timestamp, requestId | append-only, indexed by entity / actor / time |

**Additional design note:** the one-product-per-row `Sale` is a historical engineering example; D02 must settle checkout cardinality before schema approval. If multi-line receipts are approved, split into `SaleHeader` and `SaleItem` before creating migrations; do **not** retrofit a second model casually after production data arrives.

## 4.2 Invariants that must never be broken

1. `Product.stockOnHand >= 0`.
2. Each committed sale subtracts stock **exactly once**, and each unique request key represents at most one sale.
3. `Sale.amount = Sale.quantity × Sale.unitSellPrice`.
4. `Sale.grossProfit = Sale.quantity × (Sale.unitSellPrice − Sale.unitCostSnapshot)`.
5. Changing `Product.currentCost` does not modify existing `Sale.unitCostSnapshot`.
6. Each stock-changing action has exactly one correctly associated signed stock movement; sums reconcile to stock-on-hand from controlled opening balances.
7. Each admin correction updates stock, sale revision, corrected economics, and audit trail **atomically**.
8. Salesperson API responses never contain current stock, cost, or profit fields.
9. Foreign-key references to historical entities remain valid after archival.

Implement integrity checks at **two levels**: DB constraints/unique indexes for mechanically verifiable invariants, and domain services for workflow semantics. For critical invariants Prisma cannot express in the schema, add reviewed SQL migration constraints.

## 4.3 Money and timestamps

Proposed storage is Prisma `Decimal @db.Decimal(18, 2)` / PostgreSQL `NUMERIC(18,2)` for PKR prices, costs, revenue and profit. Final bounds, fractional-quantity rounding and stored/display precision require schema review under D03/D07; this example does not settle them. Do not use DB `FLOAT` or React `number` arithmetic for final financial calculations. Parse validated price strings into Decimal; format as `Rs. 1,200.00`. If the shop only accepts whole rupees, change display precision **after** agreeing on a stored precision policy.

Store `createdAt` as UTC/timestamptz and use a half-open reporting window: `createdAt >= startOfLocalDayUTC AND createdAt < startOfNextLocalDayUTC`. Avoid constructing a date filter by subtracting `24h` without timezone rules.

## 4.4 Illustrative schema fragment (Prisma v7 style)

**Conditional example, not an approved schema:** Int quantities and a single-product Sale below reflect the historical prototype assumption. D02/D03 must resolve cardinality and quantity type before master Phase 4 migrations; related cost/correction policies also need approval. Preserve the confirmed repricing/history rule regardless of those decisions.

```prisma
// Adapt model names/relations to the installed Better Auth schema.
model Product {
  id                 String   @id @default(uuid())
  name               String
  currentCost        Decimal  @db.Decimal(18, 2)
  stockOnHand        Int      @default(0)
  lowStockThreshold  Int      @default(5)
  archivedAt         DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  sales              Sale[]
  @@index([name])
}

model Sale {
  id                 String   @id @default(uuid())
  requestKey         String   @unique
  productId          String
  product            Product  @relation(fields: [productId], references: [id])
  quantity           Int
  unitSellPrice      Decimal  @db.Decimal(18, 2)
  unitCostSnapshot   Decimal  @db.Decimal(18, 2)
  amount             Decimal  @db.Decimal(18, 2)
  grossProfit        Decimal  @db.Decimal(18, 2)
  createdAt          DateTime @default(now())
  createdById        String
  currentRevision    Int      @default(1)
  @@index([createdAt])
  @@index([productId, createdAt])
}
```

This is an **extract**, not the complete schema; Codex must add the complete relations, stock movements, corrections, receipts, authentication tables, and database CHECK constraints.

## 4.5 Migration workflow

1. Generate schema from confirmed decisions; obtain an explicit review before migration.
2. Use `npx prisma migrate dev --name initial_schema` only in development.
3. Use `npx prisma migrate deploy` on the shop server **after a verified backup**.
4. Do not use `prisma db push` to bypass migrations in production.
5. Store migration SQL in Git; review destructive changes; test migrations against a copy of existing production data.

---

# 5. Module 1 — Local authentication, user administration, and RBAC

**SRS need:** separate Admin and Salesperson accounts; salesperson can only record sales and must not see stock or profit.

**Screens:** `/login`, `/admin/accounts` (proposed Admin management screen), `/admin/...`, `/pos`.

**Implementation:**

1. Install/configure the compatible Better Auth integration with Prisma **7**, enabling username/email-and-password login as supported by the selected version. Choose offline credentials; do not use Google/GitHub/social login.
2. Generate Better Auth schema, preserve its account/session/verification models; add an Admin/Salesperson role enum or validated role column.
3. Disable public registration after the **one-time secure bootstrap** account creation. Only Admin can create/disable salesperson accounts.
4. Store hashed credentials through the auth provider; do not implement custom password hashing or raw token storage.
5. Use server-side `requireSession()` and the appropriate role/operation check in every protected loader, action and handler; Admin entry points require `requireRole('ADMIN')`. Salesperson sale/confirmation entry points require their own authorized scope.
6. Build separate response DTOs: `SalespersonProductOption = { id, name }`; do not return `stockOnHand`, `currentCost`, or profit even in hidden HTML/JSON.
7. Allow logout; short idle/session expiration policy; password rotation; disable accounts without deleting sale history.
8. Prefer HttpOnly, Secure, SameSite cookies under local HTTPS and an explicit local origin; validate CSRF/origin behavior for current Better Auth/Next.js versions.

**Example permission matrix:**

| Operation | Admin | Salesperson |
|---|---|---|
| View product names for sale | Yes | Yes |
| See stock counts / unit cost | Yes | No |
| Manage products and stock | Yes | No |
| Submit sale | **PENDING D10** | Yes |
| Read profit reports | Yes | No |
| Correct sale / stock | Yes | No |
| Manage users | Yes | No |

**Acceptance:** attempts to call admin action/URL directly as Salesperson receive `403`; sanitized product selector returns only public fields; inactive account cannot sign in; login still succeeds when WAN is disconnected.

**Codex task:** “After the Phase 4 module and D11 policies are approved, implement local Better Auth login with roles and no public signup; add session/operation guards, role-safe DTO mappers and forbidden endpoint tests. Admin POS creation remains D10 and must not be granted by a convenience role helper. Do not implement inventory changes yet.”

---

# 6. Module 2 — Product and category management

**SRS need:** Admin creates products with name, optional category, initial quantity, purchase price, and low-stock threshold; searches products. Salespersons select product by name only.

**Admin UI:** `/admin/products`: paginated/searchable table, Add/Edit dialog, archived filter. Fields: `name`, `categoryId?`, `currentCost`, `initialQuantity`, `lowStockThreshold`, optional internal SKU (proposed, not mandated).

**Implementation:**

1. Validate trimmed name, valid exact cost >= 0 and nonnegative opening quantity/threshold under the approved D03 unit, scale, limits and rounding policy. Integer-only validation is not yet approved.
2. Create Product **and** opening inventory movement in the same transaction; set opening stock from the submitted initial quantity.
3. Duplicate names: either enforce uniqueness within category or permit same name with SKU—must be product-owner approved. Do not silently merge two product records.
4. Edits to cost must call the special **purchase-price change service**, never a generic product update.
5. Edits to stock must call **stock adjustment service**, never raw `product.update({ stockOnHand })`.
6. Show low-stock visual state when quantity <= threshold, but only on Admin screens.
7. Archive products rather than deleting them; block sale of archived products. Keep historical reports intact.
8. For Salesperson search, expose only `id` and `name`, excluding quantity, cost and internal notes. An optional public category would require an approved DTO extension.

**Server interfaces (illustrative):** `listAdminProducts(filters)`, `listSaleProductOptions(search)`, `createProduct(input, adminId)`, `editProductDetails(input, adminId)`, `archiveProduct(productId, adminId)`.

**Acceptance:** initial stock is reconciled to opening movement; duplicate/invalid inputs rejected; product hidden from POS after archive; Salesperson product search never exposes quantity/cost.

---

# 7. Module 3 — Stock receipts and incoming inventory

**SRS need:** when additional stock arrives, Admin selects existing product and enters quantity, unit purchase cost and date; stock increases and receipt history remains available.

**Admin UI:** `/admin/inventory/receive`: Receive Stock form, product picker, positive quantity under approved D03 units/precision, purchase unit cost, actual receipt date, note/reference; history by product/date.

**Implementation:**

1. Validate Admin session; product exists and is active; quantity > 0; date valid; price non-negative.
2. Require a unique `requestKey` (UUID) generated for the form submission; dedupe retries.
3. Use a single transaction: write `StockReceipt`, increase `Product.stockOnHand`, insert `StockMovement { type: RECEIPT, delta: +quantity, stockAfter }`, and audit.
4. Use atomic update/locking for stock and price changes, preventing conflicting read-modify-write.
5. **Open business rule:** if receipt's unit purchase cost differs from `Product.currentCost`, the SRS does not unambiguously say whether receiving stock *automatically* reprices all older units. **PENDING D05:** receipt-only and an explicitly linked “Receive + Reprice All Remaining Stock” operation remain alternatives, with no default selected. If a linked operation is approved, record both events atomically. Never implement weighted-average or FIFO costing: that would contradict the confirmed single-current-cost rule.
6. Maintain receipt's entered unit cost for purchasing history, even if later product current cost changes.
7. Render newly available stock immediately after successful local commit, without depending on background synchronization.

**Acceptance:** receiving +20 on 50 makes 70; request retry does not add another +20; receipt and movement are present; price divergence requires explicit policy response.

---

# 8. Module 4 — Purchase-cost changes (critical SRS amendment)

**SRS need:** Admin may change current product purchase cost. Updated price immediately applies to **every remaining unit** of that product, including units acquired earlier and future stock; completed sales must remain unchanged.

**Admin UI:** `/admin/inventory/reprice`: old/current cost, new cost, required confirmation, optional reason, cost-change timeline.

**Implementation:**

1. Admin-only mutation `changeCurrentPurchaseCost(productId, newCost, actorId, requestKey)`.
2. Validate exact decimal new cost >= 0; reject archived product unless specified by policy.
3. Inside one transaction, acquire write access to the product row, record old cost, update `currentCost`, insert `PurchaseCostChange`, insert `AuditLog`.
4. **Do not rewrite** any `Sale.unitCostSnapshot`, revenue, or historical profit.
5. Since all remaining units share a single current cost, do not implement purchase-batch costing for sale profit in v1.
6. A sale must read/capture the current cost under proper locking/atomic semantics at sale time (avoid a stale price read during a concurrent cost change).
7. Ensure a new receipt either inherits the updated current cost or explicitly follows the agreed cost-difference behavior from Module 3.

**Worked example:** 50 units × Rs.1,000 cost; sell 10, snapshot Rs.1,000 for those sales; Admin changes cost to Rs.1,100 for remaining 40; receive 20 more at the approved current rate; new stock 60 with Rs.1,100 current cost; old sales remain at the Rs.1,000 snapshot.

**Acceptance:** historical profit totals do not change when current purchase cost is edited; later sales use the new cost; parallel reprice/sale cannot record inconsistent cost.

---

# 9. Module 5 — Inventory movements, reconciliation, and stock adjustments

**SRS need:** immediate available quantities, zero overselling, low-stock warnings, Admin corrections including before/after and actor/timestamp.

**Admin UI:** `/admin/inventory`: current counts, low-stock flag, movement timeline, “Adjust Stock” action (requires reason).

**Implementation:**

1. Make `stockOnHand` the performant current balance, backed by an append-only ledger of `StockMovement` records.
2. Movement types: `OPENING`, `RECEIPT`, `SALE`, `SALE_CORRECTION`, `ADMIN_ADJUSTMENT`. Add type-specific references and unique event key.
3. For a manual count correction: read/lock current product row, validate target stock >= 0; compute `delta = target - before`; update product, insert `StockAdjustment(before, after, reason, actor)` and signed `StockMovement`, and audit in one transaction.
4. Never allow salesperson adjustment; never allow direct UI `stockOnHand` edits outside service.
5. **Reconciliation command:** compute `opening + SUM(delta of post-opening movements)` per product; compare to `stockOnHand`. Report any discrepancy without automatic silent rewriting. Keep an auditable manual repair process.
6. Warn Admin if `stockOnHand <= lowStockThreshold`; show badges/filters and dashboard counts.
7. Log who counted stock and when. Keep all event timestamps and reasons.

**Acceptance:** stock correction 48 → 45 generates `-3`; duplicate correction request has no second effect; reconciliation matches for every product; salesperson receives no stock data.

---

# 10. Module 6 — Salesperson POS and sale processing

**SRS need:** minimal-step screen to select a product, enter quantity and flexible selling price, and submit sale; backend checks stock without displaying it, stores date/time, computes profit, deducts stock once.

## 10.1 Salesperson interface

**Route:** `/pos`. Layout with large searchable product dropdown, quantity input (default 1), unit price in PKR, **Record Sale** primary button, clear confirmation or failure message, keyboard-friendly and mobile responsive.

Client must generate `requestKey = crypto.randomUUID()` once for each intended sale and retain/reuse it until the server resolves the original outcome. Never discard it or create a replacement sale/key merely because a response was lost. Disable Save while processing but **do not depend on button disabling for correctness**.

Product choices must be DTOs like `{ id, name }`. Do not send actual available inventory or purchase costs to the browser.

## 10.2 Backend sale algorithm

1. Validate session and `SALE_CREATE` permission.
2. Validate canonical RecordSaleInput structure and requestKey UUID; normalize/hash the intended payload. Apply approved D02/D03/D07 policies to new intents. An authorized replay of a committed intent must not fail because its product was later archived. The single-product SQL example is conditional, not approval of a one-item or integer-only rule.
3. For an existing key, verify operation/actor authorization and normalized payload match before returning the same persisted safe confirmation. Reject changed-payload reuse without revealing another actor's result.
4. Begin a database transaction and serialize/claim the operation key before deducting stock. Concurrent identical-key requests wait for/retrieve the original committed result; they must not become an insufficient-stock rejection merely because the first request consumed the last unit. A failed claim/write rolls back with the business writes; use the reviewed operation-key protocol in implementation-plan §5.3.
5. Atomically conditionally deduct the requested units (`WHERE stock_on_hand >= quantity AND product active`), and obtain the **current purchase cost after proper serialization with price changes**. If zero rows changed, return a generic `INSUFFICIENT_STOCK` without revealing stock count.
6. Persist sale/items under the approved model with unique requestKey, product/name and cost snapshots, quantities, selling prices, exact revenue/profit, employee ID and timestamp.
7. Insert a unique linked `StockMovement` of `-quantity` and an appropriate audit event.
8. Commit; return canonical SaleConfirmation from persisted committed data (section 17.1 / implementation-plan §6.2). Include the safe item breakdown, total, requestKey, saleId, recording time and PKR currency. Never return purchase cost, profit or remaining stock, and never confirm from a browser echo.
9. On uniqueness conflict from a concurrent same-key claim, roll back/wait and resolve the authorized matching original outcome before returning its equivalent safe confirmation. On transient serialization/deadlock errors, retry the **whole** transaction a bounded number of times. No unresolved original outcome permits a replacement key.

For critical stock and cost simultaneity, use a reviewed, **parameterized SQL `UPDATE ... RETURNING`** or another proven row-lock protocol in the transaction. PostgreSQL serializes updates to the same product row; cost reprice and sale stock decrement must both update/lock that row. A read-before-update without appropriate locking can capture the wrong historical cost.

## 10.3 Core transactional query pattern (illustrative PostgreSQL)

```sql
-- Execute this with bound parameters, inside an application transaction.
UPDATE products
SET stock_on_hand = stock_on_hand - $2
WHERE id = $1
  AND archived_at IS NULL
  AND stock_on_hand >= $2
RETURNING current_purchase_cost, stock_on_hand;
```

If no row is returned, fail without inserting the sale. The application then calculates exact Decimal amounts using `current_purchase_cost` returned by the successful update; inserts sale and movement; commits once. Database table/column names must match actual Prisma migration output.

**Why this pattern:** with two employees trying to sell a single remaining unit, the row update allows only one to succeed. Client-only validation cannot guarantee this.

## 10.4 Required automated tests

- Sale of 2 units from 50 leaves 48; revenue and profit correct.
- Same product sold at different prices generates distinct revenue/profit results.
- Sale of quantity greater than stock fails and changes nothing.
- Two simultaneous requests for last available unit: exactly one succeeds, stock never negative.
- Same `requestKey` repeated or double-clicked: exactly one sale and one movement.
- Admin changes cost concurrently with sale: sale snapshot and historical cost satisfy transaction order.
- Salesperson can never extract stock or profit through UI, action response, network payload, API, or error text.

---

# 11. Module 7 — Sales history and Admin correction workflow

**SRS need:** complete searchable sales history, Admin correction of an incorrect entry, corresponding inventory/profit adjustment, and preserved correction history.

**Admin UI:** `/admin/sales` with date and product filters; details drawer; Correct Sale action with required reason, before/after preview, final confirmation.

**Implementation:**

The same-product quantity/price examples below do not define the full correction scope. Resolve D06/D09, including additional-unit cost treatment and reporting date attribution, before implementing this module.

1. Search sales by date range, product and transaction ID. Avoid exposing entire history to Salespersons.
2. Keep original sale details in history. Use a `currentRevision` and `SaleCorrection` snapshots for before/after, actor and reason.
3. For quantity correction of **the same product**, calculate `inventoryDelta = oldQuantity − newQuantity` (e.g., 5 → 2 produces `+3`).
4. Inside **one** transaction, lock the sale and affected product rows; check expected revision; validate adjusted stock never negative; update effective quantity/revenue/profit under the approved correction-cost policy while retaining original snapshots; append correction and any signed movement; increment revision; append audit log.
5. If selling price is corrected, change revenue and profit but **not** inventory; cost snapshot stays the original sale cost.
6. Idempotently handle `requestKey` and reject stale `expectedRevision` with a conflict response, avoiding two Admins overwriting each other's correction.
7. If correcting **product identity or sale timestamp**, require a separately specified policy; product changes demand atomic return to one SKU and deduction from another, and retroactive cost/timestamp changes have additional accounting effects. Do not enable these operations before defining them.
8. Do not delete or overwrite historical correction events. A searchable latest-state view may show the corrected amount, but audit history must show before/after.

**PENDING D06/D09:** repricing must preserve completed-sale original costs/profits. For an audited quantity increase, whether additional units use the original cost snapshot or another explicitly defined correction treatment remains unresolved. Retaining the original snapshot for all units is a historical proposal, not a selected default. Always preserve original and corrected revisions.

**Acceptance:** 5→2 restores 3 units and profit is recomputed; correction retried does not restore 3 again; price-only edit has no stock movement; concurrent stale correction rejected; old versions remain visible to Admin.

---

# 12. Module 8 — Daily, monthly, and custom-date reports

**SRS need:** daily and monthly revenue/profit, product and quantity counts, best-selling products, product-wise history, date filtering, and custom ranges.

**Admin UI:** `/admin/reports` with Daily / Monthly / Custom tabs, date and product filters, summary cards and sortable product table. Export is an **optional enhancement** (not mandated).

**Queries and definitions:**

- `totalRevenue = SUM(effectiveSale.amount)` for included sales.
- `totalGrossProfit = SUM(effectiveSale.grossProfit)`.
- `totalQuantity = SUM(effectiveSale.quantity)`.
- `distinctProducts = COUNT(DISTINCT productId)` for products sold during period.
- `numberOfTransactions = COUNT(saleId)` — useful extra, but distinguish from products/quantity.
- `bestSellingProducts` sorted by sum(quantity), with separate revenue/profit metrics.
- Daily chart grouped by `Asia/Karachi` calendar date; monthly chart grouped by shop-local calendar month.

**PENDING D06/D09 — corrected sales and historical reports:** resolve original-sale-date versus correction-date attribution before report implementation; neither is the approved default. Preserve original recording time and correction time in audit history so the chosen policy is testable. Any “as originally reported on date X” view also needs an explicit scope decision.

**Implementation:**

1. Require Admin role in server query—not just on report page.
2. Validate requested date range and limit unreasonable spans if necessary.
3. Convert local start/end dates to UTC `[start, end)` timestamps.
4. Aggregate in PostgreSQL, not by fetching all rows into the browser.
5. Add indexes `Sale(createdAt)` and `Sale(productId, createdAt)`; inspect actual query plans as data grows.
6. Return only aggregated and appropriately rounded exact money strings.
7. Add fixtures covering midnight boundaries, month end, correction history and no-sales empty states.

**Acceptance:** daily, monthly and custom totals reconcile to the same underlying effective sales. On a local WAN-off test, reports remain usable.

---

# 13. Module 9 — Product-wise sales, profit and stock history

**SRS need:** selecting a specific product shows current cost, remaining stock, total sold, revenue, profit, daily/monthly breakdown, and previous stock additions.

**Admin UI:** `/admin/products/[id]` with Overview, Sales, Stock Receipts, Stock Movements, Cost History and Correction History sections.

**Implementation:**

1. Load product and current stock for Admin only.
2. Query aggregate quantity sold/revenue/profit from effective sale records with optional `[start, end)` filter.
3. Query receipt history and signed movement ledger, separately from sales aggregates to avoid SQL double-counting joins.
4. Show current cost as current information; historical sales show their own unit cost snapshot. Do not calculate old profit against today's purchase cost.
5. Include daily and monthly grouped series for charts; paginate transaction/receipt tables.
6. Retain archived-product detail/history for Admin and prevent further sale if archived.

**Acceptance:** a reprice changes current cost but not historical profit in this view; product filter aligns with global reports; stock receipts and corrections reconcile.

---

# 14. Module 10 — Low-stock alerts

**SRS need:** each product has a configurable threshold; Admin sees warnings when `stockOnHand <= threshold`.

**Admin UI:** dashboard “Low Stock Products”, inventory filter, clear red/orange visual status and accessible text label.

**Implementation:**

1. Persist threshold on product.
2. Compute low-stock status from live quantity and threshold using a database query (avoid a fragile separate boolean flag).
3. Query active products with `stockOnHand <= lowStockThreshold`, sorted by urgency.
4. Trigger appearance immediately after a successful sale or stock adjustment; refresh affected server component/query.
5. No email/SMS notification dependency; on-screen alerts work without internet.

**Acceptance:** exactly threshold counts as low stock; restocking above threshold clears warning; salesperson never receives alert list.

---

# 15. Module 11 — Admin and Salesperson dashboards

## 15.1 Admin dashboard

**SRS metrics:** product count, stock total, low stock, recently added stock, today's revenue/profit, month's revenue/profit, daily/monthly sales/profit charts, product-wise profit comparison and best sellers.

**Implementation:**

- Route `/admin/dashboard`, with Admin authorization on the data access layer.
- A query service calculates dashboard summary with the same definitions as Reports module.
- Display four headline metrics, low-stock table, recent receipts, trend charts and top products.
- Timezone explicit in subtitle, e.g., “Today — Karachi time”.
- Use Recharts with screen-reader labels/table alternatives; show formatted PKR values.
- Empty dataset state should say “No sales recorded yet”, not show broken charts.
- Avoid client polling faster than necessary; a clear refresh button or modest refresh interval is enough for a single shop.

## 15.2 Salesperson dashboard

This is the POS screen itself: product picker, quantity, unit price, submit, outcome message. **No Admin-only cards, counts, profits, or stock values**.

**Acceptance:** charts and report cards use consistent numbers; Admin dashboard available with no internet; role checks block salesperson URLs/APIs.

---

# 16. Module 12 — Validation, UX, and reliability

**Validation requirements:** positive sale quantities with D03-approved precision, exact costs/prices under approved D07 zero/below-cost rules, date and role checks, friendly server errors. Frontend validation improves usability but never replaces server validation.

**UI checklist:**

- Mobile-first form layouts, large tap targets, keyboard shortcut/Enter submit where safe.
- Confirmation visibly states product, quantity, sell price, success, transaction reference; no private cost/profit data.
- Server errors differentiated: validation, stock unavailable, permission denied, local server unavailable, duplicate request resolved.
- Do not reveal actual remaining stock in a salesperson error (“Requested quantity unavailable” is sufficient).
- Keep field values when submission fails. Prevent accidental duplicate submissions with both button state and idempotency on backend.
- Locale formatting: `en-PK` (or preferred localized language) and explicit `PKR` labels.
- Accessible labels, form focus, confirmation announcements and color-independent warning text.

**Connectivity behavior:** a missing response does not mean a sale failed. Show **“Outcome unconfirmed. Reconnect to check this sale.”** Preserve the original intent/requestKey and check or retry with that same key until the server resolves the outcome. Never create a replacement sale with a new key merely because the response was lost. Only committed server data can produce “Sale recorded”; a confirmed rejection/rollback is distinct from an unknown outcome. A connectivity/liveness check cannot establish the outcome of an interrupted sale.

---

# 17. Module 13 — API and application contracts

For the Next.js monolith, prefer **Server Actions** for authenticated forms and **Route Handlers** only where explicit HTTP behavior is useful. Regardless of mechanism, treat all entry points as public attack surfaces requiring validation and authorization.

| Contract | Authorized role | Inputs | Success output |
|---|---|---|---|
| `createProduct` | Admin | name, cost, openingQty, threshold, category? | productId |
| `receiveStock` | Admin | productId, quantity, cost, date, requestKey | receiptId, updatedQty |
| `repriceProduct` | Admin | productId, newCost, reason, requestKey | changeId |
| `adjustStock` | Admin | productId, newQty, reason, requestKey | adjustmentId |
| `listSaleOptions` | Logged in | search | **id, name only** |
| `recordSale` | Salesperson; Admin POS access pending D10 | Canonical RecordSaleInput; D02/D03/D07 policies pending | Canonical SaleConfirmation (section 17.1) |
| `listSales` | Admin | product, dates, pagination | sanitized Admin table rows |
| `correctSale` | Admin | saleId, expected revision, approved D06/D09 correction fields, reason, requestKey | correctedRevision |
| `getAdminDashboard` | Admin | local date range | private summary and charts |
| `getReports` | Admin | date start/end, product? | revenue/profit/quantity aggregates |

**Do not expose a generic `updateProduct` API that accepts arbitrary `stockOnHand` or `currentCost` properties.** Dedicated explicit business operations protect the SRS rules.

---

### 17.1 Canonical confirmation and outcome contracts

Use the exact RecordSaleInput / SaleConfirmation definitions in docs/IMPLEMENTATION_PLAN.md §6.2 and UI specification §8.3. The request uses requestKey and item fields productId, quantity and unitSellingPrice. The committed response contains status COMMITTED, requestKey, saleId, recordedAt, currency PKR, items (productId/productName/quantity/unitSellingPrice/lineTotal) and totalAmount. Exact numeric values are strings. Item-list encoding is a transport choice, not approval of a basket or decimal quantity business rule; D02/D03 remain pending.

Return only persisted committed confirmation values through an allowlisted role-safe projection. No purchase costs/cost snapshots, unit/total profit, available/remaining stock, thresholds, movements or Admin audit objects may reach Salespersons. Replays of the same actor/key/payload return the same committed safe result. Confirmation retrieval rechecks ownership/authorization; general Salesperson history remains unapproved.

getSaleRequestOutcome(requestKey) returns COMMITTED with that safe confirmation, UNCONFIRMED while the original outcome is unknown, or authoritative REJECTED with safe failure information. Missing/not-yet-found records during an in-flight request do not establish rejection. Check/retry the original key; never replace a sale/key merely after response loss. A new corrected submission after a definitive rejection must be a deliberate new intent, not a network-timeout workaround.

Canonical screens: /admin/accounts, /admin/inventory/receive, /admin/inventory/reprice, /admin/inventory/adjust, /admin/inventory/movements, /admin/inventory/low-stock, /admin/sales/[id]/correct, /admin/reports/products, /pos and /pos/success/[id]. Existing /api/health is advisory liveness only. The full screen/legacy alias map is implementation-plan §6. A17/A18 and a dedicated audit-search view remain subject to scope approval.

# 18. Module 14 — Local network deployment and offline readiness

## 18.1 Production topology and hardware

- Dedicated shop server: a reliable Linux mini-PC or always-on computer; adequate RAM/SSD; stable wired LAN; UPS recommended.
- Local router/switch/ Wi-Fi remains powered during internet outage.
- One production PostgreSQL instance; bind DB port only to the Docker internal network, not to LAN/Internet.
- Next.js behind Caddy; expose only local HTTPS to employees.
- Fixed LAN server address (DHCP reservation), plus a shop-local hostname such as `pos.shop.internal` **only if local DNS is configured to resolve it without internet**.
- Do not depend on cloud-hosted JS, external fonts, telemetry, maps, or remote license checks for critical operations.

## 18.2 Docker Compose outline (design, not production-ready credentials)

```yaml
services:
  db:
    image: postgres:18  # pin reviewed digest / version before deployment
    restart: unless-stopped
    environment:
      POSTGRES_DB: pos
      POSTGRES_USER: pos_app
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets: [db_password]
    volumes: [postgres_data:/var/lib/postgresql]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pos_app -d pos"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [internal]

  app:
    build: .
    restart: unless-stopped
    depends_on:
      db: { condition: service_healthy }
    # Securely inject DATABASE_URL, BETTER_AUTH_SECRET, and site URL.
    # Use an env/secrets strategy supported by your selected packages.
    networks: [internal]

  caddy:
    image: caddy:2  # pin reviewed digest / version before deployment
    restart: unless-stopped
    ports: ["443:443"]
    volumes:
      - ./docker/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks: [internal]

networks:
  internal:
volumes:
  postgres_data:
  caddy_data:
  caddy_config:
secrets:
  db_password:
    file: ./secrets/db_password.txt
```

**Deployment caveats:**

- This snippet omits application secrets and build details intentionally. Codex must supply a complete production Dockerfile, application health checks, secrets handling, migrations and backup process before launch.
- **Check PostgreSQL major-version volume layout** before running; use a compatible path for the selected image/version. Never switch database major versions by changing the image tag alone.
- Caddy `tls internal` signs certificates using a local certificate authority; every client browser/device must trust the local root certificate. Persist Caddy `/data` to preserve its CA; secure its private key. Install trust via managed client administration, not browser warning bypass.
- Avoid publishing PostgreSQL port 5432 on the shop LAN.
- Maintain a tested, offline installation bundle (container images, compose config, secrets provisioning instructions, migration artifacts) before shipping the system to the shop.

## 18.3 Offline test procedure

1. Start local server and verify two LAN devices can log in.
2. Physically disconnect WAN from router; **leave LAN/Wi-Fi operating**.
3. Reload `/pos`, sign in with local credentials and record a sale.
4. Verify Admin sees stock decrement and matching report while WAN remains offline.
5. Reprice a product, enter stock receipt, correct a sale; verify audits.
6. Restart one client device/browser and verify authenticated re-login works offline.
7. Restart application container (not database); confirm no sales disappear.
8. Restore internet; confirm no special synchronization is needed because all primary data already lived in the shop's local database.
9. Separately test **server unreachable/response lost**: block new authoritative submissions; distinguish a confirmed rejection from an unconfirmed original outcome. Recover/check/retry the original request key; never create a replacement sale/key merely because its response was lost.

---

# 19. Module 15 — Backup, restore, monitoring and operations

## 19.1 Backup plan

**Minimum production policy proposal:** nightly encrypted PostgreSQL logical backup (`pg_dump -Fc`), retained for a defined number of days; an additional copy on a separate physical disk; optional off-site encrypted copy once internet returns. Choose retention, recovery point objective and recovery time objective with the owner. A backup that has never been restored is not a verified backup.

- Schedule outside the web request path; backup failure must not block sales.
- Check archive integrity and store timestamp/checksum; alert shop Admin locally if backups have failed.
- Protect backup files and encryption keys separately; DB backups contain confidential business information.
- Test `pg_restore` into an isolated staging database; validate product count, stock reconciliation, transaction count, totals and logins.
- Do not treat a Docker named volume by itself as a backup. A server/disk failure could destroy it.

**Illustrative admin commands:**

```bash
# Run from a secured backup environment with appropriate credentials.
pg_dump -Fc -h <db-host> -U <backup-user> -d pos -f pos-YYYYMMDD.dump

# Restore into a dedicated *empty* test DB; NEVER over live production data.
pg_restore --exit-on-error -h <test-db-host> -U <restore-user> -d pos_restore pos-YYYYMMDD.dump
```

## 19.2 Recovery runbook

1. Stop further writes to affected system; inform shop staff.
2. Preserve current files/logs before changing state.
3. Provision repaired or replacement machine with compatible PostgreSQL/app versions.
4. Restore selected verified backup to isolated DB; run schema/ledger checks.
5. Repoint app safely; verify Admin login, products, latest sales and inventory.
6. Record any gap between last backup and outage; reconcile physical stock with owner before reopening.
7. Document incident and prevention measures.

## 19.3 Monitoring

- Local server uptime / disk free space / SSD health / RAM.
- Database health, migration status, connection counts, backup freshness.
- Application errors: failed sale writes, `INSUFFICIENT_STOCK`, authentication failures (without logging passwords), stock reconciliation mismatch.
- Clear `READY / NOT READY` health endpoint but do not expose sensitive server internals.
- Logs should include request/event IDs and error codes, **not** passwords or session cookies.

---

# 20. Test plan, acceptance cases, and quality gates

## 20.1 Testing pyramid

- **Unit / Vitest:** Zod validation; Decimal profit math; date boundaries; DTO sanitization; role predicate; stock delta/revision logic.
- **Integration / PostgreSQL:** real transactions, database CHECK/unique constraints, idempotency, concurrency, audit, receipts, price changes, migrations.
- **E2E / Playwright:** real user login, add product, receive stock, sell, correct, filter reports, smartphone viewport, blocked salesperson admin access.
- **Operations:** internet-outage drill, restart drill, backup/restore drill, disk-full and server-unavailable failure handling.

## 20.2 Required case matrix

| ID | Scenario | Expected result |
|---|---|---|
| AUTH-01 | Salesperson requests Admin report API | 403; no sensitive payload |
| AUTH-02 | WAN disabled, local login | Login succeeds |
| PROD-01 | Create product with 50 units | Stock 50; opening movement +50 |
| STOCK-01 | Receive 20 units | Stock 70; one receipt + movement |
| STOCK-02 | Same receipt request retried | Stock stays 70 |
| COST-01 | Reprice 1,000 → 1,100 | Current cost changes; old sales unchanged |
| SALE-01 | Sell two at 1,200, cost 1,000 | Revenue 2,400; gross profit 400; stock -2 |
| SALE-02 | Different sell price for same product | Separate sale snapshot, different profit |
| SALE-03 | Sell more than available | No sale/movement; no stock change |
| SALE-04 | Two simultaneous last-unit sales | Exactly one succeeds |
| SALE-05 | Duplicate requestKey | Exactly one sale/movement |
| SALE-06 | Response lost after commit; reload/reconnect | Original request key resolves to the same committed safe confirmation; no replacement sale/key |
| SALE-07 | Same request key with changed payload | Conflict; no additional stock deduction or sale |
| CORR-01 | Correct sale quantity 5 → 2 | +3 inventory; profit updated; audit logged |
| CORR-02 | Repeat same correction request | No duplicate adjustment |
| CORR-03 | Two Admins edit same revision | Stale revision rejected |
| INV-01 | Adjust physical stock 48 → 45 | -3 movement; before/after logged |
| REPORT-01 | Compare daily/monthly/custom totals | Totals reconcile for same window |
| REPORT-02 | Sale occurs near local midnight | Included in correct Karachi day |
| DASH-01 | Stock at threshold | Low-stock warning shows to Admin only |
| OFF-01 | Disconnect WAN, retain LAN | Sale, inventory, reports work |
| OFF-02 | Disconnect shop LAN/server | No false “sale recorded” confirmation |
| BACK-01 | Restore backup on test server | Correct totals and usable database |

**Gate for each module:** implementation + passing relevant tests + code review + screenshots/UX check + updated documentation + migration review (if needed).

---

# 21. Historical guide phase mapping and detailed task groups

**Historical reference only:** the retained guide phase 0–8 labels below are not the current schedule. The master sequence is Phase 1 foundation; Phase 2 shared UI/UI-1; Phase 3 mock screens/UI-2–UI-5; Phase 4 database/auth; Phase 5 products/inventory; Phase 6 sales/profit; Phase 7 corrections/audit; Phase 8 reports; Phase 9 local deployment/final tests. The mapping table at the start and implementation-plan §11 preserve all references. Do not execute these task groups by old phase number.

## Legacy guide phase 0 — Confirm decisions and protect the repository

1. Save supplied SRS at `docs/requirements/Software Requirements Specification.docx`.
2. Create `docs/decisions/0001-offline-architecture.md` defining local-server offline semantics.
3. Resolve quantity units, new receipt cost behavior, below-cost sale policy, and correction scope.
4. Initialize Git, `.gitignore`, `AGENTS.md` and branch policy.

**Done when:** all critical open decisions are written and approved, no secret is committed to Git.

## Legacy guide phase 1 — Scaffold, database, and offline health

1. Create Next.js TypeScript App Router project.
2. Install Tailwind, shadcn/ui, Zod, React Hook Form, Recharts.
3. Set up a **local** PostgreSQL Docker Compose service; establish `.env.example` with placeholders only.
4. Pin Prisma ORM/Client and Better Auth versions proven compatible, generate schema, make first migration.
5. Create local health check and error page for server-unavailable.

**Done when:** app builds, DB connects, migration runs, LAN reachability is tested in dev.

## Legacy guide phase 2 — Auth and permissions

1. Implement compatible Better Auth local credentials.
2. Secure bootstrap Admin, disable public signup, create salesperson account workflow.
3. Implement server `requireRole`, DTO sanitization, route protection.
4. Test authorization and WAN-off login.

**Done when:** Salesperson cannot access admin data by URL, API, or action.

## Legacy guide phase 3 — Products and opening inventory

1. Product schema and UI CRUD/archive.
2. Initial stock via opening movements.
3. Admin table/search and POS name-only list.
4. Test data integrity and no leakage.

**Done when:** Admin can create/search products and stock ledger reconciles.

## Legacy guide phase 4 — Receipts, repricing, inventory adjustments

1. Stock receipt service, transaction ledger and audit.
2. Cost change service exactly following confirmed SRS amendment.
3. Physical stock adjustment and threshold queries.
4. Integration tests for duplicate submissions/concurrency and cost changes.

**Done when:** all four inventory-changing scenarios are auditable.

## Legacy guide phase 5 — Sale recording

1. Responsive POS form.
2. Transactional, idempotent server sale service with atomic stock update.
3. Cost snapshot and exact profit math.
4. Concurrency tests and offline smoke test.

**Done when:** two users can safely record sales without overselling or duplicates.

## Legacy guide phase 6 — Sales corrections

1. Admin history/search/details.
2. Quantity and selling-price correction with revision checks.
3. Movement reversal, economics recomputation and full audit.
4. Stale edit and retry tests.

**Done when:** corrections are safe, reversible/auditable, and reports reflect them.

## Legacy guide phase 7 — Reports and dashboard

1. Report queries + date/time helpers.
2. Daily/monthly/custom/product breakdown screens.
3. Charts, low-stock panels and dashboard summary.
4. Financial reconciliation tests.

**Done when:** all totals agree and no historical sale is repriced.

## Legacy guide phase 8 — Local production, recovery and handover

1. Production Dockerfile/Compose and Caddy internal HTTPS.
2. Offline-local DNS and client certificate trust configuration.
3. Create Admin runbook, secure secrets provisioning, backup job.
4. Test WAN outage, app restart, disk space monitoring, backup/restore.
5. Freeze migration set; deploy during planned shop maintenance.
6. Train owner and salesperson; record final acceptance evidence.

**Done when:** the owner can operate and recover the system without the developer present.

---

# 22. Windows + VS Code + Codex setup instructions

## 22.1 Tools on development PC

Install Node.js supported LTS, Git, VS Code + Codex, Docker Desktop (with WSL2 on Windows), and a modern web browser. Avoid assuming the shop production server will run Windows; a dedicated Linux host is simpler for Docker Compose operations.

## 22.2 Commands (PowerShell)

```powershell
# Bootstrap reference only for an approved new checkout; do not rerun over accepted Phase 1.
# Start at the repository root, keep shared docs there, and create application files under web/.
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir --use-npm
Set-Location web

# Build the UI component foundation.
npx shadcn@latest init

# Later approved mock/form/report work only; installation is not part of documentation reconciliation.
npm install zod react-hook-form @hookform/resolvers recharts

# Master Phase 4 only: STOP and verify compatible Prisma/Better Auth versions first.
# Example compatible Prisma 7 family; use verified exact releases in package.json.
npm install @prisma/client@7 @prisma/adapter-pg pg dotenv better-auth
npm install -D prisma@7 @types/pg vitest @playwright/test

# Initialize PostgreSQL datasource after choosing Prisma 7 config pattern.
npx prisma init --datasource-provider postgresql --output ../src/generated/prisma

# Start local DB only after Codex writes a valid compose.yaml.
docker compose up -d db

# After Codex finalizes prisma.config.ts/schema.prisma and environment:
npx prisma migrate dev --name initial_schema
npx prisma generate

# Verify scaffold.
npm run dev
```

**IMPORTANT:** current Better Auth adapter documentation may use different import/package paths across versions. Follow the selected versions' official guides, not copied snippets from unrelated versions. Keep credentials in `.env`/secrets, never in repository. For database development, `localhost` can be used; production inside Compose should connect via service name `db`.

## 22.3 Create `AGENTS.md` rules for Codex

```markdown
# Codex rules for POS project
- Read docs/requirements/Software Requirements Specification.docx and the decisions folder before editing.
- Treat the final SRS purchase-cost amendment as mandatory.
- Offline means WAN-off with shop server + LAN working; no cloud calls in core workflows.
- Never modify sale cost snapshots after a current purchase-cost change.
- Never expose stock, cost or profit to Salesperson UI or endpoints.
- All stock-changing actions require transactions, movement events, audit and request idempotency.
- Use Decimal for PKR, UTC timestamps, Karachi local reporting boundaries.
- Add unit/integration tests with each domain-service change.
- Do not install new major dependencies or rewrite unrelated modules without approval.
- Never run destructive migrations on a live database; never commit secrets.
- Work on one module per change. Report files changed, commands run, tests, assumptions and blockers.
```

---

# 23. Codex prompts — focused modules mapped to master phases

Copy one prompt at a time only after separate module authorization. Review diffs/tests before proceeding. Prompt letters are retained identifiers, not phase numbers: A/B target master Phase 4; C/D Phase 5; E Phase 6; F Phase 7; G Phase 8; H Phase 9. Master Phases 2/3 use bounded UI-1 and UI-2–UI-5 briefs in UI-spec §10. Resolve dependent pending policies before executing examples.

### Prompt A — Architecture and schema

> Read the complete SRS document from docs/requirements, including the confirmed purchase-cost amendment. Read docs/decisions. Implement only master Phase 4 persistence foundations after accepted Phases 1–3 and schema decisions: scaffold audit, architecture.md, complete compatible Prisma schema with constraints and indexes, local DB Compose configuration, environment example and a migration plan. Explain open decisions. No sales code yet. Verify build and tests, show changed files.

### Prompt B — Authentication

> Implement only the approved master Phase 4 authentication module: local username/email-password authentication with compatible Better Auth and Prisma integration; bootstrap Admin securely, disable public registration, create Admin-only salesperson management, requireRole helpers and sanitized DTOs. Write tests proving salesperson cannot access stock, cost, profit or admin routes/actions/API. Verify login works without WAN.

### Prompt C — Product master and initial inventory

> Implement the approved master Phase 5 product module following SRS: validated product creation, opening stock ledger event, low-stock threshold, category optional, search, archive, name-only salesperson product selector. Enforce admin-only mutation and use transactions. Add integration and role-leak tests.

### Prompt D — Receipts, reprice, stock corrections

> Implement the approved master Phase 5 inventory module with domain service layer: stock receipts, signed movement ledger, request-key idempotency, explicit current purchase-cost reprice preserving completed sale snapshots, and audited Admin physical stock adjustments. Flag receipt-cost policy if not approved. Add all boundary, concurrency and ledger reconciliation tests.

### Prompt E — Salesperson POS

> Implement master Phase 6: connect the approved /pos form with name-only product selector, quantity, flexible PKR unit price and record button. Backend must atomically validate/deduct stock, capture current cost snapshot, compute exact revenue/profit, save sale and movement once, and use a unique request key. Do not return stock, cost or profit to salesperson. Add duplicate and two-cashier last-unit integration tests. Test with WAN off.

### Prompt F — Sales history and corrections

> Implement the approved master Phase 7 Admin history/correction module under resolved D06/D09 scope, additional-unit cost and date-attribution policies. Retain original snapshots/revisions; use expected revision, atomic stock/economics changes, reason, append-only correction events, movements and audit. Handle duplicate request keys and stale revisions. Add same-product 5→2 recovery, price-only, retry and competing-edit tests where approved.

### Prompt G — Reports and dashboards

> Implement master Phase 8 Admin-only daily/monthly/custom-date and product-wise reports, low-stock warnings and dashboard. Compute from effective corrected sales using approved shop-local time boundaries, approved correction-date attribution and exact Decimals. Include Recharts and exportable/testable query services. Test report totals reconcile and old sale profit remains unchanged after current-cost repricing.

### Prompt H — Production deployment and handover

> Prepare master Phase 9 production files and operations guide: pinned multi-stage Next.js Dockerfile, Compose with app/db/Caddy, secured local HTTPS trust, DB health checks, secrets, migrations, scheduled encrypted backups, verified restore procedure, local monitoring and a complete WAN-disconnect acceptance checklist. Keep database private to internal Docker network. Do not deploy without final review.

**Codex delivery format for every prompt:** (1) requirements implemented, (2) files changed, (3) database migrations, (4) tests and terminal output, (5) security/privacy implications, (6) assumptions/open questions, (7) rollback plan.

---

# 24. Final release checklist

- [ ] SRS decision log and amendments approved.
- [ ] Correct Admin/Salesperson permissions including API/action leakage tests.
- [ ] Opening, receipt, sale, sale correction and Admin adjustment movements reconcile.
- [ ] Purchase cost changes affect remaining stock but never rewrite historical completed sales.
- [ ] Financial arithmetic uses exact decimal values, stored in PKR.
- [ ] Concurrent final-unit sales cannot oversell.
- [ ] Same request never creates duplicate sale, receipt, or correction.
- [ ] Daily/monthly/custom/product reports reconcile with corrected sales.
- [ ] Offline WAN test passes on multiple devices via local LAN.
- [ ] LAN/server outage never produces false success.
- [ ] HTTPS trusted on each device; no remote resource dependency for sales/login.
- [ ] Production database port not exposed; credentials and backup keys protected.
- [ ] Backup schedule active; at least one full restore drill completed.
- [ ] Deployment, rollback, recovery and staff-use runbooks complete.
- [ ] Barcode, expenses, customer records and multi-branch features remain out of scope.

---

# 25. References and traceability

## Primary requirement source

- **User-provided SRS:** *Software Requirements Specification — Inventory, Stock & Sales Management System*, Version 1.0, 15 pages, including amendments and confirmed Option A purchase-cost behavior. Project functional requirements in this guide are derived from that document unless labeled as a proposal, design decision, or open question.

## Official implementation references (verified October 2026)

- Next.js self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- Next.js authentication/authorization: https://nextjs.org/docs/app/guides/authentication
- Docker guide for containerizing Next.js: https://docs.docker.com/guides/nextjs
- Better Auth Next.js integration: https://better-auth.com/docs/integrations/next
- Better Auth Prisma adapter: https://better-auth.com/docs/adapters/prisma
- Prisma + Better Auth compatible guide (Prisma 7): https://www.prisma.io/docs/guides/authentication/better-auth/nextjs
- Prisma 7 transactions: https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions
- Prisma 8 transactions (NOT drop-in compatible): https://www.prisma.io/docs/orm/fundamentals/transactions
- Caddy `tls internal` and CA trust: https://caddyserver.com/docs/caddyfile/directives/tls
- Docker Compose secrets: https://docs.docker.com/compose/how-tos/use-secrets
- PostgreSQL pg_restore: https://www.postgresql.org/docs/current/app-pgrestore.html

## Explicit exclusions

No implemented app files, final production credentials, reviewed finished Prisma schema, confirmed hardware specification, security certification, or deployed server are included in this guide. These are deliverables of the development and acceptance process described above.
