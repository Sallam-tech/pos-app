/** Optional public identity metadata for unsaved product previews; never an internal ID. */
export type ProductIdentity = Readonly<{ id: string; name: string; productCode?: string; category?: string; unitLabel?: string }>;
export const demoUnitLabels = ["Piece", "Pack", "Box", "Bottle", "Kilogram (kg)", "Liter (L)"] as const;

export function validateProductCode(raw: string, catalog: readonly ProductIdentity[], currentId?: string): string | undefined {
  const code = raw.trim();
  if (!code) return;
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(code)) return "Use 1-32 letters, numbers, dots, hyphens or underscores; start with a letter or number.";
  if (catalog.some((item) => item.id !== currentId && item.productCode?.trim().toLowerCase() === code.toLowerCase())) {
    return "This product code is already used in the demo catalog.";
  }
}
export function suggestProductCode(catalog: readonly ProductIdentity[]): string {
  const used = new Set(catalog.map((item) => item.productCode?.trim().toLowerCase()).filter(Boolean));
  for (let index = 1; index <= 999999; index++) {
    const code = "POS-" + String(index).padStart(4, "0");
    if (!used.has(code.toLowerCase())) return code;
  }
  return ""; // Code is optional; never suggest a known conflict.
}
export function productUnitDisplay(product: { id?: string; unitLabel?: string }): string {
  return product.unitLabel?.trim() || "Piece (display fallback)";
}
export function matchesProductIdentity(product: ProductIdentity, query: string): boolean {
  const value = query.trim().toLowerCase();
  return product.name.toLowerCase().includes(value) || Boolean(product.productCode?.toLowerCase().includes(value));
}
