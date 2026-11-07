# Shop POS: shopkeeper demonstration

## Start from one address

```powershell
cd D:\pos\web
npm run dev -- --port 3000
```

Keep the terminal open and wait for Next.js to be ready. Open **http://localhost:3000/**; it opens Login. If port 3000 is occupied, check whether this project's server is already running. Do not stop an unknown process.

Public internet is not required while the local server and connection remain available. This preview is not a production deployment.

## Choose a preview

- Choose **Preview Admin** or **Preview Salesperson** on Login. No credentials are needed.
- Use **Back to Login** in either workspace header to switch roles.
- The Login form demonstrates validation only. Use made-up details; it cannot sign anyone in.
- Light, Dark and System are available through the Theme selector. Only the theme preference persists.

Role selection is public demo navigation. It does not authenticate users or secure Admin routes.

## Suggested walkthrough

1. **Admin:** Show Dashboard's five summaries, Products search and the existing Add/Edit, Stock Correction and Stop/Resume Selling previews.
2. **Inventory:** Show Available Stock and Low Stock, including Toothpaste at zero. The unchanged sample contains seven products, 123 stock units and three low-stock products.
3. **Sales and Reports:** Show Sales Report, Profit Report and Reports. The sample business date is **2 November 2026**, not today's live trading. Chart appearance remains deferred for shopkeeper feedback.
4. **Total Investment:** Open it directly in the Admin sidebar. Enter an amount and optional note. It starts **Not entered**, shows only temporary owner input and is not a business valuation.
5. **Make a Sale:** Return to Login and choose Salesperson. The three destinations are Make a Sale, Return Item and Shop Expenses. Select Diapers, quantity 2, actual selling price 1250.25: the no-discount total is Rs. 2,500.50. Suggested Selling Price is a guide, not the entered price.
6. **Optional discount and cash:** These controls are visible. For quantity 2 at Rs. 1,200.00, discount 10% and cash Rs. 2,500.00, subtotal is Rs. 2,400.00, discount Rs. 240.00, final amount Rs. 2,160.00 and change Rs. 340.00. Record Sale produces a simulation.
7. **Receipt:** Choose View Sample Receipt after the simulation. It is labeled SAMPLE RECEIPT - DEMO ONLY, has no official invoice ID and can open the browser print dialog. New Sale resets the preview.
8. **Return Item:** Choose an original demo sale and return quantity. The recorded-price comparison is not a refund. The page states **Refund amount not available for this demo sale.** No return, payment or stock adjustment occurs.
9. **Shop Expenses:** Add a temporary date/type/amount/note. Try correcting or removing an entry and changing Summary date. Daily and monthly totals reflect only these temporary entries.

## Honest limits

All product, stock, sale and profit records are examples. The historical purchase costs are explicitly fictional. Eight original sales total Rs. 25,690.00, fictional sold-item costs total Rs. 20,550.00 and demo gross profit is Rs. 5,140.00. Temporary expenses, returns and investment never alter these figures.

Product changes, stock corrections, Stop/Resume Selling, sale confirmations and new previews are unsaved. Leaving their page or reloading clears temporary state. No real payment, refund, inventory movement, authoritative investment/expense record, account or database transaction is created.

Discount accepts an illustrative 0-100% with at most two percentage decimals. Unsupported fractional-paisa discount/cash results are rejected rather than rounded. Blank/zero discount preserves existing exact no-discount totals, including existing sub-paisa examples. These limits do not decide production accounting or quantity policies.

Salesperson presentation excludes confidential stock quantities, costs, profits and Admin reports. Real authentication and server role enforcement remain unimplemented. These public previews must not be used with real shop records.

Manual screen-reader, native zoom, physical-device and physical receipt-printer checks remain outstanding. New visuals await owner review; chart design is still deferred.

## Portable offline showcase

Open **D:\pos\demo\shop-pos-showcase.html** directly in a modern browser. It is a separate, self-contained Light-theme showcase; it does not replace the Next.js application. It needs no local server, CDN or internet and uses bundled original project helpers.

Entries stay in memory only. Reset Demo or reload clears them. The showcase is smaller than the application and does not provide production security or persistence.

Maintainers can regenerate and verify it from the repository root:

```powershell
node web/scripts/build-demo-showcase.mjs
node web/scripts/verify-demo-showcase.mjs
```

## Feedback to collect

- Can the shopkeeper find a product and enter a sale without help?
- Are the actual selling price, optional discount and final amount clear?
- Are Return Item and Shop Expenses easy to find?
- Are labels, numbers, focus and buttons readable?
- Which step feels confusing or slow?
