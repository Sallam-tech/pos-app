"use client";

import { useShopSettings } from "./use-shop-settings";
import { ShopLogo } from "@/components/brand/shop-logo";
export function ShopName({ as: Tag = "span", className }: { as?: "span" | "p" | "h1"; className?: string }) {
  const settings = useShopSettings();
  return <Tag className={className}>{settings.shopName}</Tag>;
}
export function ReceiptShopHeader() {
  const settings = useShopSettings();
  return <><ShopLogo className="receipt-logo mx-auto mb-2 block size-20 object-contain" />
    <p className="break-words text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">{settings.shopName}</p>
    {settings.address && <p className="mt-1 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{settings.address}</p>}
    {settings.phone && <p className="mt-1 break-words text-sm">Phone: {settings.phone}</p>}</>;
}
export function ReceiptShopFooter({ fallback }: { fallback: string }) {
  const settings = useShopSettings();
  return <p className="break-words text-center font-semibold [overflow-wrap:anywhere]">{settings.footer || fallback}</p>;
}
