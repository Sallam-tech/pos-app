import { describe, expect, it } from "vitest";
import { calculateInvestmentOverview, getDemoInvestmentOverview, quantityCostPaise, validateStockPurchase, type PurchaseSnapshot } from "@/lib/admin/stock-investment-preview";
import { mockInventory } from "@/lib/admin/mock-inventory";

const purchase = (id: string, quantity: string, cost = BigInt(10000)): PurchaseSnapshot =>
  ({ purchaseId: id, quantity, unitBuyingCostSnapshotPaise: cost });
const stock = (quantity: string, cost: bigint | null = BigInt(10000)) =>
  [{ id: "example", name: "Example only", quantity, currentBuyingCostPaise: cost }];

describe("purchase expenditure versus remaining-stock valuation", () => {
  it("preserves original purchase expenditure across sales, restocking and explicit revaluation", () => {
    const first = Object.freeze(purchase("example-1", "10"));
    const ledger = Object.freeze([first]);
    expect(calculateInvestmentOverview(ledger, stock("10"), true)).toMatchObject({ totalInvestmentPaise: BigInt(100000), stockValuePaise: BigInt(100000) });
    expect(calculateInvestmentOverview(ledger, stock("6"), true)).toMatchObject({ totalInvestmentPaise: BigInt(100000), stockValuePaise: BigInt(60000) });
    const restocked = [...ledger, purchase("example-2", "5")];
    expect(calculateInvestmentOverview(restocked, stock("11"), true)).toMatchObject({ totalInvestmentPaise: BigInt(150000), stockValuePaise: BigInt(110000) });
    expect(calculateInvestmentOverview(restocked, stock("11", BigInt(12000)), true)).toMatchObject({ totalInvestmentPaise: BigInt(150000), stockValuePaise: BigInt(132000) });
    // Rename, correction/return quantities and different current prices never add purchases.
    expect(calculateInvestmentOverview(ledger, [{ ...stock("8")[0], name: "Renamed" }], true).totalInvestmentPaise).toBe(BigInt(100000));
    expect(first.unitBuyingCostSnapshotPaise).toBe(BigInt(10000));
  });
  it("uses each original receipt cost even when remaining inventory has a different current cost", () => {
    expect(calculateInvestmentOverview([purchase("a", "10"), purchase("b", "5", BigInt(12000))], stock("11", BigInt(12000)), true))
      .toMatchObject({ totalInvestmentPaise: BigInt(160000), stockValuePaise: BigInt(132000) });
  });
  it("keeps incomplete purchase history and unknown current costs unavailable, including zero stock", () => {
    const snapshot = JSON.stringify(mockInventory);
    const overview = getDemoInvestmentOverview();
    expect(overview.totalInvestmentPaise).toBeNull();
    expect(overview.stockValuePaise).toBeNull();
    expect(overview.products).toHaveLength(7);
    expect(overview.products.every((row) => row.currentBuyingCostPaise === null && row.stockValuePaise === null)).toBe(true);
    expect(quantityCostPaise("0", null)).toBeNull();
    expect(calculateInvestmentOverview([purchase("a", "2")], stock("1"), false).totalInvestmentPaise).toBeNull();
    expect(JSON.stringify(mockInventory)).toBe(snapshot);
  });
  it("distinguishes known zero from missing information without fabricating purchases", () => {
    expect(calculateInvestmentOverview([], stock("0"), true)).toMatchObject({ totalInvestmentPaise: BigInt(0), stockValuePaise: BigInt(0) });
    expect(quantityCostPaise("5", BigInt(0))).toBe(BigInt(0));
  });
  it.each(["", "-1", "1e3", "0.0000001", "1000000000000"])("rejects unsupported valuation quantity %j", (value) => {
    expect(quantityCostPaise(value, BigInt(10000))).toBeNull();
  });
  it("uses exact paise for decimal quantities and refuses rounding", () => {
    expect(quantityCostPaise("0.125", BigInt(10000))).toBe(BigInt(1250));
    expect(quantityCostPaise("2", BigInt(125025))).toBe(BigInt(250050));
    expect(quantityCostPaise("0.001", BigInt(1))).toBeNull();
    expect(quantityCostPaise("999999999999", BigInt("99999999999999"))).toBe(BigInt("999999999999") * BigInt("99999999999999"));
    expect(quantityCostPaise("2", BigInt(-1))).toBeNull();
  });
  it("does not double-count duplicate receipts or present invalid purchase history as a valid total", () => {
    for (const ledger of [
      [purchase("a", "2"), purchase("a", "2")],
      [purchase("", "2")], [purchase("a", "0")], [purchase("a", "-1")],
      [{ ...purchase("a", "1"), unitBuyingCostSnapshotPaise: null }],
      [purchase("a", "0.001", BigInt(1))],
    ]) expect(calculateInvestmentOverview(ledger, stock("1"), true).totalInvestmentPaise).toBeNull();
  });
});

describe("unsaved stock purchase input", () => {
  it.each(["100", "100.5", "100.50", "100.99", "1,250.25"])("accepts valid buying price %s", (buyingPrice) => {
    expect(validateStockPurchase({ quantity: "2", buyingPrice, sellingPrice: "" })).toEqual({});
  });
  it.each(["100.999", "0.001"])("rejects excess price precision without rounding %s", (buyingPrice) => {
    expect(validateStockPurchase({ quantity: "2", buyingPrice, sellingPrice: "" }).buyingPrice).toBe("Enter a price with no more than 2 decimal places.");
  });
  it.each(["", "0", "-1", "abc", "1e3", "0.0000001"])("rejects invalid bought quantity %j", (quantity) => {
    expect(validateStockPurchase({ quantity, buyingPrice: "100", sellingPrice: "" }).quantity).toBeTruthy();
  });
  it.each(["", "0", "-1", "not money", "1e3"])("keeps the existing positive buying-price preview policy for %j", (buyingPrice) => {
    expect(validateStockPurchase({ quantity: "2", buyingPrice, sellingPrice: "" }).buyingPrice).toBeTruthy();
  });
  it("validates optional proposed selling prices, fractional precision and required fields", () => {
    expect(validateStockPurchase({ quantity: "", buyingPrice: "", sellingPrice: "" })).toMatchObject({ quantity: "Enter the quantity bought.", buyingPrice: "Enter a buying price in PKR." });
    expect(validateStockPurchase({ quantity: "0.125", buyingPrice: "100", sellingPrice: "1250.00" })).toEqual({});
    for (const sellingPrice of ["0", "-1", "100.999"]) expect(validateStockPurchase({ quantity: "2", buyingPrice: "100", sellingPrice }).sellingPrice).toBeTruthy();
    expect(validateStockPurchase({ quantity: "0.001", buyingPrice: "0.01", sellingPrice: "" }).quantity).toMatch(/will not round/);
  });
});
