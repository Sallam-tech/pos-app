# B2 Part5 current integration

A narrow Admin-only TEST HTTP/UI slice now calls this SAME service/gateway. getOperationResult adds authorized CREATE/RECEIVE request-key reconciliation; the random request key grants no access. No production activation, historical migration change, business-policy change or DB owner is added. See docs/development/INVENTORY_B2_PART5_TEST_API_UI_REPORT.md. Earlier private-only scope statements below are historical Part1/2 boundaries; production limitations remain.

# Private Products and Inventory - B2 Part 1

Server-only foundation. No HTTP route, UI binding, shop data or production activation.
Compose createInventoryService with the existing trusted AuthorizationGateway.
Every call, including reads and idempotent replay, uses withAdminTransaction and its
single native owner, official adapter transaction, writer reservation, signed ADMIN
cookie and authoritative SQL checks before work and again before COMMIT. A role,
Actor, transaction, SQL string or verifier is never accepted from a browser.

## Private operations

Input definitions: contracts.ts. Runtime input is always treated as unknown and
strictly validated; unknown members/accessors and implicit numeric conversions reject.
All prices are canonical positive INTEGER PAISA strings (not rupee decimal input).
Quantities are canonical whole PACK/BOX strings; Q storage scales by 1000000, with
no conversion between independent variants. Quantity maximum is 999999999999 whole
units; price maximum is 99999999999999 paisa, subject also to signed-int64 value and
aggregate bounds. BigInt arithmetic only. No sales/discount/P02 rounding policy.

| Method | Purpose and additional required input |
| --- | --- |
| createProduct | Exact create contract; optional immutable unique code, otherwise random code; required openingQuantity (zero allowed), known buying cost, threshold, unit, sellingActive and nullable normal selling price |
| updateProduct | Only name, category, barcode and/or threshold; cannot change stock, cost, code, unit or variant size |
| setSellingPrice | Explicit positive normal selling price at least current buying cost |
| setSellingStatus | Stop/Resume; resume requires unarchived product and valid normal price |
| archiveProduct | Retain identity, balances and all history; stop selling; no unarchive/delete capability |
| changeBuyingCost | Explicit confirmAllRemaining=true; revalue ALL remaining physical stock; keep quantity, normal price and historical snapshots unchanged |
| receiveStock | Positive quantity, unitBuyingPricePaisa equal to CURRENT cost; optional reference; no purchase-payment processing |
| correctStock | Nonnegative targetQuantity; mandatory reason; signed before/delta/after movement |
| getProduct | One Admin-only detail by productId |
| listProducts | Bounded query/status/stock filters, overall and filtered totals, UUID keyset page |
| listMovements | Product-scoped, descending balance-version keyset page |
| listProductEvents | Product-scoped before/after audit, descending server timestamp/operation-ID keyset page |

Mutations require UUID-v4 requestKey. Existing-product mutations also require
productId, expectedProductVersion and reason. Receive/correct/reprice additionally
require expectedBalanceVersion. The gateway supplies ADMIN actor and NON-BEARER
session reference. Neither is a substitute for an authenticated signed session.
A stale edit conflicts; retries must reuse the exact original payload and key.
Key, canonical payload/checksum, original safe result, audit, balance and movement
commit together. Same key with another valid payload conflicts. Replays return the
ORIGINAL result, not a fresh snapshot, only after current inventory integrity and
authorization checks. Keep request keys permanently with history; no auto-pruning.

Opening stock is initialized ONLY during product creation. Positive opening has
one immutable-by-service movement/cost snapshot; zero opening has no zero movement,
but the opening-operation balance latch and creation audit still record initialization.
Receiving and corrections preserve the then-current cost in each movement. Explicit
cost changes have a before/after event and signed valuation delta, never a fictitious
quantity movement. Repricing above an old normal price sets priceNeedsReview; it
does not silently change that price. Future sales MUST enforce the approved cost floor.
Archived physical stock may be corrected/repriced and remains in valuation; receiving
and metadata/resume changes on archived products reject.

