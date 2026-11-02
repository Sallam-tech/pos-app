import type { Metadata } from "next";
import Link from "next/link";
import { AvailableStockPreview } from "@/components/admin/available-stock-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockInventory } from "@/lib/admin/mock-inventory";

export const metadata: Metadata = { title: "Available Stock | Shop POS" };

export default function AvailableStockPage() {
  return <>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">Available Stock</h1><Badge>Demo Data</Badge></div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Simulated quantities, not live inventory.</p>
      </div>
      <Button asChild variant="outline"><Link href="/admin/dashboard">Back to Admin Dashboard</Link></Button>
    </div>
    <AvailableStockPreview products={mockInventory} />
  </>;
}
