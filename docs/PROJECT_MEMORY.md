# Shop POS — project memory and new-chat handoff

Snapshot: 9 November 2026, Asia/Karachi. Client-approved frontend FROZEN; owner has authorized the single local checkpoint containing this entry. This checkpoint task changes documentation only. This is a continuity summary, not permission to start a new module or a substitute for the SRS, confirmed owner amendments or live source code.

## 1. Read this first

- Project root: D:\pos. Next.js application: D:\pos\web. Shared documentation stays at the repository root under docs/.
- Goal: a production-oriented, single-shop retail POS, products, inventory, stock, sales, expenses and profit system that works without public internet while the local shop server and LAN are running.
- Current reality: extensively implemented frontend/demo previews with tested pure helpers. There is NO production database, real authentication/authorization, durable sale/refund/expense processing or real inventory ledger yet. Never describe the demo as a functioning production POS.
- All optional frontend visual changes are FROZEN after client approval. Backend integration may add necessary data connections, validation/error states and wiring, while preserving approved screens and flows. A new optional redesign requires separate owner authorization.
- Read [AGENTS.md](../AGENTS.md), any nested instructions (notably [web/AGENTS.md](../web/AGENTS.md)), [the implementation plan](IMPLEMENTATION_PLAN.md), [the module checklist](MODULE_CHECKLIST.md) and the relevant original requirements before implementation. The installed Next.js documentation must be consulted as instructed by web/AGENTS.md.
- The [original SRS](<requirements/Software Requirements Specification.docx>), [canonical development guide](development/POS_Complete_Development_Guide.md), [UI specification](design/POS_UI_UX_Prototype_Design_Plan.md) and [HTML prototype](design/POS_UI_Prototype.html) are present, readable and preserved. DOCX extraction has succeeded. Do not guess or rewrite their contents.
- Several earlier sections in the implementation plan/checklist and older reports are dated historical snapshots. They can describe superseded UI such as a global discount, Demo Tools hub, username Login, old developer number or manual investment entry. Use the latest confirmed owner changes and actual code for current presentation; preserve historical planning. Do not silently translate a demo choice into a final production policy.

## 2. Git state and immediate continuation

- Branch: master. Approved freeze checkpoint: the commit containing this entry, with subject chore: freeze approved POS frontend before backend development. Resolve its exact ID from Git; a commit cannot embed its own hash.
- Parent / prior frontend baseline: 6680d62d5a62936313c86cfedd34a8a54cf319bb (chore: finalize approved POS frontend and create backend baseline). Do not reset to it.
- The owner explicitly confirmed client approval of the frontend and authorized ONE local checkpoint. The reviewed scope is 55 pending files: the latest report's 41 plus 14 inherited continuity, per-item discount/receipt and associated test files. No files were staged at the start.
- Per-item discounts, Stock Value, simplified expenses, closing cash summary, invoice-level partial/full returns and disabled Backup & Restore UI are included in the approved frozen baseline. Earlier statements about pending visual approval describe historical delivery status and are superseded by this owner approval.
- Client logo integration is deferred until the final stage. Do not add or substitute AL.MADINA artwork now.
- This task performs documentation/Git review only. No application feature, dependency, backend, database, migration, Supabase connection, EXE or deployment is changed; no remote push is authorized.
- Preserve ignored local data/evidence. Never reset, clean, stash, force-checkout, amend or discard work. Future tasks must inspect live Git status before editing.

## 3. Current feature and route map

All business operations in this table are mock/read-only/temporary previews unless explicitly described as browser display preferences.

