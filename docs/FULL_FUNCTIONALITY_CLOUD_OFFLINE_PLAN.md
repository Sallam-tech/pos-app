# POS: plan for a fully connected shop app and remote Admin EXE

Date: 8 November 2026, Asia/Karachi  
Status: planning only; proposed design awaits review. No backend, cloud infrastructure or EXE has been implemented by this task.

## 1. What we are building

Keep the existing screens and connect them to a real, tested backend. Products, stock, sales, returns, expenses, profit, reports and closing will use the same saved business records.

The owner confirmed these requirements in this planning conversation:

- The shop must work both with and without internet, while its local server and LAN are operating.
- Use a live cloud database.
- The Admin will carry a Windows `.exe`, connect over the internet from elsewhere, and view activity across all sections.
- The remote Admin will only view business information; remote sales and business changes are outside this release.
- Use REST APIs, explicit endpoints, server validation, verification at every step, and a feature-by-feature implementation sequence.
- Start with database structure and architecture design. Produce this Markdown plan before implementation.

Existing code is a substantial frontend/demo, not a production POS. Currently only `/api/health` exists under the API directory; PostgreSQL, Prisma, Better Auth and business REST endpoints are not configured in the inspected application.

**How we will work:** implement one bounded module, test it, show the connected result, record evidence, and obtain review before the next module. This plan does not authorize deployment, account purchases, destructive migrations or every future module at once.

## 2. How online, offline and the EXE fit together

A cloud database alone cannot support checkout when the shop loses internet. The proposed design uses **one authoritative local shop database and a continuously updated cloud copy**.

```text
SHOP
Cashier / local Admin devices
             |
       LAN HTTPS
             |
 Next.js app + REST API
             |
 Local PostgreSQL  <--- authoritative business writes
             |
 Saved change queue + background synchronization
             |
        Internet, when available
             |
CLOUD
Authenticated synchronization API
             |
 Live cloud PostgreSQL business copy
             |
 Read-only Admin API + hosted Admin screens
             |
        Internet / HTTPS
             |
REMOTE ADMIN
Windows EXE -> sign in -> view every section
```

In simple terms: save at the shop first; send a reliable copy to the cloud afterward. The EXE is a secure client for the hosted Admin app. A database connection alone does not provide the hosted screens or API.

| Situation | Shop behavior | Remote Admin behavior |
| --- | --- | --- |
| Shop and Admin have internet | Shop operates locally; changes synchronize | All sections show synchronized activity and its freshness |
| Shop loses internet; LAN/server work | Login, checkout, inventory and other core work continue | View the last synchronized information, with an obvious stale-data notice |
| Internet returns to the shop | Saved changes upload automatically and safely | Catch-up progress appears; latest information becomes available |
| Cloud database/API fails | Shop continues; queue retains unsent changes | Show cloud unavailability; never invent current figures |
| Shop server/LAN fails | Stop new authoritative operations; recover uncertain requests | Cloud remains viewable up to its last received change |
| Admin device loses internet | Shop remains unaffected | Explain connection loss; do not present an old screen as live |

**A real limit:** an internet-connected Admin cannot see new activity from a shop that has no route to the internet. A second shop internet connection/mobile backup can reduce that gap if later requested.

There will be no automatic switch that lets local and cloud databases independently sell the same stock. A cloud replica is also not a replacement for separately retained backups.

### Desktop delivery

Propose a small Electron desktop shell around the hosted HTTPS Admin app so we can reuse the existing Next.js screens. This is a new packaging dependency, to be reviewed before implementation.

- Target a portable Windows distribution suitable for carrying on a USB drive; verify whether the selected packaging tool produces one executable or an executable with required companion files.
- Do not promise an installer-free single-file artifact until it passes a clean-Windows-machine test.
- Require Admin sign-in. Possession of the EXE/USB does not grant access.
- Keep database credentials, synchronization keys and passwords out of the executable.
- The cloud deployment enforces read-only business access, including direct HTTP attempts; hiding Save buttons is insufficient.
- Remote settings, closing and backup pages show recorded settings/status/history. Password hashes, recovery material and server file paths remain private. Remote account security operations are separate from business edits.
- Preserve familiar navigation and label this workspace as remote viewing.
- Use isolated, sandboxed web content, no Node access for remote pages, an allowlisted HTTPS origin and controlled navigation. Test signing, updates, logout and Windows compatibility. These controls follow [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security); [code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing) is part of release preparation.

No extra cashier EXE is assumed. Shop devices can continue using the local web app.

## 3. Source requirements, conflicts and scope

Read together with:

- [Original SRS](<requirements/Software Requirements Specification.docx>), including confirmed amendments.
- [Development guide](development/POS_Complete_Development_Guide.md).
- [UI specification](design/POS_UI_UX_Prototype_Design_Plan.md) and [original prototype](design/POS_UI_Prototype.html).
- [Current project memory](PROJECT_MEMORY.md), [existing implementation plan](IMPLEMENTATION_PLAN.md), and [module checklist](MODULE_CHECKLIST.md).
- [Expense accounting contract](development/EXPENSE_ACCOUNTING_CONTRACT.md).
- [Settings, closing and backup contract](development/SETTINGS_CLOSING_BACKUP_CONTRACT.md).

This document supplements the existing master Phases 4–9; it does not restart the project or renumber historical phases.

