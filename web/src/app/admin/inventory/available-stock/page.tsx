import { isTestInventoryRender } from "@/server/hosting/inventory-render";
import { TestInventory } from "@/components/admin/test-inventory";
import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import "./inventory.css";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { LiveDataRequired } from "@/components/shell/live-data-required";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inventory | Shop POS" };

export default function AvailableStockPage() {
  if (!isTestInventoryRender()) return <LiveDataRequired route="/admin/inventory/available-stock" title="Inventory"/>;
  return <div className="inventory-workspace">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/inventory/available-stock"} className="page-title flex items-center gap-2"><Icon name="layers" className="size-6 text-success" />Inventory</PageHeading><Badge>Test mode</Badge></div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Stock saved in your shop database (test mode).</p>
      </div>
    </div>
    <TestInventory mode="available" />
  </div>;
}
