import type { PreviewProduct } from "@/lib/pos-preview";
import { getMockSuggestedSellingPrice } from "@/lib/mock-suggested-prices";
import { parseDemoMoney } from "./money";

// Public checkout-only additions: the original five choices and Admin inventory stay intact.
// No stock, buying costs or historical prices are projected into the cashier catalog.
export const additionalCheckoutProducts: readonly PreviewProduct[] = [
  { id: "mock-shampoo", name: "Shampoo" },
  { id: "mock-toothpaste", name: "Toothpaste" },
];
const temporaryCheckoutPrices: Readonly<Record<string, string>> = {
  "mock-milk": "800.00", "mock-wipes": "222.00", "mock-soap": "125.00",
  "mock-rice": "850.00", "mock-shampoo": "455.00", "mock-toothpaste": "180.00",
};
/** Temporary unsaved demonstration prices; never a production price or sale snapshot. */
export function getCheckoutDemoPrice(productId: string): string | null {
  const existing = getMockSuggestedSellingPrice(productId);
  return existing !== null && parseDemoMoney(existing) !== null ? existing : temporaryCheckoutPrices[productId] ?? null;
}
