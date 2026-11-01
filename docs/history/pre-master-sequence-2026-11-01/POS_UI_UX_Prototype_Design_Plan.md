# Retail POS — Complete UI/UX Prototype Design & Codex Implementation Plan

**Document:** UI/UX design specification v1.0  
**Product:** Inventory, Stock & Sales Management System  
**Design style:** Simple Retail POS  
**Themes:** Light + Dark (same information architecture, different semantic tokens)  
**Operation:** Shop-local server + local LAN; internet not needed for daily use  
**Base requirements:** User-provided *Software Requirements Specification (SRS)*, version 1.0, including confirmed purchase-cost, stock-correction and PKR amendments  
**Engineering companion:** `POS_Complete_Development_Guide.md`  
**Deliverables covered:** Screen inventory, flows, content rules, interaction states, accessibility, responsive specification, design tokens, test/acceptance criteria, and Codex build steps.

> **Scope and authority:** Requirements labeled **SRS** come from the supplied SRS. Choices labeled **PROPOSED UI DECISION** are recommended design decisions, **not** requirements expressly written in the SRS. Product owner approval is needed where they affect business rules. The accompanying `POS_UI_Prototype.html` is a **standalone, mocked visual prototype**, not a live database-connected POS; its examples must never be treated as production behavior.

---

## 1. Product goals and non-negotiables

### 1.1 Outcomes

- Make a sale in the fewest steps possible: **choose product → quantity → flexible unit selling price → save**. **SRS**
- Allow the Admin to view products, stock quantities, sales, profit, low stock, reports, and business trends. **SRS**
- Keep Salesperson screens clean, with **no remaining stock quantities, purchase costs, or profit information**. **SRS**
- Support Admin product creation, additional stock, purchase-cost changes, stock count corrections, sales corrections, and history. **SRS**
- Show all currency values as **PKR / Rs.** **SRS**
- Work on desktop, laptop, tablet, and phone. **SRS**
- Continue recording sales **without public internet** when the shop-local application server and LAN remain available. **User-confirmed architecture**
- Make accidental double sales, duplicate corrections, and misleading confirmations hard to cause. **Design/engineering response to SRS consistency requirements**

### 1.2 UI principles

1. **Speed first:** straightforward labels, large controls, single primary action per screen, no decorative distractions.
2. **Role-safe by design:** financial/stock-sensitive data never appears in salesperson views, toasts, HTML payloads, or browser-delivered API responses.
3. **Clarity over density:** label every monetary value and quantity; explain ambiguous adjustments before committing them.
4. **Trustworthy confirmations:** only say “Sale recorded” after the server commits; while processing, disable repeat submit.
5. **Same workflow in light/dark:** a theme change must not alter navigation, priorities, or meaning.
6. **Accessible and resilient:** keyboard, screen readers, visible focus, 44×44 px touch targets, meaningful status text.
7. **Never confuse internet status with shop server status:** internet being unavailable should not show a blocking error while local POS is working.

### 1.3 Explicit v1 exclusions

The SRS excludes barcode scanning, expense tracking, customer management/purchase history, and multiple shops/branches. The UI must not display fake or non-working menu items for these. Payment processing, printing receipts, returns/refunds, taxation, discounts, and customer baskets are **not specified** in the SRS, so omit them from the committed v1 flow unless product owner approves scope changes.

### 1.4 Decisions requiring approval before production

