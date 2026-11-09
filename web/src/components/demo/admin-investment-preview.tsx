import { Card } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { getDemoInvestmentOverview, missingBuyingCostsMessage } from "@/lib/admin/stock-investment-preview";
import { formatDemoMoney } from "@/lib/demo/money";

export function AdminInvestmentPreview() {
  const overview = getDemoInvestmentOverview();
  return <section aria-label="Stock valuation overview">
    <Card role="group" aria-label="Total Stock Value" className="max-w-3xl">
      <h2 className="text-sm font-semibold">Total Stock Value</h2>
      <p className="numeric mt-3 break-words text-xl font-bold leading-8">{overview.stockValuePaise === null ? missingBuyingCostsMessage : formatDemoMoney(overview.stockValuePaise)}</p>
    </Card>
    <details className="mt-4">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-md border border-input bg-surface px-4 py-2 text-sm font-semibold hover:bg-accent">View Product Details</summary>
      <div className="mt-4"><TableRegion label="Stock value by product">
        <Table aria-label="Demo stock value by product" className="min-w-[36rem]">
          <thead><tr><TableHead>Product</TableHead><TableHead className="text-right">Available Quantity</TableHead><TableHead className="text-right">Buying Cost</TableHead><TableHead className="text-right">Stock Value</TableHead></tr></thead>
          <tbody>{overview.products.map((product) => <tr key={product.id}>
            <th scope="row" className="border-t px-4 py-3 font-semibold">{product.name}</th>
            <TableCell className="numeric text-right">{product.quantity} units</TableCell>
            <TableCell className="numeric text-right">{product.currentBuyingCostPaise === null ? "Not available" : formatDemoMoney(product.currentBuyingCostPaise)}</TableCell>
            <TableCell className="numeric text-right">{product.stockValuePaise === null ? "Not available" : formatDemoMoney(product.stockValuePaise)}</TableCell>
          </tr>)}</tbody>
        </Table>
      </TableRegion></div>
    </details>
  </section>;
}
