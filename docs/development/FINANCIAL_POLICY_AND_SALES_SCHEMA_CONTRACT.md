# Whole-PKR financial policy and TEST Sales schema contract

12 November 2026, Asia/Karachi. **OWNER APPROVED complete TEST contract and FINAL OPTION2: per-unit FINAL payable HALF_UP first, then multiply quantity. Implementation VERIFIED TEST ONLY; production remains disabled.**

## 1. Confirmed owner policy - authoritative

This records the owner's "FINAL FINANCIAL POLICY APPROVAL + CONTINUE REAL SALES DEVELOPMENT" instruction. It supersedes the architecture's earlier paisa-cash/discount-first proposals, not historical records or fixtures.

| Decision | Approved behavior |
| --- | --- |
| P02 | Ordinary new buying/selling prices and posted invoice charges, tender, change, expenses and refunds are whole PKR. Retain INTEGER paisa and exact BigInt/rational arithmetic; never silently post fractions or rewrite old fractional records. |
| Q1 | Whole-number percentages only, per item/line, never global. "0, 5, 10, etc." does not restrict input to multiples of five. Fractional percentages such as 5.5 are invalid. Existing positive-charge/cost-floor rules still apply. |
| Q2 | HALF_UP EACH UNIT final payable, not the discount, to a whole rupee; multiply the rounded unit by whole quantity. Rs110 less5% ->Rs105/unit;3 units ->Rs315. Sum completed independent lines with no second invoice rounding. FINAL OPTION2 is approved; see section2. |
| Q3 | For original paid M whole rupees, original count N and cumulative returned r: target=HALF_UP(M*r/N); this payout=target minus all confirmed prior refunds. Rs101/3 -> Rs34,33,34. Reject invalid/inconsistent prior evidence and over-return/refund; no today's-price reconstruction. |
| D05 | ONE atomic receive-and-reprice: incoming verified actual unit cost becomes current cost of all remaining+incoming units. Preserve original receipt cost, past sold COGS and audited valuation delta. Revaluation is not realized profit; no FIFO/weighted average. |
| P08 | Asia/Karachi midnight rollover; next-day sales continue with old closing pending. Admin-only later count must account for signed flows between midnight and actual count, preserve date/history and avoid duplicates. No invented opening cash, automatic close/reset, write-off, profit adjustment or unapproved variance posting. |

Both roles still require8+ exact-input passwords; five consecutive failures cause30-second persistent cooldown. RAM sessions and current SQL authorization remain mandatory. These policies do not approve production, recovery/key custody or new migrations.

Preserve P01 whole PACK/BOX counts; P04 final line charge >= quantity*authoritative current cost, positive unit/final amounts, at-cost allowed, no override/cross-line subsidy. Snapshot cost after writer reservation. Shared SALESPERSON is not an individually identified employee. Returns remain inspection-first. Purchases are not operating expenses.

Expense funding defaults, saved-invoice correction/repricing authority and cash-variance posting remain separate affected-module gates. They do not block initial Sales.

## 2. FINAL OPTION2 - owner approved, supersedes earlier recommendation

For EACH product independently: rounded_unit_rupees=HALF_UP(unit_price_rupees*(100-discount_percent)/100); line_rupees=rounded_unit_rupees*whole_quantity; invoice_rupees=sum(lines). No global discount, extended-line rounding, discount-first rounding or second invoice round. Persist immutable rounded unit charge, original percent/quantity, exact rational numerator/denominator and policy version.

A:110 less5%,3 units ->105*3=315. B:500 less0%,2 ->1000. C:103 less20%,4 ->82*4=328. Invoice1643. At110 less5%,1000 units ->105000. Boundaries700.01/700.49 ->700;700.50/700.99 ->701;45700.99 ->45701. Use exact bounded BigInt. The final line must meet quantity*current buying cost; reject below-cost without increasing customer price. Cumulative original-paid Q3 refunds remain unchanged.

Audit history:12 November initial review recommended extended-line314 versus per-unit315, but no implementation was approved then. The owner explicitly selected OPTION2 and approved this full contract; the earlier314 recommendation is SUPERSEDED, never an implementation default.

## 3. APPROVED TEST-only preserving schema transition