Query status: ALL / SELLING / STOPPED / ARCHIVED. Stock: ALL / AVAILABLE (physical
quantity > 0, independent of selling/archive flag) / LOW (quantity <= threshold,
INCLUDING zero) / OUT (zero). Combine filters explicitly; catalog ALL includes zero,
stopped and archived records. Search is literal Unicode-lowercased name substring,
exact uppercase code or exact case-sensitive opaque barcode; no SQL wildcard semantics.
Barcodes preserve leading zeros; no GTIN/check-digit/scanner or multiple-barcode claim.
Limits are 1..100 (default50); product cursor is UUID, movement cursor positive version,
event cursor operation UUID. Returned quantity/money/version/timestamp fields are strings.
Overall/filtered totals exclude page cursor, include retained physical stock and use
INTEGER SUM plus exact cached per-product value. Overflow denies; never REAL or zero.

## Future HTTP contract - PROPOSED, NOT ACTIVATED

Reviewed Admin-only host/CSRF/body/header protections and the same live gateway must
surround each method. Proposed paths are GET/POST /api/admin/products, GET/PATCH
/api/admin/products/:id, POST subresources selling-price, selling-status, archive,
buying-cost, receipts and corrections, and GET inventory, movements and events.
Use an exact request-key mapping, reviewed bounded rupee-to-paisa parsing, optimistic
versions and generic safe responses. No raw table/SQL/auth API or Salesperson stock,
cost or profit projection. Session-status or UI role state alone cannot authorize calls.
No route exists for these proposals; existing production authentication stays disabled.

## Production gates and precise limitations

- D05 differing-cost receiving remains POLICY_PENDING. No FIFO, averaging or combined
  reprice/receipt policy is inferred. P02/P08, purchasing, sales and cash are untouched.
- Existing trusted enrollment/bootstrap/anchor validation is fixed to eight auth
  migrations. New0009..0018 explicitly migrate TEST databases only. TEST integration
  first provisions via the existing eight-migration TEST provisioner, closes it, then
  applies the business migrations and opens the SAME gateway. This proves upgraded
  auth-data/history/binding preservation, NOT production anchor/restore acceptance.
  Reviewed maintenance and enrollment/anchor compatibility are required before deployment.
- Movements, operations and events are append-only through this service: no history
  update/delete method. The approved migration grammar does NOT permit the architecture's
  proposed update/delete-blocking triggers. Database-level append-only guards therefore
  remain a production integrity gate requiring separate review; no grammar weakening
  or claim of resistance to privileged ad-hoc SQL was introduced. Integrity reads detect
  balance/sum mismatch and ordered movement before/after discontinuity. Event reads bind
  snapshots to the product and require before data except at creation. These checks
  are not a complete tamper-proof audit mechanism.
- Current cached stock value is checked exactly using integer division/remainder and
  bound to the product cost by a deferred composite FK. Service computes changes with
  BigInt before writes. No SQL financial multiplication or REAL coercion is used.
- New products and totals require known positive costs. Native CHECK/FK/STRICT plus
  service validation reject invalid state; native SUM overflow fails generically.
- Domain errors expose only a private code and fixed generic message, without SQL causes.
  The wrapper preserves known domain rejection only AFTER the gateway rolls back.
  SQL/COMMIT/auth failure never publishes success. A lost COMMIT acknowledgement can
  mean the operation committed: retry the ORIGINAL request key after trusted reauthorization.
- No durable Admin HTTP, UI, enrollment, backup/restore, WAN-off deployment, target-machine
  load/power-cut or malicious-disk-tamper claim. UTC server timestamps are automatic;
  no backdating, date attribution or inventory conversion policy is added.

Verification: vitest run --config vitest.inventory.config.mts; tsc --noEmit -p
 tsconfig.inventory.json; scoped ESLint. Tests use fake RAM credentials, actual Better
Auth/native scrypt/signed cookies and SQLite, with fault-only passthrough instrumentation.
No testUtils, mock authorizer, demo-business imports or production data.
