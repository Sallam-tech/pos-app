import "server-only";
export type InventoryCode = "INVALID_INPUT" | "CONFLICT" | "NOT_FOUND" | "POLICY_PENDING" | "OVERFLOW" | "UNAVAILABLE";
export class InventoryError extends Error {
 constructor(readonly code: InventoryCode) { super("Product or inventory operation unavailable."); this.name = "InventoryError"; }
}
export interface AdminProduct {
 id: string; code: string; name: string; category: string | null; sizeLabel: string | null;
 unit: "PACK" | "BOX"; barcode: string | null; buyingPricePaisa: string; sellingPricePaisa: string | null;
 quantity: string; lowStockThreshold: string; sellingActive: boolean; archivedAtMs: string | null;
 productVersion: string; balanceVersion: string; stockValuePaisa: string;
 stockStatus: "OK" | "LOW" | "OUT"; priceNeedsReview: boolean; createdAtMs: string; updatedAtMs: string;
}
export interface MutationResult {
 operationId: string; product: AdminProduct; movementId: string | null; valuationDeltaPaisa: string | null;
}
export interface InventoryTotals {
 products: string; quantity: string; lowStock: string; outOfStock: string; stockValuePaisa: string;
}
export type Kind = "CREATE" | "EDIT" | "SELLING_PRICE" | "STATUS" | "ARCHIVE" | "REPRICE" | "RECEIVE" | "ADJUST";
export interface CreateProduct {
 requestKey: string; code?: string; name: string; category?: string | null; sizeLabel?: string | null;
 unit: "PACK" | "BOX"; barcode?: string | null; buyingPricePaisa: string; sellingPricePaisa: string | null;
 sellingActive: boolean; openingQuantity: string; lowStockThreshold: string;
}
export interface EditProduct {
 requestKey: string; productId: string; expectedProductVersion: string; reason: string;
 name?: string; category?: string | null; barcode?: string | null; lowStockThreshold?: string;
}
export interface SetSellingPrice {
 requestKey: string; productId: string; expectedProductVersion: string; reason: string; sellingPricePaisa: string;
}
export interface SetSellingStatus {
 requestKey: string; productId: string; expectedProductVersion: string; reason: string; sellingActive: boolean;
}
export interface ArchiveProduct { requestKey: string; productId: string; expectedProductVersion: string; reason: string }
export interface StockChange extends ArchiveProduct { expectedBalanceVersion: string }
export interface ReceiveStock extends StockChange { quantity: string; unitBuyingPricePaisa: string; reference?: string | null }
export interface CorrectStock extends StockChange { targetQuantity: string }
export interface RepriceStock extends StockChange { buyingPricePaisa: string; confirmAllRemaining: true }
export interface ProductQuery {
 query?: string; status?: "ALL" | "SELLING" | "STOPPED" | "ARCHIVED";
 stock?: "ALL" | "AVAILABLE" | "LOW" | "OUT"; cursor?: string; limit?: number;
}

export type RecoveryOutcome = Readonly<{ outcome: "COMMITTED"; result: MutationResult } | { outcome: "CANCELLED" }>;