Approved ONE exact-byte/checksum-pinned multi-statement program, 0036_sales_and_stock_ledger.sql, applied as a single explicit TEST maintenance transaction from exact35 to exact36. A fresh disposable TEST installation may explicitly apply the preserved35 prefix then this program; startup never migrates. No schema8 enrolled upgrade or real-shop maintenance is authorized. Do not broadly enable DROP/ALTER/PRAGMA/arbitrary SQL in the existing additive runner.

### Six new STRICT append-only tables

| Table | Purpose and required relationships |
| --- | --- |
| sale_operations | UUID id PK, unique UUID request_key, installation/context fingerprint, fixed SALESPERSON FK actor, non-bearer session reference, canonical validated command+SHA256, policy version and server time. A unique invoice binding and deferred composite FK must guarantee the matching invoice exists before COMMIT. No credential/bearer. |
| sales | UUID id PK and unique immutable invoice_number, unique matching operation FK, original server time/Karachi date, SALESPERSON actor, positive whole-PKR total and private exact COGS/gross profit. Version1 only; no correction API or mutable historical totals. Original operation/invoice pair is one-to-one. |
| sale_lines | UUID id PK; invoice FK; unique(invoice_id,line_no), unique(invoice_id,product_id), unique(id,product_id) for movement FK. Whole positive quantity, entered whole-PKR unit price, integer discount0..100 subject to positive final charge/floor, exact base/final charge/current-cost and COGS snapshots, policy/rounding evidence. Immutable product code/name/size/unit snapshots; no current-product-price reconstruction. |
| invoice_snapshots | Invoice PK/FK; versioned bounded allowlisted receipt JSON and SHA256, server timestamp. Trusted server-configured TEST shop identity plus original lines, optional validated customer details and payment evidence. No HTML, costs, profit, stock, secrets or browser-selected shop authority. |
| sale_payments | UUID PK; unique invoice FK, explicit actual whole-PKR tender, change and net received, server time/date; net=invoice charge, tender>=net, change=tender-net. Insert only when actual cash input is supplied and confirmed; blank optional cash means UNRECORDED, never inferred paid/zero. No credit/customer-debt facility or later collection API is introduced. |
| sale_cancellations | UUID request_key PK, exact TEST installation/context, ADMIN-only authorizer/non-bearer session reference and server time. Permanent fence; no financial payload. Mutually exclusive with committed sale_operations by insert guards on BOTH tables. |

Final SQL must enumerate exact types, length/amount limits, CHECKs, FK pairs, all unique/partial indexes and their collision guards. Derived amount/quantity checks must avoid overflowing SQLite INTEGER into REAL. Cross-row line sums, payment equality, source linkage and full stock chain are verified in the SAME transaction, alongside FK/integrity checks. If SQL cannot enforce a required pairing at COMMIT, do not silently replace it with a weaker partial-record design.

Human-readable initial TEST invoice number uses the complete server-generated UUID with TEST prefix (unique constraint); no unapproved fiscal/sequential numbering claim or counter reset. Receipt reprint/history use saved snapshots. Customer details stay optional, bounded and outside operation logs/browser storage.

### Extend the SAME stock_movements ledger

Existing0013 permits only OPENING/RECEIVE/ADJUST, operation_id is NOT NULL/UNIQUE and references ADMIN-only inventory_operations. Merely adding a Sales table or reducing balance breaks the current sum/chain invariants. Do NOT label a sale ADJUST or create a separate stock ledger.

