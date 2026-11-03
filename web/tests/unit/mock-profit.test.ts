import { describe, expect, it } from "vitest";
import { aggregateMockProfit, calculateMockProfitTotals, formatProfitMoney, type ProfitSale } from "@/lib/admin/mock-profit";
import { aggregateMockSales, getMockRevenuePaise, mockSales } from "@/lib/admin/mock-sales";
import { getMockLowStockProducts, mockInventory } from "@/lib/admin/mock-inventory";
import { getMockSuggestedSellingPrice } from "@/lib/mock-suggested-prices";

const synthetic = (overrides: Partial<ProfitSale> = {}): ProfitSale => ({
  ...mockSales[0], id: "synthetic-test-only", quantity: 2, unitPricePaise: 120000,
  unitCostSnapshotPaise: 100000, ...overrides,
});

describe("Admin-only exact historical-cost profit calculation", () => {
  it("preserves all approved fixtures and marks every original cost and profit unavailable", () => {
    const before = JSON.stringify({ mockSales, mockInventory });
    const total = calculateMockProfitTotals(mockSales);
    expect(total).toEqual({ quantity: "42", revenuePaise: BigInt(2569000), costOfGoodsSoldPaise: null, grossProfitPaise: null, missingCostSales: 8 });
    expect(aggregateMockProfit(mockSales).map((p) => [p.productName, p.quantity, p.revenuePaise?.toString(), p.costOfGoodsSoldPaise, p.grossProfitPaise])).toEqual([
      ["Diapers", "6", "749950", null, null], ["Milk Powder", "4", "600100", null, null],
      ["Baby Wipes", "10", "349950", null, null], ["Hand Soap", "10", "125500", null, null],
      ["Rice", "5", "425000", null, null], ["Shampoo", "7", "318500", null, null],
    ]);
    expect(mockInventory).toHaveLength(7);
    expect(mockInventory.reduce((sum, p) => sum + p.quantity, 0)).toBe(123);
    expect(getMockLowStockProducts()).toHaveLength(3);
    expect(mockSales).toHaveLength(8);
    expect(getMockRevenuePaise()).toBe(BigInt(2569000));
    expect(aggregateMockSales(mockSales)[0].revenuePaise).toBe(BigInt(749950));
    expect(getMockSuggestedSellingPrice("diapers")).toBe("1250.00");
    expect(JSON.stringify({ mockSales, mockInventory })).toBe(before);
  });

  it("returns valid exact zero for an empty set, with no fabricated sale", () => {
    expect(calculateMockProfitTotals([])).toEqual({ quantity: "0", revenuePaise: BigInt(0), costOfGoodsSoldPaise: BigInt(0), grossProfitPaise: BigInt(0), missingCostSales: 0 });
    expect(aggregateMockProfit([])).toEqual([]);
  });

  it.each([
    [120000, 100000, 2, BigInt(40000), "Rs. 400.00"],
    [80000, 100000, 2, BigInt(-40000), "-Rs. 400.00"],
    [1, 2, 1, BigInt(-1), "-Rs. 0.01"],
  ])("uses actual selling price %s and the sale-time cost %s", (price, cost, quantity, expected, formatted) => {
    const total = calculateMockProfitTotals([synthetic({ unitPricePaise: price, unitCostSnapshotPaise: cost, quantity })]);
    expect(total.grossProfitPaise).toBe(expected);
    expect(formatProfitMoney(total.grossProfitPaise)).toBe(formatted);
  });

  it("aggregates distinct selling prices for one product without substituting a guide price", () => {
    const sales = [synthetic(), synthetic({ id: "synthetic-second", unitPricePaise: 99999, quantity: 3 })];
    const total = calculateMockProfitTotals(sales);
    expect(total.grossProfitPaise).toBe(BigInt(39997));
    expect(aggregateMockProfit(sales)[0].grossProfitPaise).toBe(BigInt(39997));
    expect(aggregateMockProfit(sales)[0].quantity).toBe("5");
  });

  it.each([undefined, null, -1, 100000.001, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("treats missing or invalid cost %s as unavailable, never zero", (cost) => {
    const total = calculateMockProfitTotals([synthetic({ unitCostSnapshotPaise: cost })]);
    expect(total.revenuePaise).toBe(BigInt(240000));
    expect(total.costOfGoodsSoldPaise).toBeNull();
    expect(total.grossProfitPaise).toBeNull();
    expect(formatProfitMoney(total.grossProfitPaise)).toBe("Not available");
  });

  it("propagates one missing cost through the same-product and complete totals", () => {
    const sales = [synthetic(), synthetic({ id: "synthetic-missing", unitCostSnapshotPaise: undefined })];
    expect(calculateMockProfitTotals(sales).grossProfitPaise).toBeNull();
    expect(aggregateMockProfit(sales)[0].grossProfitPaise).toBeNull();
    expect(calculateMockProfitTotals(sales).missingCostSales).toBe(1);
  });

  it("keeps a known product independently calculable while the overall total is unavailable", () => {
    const sales = [synthetic(), synthetic({ productId: "synthetic-other", unitCostSnapshotPaise: null })];
    expect(calculateMockProfitTotals(sales).grossProfitPaise).toBeNull();
    expect(aggregateMockProfit(sales).map((p) => p.grossProfitPaise)).toEqual([BigInt(40000), null]);
  });

  it("supports the existing fractional preview precision when the monetary result is exact", () => {
    const total = calculateMockProfitTotals([synthetic({ quantity: 2.5, unitPricePaise: 10100, unitCostSnapshotPaise: 10000 })]);
    expect(total.quantity).toBe("2.5");
    expect(total.revenuePaise).toBe(BigInt(25250));
    expect(total.grossProfitPaise).toBe(BigInt(250));
  });

  it("does not round or truncate a fractional-paise cost even if net profit would be integral", () => {
    const total = calculateMockProfitTotals([synthetic({ quantity: 0.5, unitPricePaise: 3, unitCostSnapshotPaise: 1 })]);
    expect(total.revenuePaise).toBeNull();
    expect(total.costOfGoodsSoldPaise).toBeNull();
    expect(total.grossProfitPaise).toBeNull();
    const exactRevenue = calculateMockProfitTotals([synthetic({ quantity: 0.5, unitPricePaise: 2, unitCostSnapshotPaise: 1 })]);
    expect(exactRevenue.revenuePaise).toBe(BigInt(1));
    expect(exactRevenue.grossProfitPaise).toBeNull();
  });

  it.each([0, -1, 0.0000001, 1000000000000])("does not accept unsupported quantity %s", (quantity) => {
    expect(calculateMockProfitTotals([synthetic({ quantity })]).grossProfitPaise).toBeNull();
  });

  it.each([0.01, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("rejects invalid paise price %s without rounding", (unitPricePaise) => {
    expect(calculateMockProfitTotals([synthetic({ unitPricePaise })]).grossProfitPaise).toBeNull();
  });

  it("accumulates beyond Number's safe range using BigInt", () => {
    const sale = synthetic({ quantity: 999999999999, unitPricePaise: 9000000000000000, unitCostSnapshotPaise: BigInt(1) });
    expect(calculateMockProfitTotals([sale, sale]).grossProfitPaise).toBe(BigInt(999999999999) * (BigInt(9000000000000000) - BigInt(1)) * BigInt(2));
  });

  it("never reads suggested or current product costs in place of the historical snapshot", () => {
    const sale = synthetic();
    for (const field of ["suggestedSellingPrice", "currentPurchaseCost", "currentCost"]) Object.defineProperty(sale, field, { get() { throw new Error("Current product information must not influence historical profit"); } });
    expect(calculateMockProfitTotals([sale]).grossProfitPaise).toBe(BigInt(40000));
    expect(formatProfitMoney(BigInt(0))).toBe("Rs. 0.00");
  });
});
