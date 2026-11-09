import { expect, it } from "vitest";
import { inspectCashRefund, recordedPaidAmount, findReturnSales, type RefundSaleLine } from "@/lib/return-refund-preview";
import { mockSales } from "@/lib/admin/mock-sales";
const original: RefundSaleLine = { id: "test-only", productName: "Synthetic test line", quantity: 2, unitPricePaise: 45500, discountPercent: "0" };
it("uses the original recorded paid amount, including recorded line discounts, without today's price", () => {
  expect(inspectCashRefund(original, "1").refundPaise).toBe(BigInt(45500));
  const discounted = { ...original, unitPricePaise: 125000, discountPercent: "10" };
  expect(inspectCashRefund(discounted, "1").refundPaise).toBe(BigInt(112500));
  expect(inspectCashRefund({ ...discounted, paidAmountPaise: 225000 }, "2").refundPaise).toBe(BigInt(225000));
  expect(inspectCashRefund({ ...original, discountPercent: "100" }, "1").refundPaise).toBe(BigInt(0));
});
it("keeps all eight originals unchanged and their missing paid/discount data honestly unavailable", () => {
  const saved = JSON.stringify(mockSales); expect(mockSales).toHaveLength(8);
  for (const sale of mockSales) { expect(recordedPaidAmount(sale)).toBeNull(); expect(inspectCashRefund(sale, "1")).toMatchObject({ refundPaise: null, cumulativeKnown: false }); }
  expect(JSON.stringify(mockSales)).toBe(saved);
});
it.each(["0", "-1", "NaN", "Infinity", "1e0", "", "0.0000001", "3"])("rejects invalid or excessive return quantity %s", (quantity) => expect(inspectCashRefund(original, quantity).error).toBeTruthy());
it("searches actual references, invoice numbers and product names and preserves multiple exact sale lines", () => {
  expect(findReturnSales(mockSales, "DIAPERS")).toHaveLength(2); expect(findReturnSales(mockSales, "DEMO-SALE-8")[0].id).toBe("demo-sale-8");
  const lines = [{ ...original, receiptNumber: "REAL-RECORDED", saleLineId: "line-a" }, { ...original, receiptNumber: "REAL-RECORDED", saleLineId: "line-b" }]; expect(findReturnSales(lines, "real-recorded")).toHaveLength(2); expect(findReturnSales(lines, "missing")).toHaveLength(0);
});
it("accounts for trustworthy prior returns and caps quantity and remaining recorded payment", () => {
  const sale = { ...original, priorReturns: [{ id: "recorded-1", quantity: "1", refundPaise: 45500 }] };
  expect(inspectCashRefund(sale, "1")).toMatchObject({ refundPaise: BigInt(45500), remainingQuantity: "1", cumulativeKnown: true });
  expect(inspectCashRefund(sale, "2").error).toMatch(/remaining returnable quantity/);
  const duplicate = { ...sale, priorReturns: [...sale.priorReturns, ...sale.priorReturns] }; expect(inspectCashRefund(duplicate, "1").error).toMatch(/inconsistent/);
  expect(inspectCashRefund({ ...sale, priorReturns: [{ id: "overpaid", quantity: "1", refundPaise: 100000 }] }, "1").refundPaise).toBeNull();
});
it("does not round a partial-paisa refund and allocates a known final residual exactly once in the preview", () => {
  const sale = { ...original, quantity: 3, unitPricePaise: 100, discountPercent: undefined, paidAmountPaise: 100 };
  expect(inspectCashRefund(sale, "1")).toMatchObject({ refundPaise: null, reason: expect.stringMatching(/never rounds/) });
  const priorReturns = [{ id: "a", quantity: "1", refundPaise: 33 }, { id: "b", quantity: "1", refundPaise: 33 }];
  expect(inspectCashRefund({ ...sale, priorReturns }, "1").refundPaise).toBe(BigInt(34));
});
it("rejects inconsistent payment snapshots and never assumes an empty recorded discount means zero", () => {
  for (const sale of [{ ...original, paidAmountPaise: 1 }, { ...original, discountPercent: "" }, { ...original, paidAmountPaise: NaN }, { ...original, discountPercent: "101" }, { ...original, discountPercent: undefined, paidAmountPaise: 999999 }]) expect(inspectCashRefund(sale, "1").refundPaise).toBeNull();
});