| Area / route | Implemented frontend behavior and limitations |
| --- | --- |
| Entry / and /login | Root opens Login. Configured shop name; password-only Open Shop preview, Show/Hide, validation/loading/unavailable states, clearly labeled Admin/Salesperson demo links. Password starts empty and is discarded, never verified, sent or stored. No automatic role selection or fake login. |
| Shared workspaces | Responsive Admin and Salesperson shells, navy navigation/header, Light/Dark/System themes with persistent preference, keyboard focus, local-server connectivity indication, green page-level Back arrows. Far-right outlined Back to Login uses the existing unsaved-input confirmation. Navigation is not logout/session security. |
| Salesperson /pos | Make a Sale: search by supported product name/code, Enter-to-add, repeated selection increments the same line, quantity steppers/direct entry, editable price, soft-red remove, optional customer details, Create Invoice, Cancel Sale and unsaved-work protection. Temporary fallback prices remain examples. No saved sale or stock deduction. |
| Per-item discounts — client-approved, frozen | Every new cart line has its own editable Discount %, initially 0. The old bottom/global input is removed. Each discount applies to the current entered selling price; quantity, price and discount survive repeat-add and Edit Sale. Independent line totals sum exactly to invoice total. Invalid inputs block invoice creation. |
| Sale receipt | White shared invoice paper, configurable shop/customer/message details, original entered rates, actual final line amounts, compact secondary per-item discount lines, totals, optional cash/change, Print / Done / Edit Sale. Ordinary page and 80 mm layouts. Print output includes fixed SalamTech credit and excludes navigation/edit controls. Edit Sale edits an UNSAVED draft, never historical records. |
| Salesperson /pos/history | Compact Invoices table: Invoice, Date / Time, Customer, Total, Action. Reference search and optional product/date Filters disclosure. Eight original sample sales from 2 November 2026; missing time/customer/official number are not invented. View opens a read-only historical receipt; no Edit Sale. Checkout previews are not appended to history. |
| Salesperson /pos/returns — client-approved, frozen | Visible Return & Refund with exact invoice selection; all recorded lines appear in a compact selectable table. Partial return, Select All Remaining Items, Clear Selection, individual quantity controls and combined cash refund use original paid amounts/prior returns when known. No visible condition field; review is an unsaved dialog, with goods pending inspection and no stock/cash effects. |
| Return/refund data safety | New pure helper uses a reliable original line paid amount or explicitly recorded line discount; never today's price. It checks trusted prior returns when provided, caps remaining quantity/payment and preserves exact partial-return allocation. Unknown payment data or sub-paisa allocation produces Unavailable. All eight ORIGINAL sales lack sufficient paid/discount snapshots, so their cash refund is intentionally unavailable. Known paid/discount/prior-return examples exist only in isolated tests, not added business fixtures. |
| Salesperson /pos/expenses | Existing centered Add Expense form; required positive exact PKR Amount and short Reason, automatic current Asia/Karachi date, no category/date-entry controls. Top-right View Expense Summary opens a dialog with selected-date daily totals, selected-month totals, entries and existing correction/removal/reset controls. Duplicate-submit protection. Entries are PAGE-LOCAL, clear on leave/reload and do not synchronize with Admin. |
| Admin /admin/dashboard | Grouped Sales & Profit cards (revenue, gross profit, expenses), Inventory cards (products, available stock, low stock) and one Stock Value card, with related drilldowns and Close Day navigation. Fixed business examples, not live today. Missing shared expenses/current purchase data remain Unavailable / Not available. |
| Admin /admin/products | Separate compact product cards, name/code search, price/status/stock information and Add/Edit/Stock actions. Seven shared inventory examples. Product identity/unit metadata where supported. Add Stock and stock correction are demo proposals; Stop Selling / Resume Selling are demo interactions. No real catalog or inventory mutations. |
| Admin /admin/products/new and /admin/products/[productId]/edit | Centered forms within main content area; validated product name, buying price, optional suggested selling price, quantity/threshold and supported optional identity fields. Purchase-price edits are proposals; existing records, historical costs and profits are not rewritten. Current mock validation is not a final production pricing/quantity policy. |
| Admin /admin/inventory/available-stock | Inventory overview: overall stock/product totals, product-name search and All / Available / Low stock / Out of stock filters, read-only quantities/thresholds/statuses. Overall totals are separate from filtered results. |
| Admin /admin/inventory/low-stock | Shared fixture-derived low-stock list, including zero-stock Toothpaste as Out of stock. Inclusive threshold rule. Inventory navigation active. |
| Admin /admin/reports | Simple Sales Report / Profit Report entry. /admin/reports/sales and /admin/reports/profit provide period controls, summaries, product comparisons and details. Existing /admin/sales/today and /admin/profit/today remain supported. Search/product/date filtering, valid empty periods and invalid-date behavior are implemented. Never fabricate dates/data for attractive charts. Chart visual design remains deferred pending shopkeeper feedback. |
| Admin /admin/expenses | Read-only selected-day/month expense review and details; no duplicate entry form. Shared durable entries do not exist yet, so do not pretend Salesperson's temporary entries appear here or invent expense amounts. |
| Admin /admin/investment | Visible Stock Value page and sidebar name; one Total Stock Value card, View Product Details disclosure with seven product rows. Missing current buying costs show Not available — buying costs not recorded. Historical purchase/investment helpers remain intact but cumulative investment is removed from visible UI. Internal route preserved. |
| Admin /admin/settings | Browser-local public shop name, phone, address, receipt message and supported paper layout; configured shop identity appears on Login/shared branding/new previews. PKR fixed. Separate disabled password-management previews, 8–128 characters without composition rules; no password persistence/change. Compact Backup & Restore state: local/cloud backups Not configured, Supabase — Not connected, both actions disabled. |
| Admin /admin/daily-closing | Existing six cards/date/Closing design preserved; new Counter Cash Summary and temporary Actual Cash input. Missing recorded opening cash/cash flows keep expected cash/difference unavailable. Read-only review and disabled durable confirmation. No reset/deletion of shop records and no real closing/backup execution. |
| /api/health | Advisory application liveness/connectivity endpoint. It does not prove database/auth/transaction readiness. |
| Separate demo/ HTML | demo/shop-pos-showcase.html is a standalone offline showcase with template and build/verification scripts. It does NOT replace Next.js or the original docs/design/POS_UI_Prototype.html. It was not updated for the latest per-item/refund task; do not assume it mirrors every recent app change. |

