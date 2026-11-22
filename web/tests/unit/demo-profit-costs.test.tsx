import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardPage from "@/app/admin/dashboard/page";
import TodayProfitPage from "@/app/admin/profit/today/page";
import { AddProductPreview } from "@/components/admin/add-product-preview";
import { fictionalHistoricalUnitCosts, getFictionalProfitSales } from "@/lib/admin/mock-historical-costs";
import { aggregateMockProfit, calculateMockProfitTotals, formatProfitMoney, profitDecimal } from "@/lib/admin/mock-profit";
import { aggregateMockSales, getMockRevenuePaise, mockSales } from "@/lib/admin/mock-sales";
import { selectMockSalesPeriod, type MockReportPeriod } from "@/lib/admin/mock-sales-report";
import { getMockLowStockProducts, mockInventory } from "@/lib/admin/mock-inventory";
import { getMockSuggestedSellingPrice } from "@/lib/mock-suggested-prices";

describe("explicit fictional sale-time costs", () => {
  it("provides exactly one positive integer-paise entry for each original sale, with no duplicate or orphan", () => {
    const ids = fictionalHistoricalUnitCosts.map((cost) => cost.saleId);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
    expect([...ids].sort()).toEqual(mockSales.map((sale) => sale.id).sort());
    for (const cost of fictionalHistoricalUnitCosts) {
      expect(Number.isSafeInteger(cost.unitCostSnapshotPaise)).toBe(true);
      expect(cost.unitCostSnapshotPaise).toBeGreaterThan(0);
    }
  });

  it("joins by stable sale ID rather than array order and leaves every original field unchanged", () => {
    const original = JSON.stringify(mockSales);
    const reversed = [...mockSales].reverse();
    const joined = getFictionalProfitSales(reversed);
    expect(joined.map(({ unitCostSnapshotPaise, ...sale }) => {
      expect(unitCostSnapshotPaise).toBe(fictionalHistoricalUnitCosts.find((cost) => cost.saleId === sale.id)?.unitCostSnapshotPaise);
      return sale;
    })).toEqual(reversed);
    expect(getFictionalProfitSales()).toEqual(getFictionalProfitSales());
    expect(JSON.stringify(mockSales)).toBe(original);
    expect(mockSales.every((sale) => !("unitCostSnapshotPaise" in sale))).toBe(true);
  });

  it("traces exact COGS and profit to each individual original sale ID", () => {
    const sales = getFictionalProfitSales();
    expect(sales.map((sale) => {
      const line = calculateMockProfitTotals([sale]);
      const expectedRevenue = BigInt(sale.unitPricePaise) * BigInt(sale.quantity);
      const expectedCost = BigInt(sale.unitCostSnapshotPaise!) * BigInt(sale.quantity);
      expect(line.revenuePaise).toBe(expectedRevenue);
      expect(line.costOfGoodsSoldPaise).toBe(expectedCost);
      expect(line.grossProfitPaise).toBe(expectedRevenue - expectedCost);
      return [sale.id, line.costOfGoodsSoldPaise?.toString(), line.grossProfitPaise?.toString()];
    })).toEqual([
      ["demo-sale-1", "200000", "50050"], ["demo-sale-2", "420000", "79900"],
      ["demo-sale-3", "240000", "60050"], ["demo-sale-4", "250000", "50050"],
      ["demo-sale-5", "250000", "99950"], ["demo-sale-6", "100000", "25500"],
      ["demo-sale-7", "350000", "75000"], ["demo-sale-8", "245000", "73500"],
    ]);
  });

  it("reconciles every product with its constituent transactions and the complete total", () => {
    const sales = getFictionalProfitSales();
    const products = aggregateMockProfit(sales);
    expect(products.map((p) => [p.productName, p.quantity, p.costOfGoodsSoldPaise?.toString(), p.grossProfitPaise?.toString()])).toEqual([
      ["Diapers", "6", "620000", "129950"], ["Milk Powder", "4", "490000", "110100"],
      ["Baby Wipes", "10", "250000", "99950"], ["Hand Soap", "10", "100000", "25500"],
      ["Rice", "5", "350000", "75000"], ["Shampoo", "7", "245000", "73500"],
    ]);
    for (const product of products) {
      expect(product).toMatchObject(calculateMockProfitTotals(sales.filter((sale) => sale.productId === product.productId)));
    }
    const total = calculateMockProfitTotals(sales);
    expect(total).toEqual({ quantity: "42", revenuePaise: BigInt(2569000), costOfGoodsSoldPaise: BigInt(2055000), grossProfitPaise: BigInt(514000), missingCostSales: 0 });
    expect(products.reduce((sum, p) => sum + p.grossProfitPaise!, BigInt(0))).toBe(total.grossProfitPaise);
    expect(products.reduce((sum, p) => sum + p.costOfGoodsSoldPaise!, BigInt(0))).toBe(total.costOfGoodsSoldPaise);
  });

  it.skip("uses the same fixed-date calculation in the Dashboard and Profit Report", () => {
    const today = selectMockSalesPeriod(getFictionalProfitSales(), { kind: "today" }).sales;
    const profit = calculateMockProfitTotals(today).grossProfitPaise!;
    const { unmount } = render(<DashboardPage />);
    const card = screen.getByRole("group", { name: "Today's Gross Profit" });
    expect(within(card).getByText(formatProfitMoney(profit))).toHaveAttribute("value", profitDecimal(profit));
    unmount();
    render(<TodayProfitPage />);
    expect(within(screen.getByLabelText("Gross profit totals")).getByText("Gross Profit").nextElementSibling?.firstElementChild).toHaveTextContent(formatProfitMoney(profit));
  });

  it.each([
    { kind: "today" },
    { kind: "monthly", month: "2026-11" },
    { kind: "custom", from: "2026-11-02", to: "2026-11-02" },
    { kind: "custom", from: "2026-11-01", to: "2026-11-02" },
  ] satisfies MockReportPeriod[])("filters revenue, COGS and profit together for %o", (period) => {
    const selection = selectMockSalesPeriod(getFictionalProfitSales(), period);
    expect(selection.error).toBeUndefined();
    expect(calculateMockProfitTotals(selection.sales)).toMatchObject({
      revenuePaise: BigInt(2569000), costOfGoodsSoldPaise: BigInt(2055000), grossProfitPaise: BigInt(514000),
    });
  });

  it("does not silently use other sales' costs when a future test-only ID has no snapshot", () => {
    const future = { ...mockSales[0], id: "synthetic-future-test-only" };
    const sales = getFictionalProfitSales([...mockSales, future]);
    expect(sales.at(-1)?.unitCostSnapshotPaise).toBeUndefined();
    expect(calculateMockProfitTotals(sales).grossProfitPaise).toBeNull();
    expect(calculateMockProfitTotals(sales).missingCostSales).toBe(1);
    const invalid = getFictionalProfitSales().map((sale, index) => index ? sale : { ...sale, unitCostSnapshotPaise: 100000.001 });
    expect(calculateMockProfitTotals(invalid).grossProfitPaise).toBeNull();
  });

  it("preserves fixed costs/profit when Admin previews a different current cost and suggested price", () => {
    const original = JSON.stringify(getFictionalProfitSales());
    render(<AddProductPreview product={mockInventory[0]} />);
    fireEvent.change(screen.getByLabelText("Buying Price (Rs.)"), { target: { value: "900.00" } });
    fireEvent.change(screen.getByLabelText("Selling Price (Rs.)"), { target: { value: "1600.00" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status")).toHaveTextContent("buying price was not updated");
    expect(JSON.stringify(getFictionalProfitSales())).toBe(original);
    expect(calculateMockProfitTotals(getFictionalProfitSales()).grossProfitPaise).toBe(BigInt(514000));
    expect(getMockSuggestedSellingPrice("diapers")).toBe("1250.00");
  });

  it("preserves every approved sales and inventory invariant", () => {
    expect(mockInventory).toHaveLength(7);
    expect(mockInventory.reduce((sum, p) => sum + p.quantity, 0)).toBe(123);
    expect(getMockLowStockProducts()).toHaveLength(3);
    expect(mockSales).toHaveLength(8);
    expect(getMockRevenuePaise()).toBe(BigInt(2569000));
    expect(aggregateMockSales(mockSales)[0].revenuePaise).toBe(BigInt(749950));
    expect(getMockSuggestedSellingPrice("diapers")).toBe("1250.00");
  });

  it.each([[BigInt(514000), "5140.00"], [BigInt(-1), "-0.01"], [BigInt(-40000), "-400.00"], [BigInt(0), "0.00"]])("formats signed machine-readable profit %s without a floating conversion", (value, expected) => {
    expect(profitDecimal(value)).toBe(expected);
  });
});
