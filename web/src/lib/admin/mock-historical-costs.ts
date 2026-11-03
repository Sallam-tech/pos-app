import { mockSales, type MockSale } from "@/lib/admin/mock-sales";
import type { ProfitSale } from "@/lib/admin/mock-profit";

// Fictional historical unit purchase costs for the fixed demo sales only. Not real accounting records.
// Manually chosen positive examples, independent of current/guide prices and
// any desired profit total. Amounts are whole paise; no original sale is changed.
export const fictionalHistoricalUnitCosts = [
  { saleId: "demo-sale-1", unitCostSnapshotPaise: 100000 },
  { saleId: "demo-sale-2", unitCostSnapshotPaise: 105000 },
  { saleId: "demo-sale-3", unitCostSnapshotPaise: 120000 },
  { saleId: "demo-sale-4", unitCostSnapshotPaise: 125000 },
  { saleId: "demo-sale-5", unitCostSnapshotPaise: 25000 },
  { saleId: "demo-sale-6", unitCostSnapshotPaise: 10000 },
  { saleId: "demo-sale-7", unitCostSnapshotPaise: 70000 },
  { saleId: "demo-sale-8", unitCostSnapshotPaise: 35000 },
] as const;

const costBySaleId = new Map<string, number>(
  fictionalHistoricalUnitCosts.map((cost) => [cost.saleId, cost.unitCostSnapshotPaise]),
);

export function getFictionalProfitSales(sales: readonly MockSale[] = mockSales): ProfitSale[] {
  return sales.map((sale) => ({
    ...sale, unitCostSnapshotPaise: costBySaleId.get(sale.id),
  }));
}