Admin navigation: Dashboard, Products, Inventory, Reports, Stock Value, Daily Closing, Settings. Salesperson navigation: Make a Sale, Sales History, Return Item, Shop Expenses. There is no Demo Tools navigation hub. Legacy /admin/demo redirects to Dashboard; its /returns, /expenses and /investment bookmarks redirect to the relevant current routes.

## 4. Financial, stock and privacy invariants

Preserve the historical fixture, not just its displayed total. Do not change records or invent costs to make a test pass.

| Invariant | Value |
| --- | --- |
| Fixed historical business day | 2 November 2026, Asia/Karachi |
| Products / available stock / low-stock entries | 7 / 123 units / 3 |
| Original sales / units sold / distinct products sold | 8 / 42 / 6 |
| Historical revenue | Rs. 25,690.00 |
| Explicitly fictional demo historical COGS | Rs. 20,550.00 |
| Explicitly fictional demo gross profit | Rs. 5,140.00 |
| Diapers revenue / gross profit | Rs. 7,499.50 / Rs. 1,299.50 |
| Diapers suggested selling price | Rs. 1,250.00 |

Inventory quantity / threshold: Diapers 5/5; Milk Powder 3/5; Baby Wipes 20/5; Hand Soap 30/8; Rice 40/10; Shampoo 25/5; Toothpaste 0/5. Zero is Out of stock; positive quantity <= threshold is Low stock; quantity > threshold is Available. The low-stock count includes zero-stock products.