The approved program rebuilds ONLY stock_movements into its reviewed target definition:
- Preserve every old row's physical rowid and all nine old column values exactly. Add nullable sale_line_id; retain original PK id, nullable-UNIQUE operation_id, unique(product_id,balance_version), original OPENING partial-unique index and original legacy FK.
- Legacy kinds require operation_id nonnull and sale_line_id null. SALE requires operation_id null, sale_line_id nonnull, negative delta and after>=0. A unique sale_line_id and composite FK(sale_line_id,product_id) bind exactly one deduction to the correct original invoice line.
- All balance, scale, sign, before+delta=after and cost-snapshot constraints remain. One shared product/version chain and sum of ALL movements equals stock_balances. Cost-only version gaps remain valid.
- No inbound FK to stock_movements exists in the current35 definitions. Nevertheless reverify actual source metadata before any rebuild. Build/copy/validate target, replace the old table and recreate its original index/four guards INSIDE the one transaction with foreign_keys ON throughout.
- Retain all16 original audit trigger definitions/names and protections exactly in final36. Add the missing sale_line_id uniqueness collision guard. Recreate existing stock guards identically after table replacement; do not edit historical SQL/pins. No externally visible interval without guards.
- Every new append-only table gets BEFORE INSERT protection for EACH PK/UNIQUE/partial/hidden-rowid collision, UPDATE and DELETE rejection, and positive-physical-rowid protection. Test REPLACE/INSERT OR REPLACE and UPSERT with recursive_triggers OFF AND ON. SQL OR IGNORE must not be accepted as successful partial posting.
- Pre/post compare old row values/rowids, auth/provisioning/enrollment, old35 history records, product/balance/operation/event/cancellation/identifier records, FK/integrity and current ledger sums. The only initial changes are target schema, new empty tables, new index/guard metadata and history/version36. A failure at any step/COMMIT rolls the whole transition back; unknown COMMIT is inspected explicitly, never retried automatically.
- No preserved balance/value or product cost is rewritten by the schema migration. D05 later service writes audit before/after cost and actual receipt snapshot in the existing operation/event evidence, revalues all remaining+incoming stock atomically and uses explicit INSERT column lists. Existing immutable original-key results stay unchanged.

Retain exact8/18/35 inspection authorities and0001-0035 bytes/history. Add a distinct final36 DDL/index/FK/guard manifest, rather than deriving rebuilt objects from old CREATE text or loosening current35 admission. Controlled TEST startup and every business transaction require its configured exact profile, with no fallback on mismatch. Raise metadata budgets only if the enumerated reviewed36 objects actually require it. Original schema8 enrollment anchor remains untouched; this TEST upgrade proves no protected production maintenance authority.

The controlled rebuild expands the current additive-only migration architecture. This gate is APPROVED by the owner final OPTION2 decision; implement and verify the bounded transition without production activation. Once real sales exist, old35 app code is incompatible: never auto-downgrade or discard sales; recovery requires separately verified compatible restore. Production portable backup/independent restore gates remain unmet.

## 4. Approved coordinated Sales/API/UI behavior

Use the SAME gateway/native owner/serialized writer and trusted fixed-role HTTPS hosts. No raw Better Auth/Next proxy, public signup, alternate owner, auth policy or LAN activation.

Approved endpoint inventory (implemented only in explicitly enabled isolated TEST runtime):
- SALESPERSON: GET /api/pos/products (bounded safe catalog); GET /api/pos/sales/context; POST /api/pos/sales; GET /api/pos/sales (bounded history); GET /api/pos/sales/:uuid (saved receipt); GET /api/pos/sale-operations/:uuid (explicit terminal/UNKNOWN lookup).
- ADMIN: GET/POST /api/admin/sale-operations/:uuid/recovery (explicit authoritative reconcile-or-permanently-cancel; existing proof of commit takes precedence). Salesperson cannot cancel or create Admin authority.
- Preserve all existing14 API entries. Add exact method/path, role, bounded input/output and negative evidence to the cumulative API inventory only when implemented. No generic financial endpoint or correction/refund/expense/closing handler.

Only signed current-role cookies plus authoritative SQL authorize. Server supplies actor, dates, IDs, context and private cost snapshots. Client supplies bounded distinct product IDs, whole quantities/entered prices/whole-percent discounts, optional customer/cash and original request key; reject cost, role, stock, profit and claimed totals. Implemented limits:50 distinct lines,64KiB sale JSON,100 catalog results and50 history results/page with server-validated UUID keyset cursor; retain existing8KiB/64-pair header, transport/origin/CSRF/strict JSON/no-store/generic-error controls. These are input safety limits, not a new lockout policy.

Within ONE authorized writer transaction: verify context/idempotency/fence; read authoritative active products and complete current stock chain; revalidate all lines and cost floor; compute exact totals/snapshots; conditionally update balances/versions; write paired operation/invoice, all lines/deductions, optional confirmed payment and safe receipt; validate sums/source completeness; COMMIT. Reject any insufficiency/stale/inactive/inconsistent line without disclosing available quantities or cost. No partial invoice, duplicate deduction or success before COMMIT. Repricing/receiving serialize with sale cost capture.

