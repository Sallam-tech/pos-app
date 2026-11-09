import { calculateDemoCheckout, type DemoCheckout } from "@/lib/demo/checkout";
import { createSaleSimulation, type SaleSimulation } from "@/lib/pos-preview";
import { sumDraftAmounts, type DraftItem } from "@/lib/sale-draft-preview";

/** Unsaved line snapshot: preserve entered rate, discount and final paid amount separately. */
export type DiscountedDraftLine = SaleSimulation & { baseTotal: string; discountPercent: string; discountAmount: string };
export function calculateItemDiscounts(items: readonly DraftItem[]): {
  lines: DiscountedDraftLine[] | null; lineTotals: (string | null)[]; checkout: DemoCheckout | null; errors: Partial<Record<number, string>>;
} {
  const errors: Partial<Record<number, string>> = {};
  const lines = items.map((item) => {
    const sale = createSaleSimulation(item.product, item.quantity, item.price);
    // Reuse the established 0–100%, two-decimal, exact-paisa/no-rounding policy.
    const discounted = calculateDemoCheckout(sale?.total ?? null, item.discount);
    if (discounted.errors.discount) errors[item.key] = discounted.errors.discount;
    if (!sale || !discounted.value) return null;
    return { ...sale, baseTotal: sale.total, total: discounted.value.total,
      discountPercent: discounted.value.discountPercent, discountAmount: discounted.value.discountAmount };
  });
  const lineTotals = lines.map((line) => line?.total ?? null);
  if (lines.some((line) => line === null)) return { lines: null, lineTotals, checkout: null, errors };
  const valid = lines as DiscountedDraftLine[];
  const subtotal = sumDraftAmounts(valid.map((line) => line.baseTotal));
  const checkout = calculateDemoCheckout(subtotal).value;
  return { lines: valid, lineTotals, errors, checkout: checkout && { ...checkout,
    discountAmount: sumDraftAmounts(valid.map((line) => line.discountAmount)),
    total: sumDraftAmounts(valid.map((line) => line.total)) } };
}