- Money: exact decimal strings and BigInt minor-unit arithmetic. Selling prices allow at most two decimals; never silently round/truncate an invalid price. Existing demo discount policy allows 0–100% with at most two percentage decimals; discounts needing fractions of a paisa are REJECTED rather than silently rounded. Existing no-discount fractional-quantity examples can retain sub-paisa totals. These preview conventions do not finalize production quantity/rounding policy.
- Latest examples: 1 x Rs. 1,250 at 10% = Rs. 1,125; 1 x Rs. 800 at 5% = Rs. 760; combined Rs. 1,885. Edited Rs. 1,200 at 10% = Rs. 1,080. Catalog prices stay unchanged.
- Historical sale costs/profits are immutable snapshots. Confirmed SRS Option A: an Admin current purchase-price change applies to all REMAINING inventory, not previously sold inventory. Receiving new stock at a different cost still requires its separate policy decision. Do not introduce FIFO/weighted-average costing contrary to that rule.
- Gross Profit = Net Sales Revenue minus COGS. Net Profit = Gross Profit minus approved recorded operating expenses for the SAME period. Deduct each expense once; do not double-count inventory purchases after COGS. Incomplete/mismatched data means unavailable, not assumed zero. Never subtract current-day temporary expenses from 2 November demo gross profit. See [expense accounting contract](development/EXPENSE_ACCOUNTING_CONTRACT.md).
- Latest return UI has no condition field. Future returned goods default to pending inspection; only a separate authorized disposition may restore sellable stock. Legacy condition helpers/contracts remain for history. No preview changes stock. Real cumulative return limits require durable records and transactions.
- A lost sale response is UNCONFIRMED, not proof of failure. Resolve using the ORIGINAL request/idempotency key. Never retry a replacement sale with a new key merely because the response was lost.
- Salesperson must not receive stock quantities, buying costs, profit or Admin-only data through rendered HTML, React payloads, network responses, errors or caches. Current role links are PUBLIC DEMO NAVIGATION, not security. Real server checks remain mandatory.
- No plaintext secrets in browser storage, source, cookies or logs. Browser storage is currently for themes and allowlisted PUBLIC shop display settings, not accounting, credential validation or fake roles.
- Developer branding is fixed, uneditable presentation in both sidebars and receipt/print output, exactly two lines: Developed by SalamTech / AbdulSalam · +92-310-3698984. Do not restore earlier incorrect numbers. Shop name remains independently configurable; never hardcode the client's name because a logo was supplied.

## 5. Important code locations

| Concern | Files relative to web/ |
| --- | --- |
| Checkout / unsaved draft | src/components/pos/record-sale-form.tsx; src/lib/sale-draft-preview.ts |
| Latest per-line discounts | src/lib/item-discount-preview.ts; uses the unchanged legacy src/lib/demo/checkout.ts helper |
| Core price/quantity math | src/lib/pos-preview.ts; src/lib/demo/money.ts |
| Invoice / print / attribution | src/components/pos/draft-invoice.tsx; invoice-presentation.tsx; sale-preview.css; src/components/demo/receipt-preview.tsx; developer-credit.tsx |
| Historical copies / safe DTOs | src/components/pos/historical-receipt.tsx; sales-history-preview.tsx; src/lib/sales-history-preview.ts; src/app/pos/history/page.tsx |
| Latest returns | src/components/demo/admin-return-preview.tsx (legacy name, used by Salesperson); src/lib/return-refund-preview.ts; src/lib/return-condition-preview.ts; src/app/pos/returns/page.tsx |
| Legacy return reference helper | inspectDemoReturn in src/lib/demo/admin-preview.ts remains intact; it does NOT infer paid/refund data |
| Expense entry / pure net profit | src/components/demo/admin-expenses-preview.tsx (Salesperson despite legacy name); src/lib/demo/expense-preview.ts; src/lib/demo/admin-preview.ts |
| Admin-only fixtures / reporting | src/lib/admin/mock-inventory.ts; mock-sales.ts; mock-historical-costs.ts; mock-profit.ts; mock-sales-report.ts; report-chart-data.ts |
| Product / stock / investment helpers | src/lib/admin/product-preview.ts; product-operations-preview.ts; stock-investment-preview.ts; src/lib/mock-suggested-prices.ts; src/lib/product-identity-preview.ts |
| Admin expenses / closing | src/lib/admin/expense-review-preview.ts; daily-closing-preview.ts and corresponding components |
| Shells / safe navigation | src/components/shell/admin-shell.tsx; salesperson-shell.tsx; shared.tsx; safe-navigation-link.tsx; src/lib/workspace-navigation.ts |
| Themes / public Settings | src/styles/tokens.css; src/app/globals.css; src/components/theme/; src/components/settings/; src/lib/shop-display-settings.ts |

New checkout drafts use discountMode=per-item and retain original entered unit price, base total, discount percentage, discount amount and final line total. DraftInvoice retains support for older/global-discount receipt structures. Cash/change must use the FINAL per-item sum, with no second discount. Future saved sale lines must preserve those financial snapshots and a stable line identity for accurate returns; do not infer them retrospectively from today's catalog.

## 6. Development environment and focused verification

