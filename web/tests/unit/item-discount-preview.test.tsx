import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { RecordSaleForm } from "@/components/pos/record-sale-form";
import { DraftInvoice } from "@/components/pos/draft-invoice";
import { calculateItemDiscounts } from "@/lib/item-discount-preview";
import { calculateDemoCheckout } from "@/lib/demo/checkout";
import { createSaleSimulation, previewProducts } from "@/lib/pos-preview";
import { type DraftItem } from "@/lib/sale-draft-preview";
const line = (key: number, price: string, discount = "0", quantity = "1"): DraftItem => ({ key, product: previewProducts[0], quantity, price, discount });
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
it("calculates independently from entered rates and reconciles exact invoice amounts", () => {
  const input = [line(1, "1250.00", "10"), line(2, "800.00", "5")]; const saved = JSON.stringify(input);
  const result = calculateItemDiscounts(input);
  expect(result.lineTotals).toEqual(["1125.00", "760.00"]); expect(result.checkout).toMatchObject({ subtotal: "2050.00", discountAmount: "165.00", total: "1885.00", discountPercent: "0" });
  expect(calculateItemDiscounts([line(1, "1200.00", "10")]).checkout?.total).toBe("1080.00"); expect(JSON.stringify(input)).toBe(saved);
  expect(result.lines?.[0]).toMatchObject({ unitPrice: "1250.00", baseTotal: "1250.00", discountPercent: "10", discountAmount: "125.00", total: "1125.00" });
});
it.each(["-1", "100.01", "101", "NaN", "Infinity", "1e1", "ten", "10.001", "."])("keeps invalid discount %s unavailable without rounding or affecting another valid line", (value) => {
  const result = calculateItemDiscounts([line(1, "1250", value), line(2, "800", "5")]);
  expect(result.checkout).toBeNull(); expect(result.errors[1]).toBeTruthy(); expect(result.lineTotals[1]).toBe("760.00");
});
it.each([["0", "1250.00"], ["100", "0.00"], ["12.50", "1093.75"]])("accepts exact %s percent including the inclusive boundaries", (discount, total) => expect(calculateItemDiscounts([line(1, "1250", discount)]).checkout?.total).toBe(total));
it("retains sub-paisa no-discount previews, rejects fractional-paisa discounts and sums huge exact amounts", () => {
  expect(calculateItemDiscounts([line(1, "0.10", "0", "0.125")]).checkout?.total).toBe("0.0125");
  expect(calculateItemDiscounts([line(1, "0.01", "1")]).errors[1]).toMatch(/never rounds/);
  expect(calculateItemDiscounts([line(1, "999999999999", "0", "999999999999"), line(2, "0.01")]).checkout?.total).toBe("999999999998000000000001.01");
});
const search = () => screen.getByRole("combobox", { name: "Find Product" });
function add(name: string) { fireEvent.change(search(), { target: { value: name } }); fireEvent.keyDown(search(), { key: "Enter" }); }
it("defaults each line to zero and retains independent discounts, prices and quantities across reselection and receipt editing", () => {
  render(<RecordSaleForm />); add("Diapers"); add("Milk Powder");
  const discount = screen.getByLabelText("Diapers discount (%), item 1"), milkDiscount = screen.getByLabelText("Milk Powder discount (%), item 2");
  expect(discount).toHaveValue("0"); expect(milkDiscount).toHaveValue("0"); expect(screen.queryByLabelText("Discount (%, optional)")).toBeNull();
  fireEvent.change(discount, { target: { value: "10" } }); fireEvent.change(milkDiscount, { target: { value: "5" } }); expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 1,885.00");
  fireEvent.change(screen.getByLabelText("Diapers price (PKR), item 1"), { target: { value: "1200" } }); expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 1,840.00");
  add("Diapers"); expect(discount).toHaveValue("10"); expect(screen.getByLabelText("Diapers quantity, item 1")).toHaveValue("2"); expect(screen.getByLabelText("Diapers price (PKR), item 1")).toHaveValue("1200");
  fireEvent.keyDown(discount, { key: "Enter" }); expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create Invoice" })); const receipt = screen.getByRole("dialog", { name: "Sample Invoice" });
  expect(within(receipt).getByTestId("receipt-total")).toHaveTextContent("Rs. 2,920.00"); expect(receipt).toHaveTextContent("Discount 10%"); expect(receipt).toHaveTextContent("Discount 5%");
  expect(document.getElementById("shop-pos-print-receipt")).toHaveTextContent("Rs. 2,920.00");
  fireEvent.click(within(receipt).getByRole("button", { name: "Edit Sale" })); expect(discount).toHaveValue("10"); expect(milkDiscount).toHaveValue("5");
  fireEvent.change(discount, { target: { value: "101" } }); fireEvent.submit(screen.getByRole("form")); expect(discount).toHaveFocus(); expect(screen.queryByRole("dialog")).toBeNull(); expect(discount).toHaveValue("101");
  fireEvent.click(screen.getByRole("button", { name: "Cancel Sale" })); add("Diapers"); expect(screen.getByLabelText("Diapers discount (%), item 1")).toHaveValue("0");
});
it("still displays a legacy global-discount receipt and computes its cash change without a second deduction", () => {
  render(<DraftInvoice initialDraft={null} onDone={() => {}} onEditSale={() => {}} invoice={{ items: [createSaleSimulation(previewProducts[0], "2", "1250")!], checkout: calculateDemoCheckout("2500.00", "10").value!, customer: { name: "", phone: "" }, previewedAt: "2026-11-02T10:00:00Z", sampleReference: "TEST-LEGACY" }} />);
  const receipt = screen.getByRole("dialog"); expect(receipt).toHaveTextContent("Discount (10%)"); expect(within(receipt).getByTestId("receipt-total")).toHaveTextContent("Rs. 2,250.00");
  fireEvent.change(within(receipt).getByLabelText("Cash Received (PKR, optional)"), { target: { value: "2300" } }); expect(receipt.querySelector(".receipt-sheet")).toHaveTextContent("Rs. 50.00");
});