| Source difference | Resolution for this plan |
| --- | --- |
| Older guide is local-only and says WAN return needs no sync | Core business stays local; the newly requested cloud mirror adds asynchronous sync and remote viewing |
| Guide prefers Server Actions for forms | Latest owner request selects versioned REST Route Handlers for business operations; server services still own the logic |
| Older guide illustrates one product per sale | Preserve the current approved multi-item UI; propose sale header plus sale lines and atomic basket processing |
| SRS initially excludes expenses; later contracts include expenses/net profit | Include durable expenses as an owner-directed extension; retain the original SRS unchanged |
| Discounts, receipts and returns extend the original SRS | Include the existing workflows in the plan; finalize their production permissions/accounting before implementation |
| Older guide shows username login; current UI is password-only | Preserve the presentation pending a secure identity decision; do not silently invent password-to-role lookup |
| Older screens/plans have outdated acceptance and feature statements | Use current source and memory; latest discount/refund visuals still await review |
| “View all sections” versus restricted credentials/security data | Show business sections and sanitized operational status; never expose credential or recovery secrets |

Barcode scanning, a customer relationship system, multi-branch stock, online payment gateways, taxes, export tools and independently disconnected cashier devices are not automatically added. Optional customer details already present on receipts do not imply a customer-management module.

## 4. Step 1 — database structure and architecture design

**Simple outcome:** agree where every record belongs and how records connect before creating production tables.

### 4.1 Keep a modular application

Retain Next.js App Router, TypeScript, Tailwind/shadcn UI, PostgreSQL/Prisma, Better Auth, Zod/React Hook Form, Recharts, Vitest, Playwright and Docker Compose where applicable.

Use one application with separate feature services. Avoid adding microservices for a single shop. The synchronization worker and cloud ingestion service have distinct responsibilities and credentials.

```text
Existing screen
  -> typed REST client
  -> Next.js Route Handler
  -> session + permissions + input validation
  -> business service
  -> repository using the same transaction
  -> PostgreSQL
```

Business calculations do not live in React components. Server-rendered pages may call the same authorized query services directly; they must not create a second implementation or an unguarded path around REST permissions.

Proposed locations: `web/src/features/`, `web/src/lib/{db,security,money,time}`, `web/src/app/api/v1/`, `web/prisma/` and `web/tests/integration/`. Choose a desktop-package directory during packaging review. Keep shared documentation under root `docs/`.

Use separate development, test, staging and production databases. Never run tests against live shop data or mix demo fixtures into production.

### 4.2 Proposed logical tables

This is a logical design, not an approved migration. Exact fields, numeric sizes and policy-dependent tables are finalized after the decisions in section 10.

| Records | Important saved information | Connections / purpose |
| --- | --- | --- |
| Shop | Stable ID, PKR currency, timezone, business configuration | One shop; identifies its data and synchronization source |
| Auth user/account/session/verification | Adapter-required fields, role, enabled state | Distinct Admin/Salesperson identities; generated for the selected Better Auth configuration |
| Product; optional Category | Name, unit, optional code/category, status, suggested price if approved | Shared catalog; stable identity despite later renaming |
| InventoryBalance | Product ID, current sellable quantity, version | One balance per product; fast checkout without summing history |
| ProductCost | Product ID, current buying cost, version | One current cost; serialized with stock operations |
| StockReceipt and receipt lines | Quantity, actual entered cost/date, actor, purchase expenditure | Product purchasing history; never substituted for operating expenses |
| StockAdjustment | Before/after, delta, reason, actor, timestamp | Audited physical inventory corrections |
| StockMovement | Product, signed quantity, movement type, source, before/after | Append-only opening/receipt/sale/return/correction ledger |
| PurchaseCostChange | Product, previous/new cost, reason, actor, time | Repricing history; does not rewrite old sale costs |
| Sale | ID, invoice reference, actor, server time, business date, totals, revision | One header for the entire basket |
| SaleLine | Stable line ID, product/name/unit snapshots, quantity, entered selling price, discount, paid amount, cost, COGS/profit | Many lines per sale; preserves original financial facts |
| SaleRevision / correction | Original/effective values, expected revision, reason, actor, time | Original history plus audited effective state |
| Return / ReturnLine | Original sale-line link, quantity, original-paid allocation, condition, disposition, actor/time | Cumulative return limits and stock treatment |
| Refund / cash record | Return link, exact cash amount, state, actor/reference | Recorded cash refund; no payment gateway implied |
| Expense / ExpenseRevision | Category, amount, business date, approval state, note, actor/revisions | One source for expenses and net profit |
| ShopSettings | Versioned public details and supported receipt settings | Shared settings; receipt identity also snapshotted on sale |
| DailyClosing / ClosingAdjustment | Shop/date, immutable totals, source boundary, actor and later adjustments | Audited closing without resetting shop data |
| OperationRequest | Request key, actor, operation, canonical payload hash, outcome/result reference | Retries and original-request recovery |
| AuditEvent | Actor, operation, reason, time, source references, safe before/after | Traceable business/security changes |
| OutboxEvent / job | Stable event ID, transaction envelope, schema version, revisions, attempts and delivery state | Durable cloud sync and post-closing backup jobs |
| CloudInbox / sync checkpoint | Source/event identity, payload hash, applied revisions, acknowledgments | Cloud duplicate protection and recovery |
| BackupRun / restore evidence | Destination identifier, times, checksum, result, verification evidence | Truthful backup and recovery status |
| Optional report summaries | Business day/product totals, processing version | Rebuildable acceleration; original records remain authoritative |

Relationships:

- A product has one current inventory balance/current cost and many receipts, movements, cost changes and sale lines.
- A sale has many lines; each return line identifies a stable original sale line.
- Corrections, returns and refunds remain linked to the original sale and preserve prior versions.
- Staff referenced by old records are disabled rather than deleted.
- Source references must be enforceable foreign keys where possible. Avoid unvalidated generic IDs for critical movement sources.
- Cloud business tables mirror/project business records. Cloud authentication uses a separate store; local sessions, password hashes and recovery codes are not copied through the business sync queue.