Installed frontend stack is defined by web/package.json / package-lock.json: Next.js App Router 16.4.3, React 19.3.0, TypeScript, Tailwind, existing shadcn-style/Radix components, ESLint, Vitest and Playwright. Node engine is >=24.11.0 <25; npm >=11.6.1 <12. Older guide backend tooling is proposed, not proof of installation. Latest owner direction is a pending local SQLite backend, planned private Supabase encrypted backup/restore, secure remote Admin access and Windows EXE packaging. Reconcile earlier PostgreSQL/cloud-mirror proposals during separately approved backend design. Use the lockfile; do not casually upgrade/install packages.

Run commands from D:\pos\web:

- npm run dev — local development (normally port 3000).
- npm run typecheck — Next route type generation plus tsc --noEmit.
- npm test -- tests/unit/NAME.test.tsx — targeted Vitest unit/component tests. npm test is NOT Playwright.
- npm run lint — full lint when warranted; scoped local ESLint is preferred for a small task.
- npm run build — production build when required for the changed code/browser verification.
- npm run start — serve an existing production build.
- npm run test:e2e -- tests/e2e/NAME.spec.ts — targeted Playwright. Current config starts the PRODUCTION server on 127.0.0.1:3100, requires an up-to-date build, does not reuse an existing server, and defines desktop/mobile Chromium projects. Do not change browser configuration to bypass failures.

Latest per-item/refund evidence: 143 distinct focused unit/component cases passed across initial and affected-file reruns; five targeted desktop Chromium cases passed, including unchanged historical receipt totals; scoped ESLint over 23 changed TS/TSX files, TypeScript and ONE production build passed. Browser checks covered keyboard entry, invalid values, draft retention, receipt cash/change and ordinary/80 mm print output, explicit return selection, optional condition, privacy, Light/Dark contrast and widths 320/375/768/1024/1440. Four final checkout/return Light/Dark screenshots were inspected. This is not a claim that every legacy/browser test in the entire repository was rerun or passed.

Local ignored evidence, if still present: test-results/final-three/{unit.json,unit-final.json,changed-files.md,final-source-hashes.json,browser/}. Initial unit.json contains two TEST-HARNESS focus failures; the affected cases were corrected/replaced by the passing unit-final.json. Combine the newest result per test file; do not present the original failed artifact as the final status or add run counts blindly. Latest relevant tests include item-discount-preview.test.tsx, return-refund-preview.test.ts, return-condition.test.tsx, demo-checkout-form.test.tsx, receipt-workflow.test.tsx and tests/e2e/final-three.spec.ts. Broader browser tests had directly affected selectors updated, but were not all rerun in full.

Previous committed checkpoint evidence was 107 focused unit/component and 12 desktop/mobile browser cases, plus lint/typecheck/build. Reuse evidence only if it covers the exact saved source. Avoid repeated complete suites, unnecessary builds, dozens of screenshots and long loops; rerun affected checks after an actual change/failure. Documentation-only handoffs do not need application builds/browser runs.

Manual screen-reader, native zoom, real device and physical printer checks remain open. Browser print emulation does not certify printer hardware. No dependency installation, staging, commit or push occurred in the latest per-item/refund task.

## 7. What real functionality still requires

Master sequence is unchanged:

| Phase | Scope / current state |
| --- | --- |
| 1 | Project Foundation — completed/accepted |
| 2 | Shared Design System, Themes and Shells — implemented and used |
| 3 | Complete Mock Screens and Interactions — many owner-reviewed frontend modules implemented; latest two changes await visual review and logo is blocked; do not invent blanket phase acceptance |
| 4 | Database and Authentication — NOT implemented |
| 5 | Products and Inventory — real operations NOT implemented |
| 6 | Sales Processing and Profit — real transactions NOT implemented |
| 7 | Sales Corrections and Audit History — real corrections/returns NOT implemented |
| 8 | Reports and Analytics — database-backed reporting NOT implemented; existing reports are fixtures |
| 9 | Local Offline Deployment and Final Testing — NOT implemented |

When the owner separately requests real backend work:

