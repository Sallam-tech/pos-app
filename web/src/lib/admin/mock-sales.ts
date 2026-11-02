import { formatPreviewPKR } from "@/lib/pos-preview";

// Fixed Admin-only examples, independent of inventory and the POS simulation.
// Whole-number quantities here do not decide the shop's final quantity policy.
export const mockSalesBusinessDate = {
  iso: "2026-11-02", label: "2 November 2026", timeZone: "Asia/Karachi",
} as const;

export type MockSale = Readonly<{
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPricePaise: number;
  // Shop-calendar date in Asia/Karachi, not a UTC timestamp.
  businessDate: string;
}>;

// Money is stored in whole paise; all arithmetic below uses BigInt.
export const mockSales: readonly MockSale[] = [
  { id: "demo-sale-1", businessDate: mockSalesBusinessDate.iso, productId: "diapers", productName: "Diapers", quantity: 2, unitPricePaise: 125025 },
  { id: "demo-sale-2", businessDate: mockSalesBusinessDate.iso, productId: "diapers", productName: "Diapers", quantity: 4, unitPricePaise: 124975 },
  { id: "demo-sale-3", businessDate: mockSalesBusinessDate.iso, productId: "milk-powder", productName: "Milk Powder", quantity: 2, unitPricePaise: 150025 },
  { id: "demo-sale-4", businessDate: mockSalesBusinessDate.iso, productId: "milk-powder", productName: "Milk Powder", quantity: 2, unitPricePaise: 150025 },
  { id: "demo-sale-5", businessDate: mockSalesBusinessDate.iso, productId: "baby-wipes", productName: "Baby Wipes", quantity: 10, unitPricePaise: 34995 },
  { id: "demo-sale-6", businessDate: mockSalesBusinessDate.iso, productId: "hand-soap", productName: "Hand Soap", quantity: 10, unitPricePaise: 12550 },
  { id: "demo-sale-7", businessDate: mockSalesBusinessDate.iso, productId: "rice", productName: "Rice", quantity: 5, unitPricePaise: 85000 },
  { id: "demo-sale-8", businessDate: mockSalesBusinessDate.iso, productId: "shampoo", productName: "Shampoo", quantity: 7, unitPricePaise: 45500 },
];

export type MockProductRevenue = {
  productId: string;
  productName: string;
  quantity: number;
  revenuePaise: bigint;
  unitPrices: { unitPricePaise: number; quantity: number }[];
};

export function getMockRevenuePaise(sales: readonly MockSale[] = mockSales): bigint {
  return sales.reduce((total, sale) => total + BigInt(sale.unitPricePaise) * BigInt(sale.quantity), BigInt(0));
}

export function aggregateMockSales(sales: readonly MockSale[]): MockProductRevenue[] {
  const products = new Map<string, MockProductRevenue>();
  for (const sale of sales) {
    let product = products.get(sale.productId);
    if (!product) {
      product = { productId: sale.productId, productName: sale.productName, quantity: 0, revenuePaise: BigInt(0), unitPrices: [] };
      products.set(sale.productId, product);
    }
    product.quantity += sale.quantity;
    product.revenuePaise += BigInt(sale.unitPricePaise) * BigInt(sale.quantity);
    const price = product.unitPrices.find((entry) => entry.unitPricePaise === sale.unitPricePaise);
    if (price) price.quantity += sale.quantity;
    else product.unitPrices.push({ unitPricePaise: sale.unitPricePaise, quantity: sale.quantity });
  }
  return [...products.values()];
}

export function mockRevenueDecimal(paise: bigint): string {
  return (paise / BigInt(100)).toString() + "." + (paise % BigInt(100)).toString().padStart(2, "0");
}

export function formatMockRevenue(paise: bigint): string {
  return formatPreviewPKR(mockRevenueDecimal(paise));
}
