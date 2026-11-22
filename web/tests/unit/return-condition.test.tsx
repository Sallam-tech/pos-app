import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AdminReturnPreview } from "@/components/demo/admin-return-preview";
import ReturnsPage from "@/app/pos/returns/page";
import { mockSales } from "@/lib/admin/mock-sales";
import { mockInventory } from "@/lib/admin/mock-inventory";
import { proposedStockTreatment, validateReturnCondition } from "@/lib/return-condition-preview";
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
describe("invoice-based safe cash-refund preview", () => {
  it.skip("requires exact sale selection and preserves pending-inspection stock safeguards without mutation", () => {
    const original = JSON.stringify({ mockSales, mockInventory }); render(<ReturnsPage />);
    fireEvent.change(screen.getByLabelText("Find the Bill"), { target: { value: "Diapers" } });
    expect(screen.getAllByRole("button", { name: /^Select/ })).toHaveLength(2); expect(screen.queryByLabelText("Return Quantity")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select demo-sale-1 — Diapers" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Diapers, item 1" }));
    expect(screen.getByLabelText("Return Quantity — Diapers, item 1")).toHaveValue("1");
    expect(screen.queryByLabelText(/Item Condition/)).toBeNull();
    const submit = screen.getByRole("button", { name: "Review Refund" });
    for (const quantity of ["1", "2"] as const) {
      fireEvent.change(screen.getByLabelText("Return Quantity — Diapers, item 1"), { target: { value: quantity } }); submit.focus(); fireEvent.click(submit);
      const dialog = screen.getByRole("dialog", { name: "Refund Review — Demo Only" });
      expect(dialog).toHaveTextContent(/pending inspection/i); expect(dialog).toHaveTextContent("Refund amount unavailable");
      expect(within(dialog).queryByRole("button", { name: /refund|pay|save/i })).toBeNull();
      fireEvent.click(within(dialog).getByRole("button", { name: "Done" })); expect(submit).toHaveFocus();
    }
    expect(screen.getByText(/Prior returns are not recorded/)).toBeVisible(); expect(JSON.stringify({ mockSales, mockInventory })).toBe(original);
    fireEvent.click(screen.getByRole("button", { name: "Reset" })); expect(screen.queryByLabelText(/Item Condition/)).toBeNull(); expect(screen.queryByLabelText(/Return Quantity/)).toBeNull();
  });
  it.skip("finds actual references, keeps no-result lookup honest and validates quantity controls", () => {
    render(<ReturnsPage />); const search = screen.getByLabelText("Find the Bill");
    fireEvent.change(search, { target: { value: "DEMO-SALE-8" } }); expect(screen.getAllByRole("button", { name: /^Select/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Select demo-sale-8 — Shampoo" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Shampoo, item 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Shampoo, item 1 return quantity" })); expect(screen.getByLabelText("Return Quantity — Shampoo, item 1")).toHaveValue("2");
    fireEvent.click(screen.getByRole("button", { name: "Decrease Shampoo, item 1 return quantity" })); expect(screen.getByLabelText("Return Quantity — Shampoo, item 1")).toHaveValue("1");
    for (const value of ["", "-1", "NaN", "Infinity", "8"]) {
      fireEvent.change(screen.getByLabelText("Return Quantity — Shampoo, item 1"), { target: { value } }); fireEvent.click(screen.getByRole("button", { name: "Review Refund" }));
      expect(screen.getByRole("alert")).toBeVisible(); expect(screen.getByLabelText("Return Quantity — Shampoo, item 1")).toHaveFocus();
    }
    fireEvent.change(search, { target: { value: "not-an-invoice" } }); expect(screen.getByText("No original sales match this search.")).toBeVisible();
    expect(validateReturnCondition("")).toBeUndefined(); expect(validateReturnCondition("invented")).toBeTruthy();
    expect(proposedStockTreatment("")).toMatch(/Pending inspection/);
  });
});

it("can select a specific recorded invoice line and preview its original discounted cash amount", () => {
  const sales = [
    { id: "test-invoice", receiptNumber: "RECORDED-TEST", saleLineId: "a", productName: "Test product", quantity: 2, unitPricePaise: 125000, discountPercent: "10" },
    { id: "test-invoice", receiptNumber: "RECORDED-TEST", saleLineId: "b", productName: "Test product", quantity: 2, unitPricePaise: 45500, discountPercent: "0" },
  ];
  const original = JSON.stringify(sales); render(<AdminReturnPreview sales={sales} businessDateLabel="Test records only" />);
  fireEvent.change(screen.getByLabelText("Find the Bill"), { target: { value: "recorded-test" } });
  expect(screen.getAllByRole("button", { name: /^Select/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Select RECORDED-TEST — Test product, Test product" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Test product, item 1" }));
  expect(screen.getByLabelText("Total Cash Refund")).toHaveTextContent("Rs. 1,125.00");
  fireEvent.change(screen.getByLabelText("Return Quantity — Test product, item 1"), { target: { value: "2" } }); expect(screen.getByLabelText("Total Cash Refund")).toHaveTextContent("Rs. 2,250.00");
  fireEvent.click(screen.getByRole("button", { name: "Clear Selection" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Test product, item 2" }));
  expect(screen.getByLabelText("Total Cash Refund")).toHaveTextContent("Rs. 455.00"); expect(JSON.stringify(sales)).toBe(original);
});
