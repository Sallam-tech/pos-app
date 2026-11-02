import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { getMockLowStockProducts, getMockStockStatus } from "@/lib/admin/mock-inventory";

export const metadata: Metadata = { title: "Low Stock Products | Shop POS" };

export default function LowStockPage() {
  const products = getMockLowStockProducts();
  return <>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">Low Stock Products</h1><Badge>Demo Data</Badge></div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Simulated quantities, not live inventory.</p>
      </div>
      <Button asChild variant="outline"><Link href="/admin/dashboard">Back to Admin Dashboard</Link></Button>
    </div>
    <section aria-labelledby="low-stock-list-title" aria-describedby="low-stock-mock-notice">
      <h2 id="low-stock-list-title" className="mb-3 text-sm font-semibold text-muted-foreground">Low-stock list ({products.length})</h2>
      <p id="low-stock-mock-notice" className="sr-only">
        Mock data only. Example quantities and thresholds, not live inventory. A product is low-stock when its remaining quantity is less than or equal to its threshold.
      </p>
      {products.length > 0 ? <TableRegion label="Low-stock products">
        <Table className="min-w-[32rem]">
          <caption className="sr-only">Mock low-stock inventory</caption>
          <thead><tr>
            <TableHead>Product name</TableHead>
            <TableHead className="text-right">Remaining quantity</TableHead>
            <TableHead className="text-right">Low-stock threshold</TableHead>
            <TableHead>Status</TableHead>
          </tr></thead>
          <tbody>{products.map((product) => <tr key={product.id}>
            <th scope="row" className="h-14 border-t px-4 py-3 font-semibold">{product.name}</th>
            <TableCell className="numeric text-right">{product.quantity}</TableCell>
            <TableCell className="numeric text-right">{product.lowStockThreshold}</TableCell>
            <TableCell><Badge tone={product.quantity === 0 ? "danger" : "warning"} className="whitespace-nowrap"><Icon name="alert" className="size-4" />{getMockStockStatus(product)}</Badge></TableCell>
          </tr>)}</tbody>
        </Table>
      </TableRegion> : <p className="rounded-md border bg-card p-4 text-sm">No mock products are at or below their low-stock threshold.</p>}
    </section>
  </>;
}
