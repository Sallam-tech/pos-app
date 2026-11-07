/** Browser-local invoice drafts only. Original sale math and records stay unchanged. */
import { createSaleSimulation, type PreviewProduct, type SaleSimulation } from "@/lib/pos-preview";
import type { DemoCheckout } from "@/lib/demo/checkout";

export type DraftItem = { key: number; product: PreviewProduct; quantity: string; price: string };
export type DraftInvoice = {
  items: readonly SaleSimulation[]; checkout: DemoCheckout;
  customer: { name: string; phone: string }; previewedAt: string; sampleReference: string;
};

/** Align exact decimal strings at their greatest scale; never use floating point or round. */
export function draftSubtotal(items: readonly Pick<DraftItem, "product" | "quantity" | "price">[]): string | null {
  const lines = items.map((item) => createSaleSimulation(item.product, item.quantity, item.price)?.total);
  if (lines.some((line) => line === undefined)) return null;
  const scale = Math.max(2, ...lines.map((line) => line!.split(".")[1].length));
  const sum = lines.reduce((total, line) => {
    const [whole, fraction] = line!.split(".");
    return total + BigInt(whole + fraction.padEnd(scale, "0"));
  }, BigInt(0)).toString().padStart(scale + 1, "0");
  const fraction = sum.slice(-scale).replace(/0+$/, "").padEnd(2, "0");
  return sum.slice(0, -scale) + "." + fraction;
}
