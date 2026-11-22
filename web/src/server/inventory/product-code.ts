// Readable product codes for receipts: three letters from the product name, a hyphen and a
// zero-padded sequence per prefix, e.g. "Diapers" -> DIA-001, "Milk Powder" -> MIL-001.
// Codes stay within the products.code CHECK (1..32 chars) and the [A-Z0-9_-] code rule.

export function productCodePrefix(name: string): string {
  const letters = name.normalize("NFKD").toUpperCase().replace(/[^A-Z]/g, "");
  if (!letters) return "PRD";
  return letters.slice(0, 3).padEnd(3, "X");
}

export function nextProductCode(prefix: string, existingCodes: readonly string[]): string {
  const pattern = new RegExp("^" + prefix + "-(\\d+)$");
  let highest = 0;
  for (const existing of existingCodes) {
    const match = pattern.exec(existing);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return prefix + "-" + String(highest + 1).padStart(3, "0");
}
