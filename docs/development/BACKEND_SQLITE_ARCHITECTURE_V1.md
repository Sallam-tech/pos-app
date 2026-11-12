# Shop POS backend architecture and database design V1

**FINAL OWNER UPDATE: OPTION2 APPROVED - per-unit final-payable HALF_UP first, multiply quantity, then sum lines. Complete coordinated TEST Sales36 contract APPROVED; implementation VERIFIED TEST ONLY. Earlier extended-line recommendation/approval-pending text below is historical and superseded. No production activation.**

Date: 9 November 2026, Asia/Karachi. Latest financial authority:12 November2026.

**OWNER APPROVED P02/Q1/Q2/Q3/D05/P08:** whole-PKR/final-payable rounding, cumulative refunds, atomic incoming-cost receiving and signed late-count reconstruction. [Authoritative record and approved Sales contract](FINANCIAL_POLICY_AND_SALES_SCHEMA_CONTRACT.md). FINAL OPTION2 per-unit rounding and the coordinated TEST36 Sales schema are also approved. Earlier paisa-cash/discount-first proposals are superseded; production remains disabled. Policy approval is not implementation evidence.

Status: RECONCILED with final owner/client P01-P12 decisions, 9 November 2026. CONFIRMED scope, PROVISIONAL evidence-dependent items, PENDING narrow gates and SUPERSEDED alternatives are distinguished throughout. Design only; no backend implementation authorized.

Client-decision summary: whole PACK/BOX variants; OWNER APPROVED whole-PKR prices/cash, whole-percent discounts, final-payable HALF_UP and cumulative refunds (FINAL OPTION2: round each unit, then multiply); no below-cost final charges; Admin-only saved invoice corrections; inspection-first returns; limited one-use Admin grants for restricted shared-S actions; Karachi midnight dates; exactly two role accounts; hybrid live/cloud remote access with details/price-only queue; provisional tested backups; all-in-one installed Windows application. See section15 for the twelve final statuses and section16 for prototype-versus-production gates.

## 1. Architecture in simple terms

The shop laptop keeps the only working business database. Every sale, refund, expense and stock change passes through the local backend. It checks permission and calculations, then saves connected records together. Ordinary operations need no internet while the laptop/application run. Turning off the laptop stops transactions, scheduled backups and remote access.

Recommend SQLite on the laptop's internal NTFS disk, outside installation/build/temp directories and outside OneDrive, USB and network shares. Keep the existing Next.js/TypeScript frontend and add versioned REST Route Handlers, domain services and repositories. Propose parameterized SQL through better-sqlite3 and reviewed SQL migrations, without an ORM. Retain Better Auth as preferred local authentication, subject to section 8's identity, protected-token and compatibility gates. Pin/test versions together before separately authorized installation; the PostgreSQL/Prisma examples are not SQLite instructions.

Supabase PRIVATE Storage holds encrypted recovery archives. Separately, the approved hybrid remote system needs a hosted read projection and narrow product-details/selling-price command service, not backup-file synchronization. Online remote edits reach the local authoritative backend; offline owner viewing uses last synchronized cloud data, with only those two command types allowed to queue. SQLite remains the sole transactional shop authority.

P12 CONFIRMED: ONE installed all-in-one Windows desktop POS including local database/auth, transactions, scheduler/status, USB/cloud backup and guided recovery. Electron + bundled Next.js/Node/SQLite is the candidate subject to compatibility, not a deployed package. Installation/restoration must not require separate Node.js, Chrome or SQLite installs; printer/device/cloud enrollment may need reconfiguration. Earlier browser-deployment Option B is SUPERSEDED by latest owner clarification; no reason for it is inferred. Separate Remote Admin EXE remains planned.

### Repository evidence

- Branch master; approved HEAD 1456ce4df2c6ff7d1c4d61833a019b0cbcee36a1. Initial architecture task began clean; THIS reconciliation began with unstaged memory/plan edits and the existing untracked architecture document. They are preserved and updated, not committed. Index was empty.
- Application paths: web/src/app, web/src/components and web/src/lib. Manifest pins Next.js 16.4.3, React 19.3.0, TypeScript 5.9.3, Node >=24.11.0 <25. No business DB/auth packages are present in that manifest. GET /api/health is the only current API and reports liveness only.
- Read root/web AGENTS, original SRS including confirmed amendments, memory, plan/checklist, development/UI guides/prototype, older cloud/offline plan, expense and settings/closing/backup contracts, frontend report, every page route and relevant helpers/types/fixtures. Installed Next.js Route Handler/standalone documentation was consulted.
- Relevant existing pure helpers: pos-preview.ts, item-discount-preview.ts, demo/checkout.ts, demo/money.ts, return-refund-preview.ts, counter-cash-preview.ts, admin/stock-investment-preview.ts, product-preview.ts and receipt/settings helpers. Reuse tested behavior where production policy agrees; none implements durable business transactions.
- Preserve all original fixtures: 7 products / 123 units / 3 low-stock entries; 8 sales / 42 sold units / 6 sold products; revenue Rs. 25,690.00, fictional COGS Rs. 20,550.00, gross profit Rs. 5,140.00. Original sales lack reliable paid/discount/return snapshots. Never import demo fixtures as real shop records or fill missing costs/payment data.
- Client-approved frontend is FROZEN. Necessary backend connections, identity controls, server validation and honest error states require bounded integration review. Optional redesign and AL.MADINA logo remain deferred.

Source links: [original SRS](<../requirements/Software Requirements Specification.docx>), [development guide](POS_Complete_Development_Guide.md), [frontend report](FINAL_FRONTEND_REFINEMENTS_REPORT.md), [expense contract](EXPENSE_ACCOUNTING_CONTRACT.md), [closing/backup contract](SETTINGS_CLOSING_BACKUP_CONTRACT.md), [older cloud plan](../FULL_FUNCTIONALITY_CLOUD_OFFLINE_PLAN.md).

### Local/offline workflow

~~~mermaid
flowchart TD
    U[Approved desktop screens] --> A[Local REST /api/v1]
    A --> G[Session, permission, strict validation]
    G --> S[Business service and transaction]
    S --> D[(Authoritative local SQLite)]
    D --> R[Committed role-safe response]
    R --> U
    D --> B[Consistent snapshot, verify, encrypt]
    B --> L[Local and external recovery copies]
    B --> J[Durable upload job, retry online]
    J --> C[Supabase PRIVATE Storage]
    X[Remote Admin EXE] --> T[TLS tunnel, gateway identity, remote MFA]
    T --> A
    D --> O[Transactional allowlisted sync outbox]
    O --> P[Hosted Admin read projection and watermark]
    X --> P
    X --> Q[Only details or selling-price command queue]
    Q --> V[Local reauthorize, version check and dedupe]
    V --> A
~~~

Only the local backend opens the working database. Browser code, remote EXE and Supabase never open it. No online authentication/license check, fonts/CDNs or cloud request may block local sales. Initial deployment is one laptop; LAN terminals need separate network/HTTPS approval.

### Frontend -> API -> service -> database

| Layer | Proposed location | Responsibility |
| --- | --- | --- |
| Existing screens | web/src/app/admin, web/src/app/pos, current components | Preserve layout; consume authorized DTOs |
| Typed contracts | web/src/contracts/v1 | Strict Zod schemas, DTOs, error codes, generated OpenAPI; independent server parsing |
| REST | web/src/app/api/v1/**/route.ts | Node runtime; session, role, validation, service call and safe response |
| Services | web/src/server/services | Inventory, sales, refunds, expenses and closing; one shared transaction context |
| Repositories | web/src/server/db | Prepared SQL, migrations, connection policy and transaction runner |
| Pure calculations | web/src/server/domain | BigInt money/quantity, allocations, versioned policies |
| Workers | web/src/server/jobs | Snapshot/encryption/upload/restore preflight, bounded retries |
| Desktop supervisor | future desktop/ | Lifecycle, restricted native bridge, printing and protected keys |

These paths are proposals, not created modules. Server-rendered loaders may call the same authorized query services directly. Browser and remote clients use REST. Do not introduce a second unguarded Server Action write path.

## 2. Conflicts and document authority

Latest owner instructions authorize design and replace earlier deployment proposals; original SRS business rules and confirmed amendments remain preserved.

| Topic | Older proposal/source | Current direction and consequence |
| --- | --- | --- |
| Database | AGENTS/guide/master Phase 4: PostgreSQL + Prisma | Local SQLite; propose SQL repositories. Owner/mentor approves tooling amendment before code. No PostgreSQL row-lock or NUMERIC assumptions. |
| Host | Linux mini-PC, LAN, Docker Compose, Caddy | One Windows laptop; no WSL/Docker/VM. Loopback service first. |
| Cloud | Earlier full mirror, then backup-only/direct-only proposal | CONFIRMED private encrypted Storage backups PLUS separate allowlisted Admin projection and restricted queue; neither is a second transactional shop writer. |
| Remote | Earlier read-only or direct-only/no-queue proposals | CONFIRMED hybrid live viewing/authorized edits; offline last-sync view and ONLY details/selling-price queue. Old recommendations SUPERSEDED. |
| Login | Original distinct employee/username accounts; password-only demo and earlier chooser proposal | P09 CONFIRMED fixed ADMIN and shared SALESPERSON credentials, selected role mapping; no employee accounts. Documented accountability limit. Older login contract presentation is historical; minimal role selector only during approved integration. |
| Cardinality | Old single-product examples and pending D02 | Approved basket and latest multi-item requirement need header/lines and atomic all-line commit. |
| Extra scope | SRS excluded expenses and omitted refunds/payments | Later owner requests expenses, per-line discounts and cash-only payments/refunds. Detailed policy remains pending. |
| Valuation | Confirmed SRS Option A | Reprice all remaining units; old sale cost snapshots never rewritten. No FIFO/weighted average. |
| Quantity | Six-decimal preview and earlier fractional-unit alternatives | P01 CONFIRMED whole PACK/BOX production; micro-unit storage extensibility does not permit fractional packs or conversion. |
| Price/rounding | Earlier reject fractional-paisa and allow-below-cost proposals | SUPERSEDED: owner-approved whole-PKR final-payable HALF_UP, whole-percent discounts and cumulative refunds; FINAL OPTION2 per-unit rounding approved. P04 final-line cost floor/no override remains. |
| Calendar/desktop | Trading-day or daily-manual-opening/browser deployment alternatives | SUPERSEDED by calendar midnight and installed all-in-one P12 A; late count/carry mechanics still narrowly pending. |
| Reports | Earlier gross-profit-only examples | Net revenue/COGS/operating expenses/returns share one source; immutable closing preserved. |
| Review | Historical pending visual approval | Frontend checkpoint approved and frozen; no optional redesign. |

Current planning reconciliation retains master Phases1-9 and acceptance history; section13 now refines future SQLite/Windows work under confirmed P01-P12. Active plan/memory and checklist status pointers identify which older alternatives are superseded. Original SRS/guides/contracts remain unchanged historical sources; no backend implementation checkbox is completed by a decision approval.

## 3. Database conventions and ER diagram

One shop, no branch/tenant platform. shop has one row. IDs are opaque TEXT identifiers, never product names. Business tables use SQLite STRICT types. All historical FKs use ON DELETE RESTRICT; archive/disable instead of delete. Index query-relevant referencing FKs. Append-only events have service protections plus update/delete-blocking triggers, which cannot defeat a Windows administrator modifying files.

Dictionary aliases apply to EVERY table below:

| Alias | Storage and rules |
| --- | --- |
| ID / FK | TEXT NOT NULL; ID primary key. ? means nullable. UUID syntax at API, length checks at DB. |
| I / B | INTEGER / INTEGER checked IN (0,1). Versions >=1. |
| M | INTEGER paisa; nonnegative unless explicitly signed; never REAL. |
| Q | INTEGER micro-units for extensible storage; initial production CHECK value%1000000=0 for whole PACK/BOX counts, signed only for deltas. No fractional/conversion support in this release. |
| T / Date | INTEGER UTC epoch milliseconds / TEXT validated YYYY-MM-DD Karachi business date. |
| E / J | TEXT checked enum / TEXT json_valid plus versioned typed schema. JSON does not replace relational financial lines. |
| actor / op | recorded_by FK users? plus actor_kind ROLE_ACCOUNT/SYSTEM, recorded_at T, operation_id FK operations; human events require fixed role account, system events use null person/explicit SYSTEM. Record nonsecret session reference and Admin authorizer when applicable; never invent employee/system user. |
| V | INTEGER optimistic version incremented atomically; stale-sensitive API edits require expectedVersion. |

Storage capacity can retain up to12 whole rupee digits +2 decimals and scaled Q capacity, but current API permits only integer PACK/BOX quantities (up to12 whole digits subject to practical limits). No fractional preview fixture is changed. Compute with BigInt and reject every persisted/aggregate signed64-bit overflow before SQLite could coerce arithmetic to REAL. Financial policies and the preserving TEST36 Sales schema are approved; later Closing evidence/variance authority remains a separate gate. No Number arithmetic.

