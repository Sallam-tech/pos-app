import { Card } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { getDemoInvestmentOverview, incompletePurchaseInformation } from "@/lib/admin/stock-investment-preview";
import { formatDemoMoney } from "@/lib/demo/money";

export function AdminInvestmentPreview() {
  const overview = getDemoInvestmentOverview();
  const cards = [
    { label: "Total Investment", amount: overview.totalInvestmentPaise, description: "Total money spent buying products." },
    { label: "Stock Value", amount: overview.stockValuePaise, description: "Buying-cost value of products still in stock." },
  ];
  return <section aria-label="Investment and stock valuation overview">
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((card) => <Card key={card.label} role="group" aria-label={card.label}>
        <h2 className="text-sm font-semibold">{card.label}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{card.description}</p>
        <p className="numeric mt-3 break-words text-lg font-semibold leading-7">{card.amount === null ? incompletePurchaseInformation : formatDemoMoney(card.amount)}</p>
      </Card>)}
    </div>
    <p className="my-4 text-sm leading-6 text-muted-foreground">This demo has no complete purchase history or current buying costs.
      Totals cannot be calculated yet. Add Stock and Add/Edit Product previews do not save or share purchases.</p>
    <h2 className="mb-3 section-title">Stock Value by Product</h2>
    <TableRegion label="Stock value by product">
      <Table aria-label="Demo stock value by product">
        <thead><tr><TableHead>Product</TableHead><TableHead className="text-right">Available Stock</TableHead><TableHead className="text-right">Buying Cost</TableHead><TableHead className="text-right">Stock Value</TableHead></tr></thead>
        <tbody>{overview.products.map((product) => <tr key={product.id}>
          <th scope="row" className="border-t px-4 py-3 font-semibold">{product.name}</th>
          <TableCell className="numeric text-right">{product.quantity} units</TableCell>
          <TableCell className="numeric text-right">{product.currentBuyingCostPaise === null ? "Not available" : formatDemoMoney(product.currentBuyingCostPaise)}</TableCell>
          <TableCell className="numeric text-right">{product.stockValuePaise === null ? "Not available" : formatDemoMoney(product.stockValuePaise)}</TableCell>
        </tr>)}</tbody>
      </Table>
    </TableRegion>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Sales do not reduce Total Investment. Stock Value uses the approved buying cost of remaining stock.
      Changing that cost does not change past purchase amounts or sale profits.</p>
  </section>;
}