1. Recheck source documents, latest owner amendments, live Git state and pending UI review. Preserve the existing frontend; replace data boundaries gradually rather than rebuilding screens.
2. Resolve schema/identity/accounting decisions below and approve a small Phase 4 scope. Password-only presentation must be reconciled with distinct secure Admin/Salesperson identities and Better Auth; no client-side password lookup or shared master password.
3. Select compatible installed-version tooling; then implement local PostgreSQL/Prisma migrations, constraints and secure server authentication/role-safe DTOs with meaningful integration tests. No real shop secrets or automatic ingestion of demo sales as real records.
4. Add products, stock receiving, current-cost repricing and a reconcilable immutable stock-movement ledger in small independently tested modules, with all real input/permission validation on the server.
5. Implement multi-line sale intent/outcome handling, exact money, original financial snapshots, stock/race protection and idempotency inside database transactions. No overselling, duplicate sale effects or new-key retries after lost responses.
6. Integrate recorded returns/corrections, original-paid allocation, stock disposition and audit history; persisted approved expenses and same-period net profit; shared authoritative Admin/Dashboard/Reports/Closing data. Keep Salesperson costs/profits/stock private.
7. Finish durable closing, verified backup/restore and actual LAN/internet-outage recovery testing. See [Settings/closing/backup contract](development/SETTINGS_CLOSING_BACKUP_CONTRACT.md). Do not change Windows drivers, WSL, virtualization, services or deploy merely because the guide mentions Docker Compose. Final Windows local-server packaging remains an explicitly approved deployment task.

Offline means local shop server plus LAN remain operational during an INTERNET outage. It does not promise sales while the server/LAN is down or authorize a browser-only offline accounting queue. No cloud service may be mandatory for core operations.

## 8. Decisions still needed before affected backend code

Read the detailed D01–D16 register in IMPLEMENTATION_PLAN.md / MODULE_CHECKLIST.md. Do not silently select defaults from prototypes.

- D05: new stock at a different buying cost, relationship to repricing all remaining stock, effective dates and purchase corrections.
- D03: allowed integer/decimal quantities by unit, limits and exact money/refund rounding/allocation policy. Existing fractional preview support is not final production approval.
- D07: below-cost/zero prices, overrides and confidential error handling. Different prototype forms currently have context-specific validations; do not unify them into a production rule without review.
- D02: multi-product basket is now expressly approved in DEMO UI. Final sale-header/line schema, atomic all-line behavior and production checkout policy still need explicit settlement; old single-product guide examples must not constrain the approved UI.
- D06/D09: correction/void/return rights, prior-return accounting, cash refund authorization, cost treatment and reporting-date attribution.
- D04/D08: product/code/barcode uniqueness and identity rules; production per-line discounts, historical global-discount allocation, taxes (if any), receipts and paper/printer behavior. Cash is the owner-selected refund method for the current demo, not authorization to infer missing original payment details.
- D10/D11: server permissions for Salesperson own/general history, returns and expenses; Admin POS access; staff provisioning, password-only identity lookup, reset/recovery, session and idle policies.
- D13–D16: hardware/local host addressing/TLS, capacity/recovery objectives, backup retention/key custody, pending-request recovery and real-data import/rollout. Proposed targets and historical snippets are not final decisions.

## 9. Working agreement for every new chat

- Start with a brief bounded plan. Follow ONE SCREEN / ONE ISSUE / ONE FEATURE at a time unless the owner explicitly approves a grouped task. Stop for review at its boundary.
- Preserve current code, routes, fixtures, validation and layouts. No broad redesign/refactoring, dependency installs, unrelated fixes or next module during a narrowly scoped task.
- Work autonomously on ordinary authorized safe edits/checks. Respect mandatory sandbox/OS approvals; never bypass protections or use Administrator unnecessarily. This environment has sometimes failed ordinary command startup with helper_unknown_error; that is an environment failure, not evidence the application is broken.
- Never claim successful authentication, saved sale/refund, shared expenses, accurate production reporting, backup or deployment without implementing and verifying the corresponding real service.
- Report what changed, focused verification, blockers and real versus simulated behavior. Do not claim screenshots/manual acceptance or entire-suite success without evidence.
- Keep this file current after meaningful changes: update the current checkpoint/pending work, actual feature status, blockers, policy decisions and scoped test evidence. Preserve original source documents and historical reports. Never store passwords, tokens, connection secrets or real customer records in this memory.