Genuine original-key replay requires the same validated command/context/actor, returns the original saved invoice without rewriting cost or revalidating today's price floor, but still requires current authorization and integrity. Concurrent identical requests create once; changed-command reuse conflicts. Response loss/timeout/404 remains UNKNOWN, not failure. Browser stores only bounded context/key/kind/state in durable IndexedDB with atomic cross-tab coordination; no cart/customer/cost/password/bearer persisted, no RAM-only fallback, automatic expiry or replacement key.

After a lost response/relaunch: authenticate afresh, query original key, recover verified saved invoice or remain blocked. Genuine Admin may resolve or permanently cancel that exact key in the SAME writer; delayed original requests are fenced. Clearing a cancelled marker requires fresh SQL evidence of the Admin-confirmed terminal fence. Successful normal Sales acknowledgement is of the actual saved invoice; it does not silently grant Salesperson Inventory-recovery authority. Lost/cleared browser storage remains an explicitly unproven recovery case, never a no-duplicate guarantee.

Preserve existing /pos cart/receipt/history layout and ordinary mock previews. TEST data wiring requires server-gated /pos and /pos/history, role-safe catalog/history and logout. Existing Create Invoice opens the review draft, including optional actual-cash input; an explicit Confirm and Save action performs the single sale POST before showing a saved official TEST invoice or enabling saved-invoice Print. Edit Sale only edits an unsaved draft; committed invoices remain read-only. Necessary status/error/confirmation wiring is not an optional visual redesign. Do not expose other demo business pages as live.

Refund Q3, D05 and P08 are approved policies, not claims of delivered workflows. No automatic refund, stock disposition, expense/cash variance, opening cash or closing is added. A missing payment snapshot cannot be reconstructed as paid for a later refund; cash reports remain incomplete where evidence is missing.

## 5. Approved implementation/file/test scope

New: the single0036 program plus exact final-schema/guard authority as needed; server/sales contracts, validation, calculations, service, reads, recovery; hosting/sales-http and TEST render context; lib/sales client/recovery marker; focused schema/service/HTTPS/browser tests and scoped configs.

Modify: db/migrate, schema-pins, reviewed-schema, validate-schema (and schema guard authority); inventory mutation explicit columns/D05, model/reads/history/recovery dependencies; gateway required-schema type and TEST runtime/HTTPS/page allowlists; Login destination, existing /pos layout/page/history, cart/receipt/history data wiring and Back to Login; continuity/matrix evidence. Reuse password/session code. No historical migration edits, dependencies, business fixtures or unrelated modules.

Verify real installed Better Auth/native SQLite and trusted HTTPS/Chromium: populated exact35->36 row/rowid/history preservation; failure at each DDL/copy/guard/history/COMMIT step; manifest tampering/partial/newer/extra objects denial; all unique/physical collision and UPSERT paths OFF/ON; legitimate prior Admin flows and recovery; approved exact financial examples/overflow; two simultaneous final-unit sales; multi-line rollback/receive/reprice races; genuine role isolation/no cost or stock leaks; same-key replay/changed payload; lost responses, crash/relaunch/two tabs/UNKNOWN/cancellation races; revocation/expiry/restart; saved invoice persistence; actual cash only; scoped TypeScript/ESLint and necessary isolated build. Reuse prior52 evidence instead of rerunning everything.

## 6. Approval and implementation status

Owner explicitly approved the complete coordinated TEST36 schema/API/recovery/minimal-UI contract WITH OPTION2 per-unit HALF_UP. Do not ask for this approval again. Existing0001-0035, historical rows/rowids, original anchor, auth and business data must remain. Blank actual cash remains UNRECORDED. Production/real-shop migration/recovery/key custody/remote Admin remain excluded. Implementation and actual real-native/HTTPS/browser evidence will be recorded in a separate report; approval alone is not PASS.

Current TEST-only delivery/evidence: [Sales36 implementation report](SALES_SCHEMA36_COORDINATED_TEST_IMPLEMENTATION_REPORT.md).64 distinct checks pass across recorded runs; scoped TypeScript/zero-warning ESLint and final isolated build pass. Production remains disabled.
