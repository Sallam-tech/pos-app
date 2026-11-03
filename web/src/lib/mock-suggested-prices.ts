// One explicitly illustrative, public price guide. Not cost or a historical sale price.
// The approved Admin and POS fixtures use different IDs; preserve both sets of IDs.
const mockSuggestions = [
  { adminProductId: "diapers", salespersonProductId: "mock-diapers", suggestedSellingPrice: "1250.00" },
] as const;

export function getMockSuggestedSellingPrice(productId: string | undefined): string | null {
  return mockSuggestions.find((product) =>
    product.adminProductId === productId || product.salespersonProductId === productId,
  )?.suggestedSellingPrice ?? null;
}