Suggested first instruction in a new chat: Read AGENTS.md and docs/PROJECT_MEMORY.md, inspect Git status and the latest implementation plan, preserve all pending work, and continue ONLY the specific module I authorize next.

## 10. Owner-requested full-functionality / cloud / EXE plan — 8 November 2026

- Owner requested planning only: a simple step-by-step Markdown plan, database/architecture first, REST endpoints, validation/verification throughout and measured behavior as data grows. No backend implementation or deployment was requested in this task.
- Owner clarified remote operation: carry a Windows EXE, use internet away from the shop, and VIEW activity across all sections. Remote sales/business edits are not part of this release.
- Created [FULL_FUNCTIONALITY_CLOUD_OFFLINE_PLAN.md](FULL_FUNCTIONALITY_CLOUD_OFFLINE_PLAN.md): 22 ordered work packages covering architecture/schema, migrations, REST, auth, products/stock, sales/receipts, returns/corrections, expenses/investment, reports/dashboard, settings/closing/backups, cloud sync, desktop packaging, scale/outage checks and rollout. This supplements existing master Phases 4–9 and preserves the original source documents.
- Proposed architecture, awaiting review: authoritative local PostgreSQL and local REST API for all shop writes; transactional outbox to a live cloud PostgreSQL business mirror; hosted read-only Admin API/screens accessed through a secured Windows EXE. Electron is a packaging proposal, not an installed/approved dependency. Portable single-file distribution must be demonstrated before promising it.
- Cloud freshness limit is explicit: shop internet loss does not stop LAN operation, but remote Admin can see only the last synchronized activity until the shop reconnects. No automatic cloud business writer/failover, browser-only disconnected cashier queue or copying local auth secrets into business sync.
- Cloud provider/region/budget/hosting, final architecture, EXE packaging/security, numeric capacity/recovery targets and the remaining D decisions are still pending. The document adds C01–C06 cloud/desktop decisions; it does not silently settle production rounding, receipt-cost, correction/return or password-only identity rules.
- Planning verification: original SRS extracted/read; guides, UI reference, accounting/security contracts, current package/API boundaries and live Git status inspected; official technical references checked. All 22 work packages, local Markdown links and balanced code fences verified; Git diff whitespace check passed. Pre-existing pending files were compared by SHA-256 and preserved; original source documents/package files were checked separately.
- Documentation only: no application code, dependency, database, cloud resource, EXE, service, Git staging/commit/push or deployment changed. No application tests/build were run or newly claimed. Existing frontend evidence and pending visual review/logo blocker remain unchanged.
- Next bounded task: review Step 1 architecture/schema and affected decisions, then authorize its implementation separately. The plan is not blanket approval to execute all modules.



## 11. Final owner-approved frontend task — 9 November 2026

