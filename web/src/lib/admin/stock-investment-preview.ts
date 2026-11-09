import { mockInventory } from "./mock-inventory";
import { parseProductMoneyPaise, validPreviewQuantity } from "./product-preview";
import { pricePrecisionError } from "@/lib/pos-preview";

/** Exact quantity × paise. Reject sub-paise results rather than silently rounding. */
export function quantityCostPaise(quantity: string, unitCostPaise: bigint | null): bigint | null {
  if (unitCostPaise === null || unitCostPaise < BigInt(0) || !validPreviewQuantity(quantity)) return null;
  const [whole = "", fraction = ""] = quantity.trim().split(".");
  const units = BigInt(whole || "0") * BigInt(1000000) + BigInt(fraction.padEnd(6, "0"));
  const scaled = units * unitCostPaise;
  return scaled % BigInt(1000000) === BigInt(0) ? scaled / BigInt(1000000) : null;
}

export type StockPurchaseValues = { quantity: string; buyingPrice: string; sellingPrice: string };
export type StockPurchaseErrors = Partial<Record<keyof StockPurchaseValues, string>>;

export function validateStockPurchase(values: StockPurchaseValues): StockPurchaseErrors {
  const errors: StockPurchaseErrors = {};
  const units = quantityCostPaise(values.quantity, BigInt(1000000));
  if (!values.quantity.trim()) errors.quantity = "Enter the quantity bought.";
  else if (units === null) errors.quantity = "Enter a positive quantity with up to 12 whole-number digits and 6 decimal places for this preview.";
  else if (units <= BigInt(0)) errors.quantity = "Enter a quantity greater than zero.";
  for (const field of ["buyingPrice", "sellingPrice"] as const) {
    const raw = values[field];
    if (!raw.trim()) {
      if (field === "buyingPrice") errors[field] = "Enter a buying price in PKR.";
      continue;
    }
    const amount = parseProductMoneyPaise(raw);
    const precision = pricePrecisionError(raw);
    if (precision) errors[field] = precision;
    else if (amount === null) errors[field] = "Enter a positive PKR amount with up to 12 whole-number digits and 2 decimal places.";
    else if (amount === BigInt(0)) errors[field] = "Enter a price greater than Rs. 0.00.";
  }
  if (!errors.quantity && !errors.buyingPrice &&
      quantityCostPaise(values.quantity, parseProductMoneyPaise(values.buyingPrice)) === null) {
    errors.quantity = "This quantity and buying price produce less than a whole paisa. Adjust them; the preview will not round.";
  }
  return errors;
}

export type PurchaseSnapshot = Readonly<{
  purchaseId: string;
  quantity: string;
  unitBuyingCostSnapshotPaise: bigint | null;
}>;
export type StockCostProduct = Readonly<{
  id: string;
  name: string;
  quantity: string;
  currentBuyingCostPaise: bigint | null;
}>;

/**
 * Expenditure uses original purchase snapshots only. Remaining-stock valuation
 * uses current approved costs. Sales, price edits, expenses and corrections
 * cannot become purchases through this helper. No state, persistence or mutations.
 */
export function calculateInvestmentOverview(
  purchases: readonly PurchaseSnapshot[],
  inventory: readonly StockCostProduct[],
  purchaseHistoryComplete: boolean,
) {
  let investment: bigint | null = purchaseHistoryComplete ? BigInt(0) : null;
  const seen = new Set<string>();
  for (const purchase of purchases) {
    const amount = quantityCostPaise(purchase.quantity, purchase.unitBuyingCostSnapshotPaise);
    const positiveQuantity = quantityCostPaise(purchase.quantity, BigInt(1000000));
    if (!purchase.purchaseId.trim() || seen.has(purchase.purchaseId) || positiveQuantity === null ||
        positiveQuantity <= BigInt(0) || amount === null) investment = null;
    else if (investment !== null) investment += amount;
    seen.add(purchase.purchaseId);
  }
  const products = inventory.map((product) => ({
    ...product, stockValuePaise: quantityCostPaise(product.quantity, product.currentBuyingCostPaise),
  }));
  const stockValuePaise = products.reduce<bigint | null>((total, product) =>
    total === null || product.stockValuePaise === null ? null : total + product.stockValuePaise, BigInt(0));
  return { totalInvestmentPaise: investment, stockValuePaise, products };
}

export const incompletePurchaseInformation = "Not available — purchase information incomplete";
export const missingBuyingCostsMessage = "Not available — buying costs not recorded";

export function getDemoInvestmentOverview() {
  // Original products have neither current buying costs nor a complete purchase ledger.
  // Fictional historical sale costs intentionally do NOT fill either gap.
  return calculateInvestmentOverview([], mockInventory.map((product) => ({
    id: product.id, name: product.name, quantity: String(product.quantity), currentBuyingCostPaise: null,
  })), false);
}
