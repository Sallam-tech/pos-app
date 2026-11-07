import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import "./inventory.css";
import { AvailableStockPreview } from "@/components/admin/available-stock-preview";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { mockInventory } from "@/lib/admin/mock-inventory";

export const metadata: Metadata = { title: "Inventory | Shop POS" };

export default function AvailableStockPage() {
  return <div className="inventory-workspace">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/inventory/available-stock"} className="page-title flex items-center gap-2"><Icon name="layers" className="size-6 text-success" />Inventory</PageHeading><Badge>Demo Data</Badge></div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">View and manage product stock (simulated, not live inventory).</p>
      </div>
    </div>
    <AvailableStockPreview products={mockInventory} />
  </div>;
}
