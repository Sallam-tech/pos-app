/** Public display preferences only. Never add credentials or business records here. */
export type ShopDisplaySettings = Readonly<{
  shopName: string; address: string; phone: string; currency: "PKR";
  receiptLayout: "ordinary" | "compact"; footer: string;
}>;
export const shopSettingsStorageKey = "shop-pos-display-settings-v1";
export const defaultShopSettings: ShopDisplaySettings = Object.freeze({
  shopName: "Shop POS", address: "", phone: "", currency: "PKR", receiptLayout: "ordinary", footer: "",
});
export type ShopSettingsErrors = Partial<Record<keyof ShopDisplaySettings, string>>;
export function validateShopSettings(values: ShopDisplaySettings): ShopSettingsErrors {
  const errors: ShopSettingsErrors = {};
  if (!values.shopName.trim()) errors.shopName = "Enter your shop name.";
  for (const [key, limit] of [["shopName", 80], ["address", 240], ["phone", 32], ["footer", 160]] as const) {
    if (values[key].length > limit) errors[key] = "Use no more than " + limit + " characters.";
    else if (/[\u0000-\u001f\u007f]/.test(values[key])) errors[key] = "Use plain text without control characters.";
  }
  if (!errors.phone && values.phone.trim() && (!/^[+()\d .-]+$/.test(values.phone.trim()) || !/\d/.test(values.phone))) errors.phone = "Enter a phone number using digits, spaces, +, brackets or hyphens.";
  if (values.currency !== "PKR") errors.currency = "Currency must remain PKR.";
  if (!["ordinary", "compact"].includes(values.receiptLayout)) errors.receiptLayout = "Choose an implemented receipt layout.";
  return errors;
}
/** Construct an explicit allow-list so extra storage keys can never become settings. */
export function normalizeShopSettings(values: ShopDisplaySettings): ShopDisplaySettings {
  return { shopName: values.shopName.trim(), address: values.address.trim(), phone: values.phone.trim(),
    currency: "PKR", receiptLayout: values.receiptLayout, footer: values.footer.trim() };
}
export function parseShopSettings(raw: string | null): ShopDisplaySettings {
  if (!raw || raw.length > 4096) return defaultShopSettings;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return defaultShopSettings;
    const data = value as Record<string, unknown>;
    if (["shopName", "address", "phone", "currency", "receiptLayout", "footer"].some((key) => typeof data[key] !== "string")) return defaultShopSettings;
    const settings = { shopName: data.shopName, address: data.address, phone: data.phone, currency: data.currency, receiptLayout: data.receiptLayout, footer: data.footer } as ShopDisplaySettings;
    return Object.keys(validateShopSettings(settings)).length ? defaultShopSettings : normalizeShopSettings(settings);
  } catch { return defaultShopSettings; }
}
export function validatePasswordPreview(password: string, confirmation: string) {
  return {
    password: !password ? "Enter a made-up password for this preview." : Array.from(password).length < 8 ? "Use at least 8 characters in this preview." : Array.from(password).length > 128 ? "Use no more than 128 characters." : undefined,
    confirmation: !confirmation ? "Repeat the preview password." : confirmation !== password ? "The passwords do not match." : undefined,
  };
}
