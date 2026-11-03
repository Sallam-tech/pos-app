import { validPreviewQuantity } from "@/lib/admin/product-preview";

export type StockCorrectionErrors = Partial<Record<"quantity" | "reason", string>>;
const quantityScale = BigInt(1_000_000);

function quantityUnits(value: string): bigint | null {
  if (!validPreviewQuantity(value)) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  return BigInt(whole || "0") * quantityScale + BigInt(fraction.padEnd(6, "0"));
}

/** Fixed-point arithmetic under the existing provisional 12-digit / 6-decimal limits. */
export function stockCorrectionDifference(current: string, corrected: string): string | null {
  const before = quantityUnits(current);
  const after = quantityUnits(corrected);
  if (before === null || after === null) return null;
  const difference = after - before;
  const magnitude = difference < BigInt(0) ? -difference : difference;
  const fraction = (magnitude % quantityScale).toString().padStart(6, "0").replace(/0+$/, "");
  return (difference < BigInt(0) ? "-" : difference > BigInt(0) ? "+" : "") +
    (magnitude / quantityScale).toString() + (fraction ? "." + fraction : "");
}

export function validateStockCorrection(quantity: string, reason: string): StockCorrectionErrors {
  const errors: StockCorrectionErrors = {};
  if (!quantity.trim()) errors.quantity = "Enter a correct quantity.";
  else if (!validPreviewQuantity(quantity)) errors.quantity = "Enter a non-negative quantity with up to 12 whole-number digits and 6 decimal places for this preview.";
  if (!/\p{L}/u.test(reason.trim())) errors.reason = "Enter a reason explaining the correction.";
  return errors;
}

// Future corrections require an authorized, auditable transaction with previous/new
// quantity, reason, Admin identity and timestamp. This module only validates a preview.
