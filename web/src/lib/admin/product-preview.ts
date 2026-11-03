import { previewTotal, pricePrecisionError } from "@/lib/pos-preview";

export const productPreviewFields = ["name", "category", "purchaseCost", "suggestedSellingPrice", "initialQuantity", "lowStockThreshold"] as const;
export type ProductPreviewField = typeof productPreviewFields[number];
export type ProductPreviewValues = Record<ProductPreviewField, string>;
export type ProductPreviewErrors = Partial<Record<ProductPreviewField, string>>;

export const emptyProductPreview: ProductPreviewValues = {
  name: "", category: "", purchaseCost: "", suggestedSellingPrice: "", initialQuantity: "", lowStockThreshold: "",
};

/** Reuse the exact PKR parser by multiplying by one; never convert money to Number. */
export function parseProductMoneyPaise(value: string): bigint | null {
  const decimal = previewTotal("1", value);
  return decimal === null ? null : BigInt(decimal.replace(".", ""));
}

// These match the existing illustrative quantity precision, not a final D03 policy.
export function validPreviewQuantity(raw: string): boolean {
  const value = raw.trim();
  if (value.length > 32 || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return false;
  const [whole, fraction = ""] = value.split(".");
  return (whole.replace(/^0+/, "") || "0").length <= 12 && fraction.length <= 6;
}

// In Edit mode purchaseCost is an optional proposal, never the current fixture cost.
export function validateProductPreview(values: ProductPreviewValues, mode: "add" | "edit" = "add"): ProductPreviewErrors {
  const errors: ProductPreviewErrors = {};
  const name = values.name.trim();
  if (!name || /^0+$/.test(name)) errors.name = "Enter a valid product name.";
  for (const field of ["purchaseCost", "suggestedSellingPrice"] as const) {
    const value = values[field];
    if (!value.trim()) {
      if (field === "purchaseCost" && mode === "add") errors[field] = "Enter a purchase cost in PKR.";
    } else {
      errors[field] = pricePrecisionError(value);
      const paise = parseProductMoneyPaise(value);
      if (!errors[field] && paise === null) {
        errors[field] = "Enter a positive PKR amount with up to 12 whole-number digits and 2 decimal places.";
      } else if (!errors[field] && paise === BigInt(0)) {
        errors[field] = field === "purchaseCost" ? "Enter a purchase cost greater than Rs. 0.00."
          : "Enter a suggested selling price greater than Rs. 0.00.";
      }
      if (!errors[field]) delete errors[field];
    }
  }
  for (const field of ["initialQuantity", "lowStockThreshold"] as const) {
    if (mode === "edit" && field === "initialQuantity") continue;
    if (!values[field].trim()) {
      errors[field] = field === "initialQuantity" ? "Enter an initial quantity." : "Enter a low-stock threshold.";
    } else if (!validPreviewQuantity(values[field])) {
      errors[field] = "Enter a non-negative quantity with up to 12 whole-number digits and 6 decimal places for this preview.";
    }
  }
  return errors;
}
