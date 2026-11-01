/**
 * Presentation-only fixtures and exact decimal arithmetic for the /pos preview.
 * These limits and permissive examples are NOT approved shop/domain policies.
 */
export type PreviewProduct = Readonly<{ id: string; name: string }>;

export const previewProducts: readonly PreviewProduct[] = [
  { id: "mock-diapers", name: "Diapers" },
  { id: "mock-wipes", name: "Baby Wipes" },
  { id: "mock-milk", name: "Milk Powder" },
  { id: "mock-soap", name: "Hand Soap" },
  { id: "mock-rice", name: "Rice" },
];

type Decimal = { units: bigint; scale: number };
export type PreviewField = "product" | "quantity" | "price";
export type PreviewErrors = Partial<Record<PreviewField, string>>;
export type SaleSimulation = {
  kind: "simulation";
  product: PreviewProduct;
  quantity: string;
  unitPrice: string;
  total: string;
};

function parseDecimal(raw: string, grouped = false, maximumScale = 6): Decimal | null {
  const value = raw.trim();
  if (value.length > 32) return null;
  const plain = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
  const commas = /^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/;
  if (!plain.test(value) && !(grouped && commas.test(value))) return null;
  const [whole = "", fraction = ""] = value.replaceAll(",", "").split(".");
  const significantWhole = whole.replace(/^0+/, "") || "0";
  if (significantWhole.length > 12 || fraction.length > maximumScale) return null;
  return { units: BigInt(significantWhole + fraction), scale: fraction.length };
}

function decimalString({ units, scale }: Decimal, minimumScale = 0): string {
  const padded = units.toString().padStart(scale + 1, "0");
  const whole = scale ? padded.slice(0, -scale) : padded;
  const fraction = (scale ? padded.slice(-scale) : "").replace(/0+$/, "").padEnd(minimumScale, "0");
  return fraction ? whole + "." + fraction : whole;
}

export function previewTotal(quantity: string, price: string): string | null {
  const q = parseDecimal(quantity);
  const p = parseDecimal(price, true, 2);
  if (!q || q.units <= BigInt(0) || !p) return null;
  return decimalString({ units: q.units * p.units, scale: q.scale + p.scale }, 2);
}

/** Group strings directly: never convert financial values through Number. */
export function formatPreviewPKR(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  return "Rs. " + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction.padEnd(2, "0");
}

/** +/- one is a preview convenience, not a final quantity increment policy. */
export function stepPreviewQuantity(value: string, direction: 1 | -1): string | null {
  const parsed = parseDecimal(value);
  if (!parsed || parsed.units <= BigInt(0)) return null;
  const next = parsed.units + BigInt(direction) * BigInt(10) ** BigInt(parsed.scale);
  if (next <= BigInt(0)) return null;
  const result = decimalString({ units: next, scale: parsed.scale });
  return parseDecimal(result) ? result : null;
}

export function pricePrecisionError(value: string): string | undefined {
  if (/\.\d{3,}$/.test(value.trim())) return "Enter a price with no more than 2 decimal places.";
}

export function validatePreview(product: PreviewProduct | null, quantity: string, price: string): PreviewErrors {
  const errors: PreviewErrors = {};
  if (!product || !previewProducts.some((item) => item.id === product.id && item.name === product.name)) {
    errors.product = "Choose a product from the search results.";
  }
  const q = parseDecimal(quantity);
  if (!quantity.trim()) errors.quantity = "Enter a quantity.";
  else if (!q) errors.quantity = "Use a number with up to 12 whole-number digits and 6 decimal places for this preview.";
  else if (q.units <= BigInt(0)) errors.quantity = "Enter a quantity greater than zero.";
  const precisionError = pricePrecisionError(price);
  if (!price.trim()) errors.price = "Enter a selling price in PKR.";
  else if (precisionError) errors.price = precisionError;
  else if (!parseDecimal(price, true, 2)) {
    errors.price = "Use a non-negative PKR amount, such as 1,200.50 (up to 12 whole-number digits and 2 decimal places in this preview).";
  }
  return errors;
}

export function createSaleSimulation(product: PreviewProduct | null, quantity: string, price: string): SaleSimulation | null {
  if (Object.keys(validatePreview(product, quantity, price)).length || !product) return null;
  // Safe snapshot only: no transaction ID, server timestamp or committed status.
  return {
    kind: "simulation",
    product: { id: product.id, name: product.name },
    quantity: decimalString(parseDecimal(quantity)!),
    unitPrice: decimalString(parseDecimal(price, true, 2)!, 2),
    total: previewTotal(quantity, price)!,
  };
}
