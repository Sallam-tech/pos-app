/** Browser-local invoice drafts only. Original sale math and records stay unchanged. */
import { createSaleSimulation, type PreviewProduct, type SaleSimulation } from "@/lib/pos-preview";
import type { DemoCheckout } from "@/lib/demo/checkout";

export type DraftItem = { key: number; product: PreviewProduct; quantity: string; price: string; discount: string };
export type DraftInvoice = {
  items: readonly (SaleSimulation & { baseTotal?: string; discountPercent?: string; discountAmount?: string })[]; checkout: DemoCheckout;
  /** Absent on legacy previews: retain their recorded global-discount presentation. */
  discountMode?: "per-item";
  customer: { name: string; phone: string }; previewedAt: string; sampleReference: string;
};

/** Align exact decimal strings at their greatest scale; never use floating point or round. */
export function draftSubtotal(items: readonly Pick<DraftItem, "product" | "quantity" | "price">[]): string | null {
  const lines = items.map((item) => createSaleSimulation(item.product, item.quantity, item.price)?.total);
  if (lines.some((line) => line === undefined)) return null;
  return sumDraftAmounts(lines as string[]);
}

/** Already validated exact decimal amounts only. No float conversion or rounding. */
export function sumDraftAmounts(lines: readonly string[]): string {
  const scale = Math.max(2, ...lines.map((line) => line.split(".")[1].length));
  const sum = lines.reduce((total, line) => {
    const [whole, fraction] = line!.split(".");
    return total + BigInt(whole + fraction.padEnd(scale, "0"));
  }, BigInt(0)).toString().padStart(scale + 1, "0");
  const fraction = sum.slice(-scale).replace(/0+$/, "").padEnd(2, "0");
  return sum.slice(0, -scale) + "." + fraction;
}
