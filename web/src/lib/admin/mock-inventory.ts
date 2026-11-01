// Admin-only UI examples. These are not persisted inventory or a quantity-policy decision.
export type MockInventoryProduct = Readonly<{
  id: string;
  name: string;
  quantity: number;
  lowStockThreshold: number;
}>;

export const mockInventory: readonly MockInventoryProduct[] = [
  { id: "diapers", name: "Diapers", quantity: 5, lowStockThreshold: 5 },
  { id: "milk-powder", name: "Milk Powder", quantity: 3, lowStockThreshold: 5 },
  { id: "baby-wipes", name: "Baby Wipes", quantity: 20, lowStockThreshold: 5 },
  { id: "hand-soap", name: "Hand Soap", quantity: 30, lowStockThreshold: 8 },
  { id: "rice", name: "Rice", quantity: 40, lowStockThreshold: 10 },
  { id: "shampoo", name: "Shampoo", quantity: 25, lowStockThreshold: 5 },
];

export function getMockLowStockProducts(
  inventory: readonly MockInventoryProduct[] = mockInventory,
): readonly MockInventoryProduct[] {
  return inventory.filter((product) => product.quantity <= product.lowStockThreshold);
}