~~~mermaid
erDiagram
    shop ||--o{ installations : authorizes
    users ||--o{ auth_accounts : credentials
    users ||--o{ sessions : authenticates
    users ||--o{ recovery_codes : recovers
    users ||--o{ operations : role_requests
    users ||--o{ admin_authorizations : approves
    admin_authorizations ||--o| operations : consumed_by
    operations ||--o| sync_outbox : publishes
    operations ||--o| remote_command_inbox : applies
    operations ||--o{ audit_events : records
    products ||--o{ product_identifiers : identifies
    products ||--|| stock_balances : balances
    products ||--o{ cost_changes : reprices
    purchases ||--|{ purchase_lines : contains
    products ||--o{ purchase_lines : receives
    products ||--o{ stock_adjustments : counts
    products ||--o{ stock_movements : changes
    operations ||--o{ stock_movements : owns
    sales ||--|{ sale_revisions : preserves
    sale_revisions ||--|{ sale_lines : contains
    products ||--o{ sale_lines : snapshots
    sale_revisions ||--|| invoice_snapshots : prints
    sales ||--|| cash_payments : settles
    sales ||--o{ returns : returns
    returns ||--|{ return_lines : selects
    sale_lines ||--o{ return_lines : limits
    returns ||--|| refunds : pays
    return_lines ||--o{ return_dispositions : inspects
    expenses ||--|{ expense_revisions : preserves
    cash_days ||--o{ cash_movements : reconciles
    cash_counts ||--o| cash_movements : reconciles_once
    cash_counts ||--o{ daily_closings : evidences
    cash_days ||--o| daily_closings : freezes
    daily_closings ||--o{ closing_adjustments : explains
    backup_sets ||--o{ backup_copies : locates
    background_jobs }o--o| backup_sets : produces
    restore_runs }o--|| backup_sets : validates
~~~

Principal relationships shown; dictionary defines the remaining FKs/supporting settings, schema_migrations and auth_verifications. All row ownership is this shop. All writes are server-only, never direct user SQL. A = Admin; S = Salesperson; W = restricted system worker. Unless explicitly allowed, S cannot read a table or its raw DTO.


## 4. Complete logical table and field dictionary

This is a logical schema, not migration SQL. Common fields/types/rules from section 3 are part of each row. All UQ constraints are real unique indexes. All enumerated values and nonnegative/positive amounts receive DB CHECKs; cross-row rules listed below are enforced transactionally and tested, not falsely described as SQLite CHECK capabilities.

### 4.1 Identity, configuration and request control

| Table / purpose | Important columns and relationships | Constraints and indexes | Authorization / sensitive handling |
| --- | --- | --- | --- |
| shop: single business identity | id ID; singleton I=1; name TEXT(80), address TEXT(240), phone TEXT(32), receipt_footer TEXT(160); currency E=PKR; timezone E=Asia/Karachi; receipt_layout E ordinary/compact; policy_version I; V; created_at/updated_at T | UQ singleton, CHECK singleton=1, field lengths/currency/timezone/layout. No second shop. | A edits public fields with audit; public/S read only branding subset. Historical invoices use snapshots. No credentials. |
| users: exactly two fixed role accounts | id ID; role E ADMIN/SALESPERSON; login_normalized TEXT reserved per role; display_name TEXT (Admin/Salesperson Shared); active B; auth_epoch I; framework-required name/email/emailVerified/createdAt/updatedAt | UQ role, login_normalized and internal framework email; CHECK two role values; bootstrap completes with exactly two rows, then creation/deletion blocked. Admin always active; S may be temporarily disabled. | Not employee identities. A manages credentials; no public signup/staff provisioning. Session role comes from DB. Audit cannot identify an individual shared-login employee. |
| auth_accounts: password credentials | id ID; user_id FK users; provider_id E credential; provider_account_id TEXT; password_hash TEXT; created/updated T; no enabled OAuth providers | UQ(provider_id,provider_account_id); UQ user_id for credential-only configuration; hash length/format. Framework-required schema must be generated/reviewed before migration. | Auth service only; no password/hash in DTO/audit/renderer. Salted scrypt through Better Auth; no plaintext passwords. |
| sessions: revocable login | id ID; user_id FK users; token_lookup BLOB; token_ciphertext BLOB; crypto_key_id TEXT; expires_at, last_seen_at, created_at, fresh_until T; auth_epoch I; installation_id FK installations?; remote B; remote_assurance E local/MFA | UQ token_lookup; indexes user_id, expires_at. expires_at>created_at; ciphertext nonempty. Revoke by delete/expiry/epoch. Protected-token adapter maps framework token semantics; see gate section 8. | Auth service only; HttpOnly token cookie. Encrypted token at rest plus keyed lookup, never return secrets. No plaintext token in DB/backups/logs. |
| auth_verifications: framework challenge compatibility | id ID; identifier_digest BLOB; value_ciphertext BLOB; key_id TEXT; purpose E; expires_at/created_at T | UQ identifier_digest per purpose; expiry index. Generate exact provider schema; disable public email reset/unused challenge APIs. | Auth service only; challenge material protected, short-lived; no plaintext reset tokens. |
| auth_mfa: future remote second factor | id ID; user_id FK users; totp_secret_ciphertext BLOB; key_id TEXT; enabled B; created_at T; last_accepted_step I? | UQ user_id; reject repeated accepted TOTP time step; recovery_codes adds purpose E OWNER_RECOVERY/MFA_RECOVERY so proofs cannot be confused. Provider-required fields generated/reviewed at remote phase. | A remote identity only, authenticated enrollment with fresh local A and verified factor; encrypted secret; no ordinary DTO/log exposure, except explicit one-time protected factor enrollment. Not installed now. |
| recovery_codes: offline owner recovery | id ID; user_id FK users; code_hash BLOB; created_at T; consumed_at T?; replacement_group TEXT | UQ code_hash; index user_id. Conditional consume WHERE consumed_at IS NULL; single-use transaction. | Owner setup/recovery only; raw high-entropy codes shown once and kept off-device. Never hashes in user DTO. Separate from backup decryption key. |
| installations: authority generation | id ID; shop_id FK shop; generation I; device_key_fingerprint TEXT; state E ACTIVE/RETIRED/RECOVERY; activated_at T; retired_at T?; predecessor_id FK installations? | UQ generation; partial UQ shop_id WHERE state=ACTIVE in this database. Monotonic generation; signed authority/fencing outside DB in section 10. | W/reauthenticated local A only. No private device key; protected OS storage reference only. This table alone cannot fence another offline copy. |
| operations: business idempotency and outcome | id ID; sequence I; installation_generation I; actor_id FK users?; actor_kind E ROLE_ACCOUNT/SYSTEM; actor_session_ref TEXT; authorization_id FK admin_authorizations?; remote_command_id TEXT?; request_key TEXT UUID; kind E; canonical_payload_hash BLOB; status E COMMITTED/REJECTED; http_status I; result_type E; result_id TEXT?; safe_result J?; rejection_code E?; recorded_at T | UQ request_key and sequence for lifetime of history; indexes(actor_id,recorded_at),(kind,result_id); immutable terminal outcome, 32-byte hash, versioned safe DTO. Session ref is nonsecret historical ID, not FK to deletable live session/token. | Human requests require a fixed role account; internal jobs use explicit SYSTEM/null actor, never fake Admin. S is shared executor, not a person. Restricted mutation also records Admin authorizer. No cost in S confirmation; replays remain authorized and dedup keys retained. |
| settings: typed operational configuration | key TEXT PK; value J; schema_version I; V; updated_by FK users; updated_at T | Allowlisted keys with typed validators, not arbitrary JSON editor. key examples: backup_policy, cash_policy, device_binding. Policies cannot retroactively reinterpret history. | A permitted keys; W operational reads. Secret values prohibited: store credential/key references only. S receives selected public shop fields, never this raw table. |

Auth table names are logical mappings. Do not manually approximate a library-generated schema. Exact Better Auth fields, fixed-role-only facade, naming, constraints and token transformations are a Phase B1b/B2 compatibility gate, not a blocker to a driver-only B1a. If the adapter cannot meet these protections, stop and propose a reviewed alternative; do not silently weaken them.

Additional local security table justified by P07:

| Table / purpose | Important columns and relationships | Constraints and indexes | Authorization / sensitive handling |
| --- | --- | --- | --- |
| admin_authorizations: one bounded privileged operation | id ID; kind E REFUND_CREATE/EXPENSE_REVISE/EXPENSE_VOID; requester_id FK users=SALESPERSON; requester_session_ref TEXT; requester_epoch I; target_type/id TEXT; target_version I; intent J (safe fields); intent_hash BLOB; operation_key TEXT UUID; generation I; status E REQUESTED/APPROVED/DENIED/CONSUMED/EXPIRED; approver_id FK users?; approver_epoch I?; expires_at/created_at/approved_at/consumed_at T?; consumed_operation_id FK operations?; V | UQ operation_key; index(requester_session_ref,status,expires_at); immutable intent/target/key after create; APPROVED/CONSUMED require ADMIN approver and epoch; conditional consume inside business transaction. Mutual operation FK uses reviewed insertion order/deferred FK if needed, not two transactions. | S sees safe request/status only; A approves exact intent in separate authenticated window. Grant ID never a bearer Admin login; nonsecret session references survive logout audit. No cost-floor override grant type. |

### 4.2 Catalog, purchases, costs and stock

| Table / purpose | Important columns and relationships | Constraints and indexes | Authorization / sensitive handling |
| --- | --- | --- | --- |
| products: one independent sellable size variant | id ID; code TEXT(32); base_name TEXT(120), name_normalized TEXT; category TEXT(80)?; size_label TEXT(40)? (Small/Medium/Large/XL initially); unit E PACK/BOX; quantity_step_q Q=1000000; current_cost_m M; normal_selling_price_m M?; low_stock_q Q; selling_active B; archived_at T?; V; actor/op | UQ immutable code; positive current cost; active requires positive normal price; threshold>=0 and divisible by1000000. Name need not be unique. Unit/step fixed; size/unit identity cannot be converted after history by metadata update. Index(name_normalized,size_label,code),(selling_active,id). | A full; S safe name+size+code+normal price only. New/edit normal-price service checks current cost; later cost reprice may flag stale normal price but never changes historical cost or silently edits selling price. Separate stock/cost for every size. |
| product_identifiers: optional barcode identifiers | id ID; product_id FK products; kind E BARCODE; value/normalized TEXT; active B; actor/op | UQ(kind,normalized); partial UQ(product_id,kind) WHERE active=1; index product_id; validate chosen barcode format/leading zeros. Required internal product code lives in products.code, not an optional duplicate CODE row. | A changes with audit; S approved exact-code lookup only. No scanner feature/conversion implementation authorized. |
| stock_balances: whole-pack sellable projection | product_id FK products PK; sellable_q Q; V; updated_at T | sellable_q>=0 AND sellable_q%1000000=0; conditionally update quantity/version with linked movement. No direct balance-edit endpoint. | A reads, S never sees quantities. Same transaction as all quantity-changing events; each size has its own row. |
| cost_changes: immutable cost/revaluation history | id ID; product_id FK products; old_cost_m M? (initial only), new_cost_m M; affected_sellable_q Q; valuation_delta_m signed M; reason TEXT; linked_purchase_id FK purchases?; actor/op | new_cost>0, affected>=0; UQ(operation_id,product_id); index(product_id,recorded_at,id). Initial event explicitly distinguished. | A only. Revaluation delta is not a sale profit/expense. Cost update, event and audit atomic; old sale costs untouched. |
| purchases: stock-receiving document | id ID; kind E OPENING/RECEIPT/REVERSAL; source_purchase_id FK purchases?; received_date Date; supplier_note TEXT?; payment_source E COUNTER/OWNER_FUNDS/UNKNOWN; actual_paid_m M?; status E POSTED; actor/op | UQ operation_id; index(received_date,id). Opening stock is not invented cash expenditure; UNKNOWN cannot be reported as zero paid. Reversal links original; no hard delete. | A only. Optional supplier text, no new supplier-management module. Reversal with downstream sales requires controlled correction review. |
| purchase_lines: quantities and actual original buying costs | id ID; purchase_id FK purchases; product_id FK products; line_no I; quantity_q Q; unit_cost_m M; line_cost_m M; linked_cost_change_id FK cost_changes? | UQ(purchase_id,line_no); indexes product_id, purchase_id; quantity>0, unit_cost>0; derived line-cost policy checked in service. One product once/document proposed. | A only; purchase history retains entered cost even if current valuation differs. Every posted line has one movement. |
| stock_adjustments: physical-count correction | id ID; product_id FK products; before_q, after_q Q; delta_q signed Q; expected_balance_version I; reason TEXT(160); actor/op | after>=0, delta=after-before and delta!=0; UQ operation_id; index(product_id,recorded_at). Stale balance version rejects, not overwrites sales since count. | A only; reason required. Reduction is stock change, not automatically an ordinary operating expense; valuation impact follows approved accounting. |
| stock_movements: immutable quantity ledger | id ID; product_id FK products; delta_q signed Q; balance_after_q Q; kind E OPENING/RECEIPT/SALE/CORRECTION/ADJUSTMENT/RETURN_RESTOCK; purchase_line_id FK purchase_lines?; sale_line_id FK sale_lines?; adjustment_id FK stock_adjustments?; disposition_id FK return_dispositions?; effect_key TEXT; actor/op | UQ(operation_id,effect_key); index(product_id,recorded_at,id); delta!=0, after>=0; CHECK exactly one source FK nonnull; kind/source/sign checks. Zero opening has no movement. Each new event records resulting balance. | A only; W reconciliation. Correction source points to new revision line; price-only correction has no movement. Sum ALL movements (including opening once) equals balance; immutable source chain. |

Current cost and stock balance are separate but serialized by the same short database write transaction. Stop Selling/archive excludes future sales, preserves stock/history and does not silently remove sellable physical goods from Stock Value. Pending/damaged returns are excluded until authorized restock.

### 4.3 Sales, invoices, cash payments, returns and refunds

| Table / purpose | Important columns and relationships | Constraints and indexes | Authorization / sensitive handling |
| --- | --- | --- | --- |
| sales: stable invoice identity | id ID; invoice_number TEXT; cashier_id FK users; cashier_session_ref TEXT; recorded_at T; business_date Date; latest_revision I; status E POSTED/CORRECTED; V; installation_id FK installations; op | UQ invoice_number/operation_id; indexes(business_date,recorded_at,id),(cashier_id,business_date,id). Unique generation-prefixed sequence; no reuse after transfer. | S creates; cashier identifies shared role/session, not employee. A financial access; S shared role-safe history. Admin sale-create not implicitly granted. |
| sale_revisions: immutable original/corrected accounting | id ID; sale_id FK sales; revision I; prior_revision_id FK sale_revisions?; reason TEXT?; subtotal_m,discount_m,revenue_m,cogs_m M; charge_rounding_delta_m signed M; gross_profit_m signed M; financial_delta_revenue_m/financial_delta_cogs_m signed M; effective_date Date; money_policy_version I; actor/op | UQ(sale_id,revision),operation_id; same-sale predecessor FK; revenue=subtotal-discount+rounding_delta>0; GP=revenue-cogs; line sums and P02 allocation checked in service. Deltas=new-old (initial totals for revision1). | A only saved financial corrections, quantity/price/discount on existing variant lines; blocked after returns. Original snapshots preserved; no uncontrolled invoice replacement. |
| sale_lines: immutable price, discount, size and cost | id ID; revision_id FK sale_revisions; sale_id FK sales; logical_line_id TEXT; product_id FK products; base_name/code/size/unit snapshots TEXT; quantity_q Q; unit_price_m M; discount_percent I; base_m/discount_m/charged_m/unit_cost_snapshot_m/cogs_m M; charge_rounding_delta_m signed M; calculation J (rational integers as strings); money_policy_version I | UQ(revision_id,logical_line_id); indexes(product_id,revision_id),(sale_id,logical_line_id); quantity>0 and divisible by1000000; unit_price>0; whole percent0..100; charged=base-discount+rounding_delta>0; charged>=cogs. Current-cost correction-floor service rule also applies; zero totals/override blocked. | S charged fields only, never cost/profit/calculation internals containing cost. A sees financial snapshot. The bounded implemented TEST36 definition is in the approved Sales contract; this broader future revision model is not implemented. |
| invoice_snapshots: saved reproducible receipt | revision_id FK sale_revisions PK; format_version I; public_receipt J; sha256 BLOB; recorded_at T | One snapshot/revision; payload validated and hash checked; no raw HTML. Includes official number/time, shop identity/footer, lines, paid totals, optional customer and printer layout. | Scoped S/A reads. No costs/profits/stock. Customer name/phone optional PII; never central CRM. Initial snapshot immutable; corrected copy clearly labelled. |
| cash_payments: original positive cash settlement | id ID; sale_id FK sales; tendered_m/change_m/net_received_m M; paid_at T; cash_day_id FK cash_days; money_policy_version I; op | UQ sale_id/operation_id; net_received>0, tendered>=net, change=tendered-net; net equals final sale charge; approved cash denomination enforced. | S saved receipt, A cash review. Corrections append actual cash adjustments, never overwrite original payment. |
| returns: one authorized posted invoice refund | id ID; sale_id FK sales; sale_revision_id FK sale_revisions; authorization_id FK admin_authorizations?; refund_total_m M; reason TEXT?; business_date Date; money_policy_version I; V; actor/op | UQ operation_id; index(sale_id,recorded_at,id); same-sale revision; prior returns checked atomically; S requires matching consumed Admin grant, A direct requires fresh authority. | Shared S executor/Admin authorizer recorded separately. No automatic stock effect, cost disclosure or arbitrary freeform refund. |
| return_lines: original-final-charge partial allocation | id ID; return_id FK returns; sale_line_id FK sale_lines; quantity_q Q; refund_m/original_cost_allocation_m M; cumulative_returned_after_q Q; cumulative_refunded_after_m M; allocation J; money_policy_version I | UQ(return_id,sale_line_id); index sale_line_id; positive whole-pack quantity; cumulative returned<=sold/refunded<=original FINAL paid; cumulative-target rounding + final residual per approved P02. No double allocation. | S safe selection/refund fields only; original cost private. Default pending inspection; immutable saved evidence. |
| refunds: actual authorized cash payout | id ID; return_id FK returns; amount_m M; cash_day_id FK cash_days; paid_at T; authorized_by FK users (ADMIN); authorization_id FK admin_authorizations?; actor/op | UQ return_id/operation_id; amount matches original-paid allocation and approved denomination; no arbitrary second refund; zero/low-value partial handling must match P02. | A direct or S exact one-use grant; physical handover confirmed. No standing S refund privilege, no remote queued payout. |
| return_dispositions: inspect returned goods separately | id ID; return_line_id FK return_lines; quantity_q Q; decision E RESTOCK/WRITE_OFF; reason TEXT; original_cogs_reversal_m M; current_cost_snapshot_m M?; valuation_delta_m signed M?; actor/op | quantity>0; UQ(operation_id,return_line_id); index return_line_id. Sum disposed<=returned; only RESTOCK creates positive stock movement; damaged WRITE_OFF creates none. Service checks original cost allocation residual. | A only. Uninspected quantity is returned quantity minus dispositions, not sellable stock. No hidden condition assumption from removed UI field. |

Returns keep current revision references stable. Recommended first correction policy blocks generic sale corrections after any posted return; use separately designed compensating adjustments rather than invalidating return allocations. P05 must approve this restriction and additional-unit cost treatment.

### 4.4 Expenses, cash and closing

| Table / purpose | Important columns and relationships | Constraints and indexes | Authorization / sensitive handling |
| --- | --- | --- | --- |
| expenses: shared-role operating expense identity | id ID; created_by FK users; created_session_ref TEXT; created_at T; business_date Date; latest_revision I; V; op | UQ operation_id; indexes(business_date,id),(created_by,business_date,id); server calendar date retained on correction. | S may create and read shared role-safe summaries, not individual ownership. A or exact Admin grant required to revise/void; no profit/stock fields. |
| expense_revisions: posted/corrected/voided operating expense | id ID; expense_id FK expenses; revision I; prior_revision_id FK expense_revisions?; amount_m M; reason TEXT(160); status E POSTED/VOIDED; payment_source E COUNTER/OWNER_FUNDS; economic_class E OPERATING; authorization_id FK admin_authorizations?; actor/op | UQ(expense_id,revision),operation_id; posted amount>0; void preserves original amount; same-expense predecessor; only delta affects cash/economics. | S initial entry; later S edit/void needs exact consumed Admin grant, or A directly. Purchases/drawings excluded; date retained and actual cash delta separately dated. |
| cash_days: calendar-day boundary and continuous carry | id ID; business_date Date; opening_m signed M?; opening_basis E INITIAL_COUNT/LEDGER_CARRY/UNKNOWN; predecessor_id FK cash_days?; boundary_sequence I; state E ACTIVE/AWAITING_CLOSE/CLOSED; cash_status E COMPLETE/UNRECONCILED/UNKNOWN; V; created_at T; actor/op | UQ business_date; initial counted opening>=0; known carry is frozen previous-day expected boundary balance, never an opening movement. UNKNOWN has null opening. First current-day write creates rollover atomically; previous day awaiting close need not be closed. | A handles first counted setup; system carries known ledger at midnight. S status only. Tuesday sales never depend on Monday closing confirmation; P08 count/carry procedure pending before cash production. |
| cash_movements: continuous real counter ledger | id ID; cash_day_id FK cash_days; amount_m signed M; kind E SALE/REFUND/EXPENSE/PURCHASE/OWNER_IN/OWNER_OUT/CORRECTION/COUNTER_RECONCILIATION; payment_id/refund_id/expense_revision_id/purchase_id/sale_revision_id typed FK?; cash_count_id FK cash_counts?; source_reference TEXT?; effective_at T; source_operation_sequence I; effect_key TEXT; reason TEXT?; actor/op | UQ(operation_id,effect_key); partial UQ cash_count_id for reconciliation; index(cash_day_id,source_operation_sequence); exactly one typed FK or owner source_ref; actual cash calendar date from event time. No zero event. | S receipt only, A all. Reconciliation is explicit non-profit physical-ledger bridge once per count, never invented expense/revenue and never duplicated as next-day opening. |
| daily_closings: immutable calendar financial/cash record | id ID; cash_day_id FK cash_days; business_date Date; confirmed_at T; financial_cutoff_sequence I; boundary_sequence I; cash_count_id FK cash_counts; count_cutoff_sequence I; expected_boundary_m signed M; actual_counted_at_count_m M; reconstructed_boundary_actual_m M?; post_boundary_flows_m signed M; difference_m signed M; cash_method E BOUNDARY_COUNT/LATE_RECONSTRUCTION; cash_status E COMPLETE/UNRECONCILED; revenue/refunds/cogs/gross_profit/expenses/net_profit M (net fields signed); snapshot J; source_digest BLOB; money_policy_version I; actor/op | UQ business_date/cash_day_id/operation_id; composite FK(cash_count_id,business_date) to cash_counts(id,target_business_date); actual physical count>=0; financial day and confirmed timestamp independent; arithmetic reflects section5.5. Reconstructed amount not falsely labelled physical midnight count; complete source/approved count method required for verified cash closing. | A only; no Tuesday revenue mixed into Monday. Count/variance link prevents repeat bridge; immutable closing plus later linked adjustments, no backdated rewrite. P08 procedural gate remains explicit. |
| closing_adjustments: later recorded effect on closed day | id ID; closing_id FK daily_closings; source_operation_id FK operations; revenue_delta_m, cogs_delta_m, expenses_delta_m, cash_delta_m signed M; explanation TEXT; actor/op | UQ(closing_id,source_operation_id); index(closing_id,recorded_at,id). Values from source event, not arbitrary balancing. | A only. Links original closed date to later-day posting; immutable closing preserved. No automatically fabricated expense for shortages. |

A closing's cash summary is stored in daily_closings; a second editable cash-summary table is unnecessary. Today's live cash summary is a checked query over cash_days plus movements.

Additional local cash evidence justified by P08:

| Table / purpose | Important columns and relationships | Constraints and indexes | Authorization / sensitive handling |
| --- | --- | --- | --- |
| cash_counts: timed physical observation and unique reconciliation | id ID; target_business_date Date; method E BOUNDARY_COUNT/LATE_RECONSTRUCTION; status E COUNTING/RECORDED/ABORTED/RECONCILED; count_started_at/count_completed_at T?; cutoff_sequence I; pause_lease_until T; actual_m M?; expected_at_cutoff_m signed M?; post_boundary_flows_m signed M?; reconstructed_boundary_m M?; variance_m signed M?; completeness B; reconciled_by FK users?; reconciliation_operation_id FK operations?; actor/op | At most one active counter-count lease (partial singleton index); actual>=0; final observation immutable; reconstructed negative/unknown marks unresolved, never physical cash. UQ(id,target_business_date), UQ reconciliation_operation_id; cash movement UQ count_id ensures bridge once. Index(target_business_date,count_completed_at). | A-only count/reconcile. Short cash-admission pause during physical count, bounded lease; expiry aborts observation and resumes sales, never certifies stale count. A completed count supports only its selected target_business_date (same-date linkage checked by composite FK/service); variance cannot be posted twice or blamed on invented employee/day. |

### 4.5 Audit, backups, jobs and schema lifecycle

| Table / purpose | Important columns and relationships | Constraints and indexes | Authorization / sensitive handling |
| --- | --- | --- | --- |
| audit_events: truthful role/session/authorization evidence | id ID; operation_id FK operations?; actor_id FK users?; actor_session_ref TEXT?; authorized_by FK users?; authorization_id FK admin_authorizations?; actor_kind E ROLE_ACCOUNT/SYSTEM/ANONYMOUS; installation_id FK installations; action/entity_type E; entity_id TEXT; before_safe/after_safe J?; reason TEXT?; recorded_at T; request_id TEXT; origin E LOCAL/REMOTE/REMOTE_QUEUE | UQ(operation_id,event_key) where nonnull; entity/time and actor/time indexes. No FK to deletable session; actor may null for system/failed login. | No invented employee identity. Distinguish shared S executor from A grant authorizer/cloud Admin. Never passwords/tokens/keys, full bodies or confidential S output. |
| backup_sets: one consistent encrypted archive | id ID; source_installation_id FK installations; source_generation I; snapshot_at T; highest_operation_id FK operations?; highest_operation_sequence I; schema_version I; app_version TEXT; crypto_version I; key_id TEXT; plaintext_digest BLOB (inside protected manifest); ciphertext_digest BLOB; size_bytes I; state E CREATING/VERIFIED/FAILED; verified_at T?; failure_code E?; created_at T | Unique ID; indexes(snapshot_at,id), state; size>0 when verified; digest sizes 32. Snapshot watermark comes from snapshot itself. Full-restore-test date is distinct from archive verification. | W writes; A sanitized status. No raw decryption keys. A snapshot cannot include metadata written after its completion; keep authenticated archive manifest authoritative. |
| backup_copies: each local/external/cloud location | id ID; backup_id FK backup_sets; destination E LOCAL/EXTERNAL/SUPABASE; location_ref TEXT; state E PENDING/UPLOADING/VERIFIED/FAILED/DELETED; bytes_verified I; verified_at T?; restored_test_at T?; attempt I; last_error E?; next_retry_at T? | UQ(backup_id,destination,location_ref); indexes(state,next_retry_at), backup_id. No public URL; object path opaque. VERIFIED only after digest/decryptability checks as applicable. | W updates; A redacted destination/status. Secrets protected outside SQLite; remote excludes local paths. |
| background_jobs: supervised durable recovery/sync work | id ID; kind E BACKUP/UPLOAD/EXPORT_USB/RESTORE_IMPORT/RESTORE_PREFLIGHT/RETENTION/SYNC_PUBLISH/COMMAND_POLL/OUTCOME_ACK; dedupe_key TEXT; source_operation_id FK operations?; backup_id FK backup_sets?; payload J; state E PENDING/RUNNING/SUCCEEDED/FAILED; attempt I; available_at T; lease_until T?; last_error E?; created_at T | UQ(kind,dedupe_key); index(state,available_at,id); bounded payload/retry and expired-lease recovery; no arbitrary financial posting. Closing enqueues backup in same TX. | W only, explicit SYSTEM audit for scheduled tasks; A safe status/export/retry. No credentials/payload secrets; remote queue dispatch only allowlisted product services. |
| schema_migrations: controlled version history | version I PK; name TEXT; checksum BLOB; applied_at T; app_version TEXT; duration_ms I | Version monotonic/checksum immutable; UNIQUE name; PRAGMA user_version is matching marker, not second authoritative history. Pending attempt state in separate supervisor recovery log if transaction rolls back. | Migration runner only, no REST mutation. Ship reviewed SQL/checksums with app, never editable user SQL. |
| restore_runs: recoverability evidence | id ID; backup_id FK backup_sets; source_digest BLOB; target_installation_id FK installations?; state E PREFLIGHT/VALIDATED/CONFIRMED/REPLACED/FAILED; app/schema versions TEXT/I; checks J; verified_at T?; confirmed_by FK users?; created_at T; failure_code E? | index(backup_id,created_at), state; replacement requires matching validated digest/version and fresh local authorization. | Local recovery supervisor + A; normal remote/S denied. Logs preserved outside replaced DB too, then imported/audited. No decryption keys or arbitrary restore path. |

Initial setup is a local owner-authorized ceremony establishing exactly two fixed role accounts and their distinct passwords/recovery custody. Disable all signup/account-creation paths afterward; never create a named employee or claim employee accountability.

P10 hybrid projection/command synchronization is CONFIRMED scope but not implemented. Its additional local and hosted-cloud table dictionary follows section11; encrypted Storage backups remain independent. Initial two-account bootstrap establishes both fixed credentials locally, then closes creation; no per-employee user creation.


## 5. Financial and inventory specification

Status:12 November final owner approval supersedes prior monetary proposals: OPTION2 rounds each unit first. The coordinated TEST36 schema is approved. Closing procedure/variance authority does not block Sales. Historical fixtures remain untouched; later business schema still requires approval.

### 5.1 Pack quantities, money, rounding and cost floor

P01 CONFIRMED: production quantities are positive whole PACK or BOX counts; opening/threshold may be zero. No fractional package, loose-unit, strip, pack-to-piece or automatic conversion. Retain six-decimal storage extensibility only through Q micro-units with CHECK quantity_q % 1000000=0; all initial product steps equal 1000000. API Quantity is an integer decimal string. Future conversion is a separate project, not a foundation blocker.

P02 / Q1 / Q2 / Q3 OWNER APPROVED,12 November: new ordinary buying/selling prices and posted invoice charges, payments, change, expenses and refunds are whole PKR. Retain INTEGER paisa and exact BigInt/rational intermediates. Preserve old fractional records/fixtures. Only whole-number percentages PER LINE, never global or fractional percent.

FINAL OPTION2: rounded_unit_rupees=HALF_UP(unit_price_rupees*(100-discount_percent)/100). Line=rounded_unit_rupees*whole_quantity; invoice=sum completed lines. Each product has its own discount, including zero; never global, extended-line or second invoice rounding. Rs110 less5%=Rs105/unit;3 units=Rs315,1000=Rs105000. Mixed315+1000+328=Rs1643. Save rounded unit, entered rate/percent/quantity, exact rational evidence and policy version. Reject below-cost after rounding without increasing price. Audit history: the initial extended-line Rs314 recommendation was never implemented and is superseded by explicit final owner approval.

Q3 cumulative refund: original actually paid M whole rupees, original count N, cumulative returned r ->target HALF_UP(M*r/N); current payout=target minus all confirmed prior refunds. Rs101/3 ->34/33/34; full return exactly101. Reject inconsistent prior evidence/over-return/over-refund, never use today's price or reconstruct missing payment. Original COGS remains exact saved cost.

Earlier paisa-cash A/B, discount-first rounding, fractional percentages and invoice-wide allocation proposals are SUPERSEDED. Posted whole-PKR amounts are multiples of100 INTEGER paisa. New ordinary price/payment writes enforce this; old cost/history stays exact, never rounded down to bypass the floor. Bound inputs/intermediates and check persisted products/aggregates against signed int64; no SQLite REAL or JavaScript Number posting.

P04 CONFIRMED: no below-buying-cost sale, zero unit price, zero final line charge or zero-total sale. Discount below normal selling price is allowed, including selling exactly at cost. For EACH line, after ALL discount and charge-rounding allocations, require final charged_line_m >= soldWholePacks*applicableUnitCost_m and charged_line_m>0. No cross-line subsidy, aggregate-only floor, below-cost Admin override or rounding exemption. The approved floor is checked on the final whole-PKR line charge; future refund allocation follows Q3 separately. A failed rounded charge is rejected, not silently raised or bypassed.

New sales snapshot current approved product-variant cost AFTER BEGIN IMMEDIATE, serialized with repricing. Original completed sales/cost/profit remain immutable under Option A. For approved invoice corrections, original snapshot remains the basis for recorded COGS; there is a narrow cost-floor ambiguity if today's approved cost differs from that original snapshot. Proposed conservative correction rule: preserve original COGS but test revised final charges against max(original snapshot cost, current approved cost), so a new correction cannot newly create a below-current-cost charge. Owner/mentor must confirm this correction-floor interpretation before B6, not reopen the no-below-cost decision or block a driver-only prototype. Repricing alone never retroactively invalidates a committed sale or its original-key replay.

Changing a normal selling price also checks current approved cost. If buying cost is later raised above an existing normal price, flag that setting for Admin review; do not secretly change the selling price. Actual checkout revalidates current floor. S receives only generic PRICE_NOT_ALLOWED with no cost/threshold/profit in DTO/errors/HTML. A cost-floor oracle through repeated attempts is a residual consequence of permitting user-entered rates; throttle abusive probing and audit it, never promise mathematical secrecy from all inference.

Server accepts authorized entered prices/percentages, recalculates all amounts and rejects client actor/cost/profit/balance/totals. One line per variant (matching repeat-add UI) prevents inconsistent duplicate deductions. Money bounds are checked before every write and aggregate; no Number/REAL arithmetic.

### 5.2 Product variants, Stock Value and receiving

P03 CONFIRMED: each sellable size variant is its own products row with unique immutable ID and generated unique internal code, separate size label, stock, current buying cost and normal selling price. Similar/identical names are allowed; display base product + size + code to disambiguate. Category, base product name and size are different fields: category Diapers, base product Baby Diapers, size Large. A separate parent-product table is unnecessary initially. Do not aggregate or sell one size against another size's balance.

Stock Value=sum(remaining sellable whole packages * current approved per-package cost). Include physically sellable stock even if Stop Selling is selected; exclude pending/damaged returns. It is not purchase expenditure, COGS, revenue or cash. Unknown cost makes total unavailable; never substitute demo historical costs.

Confirmed Option A remains: buy50 at Rs1000, sell10, reprice remaining40 to Rs1100, then receive20 at approved cost =>60 valued at Rs66000; the original10 sales retain Rs1000 cost. Revaluation is an audited valuation change, not sales profit.

D05 OWNER APPROVED Option A: ONE atomic receive-and-reprice sets cost of ALL remaining+incoming stock to incoming verified actual cost. Preserve original receipt cost and past sold COGS/profit.5 unsold at800 plus2 at900 ->7 at900. Revaluation is not realized profit; no FIFO/weighted average. Current TEST code still rejects differing costs as POLICY_PENDING; implementation remains pending, policy is settled.

Stock balance=sum signed movements including opening once. Zero opening has no movement. Repricing changes no quantity. Stock count48->45 creates -3 only once, with stale-version protection. Unit/size identity cannot be converted by ordinary metadata updates.

### 5.3 Returns, refunds and disposition

P06 Option A CONFIRMED: cash refund reduces revenue on actual refund date; original COGS reverses ONLY on authorized sellable restock, on that disposition date. Pending/damaged goods do not reverse COGS and are not sellable stock. Damaged original cost remains a recognized loss; do not also book the same cost again as an expense.

Always use original FINAL paid line snapshots and approved P02 allocation, not today's prices/cost. Serialize all prior-return checks; cumulative quantity<=sold, cumulative cash refunded<=original charged, per-line identity/revision valid. Full return is one atomic all-remaining selected-lines request. Unknown original payments/prior returns remain unavailable until authorized reconciliation; old fixtures are not fabricated into refundable invoices.

For a fully refunded Rs120 sale at original cost Rs100: cumulative net revenue0/COGS100/GP-100 pending inspection; approved sellable restock reverses100 =>GP0; damaged disposition retains loss100. Return restock quantity is valued at current approved cost; difference from original reversed COGS is a separate valuation event, not invented sales profit.

Return creation defaults pending inspection, no stock movement. Only A records RESTOCK/WRITE_OFF; partial disposition sums cannot exceed returns; restock reverses original cost once. Each return increments sales.V for refund concurrency; each disposition increments returns.V.

P07 CONFIRMED: S may search invoices and obtain role-safe quote, but POST refund requires single-use Admin authorization bound to the exact request (section8), or A directly processes it. Consuming approval, saving returns/lines/refund/cash/audit/operation are one transaction. No staff knowledge of Admin password, no blanket refund privilege and no queued remote cash command. Physical handover still requires confirmation; software cannot atomically move banknotes.

### 5.4 Corrections, expenses and profit

P05 Option A CONFIRMED: only A corrects saved item quantities, entered prices or discounts; same logical variant lines, no uncontrolled full invoice replacement/product/date swap. Preserve revision1 and all revisions/audit. Correct stock delta=oldQuantity-newQuantity; price/discount-only correction has zero stock effect. Ordinary correction after ANY posted return/refund is blocked. Added units use original saved unit cost under Option A; correction floor interpretation above remains a narrow B6 gate. Quantity increases still atomically check available stock.

Actual cash delta must equal corrected total minus prior settled total and be explicitly collected/refunded as appropriate; preserve payment history, append cash movement on actual cash date. If physical cash has not changed, do not mark financial correction settled or invent a payment. A later exceptional bookkeeping-only adjustment needs its own approved design. Corrected period attribution is event-date deltas (approved A), linked to immutable earlier closing; no silent rewrite of original recorded closing.

Net Sales Revenue=sum sale revision revenue deltas-refunds. Effective COGS=sum sale revision COGS deltas-original-cost reversals on sellable return restock. Gross Profit=Net Sales Revenue-Effective COGS. Net Profit=Gross Profit-recorded operating expenses for the SAME period; losses may remain from damaged returns, not from permission to make new below-cost sales.

P07: S may record new operating expenses (Amount+Reason, server Karachi date). Correction/void needs A or exact single-use Admin authorization; no deletion. Shared S history is role/account history, never individual employee accountability. Counter-paid expenses reduce counter cash; owner-paid operating expenses reduce net profit only. Inventory purchases/drawings are not operating expenses and cannot be deducted twice. Funding default COUNTER is still an operational proposal to confirm before B8, not something inferred from the shared login.

Expense revisions preserve original business date/economic source; actual cash adjustment posts on the real correction date, links original closing if applicable and is counted once. Keep gross/net profit separate and sources complete. Aggregate sources at their own grain before joins; no multiplying totals. Complete empty source means zero; missing means unavailable. Group package/box counts by unit/variant rather than implying conversion.

### 5.5 Calendar days, midnight and late cash counts

P08 CONFIRMED: Asia/Karachi CALENDAR date, midnight rollover, no trading-day alternative. Monday23:50 sale belongs Monday; Tuesday00:10 sale belongs Tuesday. Closing Monday at Tuesday00:30 stores business_date=Monday and confirmed_at=Tuesday00:30; Tuesday sales never enter Monday revenue/COGS/expense totals.

Separate (1) calendar financial day, (2) the continuous physical counter ledger, and (3) a timed physical cash count. A prior day awaiting confirmation is AWAITING_CLOSE; it is not the active Tuesday day. First Tuesday write atomically creates/opens Tuesday with opening_basis=LEDGER_CARRY and a frozen boundary balance from all committed Monday cash events. No extra opening cash movement (that would double count). Startup after missed days derives carries from committed sequence/date boundaries. Tuesday is not blocked merely because Monday closing is late. Initial installation alone needs explicit verified counted opening; unknown initial source stays unknown, never zero.

Expected physical cash at a cutoff = initial counted anchor + all net sale cash - refunds - counter expenses - purchases - withdrawals + injections + authorized corrections/reconciliations up to that operation sequence. Tendered-change is cash, not tendered or unverified revenue. The carry is a COMPUTED ledger expectation, never labelled a physical Monday count. After rollover, keep prior day immutable to ordinary posting; later authorized adjustments post on actual current date and link prior closing.

P08 OWNER APPROVED signed-flow late-count reconstruction; operational pause and variance-posting details below remain proposals, not implicit write authority:
- Briefly pause this counter's physical money movements while counting; finish/drain in-flight cash submissions and record a server operation cutoff, count timestamp and actual physical amount together. After the count, Tuesday sales resume immediately; do not pause Tuesday until a Monday report is finished. If handover/count cannot be aligned to a cutoff, mark cash reconciliation unavailable and request recount, not a fabricated figure.
- Let E_D be expected cash at Monday midnight boundary, C_T the actual physical count Tuesday00:30, and M_D_T the signed COMPLETE recorded cash movements after that boundary through count cutoff (includes withdrawals/injections/purchases/cash corrections). Reconstructed Monday-boundary cash A_D=C_T-M_D_T. Difference=C_T-(E_D+M_D_T)=A_D-E_D.
- Example E_D=Rs1000, Tuesday net cash flows+Rs300 before count, count Rs1280 => reconstructed boundary Rs980, unexplained difference -Rs20. Monday financial report still excludes all Tuesday sales. A_D is RECONSTRUCTED from a later count, not a claim someone counted Rs980 at midnight.
- An unexplained difference observed Tuesday cannot be proven to have happened Monday. Closing labels boundary reconstruction and unallocated count variance honestly; no fabricated employee/date blame. Pending cash-day close can store this reference and discrepancy without certifying source-date responsibility.
- Do not reuse the same shortage at every later close. UNAPPROVED variance-posting proposal, requiring separate authority: a count reconciliation could append a non-profit COUNTER_RECONCILIATION movement equal to the physical-minus-ledger variance at Tuesday count time, uniquely linked to that count. It adjusts the continuing physical ledger, not Monday sales, an operating expense or cash income. The physical-count observation stores pre-adjustment expectation; subsequent Tuesday expected cash includes the bridge once. Repeating count/close/response cannot reapply it.
- If A does not approve the reconciliation bridge or source completeness is unknown, keep cash status UNRECONCILED, allow legitimate Tuesday sales and mark later cash differences carried/unallocated; do not silently certify or repeatedly expense the shortage. Closing cash confirmation waits for evidence/policy, not sales. No period's sales are blocked for an unresolved prior cash-count reconciliation.

P08 is settled: midnight Karachi dates, continued next-day sales and signed-flow reconstruction for a later Admin count. Do not re-request L/M selection. Closing still needs trustworthy physical count/cutoff/source-completeness handling; variance/opening-cash/write-off authority remains separate. Unknown reconciliation must not block legitimate sales.

Daily Closing remains A-only, unique per calendar date, immutable, with separate boundary and count/confirmation timestamps, source digest/cutoffs, reconstruction method and cash completeness. Actual Cash input retains approved layout; necessary count-time/reconstruction explanation and review fields must fit the current flow, not redesign cards. Save snapshot, backup job and audit atomically; backup failure does not undo closing. Never delete/reset accounts, inventory or invoices, reopen calendar cutoff or mix Tuesday sales into Monday to make cash match.

## 6. SQLite transaction, durability and idempotency protocols

### 6.1 Connection and process policy

- One supervised backend, one bounded FIFO business writer queue/connection, short read-only connections for reports/snapshots. Auth writes may use separate supported library connection: SQLite still serializes ALL writers; configure and test the same foreign-key/durability/busy policy there. No clustering/second Next worker with an independent writer queue.
- On EVERY connection assert foreign_keys=ON, synchronous=FULL and busy_timeout=5000ms (initial proposal); set/verify journal_mode=WAL at controlled startup, not during a sale. Business tables STRICT, extension loading disabled. Validate embedded SQLite version and compile options. SQLite WAL documentation reports a WAL-reset corruption fix in 3.51.3 (or documented backports); reject known affected runtimes, including an older SQLite bundled by a driver. Verify the actual runtime, not package name. [SQLite WAL](https://www.sqlite.org/wal.html)
- All business writes use explicit BEGIN IMMEDIATE before authoritative reads. It obtains the single writer reservation; no PostgreSQL SELECT FOR UPDATE. No network calls, printer operations, password hashing, large report work or archive encryption in transaction. [SQLite transactions](https://sqlite.org/lang_transaction.html)
- Bind BigInt in safe-integer mode, never lose precision through driver's default number conversion. Repositories accept existing tx context, never independently commit nested effects. All error paths roll back; stock conditional update WHERE sellable_q>=requested plus version checks remains a defense.
- Bounded queue, operation deadline and busy retry with jitter; proposed total 10s maximum before 503 RETRY_SAME_KEY. Restart the WHOLE transaction after a retryable busy/snapshot conflict, never just the last statement. A COMMIT error with uncertain outcome requires original-key resolution before replay. Constraint/domain failures are not blind retries.
- Use small read transactions and keyset pagination to avoid pinning WAL. Monitor WAL bytes/checkpoint age; regular PASSIVE checkpoint and controlled idle shutdown checkpoint. Never delete -wal/-shm to repair a lock or copy only .db while live.
- FULL WAL durability is chosen over NORMAL to reduce power-loss loss of acknowledged commits; hardware/OS must still honor flush. Battery health, disk health/free space, Windows ACLs and off-device backups remain necessary. SQLite is not inherently encrypted; DPAPI-protected secrets and approved disk protection are separate. [SQLite synchronous](https://sqlite.org/pragma.html)

### 6.2 Exact sale protocol

1. Authenticate the shared role account, authorize sale category, validate syntax/size and canonicalize intent. Restricted S actions are eligible only through the exact Admin grant; do not reject a committed replay solely because its old grant is consumed. Derive actor and event time/day from server, not payload.
2. In BEGIN IMMEDIATE look up request_key FIRST. Verify actor/operation/payload hash and current access. If matching terminal result exists, return the recorded safe result after transaction without rechecking today's product availability. Changed payload/key ownership returns generic conflict.
3. For new intent reserve the key through the held writer transaction; no separate durable claim. Check active installation; assign event_at/business_date consistently inside the writer transaction, auto-roll the current calendar day from the continuous ledger regardless of prior AWAITING_CLOSE; check products/whole steps/entered prices/discounts/server cost. An active short count lease returns transient CASH_COUNT_IN_PROGRESS/SAME_KEY without a terminal rejection or consumed approval. Consolidate/reject duplicate product lines; process deterministic product order. Snapshot costs AFTER obtaining writer lock, serialized with repricing.
4. Calculate authoritative rounded lines/totals with BigInt under APPROVED P02, validate final per-line floor AFTER all allocations and reject zero/below-cost; no override. Apply exact cost snapshots and bounds. Allocate result IDs/operation sequence and insert the complete transaction-local terminal operation row with authoritative safe confirmation. For each line conditionally deduct balance; any failure rolls back ALL lines. Save sale, revision1, all lines, original payment, saved receipt snapshot, stock movements, cash movement, mandatory audit and immutable sync_outbox bundle.
5. Verify the saved records match the already constructed operation confirmation. Commit once; only then respond COMMITTED. Invalidate related live queries. Any postcommit printer/refresh failure cannot undo/recreate sale.

BEGIN IMMEDIATE serializes lookup/validation with all other writers. After validation, insert the final operation row inside the same still-uncommitted transaction, with preallocated result IDs, before its dependent FK rows. That row is not visible as success before COMMIT. UQ request_key is the final defense. No IN_PROGRESS status is needed; never leave a durable abandoned claim.

For authoritative domain rejection, use a SAVEPOINT around the terminal operation insert AND all business writes: roll back attempted effects, insert only REJECTED operation + safe rejection evidence, commit. Changed stock/payload after rejection is a new deliberate intent; first resolve original key. Busy/crash before terminal commit leaves no terminal record and no business effects. Authentication/transport errors do not invent a terminal rejection.

### 6.3 Replay, response loss and other atomic operations

Key scope: unique shop-wide UUID, bound to actor, operation kind, installation generation and canonical payload hash. Whitespace/decimal normalization is documented; preserve line identity/order semantics. Retain dedupe tombstones/results with business history. Fresh role/session authorization precedes replay; disabled roles cannot fetch results. Shared S may obtain only safe account-scoped history/outcomes, never a claim of individual-person isolation. Consumed grant/changed product rules do not undo an already committed original result; new restricted effects require a fresh valid grant.

GET /operations/{key} returns COMMITTED with safe result/reference, REJECTED with authoritative safe reason, or UNCONFIRMED. Missing row/timeout is not proof of failure. Retry the identical original POST with same key, serialized with any in-flight original. Never generate a new key merely after timeout. Persist only minimal unresolved key/operation identity in protected desktop storage (no passwords/costs); after lost local intent, search authorized recent outcomes before allowing replacement.

| Operation | One atomic transaction contains |
| --- | --- |
| Product opening | Product/identifier, balance, initial cost history, opening purchase record/lines when quantity>0, movement, audit, operation |
| Receive/reprice | Purchase lines, balance increments, movements, optional explicit cost update/history, actual counter payment if known, audit, operation |
| Physical count | Compare expected balance version; before/after/delta, balance, movement, audit, operation |
| Refund | Current sale/prior-return/P02 checks, exact Admin grant validation/conditional consume when S, header/lines/refund/cash/audit/operation/outbox; no sellable restock |
| Disposition | Remaining uninspected check, event; RESTOCK balance/movement and approved COGS reversal; WRITE_OFF no stock; audit, operation |
| Sale correction | Expected revision, new immutable revision/lines/snapshot, delta stock/cash/economics, closing adjustment if relevant, audit, operation |
| Expense correction/void | Expected version, exact Admin grant consume if S, revision, actual cash delta, linked closing adjustment, audit/operation/outbox; no individual employee attribution |
| Closing | Selected-day/count-cutoff source digest, immutable calendar snapshot with actual confirmation time, prior day CLOSED while current day stays ACTIVE, audit/operation/backup job/outbox; count reconciliation unique and explicit, no Tuesday revenue mixed |
| Shared role disable/rotation | Only S may be disabled; role credential changes revoke its sessions/grants; no account creation/deletion or employee histories |

All relevant financial/catalog/status transactions append allowlisted outbox state atomically, and queued product operations also persist terminal inbox outcome (section11). Cloud network/ack happens after commit. Cash rollover and source date belong to the same local transaction as the triggering event. Closing digest is scoped to selected-day financial sources and fixed count cutoff: later Tuesday events AFTER that cutoff do not repeatedly invalidate Monday's preview or require pausing Tuesday sales while Monday closes.

### 6.4 Corruption, crashes and migration safety

Startup acquires one-instance/authority guard, checks schema compatibility and runs quick_check plus foreign_key_check before readiness. Scheduled/full recovery checks use integrity_check plus financial/stock reconciliation; quick_check alone cannot prove ledger correctness. Corruption/incompatible schema => maintenance state, preserve all files, no automatic empty replacement.

App killed before commit => rollback; after commit before response => original-key lookup finds saved transaction. Disk-full/I/O errors => fail safely and mark write health unavailable. Never acknowledge success before commit. A printer retry is not a sale retry.

Migrations: separately approved, numbered, immutable checksummed SQL; no runtime library auto-migrate on normal login. Lock maintenance, preflight free space, verified backup, close remote admission, execute transactional DDL where supported, update schema_migrations/user_version, run FK/integrity/domain checks, then enable writes. A failure rolls back; incompatible/nontransactional conversion is performed on an isolated copy with explicit promotion. Never downgrade code over a newer schema or restore a pre-migration backup after new sales without an explicit recovery/loss decision. Crash recovery distinguishes failed migration from a completed commit using checksums/version, not a missing UI response.


## 7. Versioned REST contracts and screen map

### 7.1 Shared typed contract

All paths below are prefixed /api/v1 unless explicitly stated. No endpoint exists yet except /api/health. A is Admin; S is explicitly permitted Salesperson scope; L is local privileged maintenance only; R is remote Admin subset.

~~~ts
type Money = string; // canonical nonnegative "123.45"; signed only in named deltas
type Quantity = string; // positive INTEGER pack/box count, no decimal quantity
type Id = string;
type Write = { requestKey: Id };
type Edit = Write & { expectedVersion: number };
type Period = { from: string; to: string; productId?: Id }; // inclusive civil dates
type Page<T> = { items: T[]; nextCursor: string | null; asOf: string };
type Envelope<T> = { data: T; meta: { requestId: Id; policyVersion: number } };
type ApiError = { error: {
  code: string; message: string; fieldErrors?: Record<string,string>;
  retry: "NONE" | "SAME_KEY" | "REFRESH";
}; meta: { requestId: Id } };
type SaleInput = Write & {
  items: { productId: Id; quantity: Quantity; unitSellingPrice: Money;
    discountPercent: string }[];
  cashTendered: Money;
  customer?: { name?: string; phone?: string };
};
type SaleConfirmation = {
  status: "COMMITTED"; requestKey: Id; saleId: Id; invoiceNumber: string;
  recordedAt: string; currency: "PKR";
  items: { lineId: Id; productId: Id; productName: string; quantity: Quantity;
    unitSellingPrice: Money; discountPercent: string; discountAmount: Money;
    lineTotal: Money }[];
  totalAmount: Money; cashTendered: Money; change: Money;
};
~~~

money values remain decimal strings at transport; DB stores paisa. expectedVersion is a safe bounded integer. Every business mutation also supplies X-Shop-Generation from the authenticated authority context; new operations from a retired/stale generation fail. Matching committed original-key recovery remains readable under current authorization. Use versioned OpenAPI generated from the SAME strict schemas and include request/response/error examples in each later module. Shared DTOs below name concrete shapes; no raw database rows or SELECT * serialization.

Every request pipeline: content type/body limit -> session/active/permission -> strict field schemas -> record scope -> idempotency lookup -> authoritative transactional rules -> safe DTO. Validate origin/CSRF before mutation. Parameterize values; sort/filter identifiers allowlisted. Public GET endpoints are explicitly allowlisted.

Default validation proposals: names 1-120 (shop name 80), reason 1-160, optional customer name <=120, phone <=32, receipt/footer <=160, address <=240; no control characters/HTML execution. Existing code input format retained. Page limit 1..100 (default 50); query <=120; date window up to 366 days initially, longer reports split/server-aggregate by approved limits. Basket cap proposed 100 unique products. Body cap 256 KiB excluding separately streamed bounded backup uploads; tune with evidence.

All private responses Cache-Control: no-store, no service-worker/CDN reuse; role-safe serializers apply to server HTML/React payloads, error responses and exports too. Public branding is a dedicated allowlist.

Response meanings: 200 read/replay/update; 201 new committed resource; 202 accepted BACKGROUND JOB, never business success; 400 malformed input; 401 no valid session; 403 forbidden; 404 absent/out-of-scope record; 409 stale version/key conflict/insufficient stock/day state; 423 bounded count pause (SAME_KEY, no terminal rejection); 422 invalid domain/policy/zero/cost-floor; 429 rate limit; 503 maintenance/busy/unavailable. Never leak actual stock or purchase cost in S errors. Codes include VALIDATION_ERROR, POLICY_NOT_APPROVED, INSUFFICIENT_STOCK, PRICE_NOT_ALLOWED, ADMIN_AUTHORIZATION_REQUIRED, AUTHORIZATION_EXPIRED, CASH_COUNT_IN_PROGRESS, VERSION_CONFLICT, KEY_CONFLICT, DAY_NOT_OPEN, DAY_CLOSED, RETURN_LIMIT, BACKUP_INVALID, SCHEMA_INCOMPATIBLE, AUTHORITY_RETIRED.

Write modes used in EVERY row below:
- TX: one short section-6 transaction including audit/terminal operation; same-key replay first, mismatch 409.
- JOB: TX records job/operation, 202 status; GET job reports actual later outcome. Retry job command itself once by key; worker uses job/copy dedupe.
- AUTH: library credential/session/recovery protocol, throttled; not sale idempotency. Repeating logout is safe; do not store password payload hashes.
- READ: short consistent read, no business write, safely repeat; failures 401/403/422/503 as applicable.
- MAINT: separate isolated recovery protocol; no open live DB replacement within HTTP handler.

### 7.2 Exact endpoint outline

Each row defines request -> response, role, validation/business checks and transaction/retry. Common rules above apply even when abbreviated.

| Method/path | Request -> response | Role | Business checks, boundary and principal errors |
| --- | --- | --- | --- |
| GET /auth/context | none -> {roles:[ADMIN,SALESPERSON],labels} | Public restricted | Fixed role labels only, no staff directory/device binding; READ/429. |
| POST /auth/login | {role:ADMIN or SALESPERSON,password} -> safe role-bound local session OR remote Admin MFA challenge | Public | Map enum to one fixed server account, match its password, active/epoch check; S credentials cannot open Admin. No authorized remote session before MFA; AUTH/429. |
| POST /auth/mfa/challenge | {loginAttemptId} -> {challengeId,expiresAt} | Remote Admin login | Identity/password verified before challenge, short-lived provider challenge; AUTH/429. |
| POST /auth/mfa/verify | {challengeId,totpOrRecoveryCode} -> safe remote session + cookie | Remote Admin | Factor replay/expiry/generation, atomic accepted-step/recovery consume; AUTH; generic failure. |
| POST /auth/mfa/setup | {freshAuthProof} -> {enrollmentId,setupUriOnce,expiresAt} | A local setup | Short-lived provider enrollment, seed shown only once to authenticated owner for authenticator setup, never logs/cache; AUTH. |
| POST /auth/mfa/enroll | {enrollmentId,verifiedFactor} -> {enabled:true,recoveryCodesOnce} | A local setup | Provider-supported setup confirmation, protected secret and hashes only, no public enrollment; AUTH. |
| GET /auth/session | none -> {user:{id,name,role},expiresAt,capabilities} | A/S | Active/epoch check; AUTH read/controlled refresh, no cached roles. |
| POST /auth/logout | CSRF -> {loggedOut:true} | A/S or expired | Revoke presented session, clear cookie, safe repeat; AUTH. |
| POST /auth/password | {targetRole,currentAdminPassword,newPassword,confirmation} -> {changed:true,revokedRoleSessions:true} | Fresh A only | Target one of fixed two roles; distinct credentials, revoke target sessions and related grants; AUTH. Shared S cannot rotate credentials. |
| POST /auth/recovery | {recoveryCode,newAdminPassword} -> {recovered:true} | L owner recovery | ADMIN only, one-use proof, throttled local ceremony, revoke sessions/grants, no public/remote password reset; AUTH. |
| GET /accounts | none -> {items:[two safe role account summaries]} | A local | Fixed ADMIN and shared SALESPERSON only, no employees/hash/recovery fields; READ. |
| POST /accounts/{id}/status | Edit+{active:boolean} -> safe fixed account | A local | Only shared S can be disabled/re-enabled; ADMIN cannot be removed/disabled; no creation/role change; TX + session/grant revocation. |
| POST /accounts/{id}/password-reset | {newPassword,freshAdminProof} -> {reset:true} | Fresh A local | Fixed shared S target only; owner self-password/recovery separate; AUTH, secret-free logs and all S sessions/grants revoked. |
| POST /authorizations/requests | Write+{kind,targetId,targetVersion,intent,operationKey} -> {id,status,expiresAt} | Shared S | Strict refund/expense revise/void only; intent immutable/bound session+generation, safe DTO, throttled request TX, no financial effect. |
| GET /authorizations/{id} | id -> safe status/approved exact intent | Requesting S session or A | No Admin token/password/cost; READ. |
| POST /authorizations/{id}/decision | Edit+{approve:boolean,freshAdminProof} -> status/grantId | Fresh A local | Separate trusted Admin window, exact reviewed intent/version/expiry; TX, one-operation grant only. Idempotent decision cannot grant new scope. |
| GET /public/shop | none -> {shopName,address,phone,footer,currency,receiptLayout} | Public | Branding only, READ; no policies, cloud or auth details. |
| GET /pos/products | {query,cursor,limit,code?} -> Page<{id,name,size,code,unit,normalSellingPrice}> | S/A read | Whole-pack/box variant identity unambiguous; positive configured normal price, no stock/cost/counts. READ. |
| POST /products/{id}/selling-price | Edit+{normalSellingPrice} -> saved product/version | A local/R live | Dedicated positive normal-price change, current buying-cost floor, metadata version; TX/audit/outbox. Offline SELLING_PRICE queue invokes this SAME service. |
| GET /products | {query,status,cursor,limit} -> Page<AdminProduct> | A/R read | Metadata, identifiers, cost, balance, threshold, version; READ. |
| GET /products/{id} | id -> AdminProduct | A/R | Authorized product, includes separate product/balance versions; READ/404. |
| POST /products | Write+{name,category?,sizeLabel?,unit:PACK or BOX,code?,purchaseCost,openingQuantity,lowStockThreshold,normalSellingPrice} -> AdminProduct | A local | Generate unique code if omitted; whole counts, independent variant/cost/price; price floor, no conversion; TX opening. |
| PATCH /products/{id} | Edit+{name?,category?,lowStockThreshold?} -> AdminProduct | A local; R live allowlist | No cost/quantity/unit/size conversion/code reassignment; R details subset name/category only, no hidden stock-field patch. TX. |
| POST /products/{id}/selling-status | Edit+{sellingActive,reason} -> AdminProduct | A/R approved | Stop/resume, archive history retained; TX. |
| POST /products/{id}/archive | Edit+{reason} -> {id,archivedAt,version} | A local initially | No delete, history retained; TX; no stock disposal implied. |
| GET /products/{id}/identifiers | id -> {items:[{id,kind,value,active}]} | A/R | READ; no new scanning UI. |
| POST /products/{id}/identifiers | Edit+{kind:BARCODE,value} -> identifier/version | A local | Unique optional barcode, leading zeros; internal code immutable products.code, no scanner/conversion; TX/409. |
| GET /inventory | {query,status,cursor,limit} -> Page<{productId,name,quantity,threshold,status,balanceVersion}> plus bounded overall counts | A/R | Inclusive low-stock; consistent read; no S access. |
| GET /inventory/low-stock | cursor -> same inventory rows where quantity<=threshold | A/R | READ. Zero marked out-of-stock; counts same source. |
| GET /stock-movements | {productId?,from,to,cursor,limit} -> Page<{id,productId,delta,balanceAfter,kind,source,recordedAt,actor}> | A/R | READ; no huge unpaged ledger. |
| GET /stock-receipts | {productId?,from,to,cursor,limit} -> Page<purchase header/line summary> | A/R | READ; original entered costs, not current revaluation. |
| POST /stock-receipts | Write+{receivedDate,lines:[{productId,quantity,unitBuyingCost,expectedProductVersion,expectedBalanceVersion?,repriceAllRemaining:boolean}],paymentSource,actualPaid?} -> {receiptId,lines,newVersions} | A local initially | Date/cost divergence confirmation, active products, actual cash evidence; TX; 409 stale/422 policy. |
| POST /stock-adjustments | Write+{productId,targetQuantity,expectedBalanceVersion,reason} -> {adjustmentId,before,after,delta,version} | A local initially | Nonnegative target, current version, no zero delta; TX. |
| POST /products/{id}/cost-changes | Edit+{expectedBalanceVersion,newPurchaseCost,reason,confirmedRepriceAll:true} -> {costChangeId,oldCost,newCost,affectedQuantity,version} | A/R approved | Latest product/balance version and confirmation, all remaining, history untouched; TX. |
| GET /products/{id}/cost-history | cursor -> Page<{oldCost,newCost,quantity,valuationDelta,actor,time}> | A/R | READ. |
| GET /products/{id}/history | {from,to,cursor,limit,kind} -> Page<typed receipt/sale/movement/cost event> | A/R | Bounded timeline, no fabricated combined totals; READ. |
| POST /sales | SaleInput -> SaleConfirmation | Shared S | Auto-roll calendar cash day independent of prior closing; whole packs, approved P02 automatic rounding, final PER-LINE floor against serialized current cost; atomic stock/payment/snapshots/outbox; TX. Zero/below-cost blocked, no override. |
| GET /operations/{requestKey} | key -> tagged COMMITTED / REJECTED / UNCONFIRMED result | Scoped shared role/A | Shared-role executor, no per-employee claim; S safe result only; check original operation before reused/expired grant rules; READ. |
| GET /sales | {from,to,reference?,productId?,cursor,limit} -> Page<SafeSaleSummary or AdminSaleSummary> | A/R; shared S safe history | S may browse/search original invoices across shared role activity; no invented own-employee isolation, quantities sold allowed but remaining stock/cost/profit omitted; READ. |
| GET /sales/{id} | id -> {receiptSafe,currentRevision,allowedReturnQuantities}; A adds financial/revision data | Scoped A/S/R | No unauthorized invoice enumeration; READ/404. |
| GET /sales/{id}/receipt | {revision?} -> saved public receipt + snapshot hash | Scoped A/S/R | Saved identity/prices, historical read-only; READ. Reprinting makes no sale. |
| GET /sales/{id}/corrections | cursor -> Page<revision/delta/actor/reason> | A/R | READ; original/current clearly distinguished. |
| POST /sales/{id}/corrections | Edit+{reason,lines:[{logicalLineId,quantity,unitSellingPrice,discountPercent}],cashAdjustment:{amount,direction,actualSettlementConfirmed:true}} -> revision/delta/receipt | A only, local initially | P05 A: existing variant lines, qty/price/discount only; blocked after returns; original-cost COGS/current-floor interpretation gated B6; exact actual cash and event-date delta, no rewrite; TX/outbox. |
| POST /returns/quote | {saleId,expectedVersion,lines:[{lineId,wholeQuantity}]} -> {quoteDigest,refundTotal,sourceVersion,adminAuthorizationRequired} | S/A/R safe read | Original final-paid/P02 cumulative allocation, prior-return caps; no cash or stock write. READ quote; no reservation/approval implied. |
| POST /returns | Write+{saleId,expectedVersion,quoteDigest,lines:[{lineId,wholeQuantity}],cashRefundConfirmed:true,authorizationId?,reason?} -> saved return/refund/receipt | A direct or S exact A grant | Fresh role/grant/intent/hash/version/cumulative cap check; consume grant WITH all refund/cash/audit/outbox writes; no auto restock; TX replay first. R no queued payout. |
| GET /returns | {saleId?,from,to,cursor,limit} -> Page<safe return summary> | Scoped S/A/R | READ; A-only cost fields kept separate. |
| GET /returns/{id} | id -> safe lines/refund/disposition status | Scoped S/A/R | READ/404; S no original costs or inventory balance. |
| POST /returns/{id}/dispositions | Write+{lines:[{returnLineId,quantity,decision,reason}],expectedVersion} -> {dispositionIds,returnVersion} | A local initially | Pending quantity, inspection, RESTOCK vs WRITE_OFF policy, transaction; no second refund; TX. |
| GET /refunds | {saleId?,from,to,cursor,limit} -> Page<{id,returnId,amount,paidAt,actor}> | A/R; S own permitted receipt | READ. No separate arbitrary POST refund bypass; POST /returns owns payment. |
| POST /expenses | Write+{amount,reason} -> expense/date/version | Shared S/A local | New operating expense only, server calendar date, explicit approved funding default, automatic current-day rollover; TX/outbox. |
| GET /expenses | {day? or month?,cursor,limit} -> complete day/month summary/items | Shared S safe summary; A/R financial scope | Shared-role source not individual ownership; S no profit/cost/stock; READ. |
| POST /expenses/{id}/revisions | Edit+{amount,reason,authorizationId?,paymentSource?,actualCashAdjustmentConfirmed} -> revision | A direct or S exact A grant | Preserve expense date; current-day actual cash delta/closing link; consume exact grant atomically; S cannot change approved scope/funding; TX/outbox. |
| POST /expenses/{id}/void | Edit+{reason,authorizationId?,actualCashAdjustmentConfirmed} -> voided revision | A direct or S exact A grant | Preserve record; reverse correct economic/cash delta once with actual physical evidence; exact grant consume; TX/outbox. |
| GET /stock-value | {cursor?,limit?} -> {total,complete,asOf,products,nextCursor} | A/R | Consistent quantity*current cost, aggregate independent of page filter; READ. |
| GET /reports/sales | Period+{groupBy:day/month/product,cursor?,limit?} -> {period,complete,totals,series,products,nextCursor,asOf} | A/R | Net revenue/refund/correction rules and unit-aware quantities; READ. |
| GET /reports/profit | same period/group filters -> {netRevenue,cogs,grossProfit,expenses,netProfit,complete,series,asOf} | A/R | Shared financial definitions, snapshots not current costs; READ. |
| GET /reports/products/{id} | Period -> {product,totals,series,historyCursor} | A/R | Same metric/date policy as global report; READ. |
| GET /dashboard | {businessDate?} -> {inventoryCounts,sales,profit,expenses,stockValue,complete,asOf} | A/R | One read snapshot for matching sections; READ. |
| GET /settings/shop | none -> public shop + version and allowed operational summaries | A/R read | No raw secrets/local path in remote response; READ. |
| PATCH /settings/shop | Edit+public identity/layout fields -> saved shop + version | A/R approved | Existing text/PKR/layout validators; no arbitrary policy/SQL; TX. |
| GET /settings/receipt-preview | none -> safe unsaved sample model | A/R | No official invoice number, no business write; READ. |
| GET /cash-days/current | none -> {id,date,state,openingBasis,cashStatus}; A adds expected totals | A/R; S status | READ; prior AWAITING_CLOSE does not make Tuesday unavailable, no S balances. |
| POST /cash-days | Write+{initialOpeningCash,initialCountProof} -> initial cash anchor/day | A local setup | Initial explicit count only; later calendar rollover is system-atomic carry, not daily manual-opening blocker; TX. |
| POST /cash-counts/start | Write+{targetBusinessDate,method} -> {countId,cutoffSequence,pauseLeaseUntil} | Fresh A local | Brief counter cash-admission pause after draining in-flight cash; bounded lease, no long report lock; TX. |
| POST /cash-counts/{id}/record | Edit+{actualPhysicalCash,confirmation:true} -> observation/reconstruction/variance | A same count | Within valid pause lease, server count time/cutoff/completeness; resume current-day sales after saving, expired observation aborted; TX. |
| POST /cash-counts/{id}/reconcile | Edit+{sourceDigest,acceptVariance:true,reason} -> reconciliation operation | Fresh A local | P08 L only if approved; pre-count difference, unique non-profit cash bridge, no expense/revenue, no double carry; TX/outbox. |
| POST /cash-movements | Write+{dayId,kind:OWNER_IN/OWNER_OUT,amount,reason} -> movement | A local | Explicit authorization/count/source, no operating expense; TX. Other cash kinds created by source service only. |
| GET /closings/preview | {businessDate,cashCountId?} -> {sixMetrics,boundaryExpected,countTime,reconstruction,completeness,sourceDigest} | A/R read | Calendar financial period independent of later count cutoff; no Tuesday sales in Monday report; READ. |
| POST /closings | Write+{businessDate,sourceDigest,cashCountId,confirmation:true} -> immutable calendar closing | Fresh A local | Count evidence/method P08, prior date vs actual confirmation timestamp, unique date; current cash reconciliation if explicitly accepted occurs once by count, backup job/outbox; TX. Tuesday remains active. |
| GET /closings | {from,to,cursor,limit} -> Page<closing summary> | A/R | READ. |
| GET /closings/{id} | id -> closing snapshot + linked adjustments | A/R | READ; never update counted amount. |
| GET /backups/status | none -> {lastLocalVerified,lastExternalVerified,lastCloudVerified,lastRestoreTest,pending,overdue,cloudState} | A/R redacted | Actual distinct statuses; READ, not a cloud availability guarantee. |
| GET /backups | cursor -> Page<{id,snapshotAt,schemaVersion,size,copies,verifiedAt}> | A/R redacted | No public links, credentials or local file paths to remote; READ. |
| POST /backups | Write+{destination:CONFIGURED} -> {jobId,state:PENDING} | A local | Backup Now, consistent verified encrypted snapshot; JOB/202, no cloud dependency. Routine30min/closing scheduler needs no S secret/permission. |
| POST /backups/{id}/retry-upload | Write -> {jobId} | A local | Verified encrypted archive still present, unique cloud object; JOB. |
| POST /backups/{id}/export-usb | Write+{approvedDriveId} -> {jobId} | Fresh A local | Manual encrypted archive export, registered removable volume identity/space, copy/verify, no raw path or recovery-secret disclosure; JOB. |
| GET /restore/sources | none -> {approvedUsbArchives,cloudAvailability,safeBackupList} | L/fresh A | Guided recovery source picker, no S access/public links, cloud login/recovery authorization separate; READ. |
| POST /restore/import | Write+{nativeSelectionToken or cloudBackupId} -> {backupId,jobId} | L/fresh A or owner recovery proof | Bounded safe archive import/quarantine, no arbitrary API filesystem path; JOB, then preflight by validated backupId. |
| GET /jobs/{id} | id -> {kind,state,progress?,safeError?,resultId?} | A/R appropriate | Owner scope; READ; 202 command is not success. |
| POST /restore/preflight | Write+{backupId} -> {restoreRunId,jobId} | L + fresh A/recovery proof | No raw path/URL/SQL input; allowlisted archive, isolated verify; JOB/MAINT. |
| GET /restore/{id} | id -> checks, compatibility and recovery plan | L/A | READ, redacted; no sensitive manifest secrets. |
| POST /restore/{id}/confirm | Write+{validatedDigest,confirmation,freshAuthProof} -> {maintenanceJobId} | L + fresh A | MAINT/202 supervisor handoff; preserve current DB and fence authority. Not remote business API. |
| GET /audit-events | {entityType?,entityId?,from,to,cursor,limit} -> Page<redacted audit event> | A/R approved | Secret-safe, bounded, READ. |
| GET /remote/status | none -> {mode:LIVE or CLOUD_SNAPSHOT,generation,sourceSequence,lastShopSync,capabilities} | Remote A MFA | Live response from local tunnel; cloud mode from projection status, no false live/freshness from internet alone; READ. |
| GET /remote/operations/{key} | key -> authoritative local result or UNCONFIRMED | Remote A authorized | Direct original-key lookup when reachable; cloud outcome may lag. Lost local response never proves failure or authorizes new-key queued duplicate. READ. |
| GET /api/health (existing) | none -> minimal liveness | Public loopback | Preserve existing advisory meaning; does not certify sale outcome. |
| GET /api/ready (future) | none -> {ready:boolean} | Loopback supervisor | Schema/DB/authority availability only; no diagnostics/paths. Detailed health A local. |

Remote authorized edits use the SAME approved endpoints and request keys with origin=REMOTE audit, current MFA and explicit remote capabilities. There is no unrestricted /remote/sql or generic Admin bypass. Physical cash/refund/count/disposition/restore actions remain local unless later workflow explicitly delegates local confirmation.

Hosted contracts below use FULL /cloud/v1 paths on a separate authenticated cloud host; local /api/v1 prefix does not apply. All are proposed, not deployed. Same error envelope, schema/rate bounds and secret filtering apply. Cloud POST acceptance never means local business applied.

| Method/path | Request -> response | Role | Boundary, validation, errors/retry |
| --- | --- | --- | --- |
| GET /cloud/v1/projection/status | none -> {generation,namespace,publishedSequence,lastShopSync,stale} | Enrolled owner MFA | RLS owner shop, READ. No backup upload timestamp used as live freshness. |
| GET /cloud/v1/projection/{resource} | {filters,cursor,watermark} -> {data,nextCursor,source:CLOUD_SNAPSHOT,watermark,asOf,complete} | Enrolled owner MFA | Resource enum: catalog/inventory/sales/receipts/refunds/expenses/stock-value/reports/dashboard/closings/settings-safe/backup-status. READ from one published namespace; stale cursor requires refresh, no arbitrary SQL/raw auth fields. |
| POST /cloud/v1/projection/batches | {batchId,generation,namespace,fromSequence,toSequence,events,hash} -> {publishedSequence} | Active device scoped | Hosted TX all-operation bundle, schema/hash/membership/contiguous stream; exact replay same ack, 409 gap/hash/generation. |
| POST /cloud/v1/commands | {requestKey,generation,kind,productId,expectedVersion,patch,expiresAt} -> {commandId,state:QUEUED} | Enrolled owner MFA | Hosted TX strict PRODUCT_DETAILS(name/category) or SELLING_PRICE only; forbidden fields 422/403; same key/hash replay safe, changed hash409;202 not local apply. |
| GET /cloud/v1/commands/{id} | id -> {state,desiredPatch,localOutcome?,reviewRequired,asOf} | Enrolled owner | RLS shop, READ; absent ack/claim never APPLIED. |
| POST /cloud/v1/commands/{id}/cancel | {requestKey,expectedStateVersion} -> CANCELLED or CANCEL_REQUESTED | Enrolled owner MFA | Hosted TX cancels only unclaimed; in-flight waits for local result, same-key retry, no false cancellation. |
| POST /cloud/v1/device/commands/claim | {generation,limit,leaseId} -> {commands,freshScopedAssertion} | Active enrolled device | Hosted TX bounded lease; only current-generation permitted types; repeat lease/request safe, no direct financial access. |
| POST /cloud/v1/device/commands/{id}/outcome | {generation,localOperationId,status,result,hash,commitTime,signature} -> {ack:true} | Active device scoped | Hosted TX verifies authority/signature/idempotency/hash; APPLIED only local commit evidence, owner cannot forge; conflict409. |

These cloud endpoints never let a device or owner bypass local domain validation. Remote financial/cash/refund/closing command queue is forbidden. Local sync dispatch uses internal service identity and the same product services, not an exposed arbitrary /internal/sql endpoint.

### 7.3 Every existing screen mapped

| Current route(s) | Planned API/service connection |
| --- | --- |
| / and /login | Fixed Admin/Salesperson role selection + /auth/login/session/public shop; preserve simple layout, remove/gate demo access only in approved auth integration |
| /pos | /pos/products, POST /sales, /operations/{key}, /sales/{id}/receipt, cash-day status |
| /pos/history | scoped GET /sales, /sales/{id}, /sales/{id}/receipt |
| /pos/returns | Shared safe invoice search, /returns/quote, exact /authorizations request/status, approved POST /returns; separate A inspection/disposition |
| /pos/expenses | Shared new entry/summaries; corrections/voids gated by /authorizations exact grant or A, never ordinary unrestricted S edit |
| /admin/dashboard | /dashboard; drilldowns share underlying queries |
| /admin/products | /products, selling-status/archive and product detail |
| /admin/products/new | POST /products with atomic opening |
| /admin/products/[productId]/edit | product GET/PATCH; dedicated cost/receipt/adjustment services for existing operations |
| /admin/inventory/available-stock | /inventory, /stock-movements and authorized product operations |
| /admin/inventory/low-stock | /inventory/low-stock |
| /admin/reports | navigation only; no independent financial calculation |
| /admin/reports/sales and /admin/sales/today | /reports/sales; preserve compatibility alias/query behavior |
| /admin/reports/profit and /admin/profit/today | /reports/profit |
| /admin/expenses | shared GET /expenses, permitted A revision/void |
| /admin/investment (visible Stock Value) | /stock-value, original route retained |
| /admin/settings | shop settings, own password, backup/status/jobs and LOCAL restore maintenance |
| /admin/daily-closing | Calendar cash-day status/continuous carry, count evidence, late reconstruction, preview/close/history; same approved six-card layout and Actual Cash flow with necessary time/source explanation |
| /admin/demo | existing redirect /admin/dashboard; no new API |
| /admin/demo/returns, /expenses, /investment | existing redirects /pos/returns, /pos/expenses, /admin/investment |
| /admin and /pos layouts, shells | authorized session/capabilities and public shop display; Back to Login becomes actual logout |
| /api/health | existing liveness; future separate readiness contract above |

All routes listed are inspected existing files. Fixed-role credential controls, bounded Admin approvals, inspection and cash count/carry connections are necessary operational flows requiring focused integration review; their design must fit approved screens, not expand into a redesign.


## 8. Authentication, shared-role accountability and limited authorization

### P09 CONFIRMED: exactly two role accounts

The shop has exactly two fixed role accounts: ADMIN (owner password) and SALESPERSON (one shared staff password). Selected role + matching password authenticates ONLY that role. No individual employee account, staff signup, username chooser, password-to-account scan, hidden master password or extra shop role. A role selection control is a necessary approved connection to the simple existing login, not permission to redesign it.

Server maps selected enum to its fixed account, verifies that credential, reads active/role/epoch from DB and creates role-bound session. Never trust client role after authentication or grant Admin because a route/role label was selected. Admin and shared S credentials must be distinct. During protected setup/rotation enforce distinctness against the other known role credential as a credential-policy check, never as account discovery. Keep secret plaintext only in transient password verification; no logging or reversible password storage.

Bootstrap provisions both fixed accounts in one local owner setup, then disables creation/signup permanently. Database UNIQUE(role) plus CHECK role IN two values prevents extras; bootstrap-complete service/trigger rules prevent later insertion/deletion. Admin cannot be disabled/deleted; temporarily disable/re-enable S if needed. No staff provisioning module. All historic user/actor FKs reference one of these accounts.

CONFIRMED accountability limit: an S event means SALESPERSON_SHARED with session/device/origin and server time, not a named employee. All shared S invoices/history are role-safe shared-role records; an 'own account' filter cannot distinguish employees. Never invent employee names, verified staff attribution or person-level refund limits. Individual-account SRS/guide assumptions are SUPERSEDED by latest P09; preserve original files and explicitly record the amendment.

Admin alone rotates either role password and resets shared S with fresh Admin authentication. Changing either role password revokes all sessions for that role; owner recovery also revokes sensitive approvals. S can sign out but cannot change shared credentials/sensitive settings. Failed login uses generic failure, approved per-role persistent cooldowns and bounded overall verification concurrency. Additional device/global rate policies require explicit owner approval. Proposed strength/idle/absolute limits remain technical settings to review, not a reopened identity decision.

### Authentication compatibility and protected sessions

Retain Better Auth candidate local credential/SQLite support; map fixed role identifiers internally (reserved unique framework username/email if required). No email-dependent runtime, social login or public signup. Verify supported provider APIs and exact generated schema for TWO accounts and credential rotation, disable built-in signup/admin-user creation routes, and test every direct framework route for bypass. Role-based facade must not leave an unguarded framework endpoint. [Better Auth credentials](https://better-auth.com/docs/authentication/email-password)

Part3G owner-approved initial-release policy: BOTH ADMIN and SALESPERSON use passwords of8..128 Unicode scalar values, maximum512 UTF-8 bytes, with no composition rules or normalization/trim/truncation/case conversion. This supersedes earlier12/15-character proposals and the short-PIN initial-release requirement;4/5-digit PIN remains DISABLED after the blocked Part3F feasibility gate. Use reviewed common/weak offline screening for BOTH roles at setup/change, exact-value distinctness and existing native asynchronous salted scrypt/V001 callbacks before the writer lock. Part3I binds the real private Better Auth password callbacks to the existing SQLite owner/queue/shutdown lifecycle. The owner-approved5 CONSECUTIVE failures/role followed by30-second cooldown applies to BOTH roles; success or expiry clears only that role streak, no escalation/permanent lockout. The unapproved GLOBAL10-attempt/15-minute admission policy is INACTIVE: its legacy row is validated/pruned but never charged or used for denial. Overall protection is one in-flight verification/no native-work queue. Durable charges commit before scrypt; authoritative provisioning/role/active/credential-version/epoch/hash metadata are rechecked under the final writer reservation. Success returns only a private five-second, identity-bound, non-authorizing receipt, invalidated on new verification/close. Part3J now consumes genuine receipts once, enforcing deadline/role/boot and fresh provisioning/credential state in the SAME owner/queue/writer transaction. Supported pinned createSession and pathless createAuthEndpoint.serverOnly/setSessionCookie stage signed secure nonpersistent cookies; only non-bearer session ID/version/epoch/boot/expiry reaches SQLite, and no response is released before COMMIT. Failed issuance revokes any possibly committed row and attempts RAM cleanup; SQL uncertainty quarantines the owner, so surviving RAM cannot authorize. Every protected request still requires fresh SQL; shutdown drains issuance and restart invalidates sessions without deleting records. Part3K adds fixed-role private signed-cookie logout through the SAME queue/transaction owner: exact SQL registration revocation commits before targeted RAM deletion, cookie expiry or success. Cookie cache is bypassed; surviving RAM cannot restore SQL-revoked access. Repeat/no-live-session logout confirms SQL availability without guessing an identity. Lookup/SQL/COMMIT uncertainty quarantines the whole owner and denies both roles. Logout cancels pending receipts and earlier in-flight verification/issuance; admitted protected work serializes before revocation, later checks deny. No public login/logout/HTTP/UI, real enrollment, recovery or deployed reopen/role-switch lifecycle is implemented. Remote Admin requires an additional strong factor. The frozen login form remains an unwired presence-only demo.

Part3L bounded private rotation is now implemented: fixed Admin/Salesperson target methods require BOTH a live signed Admin session and genuine single-use fresh Admin receipt. The same owner snapshots BOTH credentials under authority, performs reviewed exact8+ screening, strict native non-reuse checks and salted hashing outside the writer, then rechecks both accounts/Admin authority and atomically updates the hash, signed-int64 credential version/auth epoch and ALL target session revocations. Pinned supported updateAccount joins the current official transaction. Login verify errors still return false; policy reuse checks throw on any error instead of treating failure as proof of difference. Target RAM deletion/clearing occurs only after confirmed COMMIT; old cookies deny even if cleanup fails. Self-rotation requires fresh login; Salesperson rotation preserves valid Admin sessions. Logout/shutdown/deadline/stale state cancel; COMMIT uncertainty quarantines. One native operation admission, no new account/route/migration/dependency/throttle/business reset. A RAM-clear fault no longer prevents closing the SQLite owner. Target-hardware performance, production enrollment/recovery/auditing and all HTTP/UI/deployment gates remain pending. [Part3L exact scope/evidence](AUTH_B1B_PART3L_PASSWORD_ROTATION_REPORT.md).

Part3M owner-approved timeout correction: the genuine5-second proof must stay fresh through the initial authorized SQL snapshot and is consumed once. Only then a PRIVATE fixed30-second monotonic rotation-operation lifecycle starts; rollback/invalid/overflow clocks deny and the deadline never slides. Native work and final queue delay use this bound, with unchanged boot/transition cancellation and final authoritative Admin/session/provisioning/BOTH-credential/version/epoch/target/session-expiry checks. No proof/session extension, new grant, login policy change, weaker scrypt or data reset. Native calls already running cannot be forcibly cancelled; late results deny and admission remains held until they finish. One actual-clock development rotation took2404.20ms, not a target-hardware guarantee.17 new timeout cases plus11 selected regressions pass; earlier evidence preserved. [Part3M scope/timing/evidence](AUTH_B1B_PART3M_ROTATION_TIMEOUT_REPORT.md).

Better Auth default documented session table stores the bearer token, not automatically a hash. Verify protected-token adapter mapping: keyed lookup + authenticated encrypted token/challenge values, OS-protected key, exact query/unique/expiry/rotation behavior. If unsupported, propose maintained protected-storage alternative before B2; never silently weaken or invent an authentication framework. SQLite/hash/adapter compatibility can be researched in an isolated B1 spike, without production credentials. [Better Auth sessions](https://better-auth.com/docs/concepts/session-management)

Role-bound opaque sessions: HttpOnly, SameSite=Strict, Secure under tested local TLS, active/epoch validated every request; no stale-role cookie cache. Proposed12h absolute/30m idle local; remote shorter with MFA. Logout/revocation clears sessions and invalidates unconsumed grants bound to them. Store session ID/role in audit, never bearer tokens. Separate Admin authorization window/partition from S window so Admin credentials/session never become available to staff window.

SQLite does not encrypt the whole DB by default. DPAPI-wrap runtime keys, restrict Windows-user filesystem ACLs, assess actual disk protection before production; a hostile same-user process/Windows administrator remains a risk. Backup must carry owner-wrapped portable data-key envelopes, not DPAPI-only recovery. Never embed local/remote/backup secrets in renderer, NEXT_PUBLIC values, executable or repository. Do not change Windows configuration now.

Owner recovery uses one-time high-entropy hashed codes, local ceremony, atomic consume and session/grant revocation; no backdoor or publicly resettable role password. Shared S never receives owner authentication or backup recovery material.

### P07 CONFIRMED: exact-operation Admin authorization

S may create sales, browse role-safe shared Sales History/search invoices and record new operating expenses. It has NO standing refund, expense-correction or expense-void permission. A directly performs these operations OR authorizes ONE exact S operation, without staff learning Admin password.

Proposed bounded workflow (technical design, not implemented):
1. S prepares refund quote or expense revision/void. Server stores an immutable authorization request: kind, target ID/version, normalized safe intent hash, exact approved amount/lines, requester role-account/session/auth_epoch, shop generation, nonce and proposed5-minute expiry. No password/profit/cost in staff-visible record.
2. Owner opens a separate trusted Admin approval window/partition and authenticates privately/re-authenticates with A credentials. Approval screen shows exact invoice/expense, amount, reason and action; approve/deny. It does not hand a general Admin cookie/password back to S or temporarily change S role. Initially local approval; remote live approval needs explicit later capability review, never queued.
3. Server produces an opaque grant ID bound to that immutable request, approved intent, current versions, approver Admin session/epoch, requester session and one application operation key. Grant grants only REFUND_CREATE, EXPENSE_REVISE or EXPENSE_VOID; no COST_OVERRIDE, restore, settings or arbitrary endpoints.
4. On S submit authenticate S normally; check matching live grant, both epochs, generation, expiry and target/version/amount/hash. Recompute all business rules and cost/refund caps. In the SAME BEGIN IMMEDIATE consume grant conditionally, post operation/financial/cash/audit records and link authorized_by=ADMIN. Failure rolls back consume and effects; stale/change requires new approval, never silently expands scope.
5. Idempotent replay finds committed original operation BEFORE testing consumed/expired grant, with current role/session result access; returns original result without redoing payout. A new key or altered amount cannot reuse consumed grant. Denied/expired requests confer nothing; rate-limit approval spam; minimal staff status only.

A password reset/revocation/restore invalidates outstanding grants. If owner absent, S may prepare request but cannot process restricted cash/expense operation. No staff access to Admin password needed; possession of an approval ID alone is insufficient. Audit records actual shared S executor and authenticated ADMIN authorizer separately; no employee attribution. Approvals never waive below-cost/stock/prior-return rules.

### Role matrix

| Operation | Local Admin | Shared Salesperson | Remote Admin |
| --- | --- | --- | --- |
| POS options/logout | Yes read | Yes | Approved read |
| Role-safe sales/receipt history and invoice search | All | Shared role-safe history; no cost/profit/stock | Last synchronized or live authorized view |
| Create sale | Not granted by this brief; separate local A POS permission if requested | Yes, final cost floor enforced | No remote cashier mode |
| New operating expense | Yes | Yes | No queued financial action |
| Cash refund | Yes, actual cash confirmation | Exact single-use Admin grant required | View only; no queued payout |
| Expense correction/void | Yes | Exact single-use Admin grant required | View initially; no queue |
| Saved invoice financial correction | Yes only | NEVER, even with limited grant | Only separately approved LIVE capability; not queue |
| Buying costs/profits/stock | Yes | NEVER | Admin projection/live view |
| Stock receive/count/disposition | Yes | No | No offline queue; local physical workflow initially |
| Product details/normal selling price | Yes | No | Live authorized edit; ONLY approved queue types while shop offline |
| Cost/unit/variant identity/settings/credentials | A-only controlled workflow | No | No offline queue; live subset explicitly gated |
| Daily Closing/cash counts/owner cash/restore | Local fresh A | No | View sanitized state; no queue/ordinary remote restore |
| Backup Now/export/recovery keys | A only | No | Status only initially; owner secrets not projected |
| Rotate Admin/shared S credentials | Fresh A only | No | No cloud queue; local recovery controls |
| Employee creation | Not part of release | No | No |

S filtering occurs before DTO/HTML/React payload rendering; never import Admin data into S client bundles. Include errors, cache/back navigation, exports and network payloads in attacks. Hiding controls is not authorization.

REST guard: strict Zod and body/range limits, prepared SQL and allowlisted sorts, escaped plain text, CSP/no dangerous HTML, exact Origin/Host plus CSRF, no broad CORS. DNS rebinding/loopback is not trusted authentication. Local TLS/bootstrap/cookie feasibility must pass; no globally disabled certificate checks or silent Secure-cookie downgrade.

Remote sessions are Admin-only, device/gateway-bound, MFA protected, short-lived and independently revocable. Local-only cookies cannot be replayed at remote ingress; never trust arbitrary forwarded-user headers. Cloud owner/device service identities are infrastructure enrollment mapped to the existing ADMIN role, not a third POS role or employee account. Do not mirror local password hashes/sessions to cloud. When shop is offline, cloud viewer identity/revocation is cloud-enforced; local password changes cannot instantly reach it, so design cloud device/session revocation and short expiry explicitly in B13.

## 9. Backup architecture: local, external and private cloud

P11 PROVISIONAL approved Option A: recover real records/configuration/account access after laptop loss, subject to actual restore/key/retention tests. Required integrated functions:30-minute encrypted local backup while running, post-closing backup, automatic verified encrypted private cloud upload, daily copy to an approved connected USB drive, A-only Backup Now/manual encrypted USB export, guided USB/cloud restore and actual independent local/cloud last-success status. Salesperson never receives recovery secrets. Same-disk backups alone do not protect disk failure.

### Consistent creation and verification

1. Scheduler enqueues REQUIRED local snapshots every30 minutes while operating, after every committed calendar closing, before migration/transfer, and Admin Backup Now. On restart catch up missed work and display overdue status. RPO is time since last VERIFIED off-device copy, not scheduled interval.
2. Use driver-supported SQLite Online Backup API to a restricted temporary file, bounded pages/retries. Never copy live .db alone in WAL mode. If that API is unavailable, evaluate supported VACUUM INTO with measured blocking/space and explicit validation. [SQLite backup API](https://sqlite.org/backup.html)
3. Read manifest data FROM the snapshot: shop ID, authority generation, app/schema/policy versions, latest included operation/cutoff, timestamps and counts. Run integrity_check, foreign_key_check and stock/financial invariants in isolation. Snapshot may contain committed records after closing; label exact watermark rather than claiming closing-time-only state.
4. Create authenticated manifest; compress with bounded resource usage, encrypt archive with a unique random per-backup key using a maintained authenticated-encryption format (proposal AES-256-GCM, unique nonce/tag, authenticated version/shop/generation metadata). Stream verified libraries; no homemade encryption format without review. Hash ciphertext and protect plaintext digest inside encrypted/authenticated manifest.
5. Flush completed encrypted file and verify decrypt/tag/hash on isolated temporary output, then atomic rename on same volume. Plain temporary snapshot has restrictive ACLs, short lifetime and explicit cleanup; do not promise secure erase on SSD. An interrupted job cannot replace the last verified archive.
6. Record local VERIFIED copy after checks. Copy to external storage by temp+flush+verify+rename. Independent external/cloud failure does not relabel local success or stop sales.
7. Automatically queue EVERY verified encrypted snapshot for upload as soon as online, to an opaque unique object key, no overwrite/upsert. On interrupted upload restart/resume supported protocol; after ambiguous outcome check that exact object/digest, never create multiple pretend successes. Verify uploaded bytes by authenticated download/hash (and periodic full restore); ETag alone is not a universal SHA-256 check.
8. Persist separate last successful local/external/cloud verification, last successful full restore drill, last error and pending/overdue states. Archive creation, cloud receipt and tested restoration are different evidence.

Durable jobs lease one worker, backoff with jitter (proposal 1m up to 1h), recover expired leases after crash. Retry transient network/5xx, pause on credentials/quota/project-paused errors with actionable status. No logging plaintext DB contents. Check disk free space for snapshot, encrypted archive, migration/restore reserve and WAL; if insufficient, warn visibly and avoid overwriting usable data.

Daily USB policy: A enrolls the approved removable volume by stable identity and safe destination, with permission/space checks; if connected, copy the latest verified encrypted backup once/day automatically and verify bytes. Disconnected drive shows missed external copy and retries when it returns. Manual Export Encrypted Backup is A-only, can create a fresh snapshot if current archive is stale, uses a native selection token/approvedDriveId (never arbitrary API path), verifies the export and never bundles plaintext recovery secrets. Normal shop sales do not depend on USB/cloud availability; actual disk-full business write failure remains a separate hardware risk.

### Encryption and recovery custody

Generate owner-controlled backup master recovery material only in later approved setup. It wraps each per-backup encryption key with versioned key IDs. In addition to DPAPI convenience storage on the laptop, require TWO independently protected owner recovery-key copies, stored separately (for example sealed physical copy plus separately encrypted removable copy/password custody). One copy on the laptop plus one external copy does not satisfy two independent owner recovery copies. Test each copy independently; Salesperson never receives either. DPAPI alone cannot recover on replacement Windows. A low-entropy shop password is not the backup encryption key.

The recovery kit records nonsecret shop/project/bucket identity, backup format, recovery software version instructions, owner cloud-login/MFA recovery process and separately protected decryption material. Owner must demonstrate retrieval/decryption on another machine; do not put account password and decryption secret together in the same cloud archive. The authenticated archive must also carry portable owner-wrapped key envelopes for required application field-encryption keys (for example retained MFA secrets), with key IDs and tested import; backing up only DPAPI blobs is insufficient. Restored session/challenge tokens are revoked rather than reused. Machine upload/tunnel credentials are not transferred and require new enrollment. Old recovery keys retained until every retained archive is rewrapped/replaced and verified; losing them cannot be fixed by resetting login.

### Supabase credentials and Free-plan risks

Use a PRIVATE bucket. Public/publishable project identifier is not authorization. Enroll a dedicated upload identity at setup, restricted by server-controlled membership to one shop/generation/prefix. Short-lived user JWT plus revocable refresh credential in DPAPI-protected storage; no root credentials in renderer or EXE. RLS checks bucket, exact object prefix, auth.uid() membership and active enrollment, never caller-asserted shop/user metadata. Allow append INSERT and necessary read-own verification; deny overwrite/delete/arbitrary object listing. Ownership alone is not the entire shop access policy.

Owner recovery identity is independent of the lost laptop, MFA protected, authorized SELECT/list of that shop's generations, with separate least-privilege retention deletion. Initial retention administration can be an owner procedure; a later hosted maintenance service would need separate approval. RLS cross-prefix, unauthenticated, revoked-device and update/delete attacks must fail.

Never distribute Supabase service_role/secret key: service credentials bypass RLS. No raw public or permanent signed download URLs; downloads authenticated, temporary signed URLs only when justified and never in logs. Encryption remains necessary despite private bucket. [Supabase access control](https://supabase.com/docs/guides/storage/security/access-control), [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)

Checked official pricing during this review: Free lists 1 GB file storage, 5 GB egress plus 5 GB cached egress, 500 MB hosted database, and project pausing after one week inactivity. Hosted PostgreSQL allowance is NOT space for the local shop database. Recheck limits/upload caps/terms before setup; do not assume Storage-only activity prevents a pause. Free is not guaranteed permanent disaster recovery. Quota, unavailable/paused projects and changed terms need external-copy fallback and owner alerts. [Supabase pricing](https://supabase.com/pricing), [Free project pausing](https://supabase.com/kb/faqs/platform/free-project-pausing)

### Retention and capacity

Proposed review targets: local retain 48 half-hourly + 7 daily + 4 weekly verified recovery points (deduplicate overlaps); external daily 7 + weekly 4; cloud daily 7 + weekly 4 only if capacity permits. Never promise these fit Free. Example 50 MB encrypted archive * 11=550 MB; 150 MB * 11=1.65 GB, exceeding 1 GB before overhead. Large runtime database needs budget/provider/retention review, not silent loss of recovery points. Every verified30-minute/closing archive is queued immediately when online; the old hourly/coalesced-upload recommendation is SUPERSEDED. Cloud retention can rotate verified older uploads only under approved policy/quota, never pretend unuploaded archive was synchronized.

Verify new independent copy before pruning; preserve at least last known-good plus older recovery point, failed-restore quarantine evidence, pinned pre-migration/pre-transfer copy. Retention deletion requires authorized identity, excludes pending/unverified replacements and never runs under basic upload identity. Offline backlog needs explicit budget/retention approval: preserve pending copies under the configured safe policy, alert before space/quota exhaustion and offer Admin verified USB export. Do not silently coalesce/drop required uploads or delete last good recovery points to hide failure. Show actual off-device age and clearly report data-loss exposure.

Target proposal for owner review: off-device RPO <=1 operating hour when connected/external drive available; disconnected gap visibly grows. RTO <=4h on prepared replacement hardware, measured by restore drill, not promised today. No worker runs while laptop powered off. Monthly isolated restore check and quarterly replacement-laptop drill proposed; costs/data volume may change schedule.

## 10. Restore, laptop transfer and single authority

### Safe restore protocol

1. LOCAL maintenance only, fresh Admin proof or offline owner recovery ceremony on a blank replacement. No remote restore endpoint or arbitrary path/URL. Preserve existing DB/WAL/keys and verify a pre-change archive if readable; never overwrite because a file is corrupt.
2. Stop accepting business writes and remote changes; drain transaction writer, stop auth/job writers. Identify shop, source generation and exact backup digest. New replacement starts RECOVERY/read-only, not active shop.
3. Fetch encrypted bytes with independent owner cloud access or external copy. Verify format/digest/AEAD, key availability, schema/app compatibility, extraction limits (zip-bomb/path traversal defense), then restore to a NEW isolated directory.
4. Run full SQLite integrity/FK checks; reconcile stock ledger, all sales/returns/payment/cash/expense totals, prior-return limits, snapshots and migration checksums. Open isolated UI/service read-only and verify selected receipts/account recovery. Do not send print/cloud/remote jobs from test copy.
5. If older schema, migrate isolated copy under reviewed compatible app, then recheck. Newer unsupported archive fails closed. Compare snapshot watermark and known later transactions; disclose recovery gap. Never claim a backup has latest data because its upload time is recent.
6. Owner confirms validated digest/gap and authority plan. Close every DB handle, preserve old directory, promote validated directory via controlled same-volume replacement/journaled recovery steps. Windows open-file/rename failures stop safely. Keep a protected restore journal outside the database so crash during replacement selects a known verified set and does not combine old/new WAL.
7. New generation/device enrollment, revoke all restored sessions, regenerate machine/tunnel/upload credentials, rewrap convenience keys under new Windows user; retain owner archival recovery material. Disable restored pending remote/network jobs until reviewed. Import the verified archive manifest into backup_sets if its metadata postdated the snapshot, then import restore evidence with valid FKs; never invent missing source business records. Audit restore and perform new verified off-device backup before live use.
8. Accept writes only after authority fencing below; verify startup, test original-key lookup, login and authorized accounting. Remove nothing until owner-approved retention permits.

### Two-laptop conflict prevention and honest limit

A single-instance mutex/lock plus installations ACTIVE uniqueness prevents two processes on ONE authoritative directory. It cannot stop a cloned database on another disconnected laptop. Always-offline sales and automatic global fencing of a destroyed-but-possibly-revived laptop cannot both be guaranteed without an external lease/online requirement. Do not claim a local flag or generation number alone solves this.

Recommendation: only one provisioned shop installation; portable remote EXE contains no local business database or cashier mode. Planned transfer freezes old laptop, drains writes, takes/validates final transfer archive, marks old installation RETIRED and removes its activation/remote/upload enrollment, then activates new generation. Retired app refuses writes and instructs recovery; old disk protected/retired by owner.

Disaster replacement: owner must confirm old laptop destroyed, securely erased, physically controlled or permanently retired. Revoke its remote/upload identities and increment generation, but an old offline clone still cannot be remotely disabled. If old laptop can reappear uncontrolled (lost/stolen), treat this as unresolved authority risk: quarantine it when found, never resume/merge records automatically; compare/export its later records for approved reconciliation. Production replacement procedure requires this owner acknowledgment or a separately approved online write-lease architecture that changes offline guarantees. New laptop must not silently activate while authority is uncertain.

Never merge independently edited restored copies. Cloud backup upload/download never authorizes a replacement writer. Generation-prefixed invoice numbers and permanent operation keys prevent ID reuse but do not reconcile divergent stock.


## 11. P10 CONFIRMED: hybrid Remote Admin, projection and bounded queue

Two modes are required, not competing options. Online shop: secure live viewing/authorized edits through local SQLite-backed API. Offline shop: owner views last COMPLETELY synchronized cloud projection and may queue ONLY PRODUCT_DETAILS or SELLING_PRICE changes. Offline stock/cost/cash/refund/expense/closing/credential/restore commands are forbidden. Nothing in cloud becomes a second shop transactional writer.

The separate Remote Admin EXE contains no business SQLite/cashier mode or backup decryption key. Cloud projection is read-only business data, not an authoritative restored backup. Display source=LIVE or CLOUD_SNAPSHOT, generation, source sequence, last shop synchronization time and pending/rejected status. Owner's internet connection and available cloud service are necessary for cloud viewing; with both offline, show unavailable unless a separately approved encrypted device cache exists. Cached data never authorizes writes.

### Hosting and security boundaries

Proposed minimum hosted infrastructure (implementation/provider selection still gated): Supabase Auth for enrolled owner/device infrastructure identities, hosted PostgreSQL for RLS-protected projection/queue metadata, and a narrow hosted API/Edge Function layer for validating queue commands, claim leases, projection batches and signed outcomes. Supabase PRIVATE Storage continues to store encrypted recovery archives separately. These hosted service identities map to the existing ADMIN shop role or restricted device worker, not additional POS roles; local password hashes/sessions never replicate.

RLS denies anonymous and shared S access, isolates shop/generation/membership, and makes owner READ-only on projection rows. Owner can submit only validated command types through scoped API; cannot UPDATE projection rows or mint APPLIED. Device can publish its shop's projection, claim allowed commands and report authenticated outcomes, not cross-shop data or owner credentials. Service-role secrets, if required by a hosted maintenance function, stay ONLY in trusted hosted secret storage; prefer invoker/scoped policies. Never embed them in EXE. Revoke enrollment/device sessions independently of shop password. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

TLS, owner MFA and short cloud sessions, rate limits/body limits, parameterized queries and audit apply. Projection contains only approved Admin business DTOs (including stock/cost/profit for owner), never local credentials, session tokens, grants, backup keys/raw files or Windows paths. Detailed customer PII minimized. Cloud owner controls and retention need review; private backup encryption is not a substitute for projection authorization.

A direct authenticated outbound HTTPS tunnel is the preferred live transport candidate: app/window need no browser/manual server/router port-forward. Gateway/device identity plus application Admin MFA/RBAC and generation/version checks remain mandatory. A mesh/VPN is an alternative only if approved setup/portability supports it; no driver/network changes now. Public tunnel failure may leave cloud projection available; do not falsely report shop offline as proof a previously sent request failed.

### Local SQLite additions

The following are durable coordination records, not a second accounting ledger. Section3 aliases apply.

| Table / purpose | Important columns and relationships | Constraints and indexes | Authorization / sensitive handling |
| --- | --- | --- | --- |
| sync_outbox: atomic projection changes | id ID; stream_sequence I; source_operation_id FK operations; source_operation_sequence I; generation I; schema_version I; payload J (allowlisted immutable changed DTOs/tombstones); payload_hash BLOB; state E PENDING/ACKED; created_at T; acked_at T? | UQ stream_sequence and source_operation_id; index(state,stream_sequence); one complete operation bundle. Every affected business TX writes outbox or none. Stream sequence advances only for published business/control events, independent of nonprojected operation gaps. | W-only publish; never auth secrets/S payloads. Bounded offline backlog can trigger consistent full resnapshot, never silently omit unacknowledged changes. |
| remote_command_inbox: local terminal dedupe/evidence | command_id TEXT PK; generation I; cloud_owner_ref TEXT; expected_admin_epoch I; kind E PRODUCT_DETAILS/SELLING_PRICE; product_id FK products; expected_product_version I; normalized_payload J; payload_hash BLOB; expires_at T; local_operation_id FK operations; outcome E APPLIED/REJECTED/EXPIRED/CANCELLED; outcome_hash BLOB; acked_at T?; received_at T | UQ local_operation_id; index(acked_at,received_at); command_id is exact request_key; only final rows commit with operation/audit/outbox. No local durable APPLYING business success. | Restricted worker invokes ordinary service as authenticated mapped ADMIN with REMOTE_QUEUE origin. Reauthorize membership/epoch/generation at execution; no unrestricted Admin impersonation. |

Outbox uses immutable DTO envelope built inside business transaction; do not reconstruct old event from today's mutable catalog. Background jobs add SYNC_PUBLISH/COMMAND_POLL/OUTCOME_ACK with bounded leases/retries; these jobs do not directly write balances.

### Hosted tables (separate proposed PostgreSQL schema, not local SQLite)

Types here are PostgreSQL: text IDs/UUID as provider requires, bigint sequences, timestamptz UTC, boolean and jsonb. Monetary DTO values inside JSON remain exact decimal strings. All tables have RLS, index their membership/FK/filter keys; owner/system access below is explicit.

| Table / purpose | Fields, keys and relationships | Uniqueness/checks/indexes | Access and sensitivity |
| --- | --- | --- | --- |
| cloud_memberships: enrolled owner and device scopes | id PK; shop_id text; auth_subject FK auth.users; kind OWNER/DEVICE; generation bigint?; mapped_local_admin_id text; enrolled_admin_epoch bigint; scopes allowlisted text[]; active bool; public_key_ref text?; created_at/revoked_at timestamptz | UQ(shop_id,auth_subject,kind,generation); index(auth_subject,active); DEVICE requires generation. Membership/scopes writable only by protected owner enrollment/control, not caller user_metadata. | Owner reads own enrollments; device own restricted row. No local password/key. No public self-enrollment into ADMIN. |
| projection_state: published consistent read boundary | shop_id PK; generation; visible_namespace text; published_stream_sequence bigint; source_committed_at/last_received_at timestamptz; schema_version int; state READY/STALE/REBUILDING | sequence>=0, generation current; FK/member checks on ingestion; publish pointer advances atomically, never backwards in generation. Index last_received_at for monitoring. | Enrolled OWNER reads; device through validated ingestion only. READY means last complete sync, not proof shop still online. |
| projection_entities: owner-safe current read models/history | shop_id,generation,namespace,entity_type,entity_id composite PK; version bigint; last_stream_sequence bigint; dto jsonb; tombstone bool | FK logical namespace/state validated; indexes(shop_id,generation,namespace,entity_type,last_stream_sequence,entity_id). Exact allowlisted DTO versions and bounded entity types; no raw SQLite rows. | OWNER SELECT same shop/visible namespace; device validated ingestion; OWNER cannot directly UPDATE. Includes approved full history/summaries or explicitly reviewed scope, not silently trimmed data. |
| projection_batches: replay/gap proof | shop_id,generation,batch_id composite PK; namespace; from_sequence/to_sequence bigint; hash text; applied_at timestamptz | UQ(shop_id,generation,namespace,from_sequence,to_sequence); from<=to; only contiguous expected next sequence, replay hash exact; indexes source stream boundary. | Device scoped ingestion; owner redacted status. Same batch/hash replay is harmless; changed hash rejects. |
| cloud_commands: immutable bounded intent and dispatch | id UUID PK=request_key; shop_id; generation; owner_membership_id FK cloud_memberships; expected_admin_epoch bigint; state_version bigint; kind PRODUCT_DETAILS/SELLING_PRICE; product_id text; expected_version bigint; payload jsonb; hash text; created_at/expires_at timestamptz; state QUEUED/CLAIMED/CANCEL_REQUESTED/APPLIED/REJECTED/EXPIRED/CANCELLED; lease_device_id FK cloud_memberships?; lease_until timestamptz? | UQ owner key/id; kind/field allowlist; product ID/base version required; created<expires; index(shop_id,generation,state,created_at). Payload immutable; bounded expiry (proposed24h). | OWNER submit/read own shop via validated API; device claim own active generation. No costs/stock/financial command types. Claim is not application. |
| cloud_command_outcomes: local authority result | command_id PK FK cloud_commands; shop_id text FK projection_state; generation; local_operation_id text; source_stream_sequence bigint?; status APPLIED/REJECTED/EXPIRED/CANCELLED; safe_result jsonb; result_hash text; committed_at/received_at timestamptz; device_id FK cloud_memberships | UQ(shop_id,generation,local_operation_id); validated device/generation, immutable/hash match on replay; index received_at. APPLIED references durable local outcome; not owner asserted. | Device authenticated result API only; OWNER reads. No secret/raw SQL/internal traces. Outcome may arrive before projection; show APPLIED with committed version, view awaits synced sequence. |

These six hosted tables are justified by approved P10; they are not installed. PostgreSQL here hosts a projection/command service only and does NOT restore the superseded PostgreSQL LOCAL database proposal.

### Projection protocol and freshness

1. Enrollment assigns current shop generation and device scope. Initial export is a consistent allowlisted read snapshot at stream watermark, not a raw recovery archive. Large export stages a new namespace in bounded batches, then atomically switches projection_state after complete validation.
2. Each local relevant commit writes one outbox bundle with all changed records/tombstones and source sequence. Worker sends bounded contiguous batches with hash/version; cloud transaction applies the whole bundle and publishes new watermark together. No half-invoice/expense/refund/report state.
3. Retry same batch/hash; reject gaps/hash mismatch/stale generation. Ack only after hosted commit; lost ack resends safely. Retain enough local stream data for recovery. If backlog/retention means gap, stage a new consistent full namespace, then resume after its watermark; no data silently skipped.
4. Reports/dashboard/history views in cloud use same committed policy/metrics and published namespace/watermark, with as-of/freshness. If one section is incomplete/missing, mark unavailable, not zero. Never mix live inventory with older cloud financial totals while presenting a single current snapshot.
5. Shop disconnected => last complete projection stays viewable with actual last shop sync age. No path to internet means no promise of fresh remote data. Cloud unavailable => local operations continue, cloud viewing/queuing unavailable. Backups/upload time never substitutes for projection watermark.

### Exactly which remote changes may queue

PRODUCT_DETAILS PATCH allowlist initially name/base display label and category. SELLING_PRICE sets normal_selling_price only. Identify immutable product ID/code and expected product version from synchronized projection. Size/unit identity conversions, code reassignment, active/archive status, buying cost, stock/threshold/receipts and all financial/auth/settings/restore fields are rejected by queue schema. If an additional product-details field is needed, review exact nonfinancial allowlist; do not use a generic JSON patch. Existing size label correcting identity after stock history remains controlled local/live action, never reinterpretation by queue.

Selling-price command must pass the CURRENT local approved buying-cost floor at execution, even if cloud showed old cost. No automatic Admin override or silent price increase. Local price/cost/metadata edit increments product.V. Stock sale alone need not change metadata version; balance has its own version. Any stale expected version or changed cost/policy rejects the queued intent for review.

### Dispatch, reauthorization, conflicts and retries

- Cloud enqueue validates OWNER/MFA membership, exact field whitelist, generation/base version and expiry. Returns202 QUEUED, never 'saved to shop'. Pending desired price shown separately from applied catalog price. No queued balance edits, cash payouts, approvals, refunds/expenses/closing or credentials.
- When online, worker claims bounded commands with lease. Fetch a fresh scoped cloud authorization assertion; BEFORE writer TX verify signature/device/channel. Inside local TX recheck active ADMIN mapping and command expected_admin_epoch against current local auth_epoch, installed generation, immutable command/hash/expiry, current product version and all service rules. No cloud/network call inside TX.
- command_id is the SAME local request_key, not a new one per delivery. Local terminal lookup precedes new-operation checks; a prior APPLIED/REJECTED outcome remains recoverable after expiry/cost changes. New application saves operation + command inbox + product update/version + audit + outbox together. Failure changes none; rejected terminal evidence records safe reason. No uncontrolled local/background second writer.
- Device publishes signed/authenticated terminal outcome from local saved result. Cloud APPLIED only after durable local commit proof; lease/HTTP acceptance or queued desired value is not enough. Lost ack/repeated delivery retrieves same result. Projection can lag applied result; show committed version/time and 'view refreshing', not falsely rewrite old snapshot.
- Conflict => REJECTED/REVIEW_REQUIRED with current authorized version/fields; no automatic rebase/last-write-wins. Owner reviews and submits NEW explicit intent/key; old rejected record stays.
- Cancel/expire QUEUED before dispatch transaction may be terminal. Once CLAIMED or outcome uncertain, show CANCEL_REQUESTED/UNCONFIRMED until local authority resolves; never label cancelled/expired if it might already have committed. Worker checks cancellation/expiry before NEW apply, but always resolves existing outcome first.
- Online direct request with lost response stays UNCONFIRMED and must resolve using SAME local key. Do NOT move it into the cloud queue or create a replacement merely because the tunnel failed. Queue creation is explicit for a fresh offline edit; queued intents execute only through the claimed dispatcher, even after owner reconnects. No simultaneous live/queue submission of the same logical edit. Delivery retries reuse the command key; queue cancellation/expiry describes that queue dispatch, not proof a separately submitted live request failed. Never queue a financial/cash command on transport failure.
- Local Admin password rotation invalidates older command/grant authorization epochs; do not silently rebind pending commands. Refresh remote enrollment with owner/local authority proof, then require explicit review/new intent for rejected old commands. Cloud viewing may still use separately revoked cloud sessions while shop is offline; this never authorizes a stale-epoch local write.
- Replacement generation invalidates unexecuted old-generation commands/enrollment; preserve old terminal results. Rebuild projection for restored watermark, visibly disclose any recovery gap, and require owner review of previous pending commands. Never blindly replay old queue against restored business data.

### Cost and operation gate (before B13, not isolated B1)

Budget must cover hosted projection database, command API/functions/auth/MFA, tunnel/domain/provider terms, egress/queries, signing and ongoing updates/monitoring/support. Supabase Free currently lists500MB database and1GB Storage; projection/history uses database quota and encrypted archives use Storage quota. Backups do not cover the cloud queue automatically. Full approved history may exceed free limits; measure before promising free operation, obtain paid/alternate hosting approval or explicit history-scope decision rather than silently dropping sections. No paid account/provisioning authorized now. [Supabase pricing](https://supabase.com/pricing)

Monitor last successful projection sync separately from last verified cloud backup; quotas/paused project/backlog must fail honestly without blocking offline sales. Owner recovery requires both archive recovery procedure and remote membership/queue reconciliation; restoring SQLite alone does not recreate cloud infrastructure. Host selection, RLS/API hardening, remote MFA/local-role binding and costs are deferred technical implementation gates; hybrid scope and queue restrictions are settled.

## 12. Windows desktop lifecycle and packaging

| Candidate | Fit for current Next.js server and offline Windows | Recommendation |
| --- | --- | --- |
| Electron + bundled Node backend | Bundled Chromium gives own window/printing; Node sidecar preserves server routes, React server behavior and SQL services. Larger distributable and security-update duty. | Preferred feasibility candidate, not committed framework. |
| Tauri/WebView2 + Node sidecar | Smaller shell possible; WebView2/runtime/Rust/sidecar lifecycle adds compatibility work. Standard Next.js Tauri integration uses static export, which cannot itself host this REST/server design. | Alternative only if sidecar/printing/offline installer tests justify complexity. [Tauri Next.js guide](https://tauri.app/start/frontend/nextjs/) |
| Browser/PWA shortcut | Earlier questionnaire Option B, retained solely as historical comparison. | SUPERSEDED by final installed all-in-one P12 A; not an active deployment option. |

P12 installed all-in-one Option A is CONFIRMED; earlier questionnaire browser Option B is SUPERSEDED without inventing its reason. Use a signed Windows installer candidate, separately test portable hybrid Remote Admin EXE. Do not promise a single installer-free self-contained EXE until a clean Windows machine test proves dependencies and writable data paths.

- Bundle pinned compatible Node 24 runtime, Next standalone server, static/public assets, native SQLite driver and local assets. Using an independent Node sidecar avoids assuming Electron's embedded Node/native ABI matches the app. Verify license redistribution, runtime patches, Windows architecture and relocatability. Existing installed Next output guidance warns standalone does not automatically include public/.next/static; some Windows junction outputs may not relocate. Packaging must check actual artifacts, not rely on dev machine.

Part3O hosting update (11 November2026): the tested direct loopback HTTPS foundation selects supported Next custom-server APIs with a NORMAL production build. This supersedes the standalone-server candidate in the preceding proposal for this host: custom files are not traced into standalone output and runtime rejects standalone/export artifacts. Future packaging must separately compile the private Node/server-only host, bundle normal Next assets/dependencies plus pinned Windows native SQLite, and verify relocatability, TLS/key custody and clean-machine Electron lifecycle. Nothing is packaged/installed or production-auth enabled by Part3O. See [host contract](../../web/src/server/hosting/README.md) and [focused report](AUTH_B1B_PART3O_LOCAL_HOSTING_REPORT.md).
- Stable per-Windows-user data proposal: %LOCALAPPDATA%\SalamTech\ShopPOS\{shopId}\data\shop.sqlite, plus restricted keys/, backups/, recovery/ and logs/. Never installation directory, resources/app.asar, .next, USB or temporary portable extraction folder. One designated Windows account; cross-account operation requires separately approved service/ACL design.
- Startup: single-instance lock -> protected config/key access -> authority/schema/quick checks -> controlled migration if approved -> Node backend -> readiness probe -> owned window. No npm/dev server/build at shop startup. Failure presents recovery/status, never initializes empty business data automatically.
- Child process exit/crash: supervisor marks disconnected, restarts with bounded attempts and startup checks. UI retains unresolved key and rechecks outcome; no duplicate replay with new key.
- Closing window policy proposed: explicit Quit Shop stops remote admission, drains current transactions, safely closes DB and jobs; backup/upload may resume next launch. Optional tray/background mode only if owner understands laptop must remain running for remote/backup. No hidden permanent Windows service/task installed in this phase.
- Graceful shutdown: reject new writes, drain in-flight short transaction, persist jobs, close reads/writer, optional idle checkpoint, stop backend, release lock. Unexpected OS termination uses WAL recovery; never force-delete journal files.
- Electron renderer sandbox=true, contextIsolation=true, nodeIntegration=false, webSecurity enabled; minimal allowlisted IPC, validated sender/origin/arguments, no arbitrary shell/file API. Block unknown navigation/new windows, deny unneeded permissions and remote content in privileged windows. Update Electron/Chromium promptly. [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- Local TLS/bootstrap/cookie plan must pass section 8 security gate. No firewall opening by default; no driver/virtualization change. Remote tunnel separately authorized.
- Printing: saved receipt after committed sale, existing ordinary and 80 mm layout; restricted print action through OS-installed printer, explicit printer choice/paper/margins, Unicode/PKR/cut and long receipt tests. Cancel/failed printing never creates/refunds a sale. Physical printer validation required; no raw driver installation now.
- Updates: signed/authenticated artifact, offline update option, maintenance window, verified pre-update backup, reviewed versioned migrations; refuse incompatible downgrade. Do not auto-install during transaction. Signing identity/certificate costs require future owner approval.
- Uninstall retains business data/backups/key references by default and clearly states location; data deletion is a distinct authenticated, backed-up, explicitly approved procedure. Remote logout removes cached access, never shop data.

Feasibility acceptance BEFORE package commitment: current Next routes/SSR on isolated Windows with bundled runtime, SQLite BigInt/native binary/backup availability, Better Auth protected storage, TLS/session/CSRF, offline fresh start, printing, child crashes and signed-update strategy. No EXE is built in this task. Installer must integrate scheduler/status,30-minute/closing backup, connected USB copy/Admin export, private cloud transport and guided USB/cloud import/restore, migration/recovery supervisor and both role accounts. A new compatible laptop installs the same artifact, then owner-authorized restoration recovers records/configuration WITHOUT separate Node/Chrome/SQLite installation. Printer selection, USB identity and cloud/device enrollment may need reconfiguration.

## 13. Exact sequential implementation phases

B labels subdivide existing master backend Phases 4-9; they do not restart frontend Phases 1-3. Every phase requires a brief bounded implementation plan, actual evidence and owner/mentor review before the next. No blanket approval to execute the list.

| Order | Module and dependencies | Independent acceptance before next |
| --- | --- | --- |
| B0 | Reconcile final P01-P12 decisions (this documentation task) | Confirmed/provisional/pending/superseded states recorded throughout; owner/mentor reviews narrow gates. No code authorized. |
| B1a | FIRST separately authorized module: disposable Windows SQLite driver/transaction/durability prototype, not production schema | Pinned driver/Node/native SQLite version, BigInt/STRICT/FK/WAL/FULL/busy, concurrent/retry/kill/reopen/backup/integrity checks on TEST-only data. No production credentials, money policy, full migrations/cloud/EXE. P02/P08 need not be settled for this bounded experiment. |
| B1b | Reviewed production schema/auth-adapter foundation (master4) after affected gates | Whole-pack/variant/two-role constraints; exact generated protected auth mapping and SQL migrations. Money/cash tables finalized only after P02/P08. Real isolated-file constraint/migration/recovery tests; no live shop data. |
| B2 | Exactly-two-role auth/rotation/recovery and bounded Admin grants (master4) | Selected role+its password only; disabled signup/provider bypass, secure offline sessions, Admin-only credential rotation, no employee attribution; grant expiry/intent binding/one-use/rollback/replay privacy tests. |
| B3 | Variant catalog/opening stock and codes (master5) | Small/Medium/Large/XL separate IDs/codes/stock/cost/normal price, similar-name disambiguation; wholePACK/BOX only, no conversion; atomic opening, retries/archive/privacy, no demo import. |
| B4 | Receiving, repricing, stock count/movements (master 5) | Receipt+20 once; Option A preserves old snapshots; stale counts reject; ledger reconciles; controlled receive-cost policy. |
| B5 | Calendar carry + rounded multi-line sales/payments/receipts (master6), after P02/P08 cash gate | Correct whole-package/P02 calculations and post-discount per-line cost floor; zero/no override, original snapshots, Tuesday auto-roll independent of Monday close, contention/idempotent lost response and shared-S privacy. |
| B6 | A-only invoice corrections/history/audit (master7) | Existing line qty/price/discount with original revision preserved, actual cash delta/date, floor interpretation resolved; no replacement or correction after returns; historical closing immutable. |
| B7 | Admin-authorized cash refund and A inspection (master7) | Shared S only exact consumed grant/A direct, original-final-paid cumulative partial/full refund, no double payment/COGS, pending no stock, sellable restock only reverses original COGS; damaged loss not double expense. |
| B8 | Shared new expenses; authorized revisions/void and net-profit queries (master8) | Shared S creates; later exact Admin grant or A required, no employee ownership, actual cash/funding/date and once-only profit effects; no purchase/drawing deduction. |
| B9 | Dashboard, Stock Value, reports/product history (master 8) | All drilldowns share definitions/periods; no multiplied joins; indexed queries measured on agreed data volume; complete/unknown handling. |
| B10 | Calendar Daily Closing and timed cash observations (master8/9), P08 procedure approved | Monday confirmation Tuesday retains Monday metrics/real timestamp; Tuesday flows excluded and continue; late-count reconstruction/source cutoff, explicit once-only variance bridge and immutable closing/backup job. |
| B11 | Required local/USB recovery integrated services (master9) | Every30min +closing, daily connected approved USB, A manual export/Backup Now/guided import/restore; two independent owner key copies tested and isolated other-Windows restoration; generation retirement. |
| B12 | Private encrypted cloud backup transport/retention (master9) | Every verified scheduled snapshot auto-queued when online, RLS least privilege/no service-role EXE, failure/quota retry, real status, copy/key recovery and retention measured; P11 provisional until these pass. |
| B13 | APPROVED hybrid remote projection + command module (master9 extension) | Live local authority; offline complete last-sync view; details/price-only queue; transactional ordered outbox, hosted RLS/MFA/leases/dedupe/version floor, pending never APPLIED, conflicting/old-generation commands reject; cost/capacity accepted. |
| B14 | CONFIRMED installed all-in-one Windows target, Electron candidate (master9) | Clean compatible Windows installation WITHOUT separate Node/Chrome/SQLite; integrated login/database/scheduler/USB/cloud/guided recovery, native/runtime/printing/update/shutdown/uninstall; separate remoteEXE. Browser B superseded. |
| B15 | Capacity/failure rehearsal, opening import, training and separately approved rollout | Reconciled owner-verified opening records, real backup/recovery evidence, agreed performance, critical risks closed, actual client/hardware acceptance and maintenance window. Logo last if separately supplied/approved. |

B1a tests snapshot mechanics on disposable data; operational backup/key mechanisms are designed in B1b and available to protect any real pilot data before it is entered; B11 completes operational drills. Development uses isolated test files, never uncontrolled real sales before recovery/security acceptance. Each phase has focused unit/domain + actual SQLite integration + REST and affected UI verification; do not re-run every suite/build for every documentation change.

## 14. Security, failure and performance acceptance

These are PLANNED tests, not outcomes. Existing frontend evidence (previously reported 175 unit/component cases, 17 browser cases, TypeScript/ESLint/production build passed) is preserved, not rerun or claimed as backend certification.

| Scenario / phase | Real integration or physical test | Pass criterion |
| --- | --- | --- |
| Offline operations B2-B10 | Disable WAN before fresh app/login, sale, refund/expense/report | Local committed records survive restart; cloud retries do not block cashier. Server off is honestly unavailable. |
| Multi-item atomicity B5 | Inject failure after each insert/deduction in real file-backed DB | No partial sale, receipt, cash, audit or stock effect; all lines commit or none. |
| Duplicate/response loss B5/B7 | Concurrent same key, changed payload, kill response after commit then retry | Exactly one effect and stable authorized outcome; mismatch rejected; no new key on uncertainty. |
| Stock contention B4/B5 | Two independent DB connections/process requests for last unit; receipt/reprice/count races | Only allowable stock success; never negative; cost snapshot agrees with serialized order; stale count rejected. |
| Discounts/floor B5 | WholePACK/BOX quantities; automatic discount tie/rounding policy, at-cost/below-cost, rounding allocation/overflow, zero/100%, cost reprice race | Final every line>=current authoritative applicable cost, no cross-line subsidy/override; original totals/cost preserved; correct display without .00 where exact, no float/ordinary fractional-discount rejection. |
| Refunds B7 | Partial then remaining/full, concurrent returns, altered line IDs, prior-refund bounds, after correction | No over-return/refund; original-paid residual correct; pending no stock; disposition once; cost/revenue reconcile. |
| Expenses/cash B8-B10 | Counter-paid/owner-paid, purchases/drawings, revisions/voids, complete empty vs missing | Net profit subtracts operating expenses once; cash movement source/sign correct; unknown never zero. |
| Daily Closing B10 | Monday23:50/Tuesday00:10, Monday confirmedTuesday00:30, concurrent Tuesday sale, actual later count and incomplete/unrecorded flows; restart/multiple awaiting dates | Exact calendar financial attribution, real count/confirmation cutoffs, Tuesday not blocked by Monday; reconstruction honest, variance bridge once, no duplicate shortage/carry or expense. |
| Restart/crash B1/B5 | Kill process before/after COMMIT, restart, original-key retrieval | Before none / after complete; UI unconfirmed until resolution. Real power-loss drill only on isolated test hardware/data. |
| Disk full/corruption B1/B11 | Controlled small test volume, bad DB/snapshot, locked file/open handle | Safe maintenance/error, no empty replacement/no acknowledged partial write, preserved recovery evidence. |
| Migrations B1/B11 | Empty/prior schema, checksum mismatch, failure halfway, crash at promotion | Rollback/verified recovery; no app against incompatible schema or automatic data loss. |
| Backup/restore B11-B12 | Corrupt bytes/tag, wrong/missing key, newer schema, interrupted copy/upload, missing external drive | Reject invalid archive, preserve last good/current DB; truthful independent local/cloud/restore statuses. |
| Cloud failure B12 | No internet, revoked JWT, forbidden prefix/delete, quota, paused project, ambiguous completed upload | Sales unaffected; scoped access denies attacks; bounded retries/recovery, no fake success. |
| Destroyed laptop B11 | New Windows user/machine, external/cloud kit only, old generation retired | Decrypt, reconcile invoices/ledgers/auth recovery, revoke restored sessions, measured loss window/RTO, one authority. |
| Authorization B2 onward | Select ADMIN with S password, forge role cookie, provider signup/admin routes, shared S direct refund/expense edit, altered/expired/consumed grant, rollback/replay | Exactly two accounts, no privilege rise; restricted mutations require same-intent one-use A grant, rollback safe and committed replay works; costs/profits/stock/keys never in S outputs; audit names shared role only. |
| Session/origin attacks B2/B14 | CSRF, DNS rebinding, forged forwarded headers, malicious browser/local requests, logout/back | No mutation/session theft through allowed test vectors; explicit same-user OS risk documented. |
| Hybrid remote B13 | Offline last-sync view, every forbidden queue field/type, cost/version changes, replay/claim expiry/cancel race, out-of-order/hash-mismatched batches, ack loss, replacement | Only product details/normal price apply once through local validation; no false APPLIED/cancel, no stale generation or gap publish; owner-only projection complete, no backup-as-sync/second writer. |
| Size variants B3-B5 | Same name Small/Large with distinct IDs/codes/prices/costs, concurrent selling/receiving and refund; fractional/loose requests | Correct variant stock/cost snapshots only; category not size, no cross-size deductions or implicit conversion. |
| USB/key custody B11-B14 | Automatic daily approved-drive copy, absent/wrong/removed drive, manual A export/S attack; independently recover using each of TWO key copies | Verified encrypted archive/status, no plaintext keys/staff export, guided restore on new Windows without separate runtimes; real data/config preserved, device/printer enrollment honestly reconfigured. |
| Printer/desktop B14 | Actual intended Windows printer, long ordinary/80mm receipt, cancel/reprint, fresh machine/offline | Readable correct saved receipt; no duplicate sale; packaged native/runtime/startup and uninstall work. |

Performance is measured, not a promise that growth never matters. Proposed benchmark tiers: 10k products, 100k then 1m sale headers with realistic multi-line/return/expense/audit history, on client's actual laptop class. Initial target p95 product search <=300ms, sale commit <=1s, ordinary day/month report <=3s under one cashier plus concurrent Admin/report/backup load; approve P12 and record disk/RAM/runtime/DB size, WAL, queue latency and test seed. One million headers with lines/snapshots/backups may exceed Free cloud capacity and slow wide reports.

Plan keyset pagination on (business_date,recorded_at,id) and product history keys, exact code equality index, normalized name-prefix index. Page cursors carry filters and stable ordering, not an implicit multi-request database snapshot. Each response has its own asOf/sequence; if a complete cross-page report must be consistent while data changes, materialize a bounded server snapshot or restart at a new sequence. Never hold a read transaction across user navigation.

Current UI uses substring name/code search; benchmark it explicitly: if prefix restriction harms approved behavior, evaluate indexed FTS5 with tested tokenizer/substring behavior and minimal query length rather than silently removing search capability. LIKE '%text%' is not magically indexed.

Use EXPLAIN QUERY PLAN, realistic data, bound chart points (e.g. <=366), limited ranges, BigInt-safe aggregates and independent summary totals. Add rebuildable daily/product rollups only after evidence of slow queries, update them in the same source transaction, reconcile against immutable events and invalidate by committed operation sequence. No cache used to accept sales/stock. Long reports/snapshots must not starve writer/checkpoint; monitor queue/WAL/free disk and backup growth. Do not prune history to make tests fast or call SQLite infinitely scalable. Revisit DB/server architecture if measured workload exceeds single-writer limits; no silent migration.

## 15. Final client-decision register P01-P12

CONFIRMED means scope/policy direction accepted by latest owner brief, not implemented or tested. PROVISIONAL requires stated evidence. PENDING names only a remaining narrow decision. SUPERSEDED alternatives are not implementation options. Original historical source documents stay preserved.

| ID | Final status and decision | Remaining gate, without reopening settled scope |
| --- | --- | --- |
| P01 | CONFIRMED: whole PACK/BOX only, no fraction/loose/strip/conversion. Different sizes are independent variants. | Future conversion DEFERRED, not a current database/prototype blocker. |
| P02 | OWNER APPROVED: whole-PKR prices/charges/cash/refunds; whole-percent item discount; HALF_UP FINAL payable; cumulative whole-PKR refund. | FINAL OPTION2 and coordinated TEST36 schema approved; production remains disabled. No paisa-cash/discount-first or second invoice round. |
| P03 | CONFIRMED: similar names allowed; Small/Medium/Large/XL variants each own ID/code/size/stock/cost/normal selling price. Category!=size. | Mandatory generated code and variant snapshot constraints in catalog foundation. Receipt-cost divergence D05 remains separately before receiving, not an unresolved variant decision. |
| P04 | CONFIRMED: final effective line amount after discount/rounding >= applicable buying cost; at-cost allowed. Zero/zero-total and below-cost Admin override prohibited. Earlier allow-below-cost A is SUPERSEDED. | Narrow correction-floor interpretation of original vs today's cost (proposed max) before B6; never reopen permission to sell below cost. |
| P05 | CONFIRMED OPTION A: A-only existing line qty/price/discount corrections; original/revisions/audit, stock and actual cash delta, no rewrite of closed day, no ordinary correction after returns/refunds. | Test original-cost correction math/current-floor interaction and event-date cash settlement before B6; no full invoice/product replacement. |
| P06 | CONFIRMED OPTION A: refund reduces revenue; COGS reverses only on A-approved sellable restock; pending inspection/no auto stock; damaged cost remains loss without duplicate expense. | P02 original-final-paid cumulative refund math and one-time authorized refund/restock tests before B7. |
| P07 | CONFIRMED: shared S creates sale/new expenses, sees safe shared history/search; refund and expense revise/void require secure exact Admin authorization. Sensitive financial/stock/settings/restore/closing remain A-only. | Implement/test bounded single-use grant before restricted S actions. No employee accountability/standing S privilege. |
| P08 | OWNER APPROVED Option A: Karachi midnight; next-day sales continue with prior close pending; Admin late count accounts signed cutoff-to-count flows and preserves history. | Count evidence/schema pending; variance/opening-cash/write-off/reset not authorized. |
| P09 | CONFIRMED: exactly ADMIN and shared SALESPERSON role accounts, selected role+matching password, one password each; server authorization and rotation/recovery. Individual staff schema/chooser SUPERSEDED. | Library fixed-account facade, disabled signup/provider bypasses, role/session and protected token compatibility before real auth, not a new business identity choice. |
| P10 | CONFIRMED HYBRID: live authoritative access online; last-synced cloud view offline; ONLY product details/normal selling price queue. Stock/financial/cash/refund/closing never offline queued. Direct-only/no-queue recommendation SUPERSEDED. | Later hosted projection/command API/RLS/MFA/cost/provider/schema acceptance. No backup-file-as-sync shortcut or second shop writer. |
| P11 | PROVISIONAL approved A: 30-minute local + closing backups, automatic verified encrypted private cloud upload, daily connected-approved USB copy, A Backup Now/export/guided restore, two independent owner key copies. | Retention/quota/security/portable key custody and actual other-Windows-laptop restore must pass before production-ready. Scope settled; timings not an availability guarantee. |
| P12 | CONFIRMED OPTION A: one installed all-in-one Windows POS, separate Remote Admin EXE; Electron+Next/Node+SQLite candidate subject to compatibility. Earlier questionnaire browser B explicitly SUPERSEDED by final owner clarification; no reason for that answer invented. | Offline clean-machine install without separate Node/Chrome/SQLite, safe startup/migrations/USB/cloud/guided recovery; printer/device/cloud enrollment may require reconfiguration. No packaging now. |

No tax engine, pack conversion, employee provisioning, below-cost override or uncontrolled cloud writer is authorized. Business expense funding default, stock-loss valuation and precise import/retention targets are affected-module details, not reasons to re-open approved P01-P12 choices or block a disposable driver-only prototype.

## 16. Minimum remaining gates, production risks and review evidence

### Before the FIRST isolated SQLite prototype (B1a)

Only a separately authorized bounded task is required: approve candidate pinned SQLite driver/runtime compatibility investigation, disposable test-data directory and preservation/test boundaries. Current whole-pack/variant/two-role decisions are settled. Verify actual embedded SQLite patch level, Node24/Windows native compatibility, 64-bit BigInt, STRICT/FK/WAL/FULL/busy settings, transactions, file backup/integrity/restart behavior. Use no production users, real business data, money policy implementation, full accounting migrations, cloud or EXE.

P02/Q1/Q2/Q3/D05/P08 are APPROVED12 November. FINAL OPTION2 and the preserving TEST36 Sales contract are approved; Closing-specific evidence/variance authority does not block independent Sales. Approval is not a service or production migration.

### Before affected production foundation/services

- Sales: implement and verify only the approved preserving TEST35-to36 contract and per-unit OPTION2; do not reopen approved whole-PKR/refund choices or activate production.
- Closing: implement approved signed-flow reconstruction with trustworthy count/cutoff/completeness; separate authority before variance/opening-cash adjustments. Midnight dates and continued sales are settled.
- Authentication B1b/B2: library schema/fixed-two-account facade, no provider route bypass, secure storage/session/role rotation and recovery; minimal role selector connection approved, no employee-account decision needed.
- Catalog/receiving B3/B4: D05 atomic incoming-cost receive/reprice APPROVED; integrate/test without historical migration/sold-cost edits. Conversion remains deferred.
- Corrections B6: cost-floor interpretation with original COGS and current cost; actual cash evidence/event-date delta tests. No below-cost override or post-return edit.
- Remote B13: hosted projection/full-history capacity, command scopes, provider/cost/terms, RLS/membership/MFA, ordered delivery/restore-generation fencing. Hybrid scope settled; no deployment authorized.
- Recovery B11/B12/B14: retention and quota budget, TWO independently protected key copies/portable data keys, approved USB identity, owner recovery proof and actual new-Windows restore; old authority retirement, cloud queue/projection recovery, no separate runtime installs.

Known release risks: hostile same-user/Windows-admin access, shared-account lack of employee attribution, price-floor inference from repeated allowed price attempts, unrecorded physical cash around midnight, rounding/correction ambiguity, disk loss/full/corruption, missing key custody, stale cloud data/Free limits, lost command acknowledgments, old offline laptop clone, native binary/printer/update compatibility. Measures require real tests; no guarantee of unlimited scale, hardware durability or permanent free cloud service.

Latest review is DOCUMENTATION ONLY: existing uncommitted architecture/memory/plan work retained and reconciled, original SRS/contracts/code/fixtures preserved. Check document cross-references, table/API/role consistency, superseded-rule residue, whitespace and Git scope; record actual checks in memory. Historical frontend results (175 unit/component,17 browser, TypeScript/ESLint/build) remain previously reported, not backend evidence; no application tests/build are needed or newly claimed here.

Actual reconciliation verification:16 main sections;43 local logical tables and6 hosted projection/command tables;95 unique endpoint contracts;21 valid Markdown table layouts;12 current/source local links across affected documents resolved; balanced fences and whitespace checks passed. A raw-byte aggregate comparison confirms all261 protected tracked files outside the four authorized documents unchanged from task start. These are documentation/scope checks, NOT backend integration results. Git index is empty and approved frontend HEAD unchanged.

Official implementation references are linked beside technical claims and must be rechecked for selected package/provider versions. SQLite STRICT does not replace cross-row/service constraints: [SQLite STRICT tables](https://sqlite.org/stricttables.html).

STOP for owner/mentor review. No implementation, dependency install, SQLite file, migration, auth/cloud provisioning, UI change, fixture change, logo, EXE, staging, commit or push in this reconciliation task.


Current TEST-only delivery/evidence: [Sales36 implementation report](SALES_SCHEMA36_COORDINATED_TEST_IMPLEMENTATION_REPORT.md).64 distinct checks pass across recorded runs; scoped TypeScript/zero-warning ESLint and final isolated build pass. Production remains disabled.
