import type { MockSale } from "@/lib/admin/mock-sales";
import { formatMockRevenue, mockRevenueDecimal } from "@/lib/admin/mock-sales";
import { previewTotal } from "@/lib/pos-preview";

// Admin-only report input. A snapshot belongs to this completed sale, never its
// current product. Existing shared sales deliberately have no cost snapshots.
export type ProfitSale = MockSale & Readonly<{ unitCostSnapshotPaise?: number | bigint | null }>;
const quantityScale = BigInt(1_000_000);

function validPaise(value: number | bigint | null | undefined): bigint | null {
  if (typeof value === "bigint") return value >= BigInt(0) ? value : null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
}

function quantityUnits(quantity: number): bigint | null {
  // Reuse the existing positive, 12-whole-digit / 6-decimal preview parser.
  const normalized = previewTotal(String(quantity), "1");
  if (normalized === null) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * quantityScale + BigInt(fraction.padEnd(6, "0"));
}

function lineAmount(paise: bigint | null, units: bigint | null): bigint | null {
  if (paise === null || units === null) return null;
  const scaled = paise * units;
  // No final fractional-quantity rounding policy exists. Reject sub-paise
  // results instead of silently rounding or truncating them.
  return scaled % quantityScale === BigInt(0) ? scaled / quantityScale : null;
}

function quantityText(units: bigint): string {
  const fraction = (units % quantityScale).toString().padStart(6, "0").replace(/0+$/, "");
  return (units / quantityScale).toString() + (fraction ? "." + fraction : "");
}

export function calculateMockProfitTotals(sales: readonly ProfitSale[]) {
  let quantity: bigint | null = BigInt(0);
  let revenuePaise: bigint | null = BigInt(0);
  let costOfGoodsSoldPaise: bigint | null = BigInt(0);
  let missingCostSales = 0;
  for (const sale of sales) {
    const units = quantityUnits(sale.quantity);
    const cost = validPaise(sale.unitCostSnapshotPaise);
    const revenue = lineAmount(validPaise(sale.unitPricePaise), units);
    const costOfSale = lineAmount(cost, units);
    if (cost === null) missingCostSales++;
    quantity = quantity === null || units === null ? null : quantity + units;
    revenuePaise = revenuePaise === null || revenue === null ? null : revenuePaise + revenue;
    costOfGoodsSoldPaise = costOfGoodsSoldPaise === null || costOfSale === null ? null : costOfGoodsSoldPaise + costOfSale;
  }
  return {
    quantity: quantity === null ? null : quantityText(quantity),
    revenuePaise,
    costOfGoodsSoldPaise,
    grossProfitPaise: revenuePaise === null || costOfGoodsSoldPaise === null ? null : revenuePaise - costOfGoodsSoldPaise,
    missingCostSales,
  };
}

export function aggregateMockProfit(sales: readonly ProfitSale[]) {
  const groups = new Map<string, { productId: string; productName: string; sales: ProfitSale[] }>();
  for (const sale of sales) {
    let group = groups.get(sale.productId);
    if (!group) {
      group = { productId: sale.productId, productName: sale.productName, sales: [] };
      groups.set(sale.productId, group);
    }
    group.sales.push(sale);
  }
  return [...groups.values()].map(({ productId, productName, sales }) => ({
    productId, productName, ...calculateMockProfitTotals(sales),
  }));
}

export function profitDecimal(paise: bigint): string {
  return (paise < BigInt(0) ? "-" : "") + mockRevenueDecimal(paise < BigInt(0) ? -paise : paise);
}

export function formatProfitMoney(paise: bigint | null): string {
  if (paise === null) return "Not available";
  return (paise < BigInt(0) ? "-" : "") + formatMockRevenue(paise < BigInt(0) ? -paise : paise);
}