| Question | Proposed prototype assumption | Implementation impact |
|---|---|---|
| One product per sale or multi-product basket? | **One product per sale** (matches SRS's salesperson flow) | POS layout, transaction model |
| Quantities | Positive whole units; no fractional weights | Validation, stock math |
| Is selling below purchase cost permitted? | No hidden rule: prototype allows positive prices, with optional non-blocking server-controlled policy if owner chooses | Validation and profit reporting |
| Incoming shipment unit cost differs from current cost | Show both and require explicit “update current cost” choice; final workflow needs owner approval | Receiving/repricing semantics |
| Date boundaries | Shop timezone `Asia/Karachi` | Filters and report queries |
| Sale corrections | Admin may change the erroneous quantity and price; product/date edits require a separate approved policy | Correction UI + audit model |
| Product deletion | Archive instead of permanent deletion when there is history | Products workflow |
| Login/user creation | Admin-provisioned accounts only | Local authentication |
| Who may switch light/dark? | Each signed-in user, remembered in browser; system preference default | Theme persistence |

---

## 2. Navigation / information architecture

### 2.1 Admin primary navigation

```text
Admin
├── Dashboard
├── Products
│   ├── Product list
│   ├── New / Edit product
│   └── Product details & history
├── Inventory
│   ├── Receive stock
│   ├── Adjust stock
│   ├── Stock movement history
│   ├── Purchase-cost updates
│   └── Low-stock list
├── Sales
│   ├── Sales history
│   ├── Sale details
│   └── Correct sale
├── Reports
│   ├── Daily
│   ├── Monthly
│   ├── Date range
│   └── Product-wise
└── Accounts / Settings (proposed operational screen)
```

**Desktop:** fixed left sidebar; logo/product title, sections, account and theme toggle.  
**Tablet:** collapsible compact sidebar or drawer.  
**Phone:** compact top header, navigation drawer, nested screens and back link. Do not try to squeeze the full admin sidebar onto mobile.

### 2.2 Salesperson navigation

```text
Salesperson
├── Record Sale (home)
├── My Recent Sales (PROPOSED UI convenience; only own safe fields)
└── Account / Sign out / Theme
```

**Important:** the SRS only requires a sale-recording interface; “My Recent Sales” is an optional safe convenience. It must not expose inventory, profit, purchase cost or other restricted fields. Do not add it unless approved; the prototype may show a locally simulated confirmation history.

### 2.3 Routes

| ID | Route | Role | Page name |
|---|---|---|---|
| A01 | `/login` | Both | Login |
| A02 | `/admin/dashboard` | Admin | Dashboard |
| A03 | `/admin/products` | Admin | Products |
| A04 | `/admin/products/new` | Admin | Add product |
| A05 | `/admin/products/[id]` | Admin | Product details |
| A06 | `/admin/products/[id]/edit` | Admin | Edit product |
| A07 | `/admin/inventory/receive` | Admin | Receive stock |
| A08 | `/admin/inventory/reprice` | Admin | Update purchase cost |
| A09 | `/admin/inventory/adjust` | Admin | Correct stock quantity |
| A10 | `/admin/inventory/movements` | Admin | Inventory movement history |
| A11 | `/admin/inventory/low-stock` | Admin | Low-stock overview |
| A12 | `/admin/sales` | Admin | Sales history |
| A13 | `/admin/sales/[id]` | Admin | Sale details |
| A14 | `/admin/sales/[id]/correct` | Admin | Correct recorded sale |
| A15 | `/admin/reports` | Admin | Daily / Monthly / Date range |
| A16 | `/admin/reports/products` | Admin | Product-wise report |
| A17 | `/admin/accounts` | Admin | Manage users (proposed) |
| A18 | `/admin/settings` | Admin | Preferences (proposed) |
| P01 | `/pos` | Salesperson | Record sale |
| P02 | `/pos/success/[id]` | Salesperson | Sale confirmation (safe fields only) |

The prototype does not need separate URLs for modals, alerts, and toasts. Real application routes may be adjusted to match Next.js route groups and implementation architecture.

---

## 3. Design system — tokens

### 3.1 Visual voice

- **Simple retail:** familiar business software, not a “fintech analytics” dashboard.
- No gradients or glass effects in transactional flows; use flat surfaces, thin borders, generous spacing.
- 1 primary accent used for positive actions; red only for destructive/error, amber for low-stock warnings; avoid meaning conveyed by color alone.
- Prefer **system font stack** (offline-safe) rather than a remotely fetched font.
- Labels use sentence case: “Record sale”, “Purchase cost”, “Available quantity”, not unexplained abbreviations.

### 3.2 Light and dark color tokens

| Semantic token | Light | Dark | Usage |
|---|---|---|---|
| `--background` | `#F6F7F9` | `#0F141B` | App canvas |
| `--surface` | `#FFFFFF` | `#18212B` | Cards / dialogs |
| `--surface-subtle` | `#EFF2F6` | `#222D39` | Muted fields / rows |
| `--foreground` | `#17212C` | `#F3F6FA` | Headings / primary text |
| `--muted-foreground` | `#536273` | `#B1BFCE` | Secondary labels |
| `--border` | `#D9E1E9` | `#394653` | Dividers / input outlines |
| `--primary` | `#176F56` | `#49D5A0` | Key actions, focus accents |
| `--primary-foreground` | `#FFFFFF` | `#071A15` | Text on primary action |
| `--success` | `#166444` | `#74E0AF` | Completed transactions |
| `--warning` | `#9C5C00` | `#F4C36C` | Low stock / nonblocking caution |
| `--danger` | `#B42332` | `#FF9099` | Rejection / destructive action |
| `--focus` | `#166DD6` | `#A7C7FF` | Keyboard focus ring |

**Engineering gate:** run automated contrast checks on every actual foreground/background combination. Aim for WCAG 2.2 AA: 4.5:1 normal text and 3:1 large text and non-text controls. Adjust tokens if any combination fails; the table provides starting colors, not a claim of compliance.

### 3.3 Typography

| Element | Desktop | Mobile | Weight |
|---|---:|---:|---|
| Screen title | 28 px / 36 | 24 px / 32 | 700 |
| Section title | 20 px / 28 | 18 px / 26 | 650 |
| Card value | 26 px / 34 | 22 px / 30 | 700 |
| Body / input | 16 px / 24 | 16 px / 24 | 400 |
| Table / helper | 14 px / 20 | 14 px / 20 | 400 |
| Micro-label | 12 px / 18 | 12 px / 18 | 600 |

Use tabular numeric figures for quantities, PKR and dates. Display `Rs. 1,250.00` where decimals apply; keep zero, negative and large values readable. Avoid truncating prices.

### 3.4 Spacing and layout

- Base spacing scale: `4 / 8 / 12 / 16 / 24 / 32 / 48` px.
- Main content max width: `1440px`; content padding: desktop `32px`, tablet `24px`, phone `16px`.
- Sidebar: `240px` desktop, `72px` icon-only optional on tablet, mobile drawer.
- Inputs: minimum `44px` high; primary POS action `52–56px` high; touch target `>=44×44px`.
- Card border radius: `12px`; button/input radius: `8px`; dialog radius: `16px`.
- Shadow: subtle only for dropdowns/dialogs; avoid heavy raised cards.
- Dialogs: `440px` small confirmation, `640px` normal form, `800px` complex correction; mobile full width, scrollable.
- Data table row height: `52–60px`; mobile: stacked cards where horizontal scrolling hides critical controls.

### 3.5 Reusable components and variants

- `AppShell`, `AdminSidebar`, `SalespersonHeader`, `MobileDrawer`, `PageHeader`, `Breadcrumbs`.
- `Button` (`primary`, `secondary`, `outline`, `danger`, `ghost`, `loading`).
- `TextInput`, `NumberInput`, `MoneyInput`, `ProductCombobox`, `DatePicker`, `DateRangePicker`, `Select`, `SearchInput`.
- `StatCard`, `SummaryStrip`, `DataTable`, `MobileListCard`, `StatusBadge`, `LowStockBadge`, `EmptyState`, `ErrorState`, `Skeleton`, `Toast`, `AlertDialog`, `FormDialog`.
- `TransactionReceiptSummary` (**on-screen sale confirmation**, not printer receipt).
- `ConnectivityIndicator` must say **“Shop server connected” / “Cannot reach shop server”**; public internet availability is not the source of truth.
- `ThemeToggle` supports `light`, `dark`, `system` (proposed per-user preference).
- `Currency` helper formats `PKR` and `Rs.` consistently; `Quantity` and `DateTime` helpers respect shop locale/timezone.

**Interaction contract for every component:** label, helper text, keyboard focus, aria attributes, `disabled`, `readOnly`, `loading`, `error`, empty state, invalid field state, and dark mode. Buttons with `loading` must guard against duplicate interactions at both UI and server layers.

---

## 4. Responsive layout specifications

| Breakpoint | Width | Admin layout | POS layout |
|---|---|---|---|
| Mobile | `<640px` | top bar + drawer; cards instead of dense tables; single-column forms | one-column: search → fields → sticky bottom action (not covering form) |
| Tablet | `640–1023px` | collapsed sidebar/drawer, 2-column KPI grid | single or two-column form and optional recent confirmation |
| Desktop | `>=1024px` | 240px sidebar; 3–4-column metrics; full tables/charts | centered, wide form with generous controls; action near inputs |

At 320px wide, horizontal page overflow is forbidden; table data may instead use expandable cards or intentional table-only scrolling. At 200% zoom, preserve access to all controls. Use `prefers-reduced-motion`; no essential information may depend on animation.

### 4.1 Desktop admin wireframe

```text
┌───────────────┬─────────────────────────────────────────────────────┐
│ STORE POS     │ Dashboard                  [Server ✓] [◐] [Admin] │
│               ├─────────────────────────────────────────────────────┤
│ Dashboard     │ Business overview                          Today  │
│ Products      │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│ Inventory     │ │ Revenue  │ │ Profit   │ │ Units    │ │Low stock││
│ Sales         │ └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│ Reports       │ ┌────────────────────────┐ ┌──────────────────────┐ │
│ Accounts      │ │ Sales trend            │ │ Low-stock products   │ │
│               │ │ chart                  │ │ table + view all     │ │
│ Settings      │ └────────────────────────┘ └──────────────────────┘ │
│ Sign out      │ Recent sales (admin)                                │
└───────────────┴─────────────────────────────────────────────────────┘
```

### 4.2 Desktop Salesperson wireframe

```text
┌─────────────────────────────────────────────────────────────────────┐
│ STORE POS / Record sale           [Shop server connected] [◐] [Exit]│
├─────────────────────────────────────────────────────────────────────┤
│ Record a sale                                                        │
│ Select product       [ Search products...                        ▼ ]│
│ Quantity             [  -  ]  [    1     ]  [  +  ]                  │
│ Selling price (Rs.)  [             1,200.00                     ]   │
│                                                                     │
│                      [ RECORD SALE — Rs. 1,200.00 ]                  │
│                                                                     │
│ Only sale-relevant fields; no stock balance, cost, or profit.        │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Phone Salesperson wireframe

```text
┌───────────────────────────┐
│ Store POS       [◐] [⋮]  │
│ Shop server connected     │
├───────────────────────────┤
│ Record a sale             │
│ Product                   │
│ [ Search / select    ▼ ]  │
│ Quantity                  │
│ [ − ] [    1    ] [ + ]   │
│ Selling price (Rs.)       │
│ [      1,200.00       ]   │
│                           │
│ Total: Rs. 1,200.00       │
│                           │
│ [ Record sale         ]   │
└───────────────────────────┘
```

---

## 5. Detailed screen specifications

Each screen uses a stable screen ID for design review, Codex tasks, screenshots, and Playwright test references.

### A01 — Login (Admin and Salesperson)

**SRS basis:** distinct login accounts and restricted functions.  
**UI:** shop name/logo, username/email (choose configured identity type), password, sign-in button, password visibility toggle, server connection state. No public registration or social sign-in.  
**Behavior:** validation on submit; generic “Invalid username or password”; show “Shop server cannot be reached” only for local-server failures; do not imply internet is needed. Successful login routes by server-confirmed role: Admin → dashboard; Salesperson → POS.  
**States:** idle, submitting, invalid credentials, account disabled, server unreachable, session expired.  
**Responsive:** single centered card; full-width mobile input/action.  
**Accessibility:** labels, error summary, autocomplete, focus on first invalid input.  
**Do not:** display different error text revealing whether an account exists.

### A02 — Admin Dashboard

**SRS basis:** inventory overview, today's/monthly sales and profit, charts, best sellers, low-stock products.  
**Structure:** header (“Dashboard”), date context, KPI cards (today's revenue, today's profit, monthly revenue, monthly profit), secondary counts (products, total available units, low-stock count, recently received stock), sales/profit charts, bestselling products and low-stock preview.  
**Actions:** jump to low stock, view all sales, open report, open individual product.  
**States:** data loading, no sales yet, no low-stock items, report unavailable; chart has accompanying accessible table/summary.  
**Responsive:** cards stack 1 → 2 → 4 columns, charts stack; tables become readable lists.  
**Important:** daily numbers use local shop dates, not browser timezone guessing. Admin only.

### A03 — Products List

**SRS basis:** searchable products, current quantity, purchase price, threshold; admin edits products.  
**Structure:** page title + `Add product` primary action; search by name; optional category filter; table: Product, Category, Purchase cost, Available stock, Low-stock threshold, Status, Actions.  
**Actions:** open details, edit product, receive stock, reprice, adjust inventory.  
**States:** no products (Add your first product), no search results (Clear filters), loading, fetch error.  
**Responsive:** hide nonessential columns into expanded mobile cards; never hide the important admin stock status.  
**Do not:** put product deletion near high-frequency actions; use archive where approved.

### A04 — Add Product / A06 — Edit Product

**SRS basis:** product name, category if applicable, initial quantity, original purchase price, low-stock threshold; admin may update product purchase cost.  
**Add fields:** name (required), category (optional), purchase cost in Rs. (required), opening quantity (required), low-stock threshold (required).  
**Edit fields:** name, category, threshold; **purchase cost changes must use the dedicated repricing workflow**, not an ordinary field save that bypasses audit/cost-history requirements.  
**Validation:** trim names, prevent duplicate where product policy requires, purchase cost non-negative by approved policy, quantity integer >=0, threshold integer >=0; exact rules backed by server validation.  
**Actions:** Save product, Cancel.  
**States:** invalid, submitting, duplicate-product conflict, success.  
**Responsive:** single-column on phone, two-column only where scan order remains clear.  
**Important:** changing product descriptive fields must not mutate historical sale snapshots.

### A05 — Product Detail & History

**SRS basis:** product-wise stock, sales revenue, profit, sales history, stock additions, cost data, date range.  
**Structure:** name, category, current cost, current available stock, threshold/status; tabs or clear stacked sections: Overview, Stock movements, Sales history, Profit history, Purchase-cost history.  
**Actions:** Edit product, Receive stock, Reprice, Adjust stock, Filter date, View sale.  
**States:** history empty, no data for date range, stock below threshold.  
**Responsive:** stacked sections on mobile; horizontal overflow only within an intentional table region.  
**Admin only.**

### A07 — Receive Stock

**SRS basis:** product, quantity received, unit purchase cost, date added; inventory increases, receipt history retained.  
**Fields:** product search, quantity received (>0), receipt purchase cost (Rs.), receipt date/time (typically current shop time; editing policy requires approval), optional internal note (**proposed**).  
**Summary:** “Adding 20 units to Diapers”; current stock and resulting quantity may be shown **admin only**.  
**Cost ambiguity:** if receipt cost differs from product's current cost, show explicit choice/notice and require approved behavior (receipt only versus receive-and-reprice). Never silently overwrite all remaining inventory cost.  
**Actions:** Review stock receipt → Confirm receipt.  
**Errors:** malformed quantity, server timeout, duplicate request, missing product.  
**Success:** server-confirmed receipt ID and new stock level.  
**Responsive:** stacked, easy-to-read review summary.

### A08 — Update Purchase Cost (critical)

**SRS basis:** Admin purchase-price update applies immediately to **all remaining units**, including older stock; completed sales unchanged.  
**Fields:** product; current purchase cost (read-only); new purchase cost; required confirmation showing quantity affected; optional reason (**proposed**, recommended).  
**Confirmation copy:** “Set current purchase cost of Diapers from Rs. 1,000.00 to Rs. 1,100.00? All 40 remaining units will use the new purchase cost. Completed sales will not change.”  
**Actions:** Review change → Confirm update.  
**States:** same-price validation, changed stock while dialog open (refresh review), success with audit entry, error.  
**Do not:** show an option to recalculate completed sales.

### A09 — Correct Stock Quantity

**SRS basis:** Admin may correct stock; preserve old quantity, new quantity, actor and time.  
**Fields:** product, current quantity read-only, corrected quantity, mandatory reason (**proposed** audit-strengthening), calculation “Difference +3 / −3”, confirmation.  
**Behavior:** stock adjustments recorded as dedicated movements and audit trail; backend commits atomically and checks stale quantity/version.  
**Errors:** invalid negative quantity, conflicting concurrent change, duplicate submission.  
**Success:** new quantity shown and audit entry accessible.  
**Warnings:** reduction may trigger low-stock warning.

### A10 — Inventory Movement History

**SRS basis:** stock additions/corrections history, accurate inventory record.  
**Structure:** filter by product, type, date; columns Date & time, Product, Movement (Received / Sold / Restored / Adjustment), Delta, Resulting stock, Linked reference, Performed by.  
**Actions:** view linked receipt, sale or correction; export only if separately approved.  
**States:** no movements, filtered empty, loading, error.  
**Admin only.**

### A11 — Low-Stock Overview

**SRS basis:** threshold-based warnings on admin dashboard.  
**Structure:** product, current stock, configured threshold, red/amber **“Low stock”** label with text icon, quick `Receive stock` action.  
**Logic:** low when `availableQuantity <= lowStockThreshold`; zero stock can say “Out of stock” (**proposed severity refinement**).  
**States:** all stock healthy, low list, zero-stock list.  
**Accessibility:** status label, not color alone.  
**Do not:** reveal this page to Salesperson.

### A12 — Sales History

**SRS basis:** complete history, search/filter by product/date, Admin may correct errors.  
**Structure:** date range, product search, table with Transaction ID, Date/time, Product, Qty, Unit selling price, Total revenue, Profit, Status, Action.  
**Actions:** View details, Correct sale; filter date/product; navigate records.  
**States:** no sales, no matches, server error; pagination for large history.  
**Admin only.**

### A13 — Sale Details

**SRS basis:** unique ID, product, qty, cost snapshot, selling price, amount, profit, timestamp.  
**Structure:** immutable original sale snapshot + current effective correction state + full correction history; make original vs corrected figures explicit.  
**Actions:** Correct sale; return to Sales history.  
**States:** normal, corrected, loading, already changed by another admin.  
**Do not:** overwrite the original audit history.

### A14 — Correct Sale

**SRS basis:** correct incorrect sales, restore/deduct appropriate inventory difference, recalculate profit, preserve correction history, avoid duplicate adjustments.  
**Fields:** transaction reference and product (read-only unless product-change policy is approved), old quantity, corrected quantity, old selling price, corrected selling price, reason (recommended), before/after totals and inventory effect.  
**Preview example:** “Quantity 5 → 2. Restore 3 units to stock. Sale total and profit will be recalculated using the original sale-time purchase cost.”  
**Actions:** Review correction → Confirm correction.  
**Safety:** if correcting to greater quantity, require atomic stock validation; if a prior correction exists, show current effective state. Server applies idempotency and version checks.  
**States:** conflict, insufficient stock for higher quantity, success, failure.  
**Do not:** expose action as a one-click delete or let the UI perform stock changes without the server.

### A15 — Reports: Daily, Monthly, Date Range

**SRS basis:** daily/monthly/custom-date sales revenue, quantities, profit, product sales, best sellers.  
**Structure:** segmented selector `Daily | Monthly | Custom range`; matching date inputs, summary metrics, product summary table, sales/profit charts, best-selling products.  
**Filters:** day picker (daily), month picker (monthly), start/end (custom); Apply button; Reset.  
**Validation:** end date not before start date; display applied date range and shop timezone.  
**States:** no sales in range, loading, invalid range, error.  
**Charts:** accessible text/table equivalents; totals reconcile with source transactions.  
**Admin only.**

### A16 — Product-wise Report

**SRS basis:** product search; purchase cost, remaining stock, revenue, total profit, daily/monthly history, stock additions.  
**Structure:** product combobox, date range, KPIs (units sold/revenue/profit), trend, sales table, incoming stock history.  
**States:** product not chosen, no activity, loading, error.  
**Admin only.**

### A17 — Accounts (PROPOSED operational UI)

**Why proposed:** SRS requires distinct Admin/Salesperson accounts but does not define their administration UX.  
**Structure:** user list (name, username, role, active state); Admin creates, resets and disables salesperson accounts.  
**Safety:** prevent accidental disabling of the last active Admin; password reset requires a documented local flow.  
**Do not:** expose raw passwords or public signup.  
**Scope:** ask product owner to approve this screen before implementation.

### A18 — Settings (PROPOSED)

**Structure:** theme preference (Light / Dark / System), shop identity display, server status, shop timezone, policy values in read-only form unless management permissions are defined.  
**Avoid:** exposing arbitrary database URLs, infrastructure secrets, or developer settings to shop users.  
**Availability:** each user can switch theme; Admin operational settings require explicit policy and permissions.

### P01 — Record Sale (Salesperson)

**SRS basis:** salesperson chooses product, quantity, flexible unit selling price, saves sale; no visible stock or profit.  
**Required fields:** product selector/search (required), quantity (positive integer), unit selling price in Rs. (positive money value according to approved rule).  
**Read-only summary:** total selling amount (quantity × unit selling price). **PROPOSED UI convenience**; does not expose cost/profit.  
**Primary action:** `Record sale`; dominant and always visible without obscuring controls.  
**Sequence:** select → quantity → price → review inline total → submit. Keep focus order in this sequence. After a completed sale, show confirmation and provide `Record another sale` with clean form; do not accidentally resubmit previous sale.  
**No available-stock count:** not in product dropdown, payload for browser, validation messages, history, or sale details.  
**Stock errors:** say “This quantity cannot be sold right now. Try a smaller quantity or ask the Admin.” **Do not reveal the hidden remaining quantity.**  
**Other errors:** product no longer active; invalid amount; cannot reach shop server; server request timed out; duplicate prevented; session expired.  
**Reliable save:** generate request idempotency key, show progress, disable submit, and resolve server result before marking success. A timeout should say “Confirmation unavailable — check recent transactions or ask Admin before retrying,” not falsely imply sale failed or succeeded.  
**Responsive:** desktop form 520–640px wide, phone stacked; quantity stepper and numeric keypad inputs usable by touch.

### P02 — Sale Confirmation

**SRS basis:** confirmation after successful sale.  
**Contents:** “Sale recorded”, transaction reference, product, quantity, selling price, total, date/time, `Record another sale`. All values returned from **committed sale**, not calculated-only UI state.  
**Never show:** purchase cost, profit, stock remaining, admin reporting links.  
**States:** successful confirmation, saved but confirmation retrieval issue (neutral guidance).  
**Responsive:** centered success summary, large next-sale action.

---

## 6. Cross-screen interaction details

### 6.1 Product search and selection

- Search is case-insensitive and keyboard navigable; use a real combobox pattern with accessible listbox options.
- No products: “No products available. Ask the Admin to add products.” (Salesperson); Admin sees `Add product`.
- Inactive product: omit or clearly disable for sales; server always checks on submit.
- Salesperson search results show **product name/category only**. Do not include stock count in a hidden data attribute, JSON or request payload.

### 6.2 Numeric entry

- Use numeric input modes on mobile; parse/validate on server.
- Quantity: integer >=1 for sale/receipt; opening stock and corrected stock >=0.
- Currency: use exact decimal or minor-unit representation. Avoid floating-point rounding.
- The UI may accept `1200`, `1,200`, `1200.50` and display `Rs. 1,200.50`, with strict parsing and clear errors; normalize before server submission.
- Enter key in sale form must never cause multiple submissions. Provide deliberate focus and keyboard handling.

### 6.3 Alerts, confirmations, and feedback

| Situation | UI severity | Message example | Next action |
|---|---|---|---|
| Sale saved | Success | `Sale recorded · TXN-00042` | Record another sale |
| Invalid required input | Inline error | `Enter a quantity greater than zero.` | Focus field |
| Not enough sellable stock | Error | `This quantity cannot be sold right now.` | Adjust quantity / contact Admin |
| Shop-local server unreachable | Blocking | `Cannot reach the shop server. No sale has been confirmed.` | Retry/reconnect |
| Internet down; local server works | Informational or no alert | `Shop server connected · Offline internet is OK` | Continue |
| Low-stock product | Warning | `Low stock` (Admin only) | Receive stock |
| Admin stock correction | Confirmation | `Adjust stock from 12 to 9 units?` | Confirm / Cancel |
| Cost repricing | Confirmation | `This updates all 40 remaining units.` | Confirm / Cancel |
| Sale correction | Confirmation | `Restore 3 units; recalculate profit?` | Confirm / Cancel |

Never display a green “Saved” message based on optimistic frontend state. Use server success data only.

### 6.4 Offline status model

| Shop-local server | Public internet | UI mode | Sales allowed? |
|---|---|---|---|
| Reachable | Available | Connected | Yes |
| Reachable | Unavailable | Connected locally | Yes |
| Unreachable | Available | Server unavailable | No |
| Unreachable | Unavailable | Server unavailable | No |

**Technical contract:** use a lightweight authenticated or permission-safe local `/api/health/connectivity` check and ordinary request outcomes; avoid online/offline browser navigator status as the sole source of truth. A status indicator is advisory; only successful transaction commit confirms a sale. No browser queue claiming it will “sync later” in v1.

### 6.5 Loading, empty, expired, and error states

Every screen needs: initial skeleton (avoid layout shift), no data, empty filtered result, server error with retry, permission denied, session expired (go to login), and stale/concurrent update messages where relevant. Persist unsaved form input locally only if safe and approved; never retain passwords and sensitive Admin financial data in uncontrolled browser storage.

---

## 7. Accessibility and localization requirements

- WCAG 2.2 AA target; audit with automated tooling **and** manual keyboard/screen reader tests.
- Semantic headings, explicit `<label>` association, `aria-describedby` for errors, input errors announced in an `aria-live` region or error summary.
- Focus visible in both themes; dialogs trap focus and return it to opener when closed.
- Preserve information under 200% zoom; support user font scaling and reduced motion.
- Status indicators combine color, icon and text.
- Date/time in the configured shop timezone. Prototype defaults to `Asia/Karachi` for discussion; confirm if needed.
- Currency is PKR with a consistent `Rs.` display. Never assume USD-style receipts or currency glyphs.
- Plain English labels suitable for staff with limited technical familiarity. Future Urdu translations are outside current SRS scope unless added.
- Keyboard shortcuts should be optional and documented; **never** create a global shortcut that records a sale by accident.

---

## 8. Frontend implementation architecture for Codex

### 8.1 Suggested component / feature structure

```text
src/
  app/
    (auth)/login/page.tsx
    (admin)/admin/
      dashboard/page.tsx
      products/page.tsx
      products/new/page.tsx
      products/[id]/page.tsx
      products/[id]/edit/page.tsx
      inventory/receive/page.tsx
      inventory/reprice/page.tsx
      inventory/adjust/page.tsx
      inventory/movements/page.tsx
      inventory/low-stock/page.tsx
      sales/page.tsx
      sales/[id]/page.tsx
      sales/[id]/correct/page.tsx
      reports/page.tsx
      reports/products/page.tsx
      accounts/page.tsx                 # owner approval required
      settings/page.tsx                 # owner approval required
    (salesperson)/pos/
      page.tsx
      success/[id]/page.tsx
  components/
    shell/{AdminShell,SalespersonShell,MobileNav,ThemeToggle,ServerStatus}.tsx
    ui/                                # shadcn/ui primitives
    patterns/{PageHeader,MetricCard,SearchableProduct,MoneyField,EmptyState,ConfirmAction}.tsx
  features/
    products/{components,schemas,queries,actions}/
    inventory/{components,schemas,queries,actions}/
    sales/{components,schemas,queries,actions}/
    reports/{components,schemas,queries}/
  lib/
    auth/
    currency.ts
    date-time.ts
    themes.ts
  styles/
    tokens.css
  mocks/
    products.ts
    sales.ts
    reports.ts
  tests/
    e2e/
    accessibility/
```

> Next.js folder details may change based on actual project scaffold. The specific route plan should be reconciled with the implementation guide and existing code before Codex moves files.

### 8.2 Design tokens (CSS starting point)

```css
:root {
  --background: #f6f7f9;
  --surface: #ffffff;
  --surface-subtle: #eff2f6;
  --foreground: #17212c;
  --muted-foreground: #536273;
  --border: #d9e1e9;
  --primary: #176f56;
  --primary-foreground: #ffffff;
  --success: #166444;
  --warning: #9c5c00;
  --danger: #b42332;
  --focus: #166dd6;
}
[data-theme="dark"] {
  --background: #0f141b;
  --surface: #18212b;
  --surface-subtle: #222d39;
  --foreground: #f3f6fa;
  --muted-foreground: #b1bfce;
  --border: #394653;
  --primary: #49d5a0;
  --primary-foreground: #071a15;
  --success: #74e0af;
  --warning: #f4c36c;
  --danger: #ff9099;
  --focus: #a7c7ff;
}
```

**Theme policy:** theme is presentation state only, not part of sale data. Resolve initial theme before first paint if possible; no light-flash on dark mode. Never fetch Google Fonts or other internet-required resources in production. System fonts are acceptable.

### 8.3 Data transfer objects and strict role separation

```ts
// Example UI-facing shapes; backend schema remains authoritative.
type SalespersonProductOption = {
  id: string;
  name: string;
  categoryName?: string;
  // Explicitly NO availableQuantity, purchaseCost, profit.
};

type RecordSaleInput = {
  productId: string;
  quantity: number;
  sellingPrice: string;          // decimal string, validated server-side
  idempotencyKey: string;
};

type SaleSuccess = {
  transactionId: string;
  productName: string;
  quantity: number;
  sellingPrice: string;
  totalAmount: string;
  soldAt: string;
  // Explicitly NO cost, remaining inventory, or profit.
};

type AdminProductRow = {
  id: string;
  name: string;
  categoryName?: string;
  currentPurchaseCost: string;
  availableQuantity: number;
  lowStockThreshold: number;
  status: "available" | "low" | "out";
};
```

Prevent information leakage on the server. A React component hidden with CSS is **not** access control. Keep Admin-only modules and queries inaccessible to the Salesperson server session, and add authorization tests.

### 8.4 Mock-data-first prototyping, then backend integration

1. Implement layout components and tokens with local static mock data.
2. Get owner approval on desktop, tablet, phone, and both themes.
3. Add data fetching and mutation actions **one module at a time**.
4. Replace UI mock success with real server transaction responses.
5. Keep the exact same design states for empty, loading, error, conflict and server outage.
6. Remove all development-only role switching, mock actions and demo credentials from production.

---

## 9. Codex delivery plan — feature by feature

**Golden rule:** never ask Codex to generate every screen and all backend logic in one response. Ask for a bounded task, tests, screenshots, and a review checkpoint.

### Phase UI-0 — Repository and design assets

**Output:** copy the SRS and engineering guide under `docs/`, this document under `docs/design/`, prototype HTML under `docs/design/`, and add `AGENTS.md`. Document requirement precedence and unresolved decisions. No database migrations yet.  
**Acceptance:** each source file readable, no requirement invention; route and feature list approved.

### Phase UI-1 — Shared design system and shells

**Output:** light/dark tokens, theme persistence, buttons, form fields, icons, tables/cards, dialogs, status, breadcrumbs, admin shell and salesperson header.  
**Acceptance:** visual/keyboard checks at 320px, 768px, 1440px; no external image/font/CDN dependence; themes render consistently.

### Phase UI-2 — Salesperson mock POS (highest-priority usability)

**Output:** P01/P02 using safe mocked data and explicit failure states.  
**Acceptance:** no cost, profit, or remaining stock anywhere in rendered UI or mock responses; user can navigate with keyboard and record a mock sale; retry handling does not claim real database success.

### Phase UI-3 — Products and stock mock screens

**Output:** A03–A11: product list/details/add/edit, receipts, repricing, adjustments, history, low stock.  
**Acceptance:** confirmation wording distinguishes receipt and repricing; no hidden historical-profit rewrite; mobile layouts usable.

### Phase UI-4 — Sales and reports mock screens

**Output:** A02, A12–A16: dashboard, sales history/detail/correction, report filters/charts/product analytics.  
**Acceptance:** all filters, tables and charts have empty states and meaningful labels; mock correction preview shows stock delta correctly.

### Phase UI-5 — Login and operational screens

**Output:** A01, approved A17–A18; role-based routes; theme selection.  
**Acceptance:** route guards specified and tested; no mock role toggle in production.

### Phase UI-6 — Connect real backend per engineering guide

**Output:** replace mocks with real authorized APIs/server actions, transaction responses, idempotency, validation and audit history.  
**Acceptance:** each SRS story passes an integration test, sales never oversell, cost snapshots preserve history, stock corrections are atomic.

### Phase UI-7 — Offline LAN, QA and release

**Output:** local-only assets, LAN connectivity indicator, accessibility audit, Playwright tests in both themes, local-server outage and internet-outage acceptance tests, production checklist.  
**Acceptance:** internet disconnected + local LAN/server active = sales work. Local server disconnected = sale blocked and no false success.

---

## 10. Copy-paste Codex prompts

### Prompt 0 — Read documents and plan before coding

```text
Read docs/requirements/Software Requirements Specification.docx,
docs/POS_Complete_Development_Guide.md, and
docs/design/POS_UI_UX_Prototype_Design_Plan.md thoroughly.

Treat the SRS and its confirmed amendments as business authority. Treat the UI plan as design guidance. List contradictions and unresolved business decisions without inventing answers. Inspect the current repository and propose a route/component map, implementation phases, acceptance tests, and risks.

Do not write application code yet. Show me a reviewable implementation plan and the exact files you intend to change for Phase UI-1.
```

### Prompt 1 — Design system + theme

```text
Implement Phase UI-1 from docs/design/POS_UI_UX_Prototype_Design_Plan.md.
Build a simple retail POS design system with light and dark themes, semantic CSS tokens,
responsive Admin and Salesperson shells, accessible controls and a shop-local server
connectivity indicator. Use Tailwind + shadcn/ui where appropriate. Do not rely on
internet fonts/CDNs. Use mock data only where a backend is absent.

Do not implement business transactions. Add component tests and screenshots
at 375px, 768px and 1440px in both themes. Verify lint/typecheck/tests.
Summarize changed files, accessibility issues and any deviations from the design spec.
```

### Prompt 2 — Salesperson POS prototype

```text
Implement only P01 Record Sale and P02 Sale Confirmation using safe mock data.
Use the SRS flow: product, quantity, unit selling price, save.
Never show or return stock remaining, purchase cost or profit to the salesperson.
Add mobile usability, keyboard navigation, field validation, loading, safe insufficient-stock
message, local-server-unreachable state, and mock success confirmation.

Use a mock service clearly marked as a prototype: do not falsely claim database persistence.
Write Playwright scenarios for form flow, duplicate-click prevention, error states,
mobile widths and both themes. Stop for review before connecting a real API.
```

### Prompt 3 — Admin Products and Inventory screens

```text
Implement the mock Admin screens A03–A11 from the UI plan, without modifying sales logic.
Use the approved SRS fields, product history, receipt flow, explicit repricing confirmation,
stock adjustment before/after preview, audit history and low-stock threshold display.
A purchase-cost change applies to all current unsold stock only; historical sales
retain original saved costs. Keep that rule visible in UI confirmations.

Use responsive tables/cards, accessible dialogs, Zod forms and realistic mock states.
Write component and Playwright tests and report remaining business ambiguities.
```

### Prompt 4 — Admin Sales, Reports, Dashboard screens

```text
Implement mock Admin screens A02 and A12–A16 from the UI plan.
Provide daily/monthly/custom range report filters, sales/revenue/profit statistics,
product-wise search, low-stock preview, and a sale-correction review workflow.
Never directly mutate authoritative stock from UI mock state in production code.
Show original vs corrected sale data and inventory delta clearly.

Add chart accessible summaries, loading/error/empty states, mobile layouts
and tests in both themes. Stop for UI approval before backend integration.
```

### Prompt 5 — Connect to backend safely

```text
Using the approved UI and the engineering guide, connect one feature module at a time
to real server actions/API handlers. Ensure authentication/authorization on the server,
role-safe response DTOs, input validation, decimal PKR money handling, atomic stock
transactions, idempotency for sale/correction mutations, and immutable cost snapshots.

Begin with one agreed module only. Create integration tests demonstrating the module's
SRS acceptance criteria. Run typecheck, lint, unit/integration tests and build.
Report exact verified results and request review before the next module.
```

### Prompt 6 — Offline / responsive / accessibility acceptance

```text
Audit the complete approved UI against docs/design/POS_UI_UX_Prototype_Design_Plan.md.
Verify every screen at 320/375/768/1024/1440 px and both themes.
Verify WCAG keyboard/focus/forms/contrast with automated and manual checks.
Disconnect public internet while leaving the shop LAN and local server active:
all required sales/admin functions must continue. Simulate loss of the local server:
prevent sale submission and never display false success.

Do not add browser-side queued/sync-later sales. Ensure no remote CDN, OAuth,
remote database, telemetry blocker or internet-required font is used in production.
Return a release checklist, screenshots, test results, defects and recommended fixes.
```

---

## 11. `AGENTS.md` additions for Codex

```md
# UI Rules — Retail POS

- Read the SRS, engineering guide and UI design plan before changes.
- Admin and Salesperson have distinct server-enforced roles.
- Salesperson UI/API response MUST NOT contain remaining stock, purchase cost or profit.
- One sale = select product, quantity, flexible selling price, save (until owner approves otherwise).
- Business-critical writes must come from committed server transactions; never optimistic success.
- A new purchase cost applies to ALL currently unsold units; historic completed sale snapshots remain unchanged.
- All money is PKR; use exact numeric representation, not JavaScript float arithmetic for persisted amounts.
- A local shop server + LAN must work with no public internet; no CDN, online font, hosted auth or cloud DB dependency.
- Do not implement barcode, customers, multi-branch or expenses in v1.
- Use semantic light/dark tokens, accessible inputs, contrast checks and responsive design.
- For every UI feature cover idle, loading, empty, invalid, error, conflict and success states.
- No UI-only RBAC; verify authorization on the server.
- Implement one feature/module per task. Add tests and report verified outputs; do not claim unrun tests passed.
- Explicitly ask for owner approval of proposed non-SRS features or business rule assumptions.
```

---

## 12. UI acceptance checklist

### Salesperson

- [ ] Login routes to POS and never displays Admin content.
- [ ] Product search has no quantity/cost/profit in UI, markup, API or diagnostics.
- [ ] Sale requires product, valid quantity and valid selling price.
- [ ] Price can differ per sale (within owner-approved business policy).
- [ ] Save is disabled while awaiting result; duplicate-click cannot cause duplicate record.
- [ ] Insufficient stock message does **not** reveal remaining stock.
- [ ] Successful confirmation reflects committed server record.
- [ ] Server outage blocks sale and produces no false “recorded” notice.
- [ ] Internet outage with local LAN/server active does not block sale.

### Admin

- [ ] Can add/edit product details, opening stock and threshold.
- [ ] Can receive stock and view receipt history.
- [ ] Can update purchase cost with a warning about all unsold units.
- [ ] Historical completed sale profit remains unchanged after repricing.
- [ ] Can correct stock with before/after audit trail.
- [ ] Can view all sales, correct an erroneous sale and track correction history.
- [ ] Has daily, monthly, custom-range and product-wise revenue/profit reports.
- [ ] Can see low-stock warnings when quantity <= threshold.
- [ ] No hidden placeholder links for out-of-scope v1 features.

### All users

- [ ] Light and dark themes, including dialogs, warnings and charts, are coherent.
- [ ] Forms, errors, tables and navigation work at 320/375/768/1024/1440 widths.
- [ ] Keyboard-only navigation, focus, labels, error announcements and zoom work.
- [ ] All local assets load with public internet disconnected.
- [ ] No false-success toasts; exact server state governs updates.
- [ ] Screens use clear language and consistent Rs./PKR formatting.

---

## 13. Traceability — SRS requirement to UI

| SRS requirement | Primary screens |
|---|---|
| Roles and restricted Salesperson information | A01, P01, P02; server authorization |
| Product fields and search | A03, A04, A05, A06 |
| Initial/additional stock and history | A04, A07, A10 |
| Purchase-price amendment (applies to all remaining inventory) | A08, A05, A13 |
| Automatic stock deduction / prevent oversell | P01, P02, A10, backend |
| Flexible selling price and sale profit | P01, A12, A13 |
| Admin sale corrections / audit | A12, A13, A14 |
| Inventory corrections / audit | A09, A10 |
| Low-stock thresholds | A02, A03, A11 |
| Daily, monthly, custom reports | A02, A15 |
| Product-wise performance | A05, A16 |
| PKR default and responsive screens | All screens |
| Offline without public internet | All screens + local deployment and connectivity indicator |

---

## 14. Prototype deliverable, what it does and does not do

Open `POS_UI_Prototype.html` in a browser to inspect a **clickable, self-contained mock** with role preview, light/dark toggle, responsive styling and screen navigation. It is designed to communicate visual hierarchy and interaction patterns to the owner/Codex. It uses mock data and simulates confirmations, filters, and a few forms. It does **not** record real sales, implement database transactions, enforce production authentication, write audits, or guarantee accurate money calculations. For production, Codex must implement the server-side architecture in the engineering guide and run real tests.

**Owner sign-off gates:** approve the screen list; approve the unresolved business decisions; review the prototype in both themes on phone and desktop; approve the language for correction/repricing confirmation; only then connect to production business logic.