### 4.3 Rules that protect the database

- Use exact decimal amounts or integer paisa arithmetic; send exact values as JSON strings. Never use floating-point arithmetic for financial truth.
- Proposed money storage: PostgreSQL `NUMERIC(18,2)`; approve bounds and fractional-quantity allocation first. Quantity scale is a D03 decision, not silently copied from a demo.
- Validate precision before database insertion; do not let numeric casts silently round invalid input.
- Enforce nonnegative sellable balances, valid positive sale/return quantities, required links, unique invoice references and one closing per shop/date.
- Make request-key identity unique and bind it to operation, actor and payload; make source event/movement identities unique.
- Preserve originals and append revisions/reversals. No generic DELETE of sales, financial history or inventory movements.
- Store server timestamps in UTC with timezone-aware columns; use Asia/Karachi business dates and half-open reporting intervals.
- Create targeted indexes for product search, product/date history, sale date/ID, actor/date, line-to-sale/product links, returns by original line, movements by product/time, expenses by date, pending queue jobs and closing date.
- Balance updates and cost changes use the same product-lock protocol, even if represented by separate tables: lock the product first, then the related rows. Lock multiple products in stable ID order.
- Database constraints handle local row/relationship rules; transactions enforce cumulative returns, basket totals and cross-record consistency. These are different safeguards, consistent with [PostgreSQL constraint documentation](https://www.postgresql.org/docs/current/ddl-constraints.html).

### 4.4 Transactions: save together or save nothing

Each business write saves its records, stock effect when applicable, audit and outbox event inside one database transaction. Synchronization, printing and backup execution run after commit.

| Action | Must save together |
| --- | --- |
| New product | Product + balance/cost + opening movement + audit + outbox |
| Receive stock | Receipt + balance increase + movement + any explicitly approved linked reprice + audit + outbox |
| Reprice | Current cost + cost-change history + audit + outbox; old sale costs unchanged |
| Record basket sale | Request claim + header/lines/snapshots + all stock deductions/movements + audit + outbox |
| Return/refund | Return lines + recorded refund state + approved stock disposition + movements + audit + outbox |
| Correct sale or count | Expected-version check + effective changes + revision + stock difference + audit + outbox |
| Expense or closing | Request claim + business record/revision + audit + reliable follow-up jobs |

Cash handover is a human action, so define its confirmation/reconciliation procedure; a database commit cannot physically dispense cash.

**Step 1 verification:** review the entity diagram, permission matrix, field dictionary, transaction/lock design, API outline, decision log and requirements coverage. Work through a complete purchase -> sale -> discount -> return -> correction -> expense -> report example. Approve the architecture before dependent implementation.

## 5. Feature-by-feature implementation order

Each step ends with its own review. Numbers below are work packages within existing master Phases 4–9, not replacement master phases.

### Step 2 — create database foundations and safe migrations

Build the approved schema, constraints, indexes, transaction helpers and development/test databases. Provision a separate cloud staging database/API only during an authorized setup task. Add outbox/inbox structures now so later features cannot forget synchronization.

Keep demo data in demo/test environments. Define opening-stock import and reconciliation instead of importing fictional sales.

**Verify:** fresh database creation; upgrade from the prior schema; invalid-row rejection; transaction rollback; uniqueness; exact numeric boundaries; locally available DB with WAN disconnected. Prove one synthetic development transaction can be queued and delivered twice with one cloud effect. Record compatible versions.

### Step 3 — establish REST contracts and validation

Implement the common API pipeline, error format, permission helpers, request tracing and OpenAPI specification. Keep route handlers thin and domain logic in services.

**Verify:** malformed JSON, unknown fields, excess body size, invalid dates/IDs/decimals, unauthenticated calls, wrong roles, wrong record ownership, unsafe origin, rate limits and private error leakage. Contract tests must compare implementation with OpenAPI.

### Step 4 — real login, roles and local account recovery

Connect Better Auth and the local database. Implement secure Admin bootstrap, disabled public signup, login/logout, enabled-account checks, session expiration/revocation and approved staff/password management.

Resolve password-only identity before implementing it. Passwords alone are not a safe indexed account identifier: do not scan every stored password hash or add plaintext/reversible password lookups. Offer an approved device-bound account identity or a reviewed login adjustment.

**Verify:** separate roles; fresh offline login; forbidden direct APIs/pages; disabled accounts; expiry; logout/back-button leakage; password reset and session revocation; offline recovery; no password/session data in logs/browser storage. Admin sale permission remains a separate decision.

### Step 5 — products and opening stock

Connect existing Add/Edit/Product screens. Validate identity, unit, purchase price, optional suggested selling price, quantity and threshold. Metadata edits cannot directly change stock or purchase cost.

**APIs:** products, product details, archive/resume and safe POS catalog.

**Verify:** opening 50 creates exactly one +50 opening movement; retry creates no duplicate; code/name policy is enforced; historical links survive archival; Salesperson responses exclude stock/cost/profit. Existing product forms require positive buying prices; retain that direction unless explicitly revised.

### Step 6 — stock receiving and purchase history

Connect Add Stock to saved receipts and a quantity increase. Preserve actual receipt cost/date even after later repricing. Implement the approved different-cost policy explicitly.

**Verify:** 50 + 20 = 70 once; duplicate request and concurrent receipt handling; no partial receipt/movement; invalid date/quantity rejection; purchase expenditure reconciliation. A receipt at a different cost must not silently introduce FIFO or weighted-average costing.

### Step 7 — change purchase cost

Connect Admin purchase-price changes to the dedicated service. Reprice every remaining unit through the single current-cost value; preserve previous sales.

**Verify:** sell at old cost, reprice remaining inventory, then sell at new cost. Old sale profit is unchanged; new sale uses new cost; repricing changes no quantity. Race a sale against repricing and verify a valid transaction order.

### Step 8 — inventory, stock corrections and low-stock views

Connect available stock, product stock details, low-stock lists and movement history. Save physical-count corrections with expected version, before/after, reason, actor and time.

**Verify:** 48 -> 45 creates one -3 movement; stale count is rejected; stock cannot become negative; every balance equals the sum of its movements including opening exactly once. Zero is out of stock; positive stock at or below threshold is low stock. Admin-only data stays private.

### Step 9 — multi-item checkout and durable sales

Connect the current POS basket and per-item discounts to one atomic transaction. The server recalculates prices/discounts/totals, obtains locked current cost snapshots, deducts all required quantities and issues the saved invoice reference.

Request quantities for duplicate product lines are combined for stock validation; approved line-specific rates/discounts remain distinct where required. A failure on any line rolls back the whole basket.

**Verify:** exact money; two independent line discounts; invalid/over-precise inputs; insufficient stock; simultaneous last-unit sales; duplicate keys; changed-payload keys; failure halfway through the basket; sale-versus-count/reprice races. A cash/change field is checked against the final paid amount under the approved payment policy.

No sale confirmation appears until a real commit is known. Example retained from the preview: Rs. 1,250 at 10% plus Rs. 800 at 5% totals Rs. 1,885.

### Step 10 — saved receipts, history and uncertain-request recovery

Connect receipt/history views to persisted sale snapshots. Printing/reprinting never creates a new sale. Saved history remains read-only except through the separately authorized correction workflow.

Keep the original `requestKey` while an outcome is uncertain. Provide authorized request lookup and original-key retry; do not use a new key after timeout. Agree how shared terminals retain a safe pending reference without storing sensitive accounting data or credentials.

**Verify:** lose the HTTP response after commit, reload/re-login and recover the same sale once; replay still works after catalog archival or price changes. Missing request data is not proof of rollback. Verify ownership/history scope, cursor pagination, ordinary/80 mm layouts and real printer hardware separately.

### Step 11 — returns and recorded cash refunds

Connect Return & Refund to original sale lines, original paid amounts and trusted prior returns. Make cumulative quantity/refund limits transactional.

Good stock is restocked only under the approved authorization; damaged goods stay outside sellable stock; unspecified condition remains pending inspection. Pending inspection requires an explicit later disposition event.

**Verify:** partial/full/multiple returns; concurrent return attempts; retry; sold quantity/payment caps; discounts and exact remainder allocation; unavailable original snapshots; damaged/inspection stock; refund reconciliation. Today's product price must never determine an old refund.

Approve return-date attribution, COGS reversal, damaged-stock loss and return-versus-correction rules first. Define safe blocking for unsupported combinations instead of silently applying both stock reversals.

### Step 12 — sale corrections and audit history

Implement authorized Admin corrections with reason, expected revision and preview. Retain originals, revisions and inventory differences.

**Verify:** recorded 5 -> corrected 2 restores 3 once; price-only changes no quantity; increased quantity cannot oversell; two Admin corrections cannot overwrite each other. Test corrections against prior returns and closing. Additional-unit cost and historical reporting treatment follow an explicit decision.

Audit history must identify who changed what and when; dedicated audit browsing can reuse detail views unless a new screen is separately approved.

### Step 13 — durable expenses and same-period net profit

Connect Salesperson expense entry and Admin expense review to the same saved source. Finalize create/approve/correct/void permissions. Record revisions rather than erasing past entries.

**Verify:** a permitted entry appears on another device and the Admin screen; duplicate submit produces one entry; expense changes update the correct period; unapproved/voided entries follow the agreed rules. Inventory purchases are not deducted again as operating expenses.

Gross profit = net sales revenue - COGS. Net profit = gross profit - approved operating expenses for the same period. An incomplete source is unavailable, not zero.

### Step 14 — investment and stock value

Connect investment to recorded product purchase expenditure and stock value to remaining sellable quantity at approved current cost. Decide whether opening inventory contributes to recorded investment and how purchase corrections/reversals affect it.

**Verify:** receiving increases purchase expenditure once; a sale reduces stock value; repricing changes remaining-stock value without rewriting historical expenditure/profit. Missing opening purchase evidence remains unavailable. Revaluation is not silently counted as sales profit.

### Step 15 — shared reports, then the dashboard

First review the report/query engine; then connect dashboard cards/charts as a separate review within this step. Use identical financial definitions across sales, profit, expenses, investment and closing.

Support day/month/custom range/product queries, sales details, low-stock counts and product histories. Calculate transaction counts, quantities and distinct-product counts separately. Avoid multiplying amounts when joining sales, expenses and returns.

**Verify:** report totals reconcile to source records; dashboard cards match their drilldowns; products add up to period totals; refunds/corrections/expenses count once; midnight/month-end/leap-day/empty-period tests pass. Charts derive from exact totals and include table alternatives.

### Step 16 — shared settings and receipt identity

Move public shop settings from browser-only preferences to validated Admin-managed database settings. Keep theme preference device-local. Connect approved password/account controls to the auth service.

**Verify:** changed shop details appear on another local device and new receipts; historical receipts keep their saved details. Currency stays PKR; safe plain-text rendering, input bounds, stale-version handling and audit pass. Developer credit remains fixed presentation.

### Step 17 — durable daily closing

Save an immutable Admin-confirmed snapshot for a business date with a unique shop/date constraint. Make totals coherent under concurrent transactions using an explicit cutoff/source boundary. If later activity belongs to that day, append a linked adjustment or follow the approved closed-day policy.

**Verify:** duplicate closing returns one snapshot; simultaneous sales cannot produce mixed totals; expenses/refunds/corrections reconcile; later adjustments preserve the original. Closing does not delete records, reset stock or shut down the computer. Queue a post-closing backup job reliably.

### Step 18 — automatic backup and tested recovery

Implement scheduled database-consistent backups to separate protected storage, plus post-closing backups and optional encrypted cloud backup copies. Cloud mirroring is a separate process.

Verify checksums/archive readability on backup creation, and perform isolated restore/reconciliation drills. Distinguish backup creation success from a successful restore test; a checksum alone does not prove full recoverability.

**Verify:** restore login, sales, stock ledger, expenses, settings and totals into an isolated database; measure recovery time/data gap. Test missed schedule, restart catch-up, disconnected drive, full disk, failed upload and safe retention. Keep the last usable backup. The existing contract proposes 7 daily/4 weekly copies; confirm storage and recovery objectives.

### Step 19 — complete reliable cloud synchronization and remote query APIs

Expand the early outbox proof to every business module. Add initial baseline transfer, ordered/versioned updates, retry, deduplication, reconciliation, sync status and separate cloud read credentials. See section 8.

Remote queries must expose every applicable Admin section using the same metric definitions as the local app. They never depend on a direct incoming connection to the shop.

**Verify:** hours/days of WAN loss; restart mid-send; duplicate delivery; cloud commit with lost acknowledgment; reordered events; schema mismatch; missed prerequisites; initial-snapshot overlap; catch-up while sales continue. Reconcile record counts, exact totals, revisions and inventory after catch-up.

Prove the cloud is read-only for business users, and that cloud/sync failure cannot roll back an already committed local sale.

### Step 20 — package the remote Admin Windows EXE

Reuse the remote hosted Admin screens in the reviewed desktop shell. Add owner provisioning, secure sessions, remote-view indicators, refresh/reconnect, sync freshness and a signed/versioned release process.

Remote authentication writes are allowed in the cloud auth store; they must not allow business writes. Keep local and remote sessions/secrets separate.

**Verify:** on another supported Windows machine and a different internet connection, open the carried package, sign in and view Dashboard, Products, Inventory, Sales/history, Returns, Expenses, Reports, Investment, Daily Closing and sanitized Settings/backup status. Check themes, keyboard, resizing, logout, expired sessions, copied EXE access, cloud outage and a stale shop. Attempt forbidden writes directly, not just through buttons.

### Step 21 — scale, security and outage acceptance

Run the end-to-end business scenario in section 11, the larger-data benchmarks in section 9, authorization/privacy tests and real offline/online drills.

**Verify:** at least two LAN clients freshly load/login with WAN disconnected and complete all core workflows; after reconnect the EXE catches up. Test server restart, lost responses, worker crash, slow cloud, disk pressure and recovery. Inspect browser HTML/React payloads/network/cache for private-data leaks.

This step checks the combined system; each earlier module still requires its own focused checks.

### Step 22 — controlled rollout and handover

Prepare a concrete release artifact, tested migrations, verified backup, opening data, trusted local HTTPS/DNS, runbooks and rollback/recovery procedure. Demonstrate on staging and obtain release acceptance before requesting deployment authorization.

After authorization, import approved real opening data, reconcile it, run the agreed pilot and verify local/remote operation. Never promote fictional demo sales into shop accounting.

**Verify:** physical stock matches approved opening records; cloud/EXE match the recorded baseline; staff can operate and recover the system; agreed printers/devices work; owner accepts outstanding limitations. No destructive restore or production migration happens merely because this plan exists.

## 6. REST endpoint inventory

Proposed contracts, not existing endpoints. Business endpoints use `/api/v1`. Better Auth retains its supported `/api/auth/*` routes; inventory changes are never tunneled through authentication endpoints.

| Endpoints | Local permission | Remote Admin |
| --- | --- | --- |
| `GET /session`; supported auth login/logout/password routes | Auth/account rules | Separate cloud owner session; no local staff credentials copied |
| `GET /catalog?q=&cursor=&limit=` | Authorized sale entry; safe product fields | Optional read-only preview if useful; no sale submit |
| `GET, POST /products`; `GET, PATCH /products/{id}` | Admin; PATCH metadata allowlist only | GET only |
| `POST /products/{id}/archive`, `/resume` | Admin | Disabled |
| `GET, POST /stock-receipts` | Admin | GET only |
| `POST /products/{id}/cost-changes`; `GET /products/{id}/cost-history` | Admin | GET only |
| `GET /inventory`, `/inventory/low-stock`, `/stock-movements` | Admin | GET only |
| `GET, POST /stock-adjustments` | Admin | GET only |
| `GET, POST /sales`; `GET /sales/{id}`, `/sales/{id}/receipt` | Create: authorized Salesperson; Admin create pending D10. Read: Admin or approved Salesperson scope | GET only |
| `GET /operations/{requestKey}` | Authorized original actor/Admin scope | No local pending-intent access unless separately needed and authorized |
| `GET, POST /sales/{id}/corrections` | Admin | GET only |
| `GET, POST /returns`; `GET /returns/{id}` | Approved return permissions; role-safe projection | GET only |
| `POST /returns/{id}/dispositions` | Authorized inventory staff/Admin policy | Disabled |
| `GET /refunds`; `GET /refunds/{id}` | Approved financial scope; return creation records refund together | GET only |
| `GET, POST /expenses`; `POST /expenses/{id}/revisions`, `/approve`, `/void` | Approved expense permission/approval rules | GET only |
| `GET /investment`, `/dashboard`, `/reports/sales`, `/reports/profit`, `/reports/products/{id}` | Admin | GET only |
| `GET, PATCH /settings/shop`; `GET /settings/receipt-preview` | Admin mutation; public subset for sale/branding | Sanitized GET only |
| `GET, POST /closings`; `GET /closings/{id}`, `/closings/{id}/adjustments` | Admin | GET only |
| `GET, POST /accounts`; approved disable/reset commands | Admin; own credential actions separately scoped | Sanitized permitted account/security view; no local staff administration |
| `GET /audit-events`, `/backups`, `/sync/status` | Admin; sensitive operational fields withheld | Sanitized GET only |
| `POST /backups` | Approved Admin backup request | Disabled |
| `POST /api/internal/v1/replication/batches` | Not a browser business endpoint; service identity only | No EXE/user access |

Rows with multiple paths abbreviate shared prefixes; OpenAPI must expand every exact path, parameter, role, body and response before implementation. Approval/disposition commands are conditional on the corresponding final workflow.

Keep `GET /api/health` as advisory liveness and add a minimal `GET /api/ready` readiness contract. Detailed diagnostics require Admin authorization. Neither endpoint resolves whether a sale committed.

## 7. Validation, permissions and verification at every step

### Request pipeline

1. Enforce HTTPS/trusted origin, JSON content type, body size and appropriate rate limits.
2. Verify the server session, enabled account, shop scope and operation permission.
3. Parse strict Zod schemas; reject unknown fields, malformed IDs, invalid dates and excessive input precision.
4. Load referenced records and enforce record-level access; derive actor/role from the session.
5. Enforce business rules: active product, unit precision, price/discount policy, stock, prior returns, expected revision and closing rules.
6. Claim the request key and apply all writes in one short transaction with database constraints.
7. Return only the allowed role-specific projection, saved committed values and a safe error/request reference.
8. Refresh affected local queries after confirmed success. Queue cloud work without waiting for the internet.

Use the same reviewed schema definitions for forms/OpenAPI where practical; browser validation is convenience, never permission to trust a request.

### Shared API contract

- Decimal amounts/quantities are strings; timestamps are ISO values; currency is PKR.
- Mutation bodies carry canonical `requestKey`; relevant corrections/settings carry `expectedVersion`.
- Bind a key to the normalized business payload, operation and actor. Concurrent same-key requests produce one effect; mismatched payloads produce a conflict.
- Replayed committed results are checked before new-operation rules that may have changed, such as product archival.
- Use 200/201 for resolved success; 400 for malformed requests; 401/403 for authentication/authorization; 404 for allowed not-found cases; 409 for version/key/stock conflicts; 422 for domain validation; 429 for throttling; 503 for unavailable required services.
- Use a stable envelope such as `{ data, meta: { requestId } }` or `{ error: { code, message, fieldErrors }, meta: { requestId } }`. Sale confirmations additionally retain `COMMITTED`, `requestKey`, `saleId` and saved amounts.
- Request outcome lookup distinguishes COMMITTED, authoritative REJECTED and UNCONFIRMED. Missing/in-flight records and HTTP errors do not prove rejection.
- Private responses use explicit cache controls; never share Admin data through CDN, browser/service-worker caches or reused role responses.
- Parameterize SQL; allowlist sort/filter fields and cursor limits. Do not accept client-supplied cost, profit, balance or actor values.

### Required verification evidence per module

- Unit tests for significant business calculations and validation.
- Real PostgreSQL integration tests for transactions, constraints, locking, retries and permissions; mock databases cannot certify these.
- REST contract tests and direct unauthorized-request tests.
- Focused Playwright checks for connected UI, error/empty/loading/unconfirmed states and applicable offline behavior.
- Relevant lint, type check and production build, recording actual results and versions.
- Changed files/migrations, unresolved decisions and acceptance evidence recorded in project memory.
- Review before the next module; deployment/destructive changes remain separately authorized.

Do not add superficial tests that repeat implementation. Test the rule, failure or cross-feature connection.

PostgreSQL transaction behavior supports row locking/conditional updates, but application isolation and retry strategy still require tests; see [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html). Pin a compatible Prisma/Better Auth pair: the [Better Auth Prisma adapter documentation](https://better-auth.com/docs/adapters/prisma) currently targets Prisma 7 and states Prisma 8 is unsupported. Recheck at implementation rather than installing unpinned latest packages.

## 8. How synchronization will avoid duplicates and missing data

Use a transactional outbox: save a cloud-delivery record in the same local transaction as the business change, then deliver it in the background. Consumers deduplicate stable event IDs. This pattern addresses the database/message dual-write problem described in [AWS transactional outbox guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html); using that pattern does not require AWS hosting.

1. **Local commit:** store the full transaction envelope or a durable reference to immutable versioned data. Do not reconstruct an old event by reading today's mutable product values.
2. **Delivery:** a worker leases bounded pending batches, authenticates to the cloud and retries with backoff. Expired leases recover after crashes.
3. **Cloud apply:** verify source identity, size, schema, payload hash, record dependencies and expected revisions; atomically apply the whole business envelope plus inbox receipt.
4. **Acknowledgment:** acknowledge individual durably applied event IDs. A lost acknowledgment causes a duplicate delivery with no second effect.
5. **Ordering:** use per-record revisions and explicit prerequisites for related envelopes. Missing earlier revisions wait/retry and raise visible gap status; partial sale/stock/refund envelopes are not applied.
6. **No unsafe timestamp cursor:** do not infer “everything delivered” from the highest timestamp/auto-increment ID, because concurrent transactions can commit out of order.
7. **Baseline:** for initial setup, use a documented short write pause to capture a consistent snapshot and exact queued-event boundary, then resume and replay later envelopes. Re-bootstrap only through an authorized recovery process.
8. **Schema changes:** use versioned envelopes and backward-compatible expand/migrate/contract releases; preserve incompatible events and alert rather than dropping them.
9. **Health:** display last shop contact, last applied source activity, pending/error state and a completeness indicator. Do not label receipt of one recent event as proof all earlier changes arrived.
10. **Reconciliation:** compare approved baseline/checkpoints, business counts, exact period totals, entity revisions and movement balances after catch-up. Flag discrepancies; do not silently “repair” business truth.
11. **Capacity:** limit batch bytes/count, connections and worker concurrency; monitor backlog age and disk growth. Alert before storage is exhausted. Never delete unsent accounting changes to clear space.
12. **Recovery:** a restored shop database uses a controlled source epoch/checkpoint reconciliation. Fence old workers, preserve cloud history and prevent reapplying old business effects or silently erasing newer cloud data.

Cloud normal users have read-only business credentials. Only the ingestion service can update the mirror; cloud authentication has separate limited write permissions. Service keys are scoped, rotated and stored server-side.

Mirror operations copy/project committed facts; they do not run checkout again or independently deduct cloud stock. Report caches refresh only after the related envelope commits. Until completeness is proven, cloud reports disclose their scope/freshness.

Do not use “last write wins” for stock, finance or corrections. Native PostgreSQL replication is an alternative requiring separate evaluation: [logical replication restrictions](https://www.postgresql.org/docs/current/logical-replication-restrictions.html) include schema and sequence handling. This plan proposes explicit outbox delivery for the bounded cloud view.

## 9. Keeping the app fast as records increase

We cannot promise constant speed for unlimited data. We can define an expected workload, design for it and verify that growth stays within agreed response targets.

| Area | Planned protection |
| --- | --- |
| Product search | Indexed normalized code/name search; choose prefix or trigram strategy from real query plans; debounce client queries |
| Lists/history | Server-side filtering and stable cursor pagination, e.g. 50 default/100 maximum after review |
| Checkout | Read only requested products; cap basket/input size; lock only affected records; keep network/printing outside transactions |
| Inventory | Maintained balance rows for immediate reads; background ledger reconciliation |
| Reports | Indexed time/product queries; exact SQL aggregates; bounded chart buckets and report ranges |
| Larger reports | Rebuildable day/product summaries when benchmarks justify them; revisions/returns/expenses update summaries reliably |
| Background work | Bounded batches for sync, backups and heavy jobs; avoid competing unbounded scans |
| Connections | Separate bounded app/worker pools with provider connection limits reviewed |
| UI | Send one page of records and aggregated charts; avoid transferring entire sales histories |
| Privacy/caching | Cache only authorized projections, with correct invalidation; local read-after-write is authoritative |
| Database health | Monitor slow queries, locks, index usage, statistics, autovacuum, disk and pool saturation |
| Long-term growth | Archive/partition only after measurement; preserve history and retention requirements |

Use [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html) on representative queries and record database plans and latency distributions.

### Proposed benchmark, to approve on actual hardware

Retain the earlier planning baseline: 10,000 products, 1,000,000 sales and five active shop terminals. Also test a larger stress tier, proposed at 50,000 products and 5,000,000 sales with realistic lines, returns, movements, expenses and uneven popular-product demand.

- Proposed p95 (95% of requests): LAN search <= 1 second, sale commit <= 1 second, common dashboard/report <= 3 seconds.
- Proposed healthy-internet cloud freshness: <= 15 seconds at the agreed normal write load; measure source-to-cloud visibility, not just upload success.
- Measure remote screen latency separately from synchronization freshness and compare to an agreed target after hosting selection.
- Exercise cold/warm caches, concurrent sale/receipt/reprice, large-history pagination, bounded reports and sync catch-up under continuing checkout.
- Record hardware, network, versions, dataset distribution, errors, p50/p95/p99, lock waits, memory and disk; averages alone are insufficient.
- Growth release checks must show acceptable latency at both baseline and stress tiers; optimize or resize when limits are exceeded.

These are proposed targets, not verified performance. Confirm backup data-loss tolerance and recovery time separately. An internet outage can make the cloud arbitrarily stale even when synchronization code is correct.

## 10. Decisions to record before affected implementation

Preserve existing D01–D16 identifiers. New C identifiers below cover the cloud/desktop extension.

| Decision | Status / proposed direction | Needed by |
| --- | --- | --- |
| C01 Remote purpose | Confirmed: Admin views all sections from elsewhere; no remote sales/business edits | Architecture and cloud authorization |
| C02 Delivery | Confirmed Windows EXE; portable packaging and supported Windows versions need verification; Electron is proposed | Step 1/20 |
| C03 Source of business truth | Proposed local authoritative DB + live cloud mirror | Step 1 review |
| C04 Cloud service | Provider, region, budget, storage, backup, hosting, TLS/domain and connection limits remain to be selected | Before provisioning |
| C05 Freshness | Stale-data disclosure required; healthy-network numeric target proposed above | Step 1/19 |
| C06 Remote identity | Separate cloud owner authentication; recovery/MFA/device-session policy to review; no staff hashes in business sync | Step 4 design/20 |
| D02 Basket | Current demo is multi-item; propose header/lines with all-or-nothing production commit | Step 1 |
| D03 Units and money | Whole/fractional unit types, max values, quantity scale, discount/refund rounding remain pending | Step 1/2 |
| D04 Product identity | Name/code uniqueness, optional category, archive/resume, case/space normalization | Step 1/5 |
| D05 New receipt cost | Different-cost receiving: receipt-only or explicitly linked all-remaining-stock reprice; effective dates/corrections | Step 1/6 |
| D06/D09 Corrections/returns | Editable fields, additional-unit cost, authorization, refund/date/COGS treatment, return-versus-correction and closed-day policy | Step 1 revision model; Steps 11/12/17 |
| D07 Selling policy | Below-cost/zero-price rules, override rights and confidential error behavior | Step 9; relevant schema earlier |
| D08 Discount/payment/receipt | Per-line production policy, exact allocation, cash records, old global-discount imports and printer support; no taxes inferred | Step 1/9–11 |
| D10 Permissions | Salesperson own/all history, return/expense rights, approval requirements and Admin local POS access | Step 4 |
| D11 Login/recovery | Secure identity behind password-only UI, staff provisioning, reset/recovery, idle/session limits | Step 1/4 |
| D12 UI | Preserve approved layouts; finish pending visual/manual checks and exact supplied logo | Relevant screens |
| D13 Capacity/hardware | Shop server/router/UPS, local DNS/TLS, terminal count and benchmark targets | Step 1/21 |
| D14 Recovery | Retention, permitted data-loss window (RPO), recovery duration (RTO), keys and restore authority | Step 18 |
| D15 Uncertain requests | Pending-key retention, shared-terminal isolation, missing-browser-state recovery | Step 10 |
| D16 Opening data | Approved real catalog, quantities/costs, legacy sales completeness, import and pilot | Step 2/22 |

Resolve each decision before dependent code. Planning can describe alternatives without pretending approval. UI examples and previously passed tests do not settle production policy.

Cloud selection should consider PostgreSQL compatibility, private credentials/TLS, region/latency, cost at expected growth, storage/connection limits, point-in-time recovery availability, export/exit path and reliable API hosting. Do not select or purchase a provider just because a connection string is available.

## 11. Cross-feature acceptance: prove everything is connected

Use isolated real PostgreSQL test data, not existing fictional sales as production data.

| Scenario | Required connected result |
| --- | --- |
| Create product with opening 50 at Rs. 1,000 cost | Product, stock balance, opening movement and audit agree |
| Receive another 20 | Balance is 70; one receipt/movement; purchase expenditure correct |
| Sell 2 at Rs. 1,200, no discount | Stock 68, revenue Rs. 2,400, COGS Rs. 2,000, gross profit Rs. 400 |
| Reprice remaining units to Rs. 1,100 | Quantity stays 68; first sale still has Rs. 400 profit |
| Sell another unit at Rs. 1,300 | Stock 67; second sale profit Rs. 200; combined gross profit Rs. 600 |
| Record approved same-period expense Rs. 100 | Gross profit stays Rs. 600; net profit becomes Rs. 500 |
| Read investment and stock value | Investment follows recorded purchases; stock value is 67 x Rs. 1,100 = Rs. 73,700 |
| Query reports and dashboard | Same period totals; card drilldowns agree with underlying records |
| Print/reprint first receipt | One sale remains; original prices and saved identity unchanged |
| Return/correct a sale | Approved policy changes inventory/revenue/COGS once; original and revision remain visible |
| Close day, then adjust | Immutable closing plus linked adjustment; no deleted/reset records |
| Disconnect WAN and continue | Local workflows work; outbox grows; remote clearly shows stale data |
| Restore WAN | Cloud applies each effect once; EXE sections reconcile to the local source |
| Lose sale response or repeat delivery | Original-key recovery finds one sale; cloud does not duplicate it |
| Open Admin EXE on another internet connection | Owner signs in and views every approved section; all business writes denied |
| Restore a verified backup in isolation | Ledger, totals, settings and authentication reconcile; recovery time/data gap recorded |

The numerical sale scenario excludes return/correction adjustments until their policy is approved. Repeat it with discounts, fractional units if permitted, prior returns, archived products and closing boundaries.

## 12. Immediate next deliverable

The next implementation-adjacent task should be **Step 1 only: architecture and database design review**.

Produce the entity diagram, field dictionary, exact constraints/index proposal, transaction/lock protocol, role matrix, REST/OpenAPI outline, cloud/EXE deployment boundaries and resolved decision log. Then review that package before database migrations.

Later modules turn the existing screens into durable functionality one by one. Completion means demonstrated persistence, accounting/stock consistency, server authorization, safe retries, tested recovery, measured performance and a working remote EXE.

## 13. Verification of this planning document

This task creates a plan and updates project memory. It does not install packages, create databases, deploy services, build the EXE or change application behavior.

The original SRS was extracted/read, existing guides/contracts and current API/frontend boundaries were inspected, live Git state was checked, and official technical references were consulted. Documentation verification is recorded in project memory after checking links, feature coverage and preservation of pending application changes. Application tests/builds are not evidence for a documentation-only plan and are not claimed here.


## Later owner direction — 9 November 2026

The final frontend brief now selects SQLite as the future authoritative local shop database and proposes Supabase private Storage for encrypted cloud backups. The PostgreSQL/cloud business-mirror architecture above is an earlier proposal and must not be implemented as an approved current design. Preserve its historical rationale, then reconcile the database, backup and remote Admin viewing requirements in a separately authorized backend design task. Backup storage alone does not provide the earlier requested live remote activity viewer. This amendment authorizes no database, Supabase connection, authentication or EXE work; the current task is frontend-only, with visual review required before committing.
