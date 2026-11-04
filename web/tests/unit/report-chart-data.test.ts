import { describe, expect, it } from "vitest";
import { getFictionalProfitSales } from "@/lib/admin/mock-historical-costs";
import { calculateMockProfitTotals, type ProfitSale } from "@/lib/admin/mock-profit";
import { mockSales } from "@/lib/admin/mock-sales";
import { selectMockSalesPeriod } from "@/lib/admin/mock-sales-report";
import { chartWidthPercent, productChartRows, timeChartRows } from "@/lib/admin/report-chart-data";

const sales = getFictionalProfitSales();
const example = (overrides: Partial<ProfitSale> = {}): ProfitSale => ({
  ...sales[0], id: "test-only", productId: "test-only", productName: "Test product",
  quantity: 1, unitPricePaise: 100, unitCostSnapshotPaise: 50, ...overrides,
});

describe("exact chart projections from the existing financial helpers", () => {
  it("reconciles all eight sales, revenue, costs, profit, quantity and product count", () => {
    expect(sales).toHaveLength(8);
    expect(calculateMockProfitTotals(sales)).toMatchObject({
      quantity: "42", revenuePaise: BigInt(2569000),
      costOfGoodsSoldPaise: BigInt(2055000), grossProfitPaise: BigInt(514000), missingCostSales: 0,
    });
    const ranked = productChartRows(sales, "profit");
    expect(ranked).toHaveLength(6);
    expect(ranked[0]).toMatchObject({ id: "diapers", value: BigInt(129950), display: "Rs. 1,299.50" });
    expect(ranked.reduce((total, row) => total + row.value!, BigInt(0))).toBe(BigInt(514000));
    expect(mockSales.every((sale) => !("unitCostSnapshotPaise" in sale))).toBe(true);
  });

  it("ranks exact quantities descending and breaks ties by name then product id", () => {
    const ranked = productChartRows(sales, "sales");
    expect(ranked.map(({ label, display }) => [label, display])).toEqual([
      ["Baby Wipes", "10 units"], ["Hand Soap", "10 units"], ["Shampoo", "7 units"],
      ["Diapers", "6 units"], ["Rice", "5 units"], ["Milk Powder", "4 units"],
    ]);
    expect(productChartRows([
      example({ productId: "b", productName: "same", quantity: 0.5 }),
      example({ productId: "a", productName: "Same", quantity: 0.5 }),
    ], "sales").map((row) => [row.id, row.value, row.display])).toEqual([
      ["a", BigInt(500000), "0.5 units"], ["b", BigInt(500000), "0.5 units"],
    ]);
  });

  it("shows only the actual demo day or month without manufactured history", () => {
    expect(timeChartRows(sales, "sales", "daily")).toEqual([
      { id: "2026-11-02", label: "02 Nov 2026", value: BigInt(2569000), display: "Rs. 25,690.00" },
    ]);
    expect(timeChartRows(sales, "profit", "monthly")).toEqual([
      { id: "2026-11", label: "November 2026", value: BigInt(514000), display: "Rs. 5,140.00" },
    ]);
  });

  it("groups synthetic test-only business dates inclusively and chronologically without UTC conversion", () => {
    const dated = [
      example({ id: "a", businessDate: "2026-12-01" }),
      example({ id: "b", businessDate: "2026-11-30" }),
      example({ id: "c", businessDate: "2026-11-01" }),
    ];
    expect(timeChartRows(dated, "sales", "daily").map((row) => row.id)).toEqual(["2026-11-01", "2026-11-30", "2026-12-01"]);
    expect(timeChartRows(dated, "profit", "monthly").map((row) => [row.id, row.value])).toEqual([
      ["2026-11", BigInt(100)], ["2026-12", BigInt(50)],
    ]);
    const selected = selectMockSalesPeriod(dated, { kind: "custom", from: "2026-11-30", to: "2026-12-01" });
    expect(timeChartRows(selected.sales as ProfitSale[], "sales", "daily").map((row) => row.id)).toEqual(["2026-11-30", "2026-12-01"]);
  });

  it("preserves exact losses, break-even and fractional quantities without inventing a rounding policy", () => {
    expect(productChartRows([example({ quantity: 0.5, unitCostSnapshotPaise: 102 })], "profit")[0]).toMatchObject({
      value: BigInt(-1), display: "-Rs. 0.01",
    });
    expect(timeChartRows([example({ unitCostSnapshotPaise: 100 })], "profit", "daily")[0].display).toBe("Rs. 0.00");
    expect(timeChartRows([example({ quantity: 0.001 })], "profit", "daily")[0].value).toBeNull();
  });

  it.each([undefined, null, -1, 0.1, Number.MAX_SAFE_INTEGER + 1])("does not replace missing or invalid historical cost %s with zero", (cost) => {
    const partial = [sales[0], example({ unitCostSnapshotPaise: cost })];
    expect(calculateMockProfitTotals(partial).grossProfitPaise).toBeNull();
    expect(timeChartRows(partial, "profit", "daily")[0]).toMatchObject({ value: null, display: "Not available" });
    expect(productChartRows(partial, "profit").find((row) => row.id === "test-only")?.value).toBeNull();
  });

  it("has no fake bars for empty periods, and no zero substitute for invalid sale values", () => {
    expect(productChartRows([], "sales")).toEqual([]);
    expect(timeChartRows([], "profit", "monthly")).toEqual([]);
    expect(calculateMockProfitTotals([]).grossProfitPaise).toBe(BigInt(0));
    expect(productChartRows([example({ quantity: -1 })], "sales")[0].value).toBeNull();
  });

  it("converts only bounded drawing ratios, even for money far beyond Number precision", () => {
    const huge = BigInt(10) ** BigInt(100);
    expect(chartWidthPercent(huge, huge)).toBe(100);
    expect(chartWidthPercent(-huge / BigInt(2), huge)).toBe(50);
    expect(chartWidthPercent(huge * BigInt(2), huge)).toBe(100);
    expect(chartWidthPercent(null, huge)).toBe(0);
    expect(chartWidthPercent(BigInt(1), BigInt(0))).toBe(0);
    const row = productChartRows([example({ unitCostSnapshotPaise: huge })], "profit")[0];
    expect(row.value).toBe(BigInt(100) - huge);
    expect(row.display).not.toContain("e+");
  });
});
