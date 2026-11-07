/** Temporary demo input only. Never an authoritative accounting store. */
export function parseDemoMoney(raw: string): bigint | null {
  const value = raw.trim();
  if (value.length > 32 || !/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2}|\d{1,3}(?:,\d{3})+(?:\.\d{0,2})?)$/.test(value)) return null;
  const [whole = "", fraction = ""] = value.replaceAll(",", "").split(".");
  const significant = whole.replace(/^0+/, "") || "0";
  if (significant.length > 12) return null;
  return BigInt(significant) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}
export function formatDemoMoney(paise: bigint): string {
  const negative = paise < BigInt(0);
  const digits = (negative ? -paise : paise).toString().padStart(3, "0");
  return (negative ? "-Rs. " : "Rs. ") + digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + digits.slice(-2);
}
export function demoMoneyDecimal(paise: bigint): string {
  const digits = paise.toString().padStart(3, "0");
  return digits.slice(0, -2) + "." + digits.slice(-2);
}
