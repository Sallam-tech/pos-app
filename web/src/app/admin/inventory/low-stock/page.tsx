import { isTestInventoryRender } from "@/server/hosting/inventory-render";
import { TestInventory } from "@/components/admin/test-inventory";
import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { LiveDataRequired } from "@/components/shell/live-data-required";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Low Stock Products | Shop POS" };

export default function LowStockPage() {
  if (!isTestInventoryRender()) return <LiveDataRequired route="/admin/inventory/low-stock" title="Low Stock Products"/>;
  return <><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-3"><PageHeading route="/admin/inventory/low-stock">Low Stock Products</PageHeading><Badge>Test mode</Badge></div><p className="mt-1 text-sm leading-6 text-muted-foreground">Saved quantities at or below their threshold, including zero.</p></div></div><TestInventory mode="low" /></>;
}