- Historical delivery status: refinements initially awaited visual review. The subsequent owner freeze/checkpoint request now confirms client approval and authorizes the local checkpoint described in section 2; no push.
- Stock Value replaces visible cumulative investment in the sidebar, page and Dashboard. One Total Stock Value card; native View Product Details disclosure; /admin/investment retained. Current missing buying costs remain unavailable. Purchase/expenditure contracts and all financial fixtures are preserved.
- Shop Expenses keeps its existing centered layout/summary dialog but now requires Amount and Reason, with automatic Karachi date (also refreshed at submit across midnight). No category/date-entry controls. Legacy record type retained internally; corrections retain original date. Entries remain page-local, clear on navigation/reload and never update Admin historical accounts.
- Same-period net-profit helper remains exact and unchanged; expenses reduce net profit once, not original gross profit. Purchases/personal withdrawals are not operating expenses. Production classification and shared records remain backend work.
- Daily Closing retains the original six cards, business date and disabled confirmation. New CounterCashSummary / counter-cash-preview helpers use complete matching-date recorded opening cash, cash receipts, refunds and counter-paid expenses. Actual count supports zero/exact PKR; shortages/extras/matches are tested. Production demo has no reliable cash source, so expectation/difference remain unavailable; changing date clears its temporary count.
- Return & Refund groups by real invoice ID and stable line IDs, shows every recorded item, supports checkbox/quantity selection, partial and all-remaining refunds, original-paid discounts and trusted prior returns. Visible Item Condition is removed. Future goods default to pending inspection; no stock changes, refund payments or saved return records. Unknown original payment data remains unavailable for all eight original sales. Five-item verification data exists ONLY in tests/fixtures/refund-invoice.ts and an ignored test harness, never a production route.
- Settings replaces only the old backup placeholder with compact disabled Backup & Restore actions, Not configured statuses and Supabase — Not connected. No keys, fake files, connection or restore.
- Latest future architecture direction is SQLite local authority and proposed encrypted backups to Supabase private Storage, explicitly deferred. This conflicts with older PostgreSQL/Prisma/cloud-mirror proposals and has been appended as an amendment to the plans/contracts. Earlier remote Admin viewing still needs reconciliation; encrypted backups alone do not implement a live viewer. No architectural code changes, database, APIs, auth, Supabase or EXE work occurred.
- Logo integration is explicitly deferred until the end; do not ask for or add it in this task. Developer branding and existing checkout/receipt/history source are unchanged.
- Focused verification: 175 distinct unit/component cases across 13 files pass, using newest evidence per file; 17 distinct Chromium desktop/mobile browser cases pass, including the original-history receipt regression. The six rerun browser cases replace earlier evidence after fixing the isolated harness's Dark theme class; do not add repeated counts. TypeScript, ESLint (including a final four-file browser-test lint) and ONE production build passed. The initial unit artifacts contain corrected obsolete-assertion failures; use unit-corrected/unit-regression/unit-final as appropriate.
- Verified Light/Dark, widths 320/375/768/1024/1440, keyboard controls/focus, no whole-page overflow, exact money, partial/full selection, prior-return limits, duplicate previews/expenses, missing-data handling, browser-storage privacy, checkout and ordinary/80 mm receipts. Original docs/design/SRS, dependency files, all original mock financial files, checkout/receipt helpers/components and previous unrelated pending edits were protected by start-of-task SHA-256 comparisons.
- Five final screenshots were inspected. Evidence is ignored under web/test-results/final-frontend/{before-hashes.json,unit*.json,browser/,browser-corrected/,history-browser/,review/}. Refund screenshot is explicitly an isolated test invoice, not shop history.
- See [FINAL_FRONTEND_REFINEMENTS_REPORT.md](development/FINAL_FRONTEND_REFINEMENTS_REPORT.md) for exact changed files, screenshot links and limitations. Manual screen-reader, actual printer and physical-device checks remain open. No full repository browser suite is claimed.
- The visual-review gate is now satisfied by the owner's explicit freeze/checkpoint instruction. Optional visual changes are frozen. Next work is separately approved backend architecture/database design; no implementation is authorized by this handoff.

## 12. Client approval and frontend freeze checkpoint — 9 November 2026

- Client approval covers the existing Admin UI (dashboard, products/inventory, reports, Stock Value, expenses review, closing and settings) and Salesperson UI (checkout with per-item discounts/receipts, history, expenses and partial/full return previews), with existing navigation and themes preserved.
- Previously reported verification is reused: 175 unit/component cases, 17 browser cases, TypeScript, ESLint and one production build passed. No suite or build is rerun for this documentation/Git task. Current source/test hashes match the recorded final verification snapshot.
- Historical fixtures remain 7 products / 123 units / 3 low-stock alerts, 8 sales / 42 sold units / 6 sold products; revenue Rs. 25,690.00, fictional COGS Rs. 20,550.00 and gross profit Rs. 5,140.00. No fixture is changed by this checkpoint task.
- All business writes, authentication/authorization, shared accounting, refunds/stock disposition, closing, backup/restore and remote access remain unimplemented demo boundaries. SQLite, private Supabase backup/restore, secure remote Admin viewing and Windows EXE packaging are pending; logo integration is deferred to the final stage.
- Current independent checks: full Git scope and staged-diff review, secret/generated-path scan, ignore coverage, source/test hash preservation, documentation links and whitespace. Generated browser evidence stays ignored; it is not part of the commit. The artifact-backed isolated screenshot test requires a locally generated fixture bundle; committing the test does not include that bundle.
- Optional visual changes are frozen. Necessary backend data wiring and error/validation states are permitted within separately approved integration work, without unnecessary redesign. Do not begin the backend from this checkpoint task.
