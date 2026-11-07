import { defaultShopSettings, validateShopSettings } from "@/lib/shop-display-settings";
export type ReceiptDraftDetails = {
  shopName: string; address: string; shopPhone: string; footer: string;
  customerName: string; customerPhone: string;
};
export type ReceiptDraftState = { details: ReceiptDraftDetails; cash: string; layout?: "ordinary" | "compact" };
export function validateReceiptDraft(details: ReceiptDraftDetails): Partial<Record<keyof ReceiptDraftDetails, string>> {
  const shop = validateShopSettings({ ...defaultShopSettings, shopName: details.shopName, address: details.address, footer: details.footer });
  const errors: Partial<Record<keyof ReceiptDraftDetails, string>> = {};
  for (const key of ["shopName", "address", "footer"] as const) if (shop[key]) errors[key] = shop[key];
  if (details.customerName.length > 120 || /[\u0000-\u001f\u007f]/.test(details.customerName)) errors.customerName = "Use a customer name of no more than 120 characters without control characters.";
  const phoneError = validateShopSettings({ ...defaultShopSettings, phone: details.customerPhone }).phone;
  if (phoneError) errors.customerPhone = phoneError;
  return errors;
}
