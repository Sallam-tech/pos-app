import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { AdminReturnPreview } from "@/components/demo/admin-return-preview";
import { groupReturnInvoices, findReturnInvoices, inspectInvoiceRefund, refundLineKey, remainingReturnQuantity } from "@/lib/return-refund-preview";
import { refundInvoiceFixture } from "../fixtures/refund-invoice";
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
function openInvoice() {
  fireEvent.change(screen.getByLabelText("Find Original Sale"), { target: { value: "Diapers" } });
  fireEvent.click(screen.getByRole("button", { name: /^Select TEST-INVOICE/ }));
}
it("groups by original invoice identity and returns all its lines when one product matches", () => {
  const invoices = groupReturnInvoices(refundInvoiceFixture);
  expect(invoices).toHaveLength(1); expect(findReturnInvoices(invoices, "DIAPERS")[0].lines).toHaveLength(5);
  const key = refundLineKey(refundInvoiceFixture[0]);
  expect(inspectInvoiceRefund(invoices[0], { [key]: "1" }).totalRefundPaise).toBe(BigInt(112500));
  expect(inspectInvoiceRefund(invoices[0], { unknown: "1" }).error).toMatch(/does not belong/);
  expect(groupReturnInvoices([refundInvoiceFixture[0], refundInvoiceFixture[0]])[0].error).toMatch(/identities/);
  expect(groupReturnInvoices([{ ...refundInvoiceFixture[0], saleLineId: undefined }, refundInvoiceFixture[1]])[0].error).toMatch(/identities/);
});
it("refunds only the selected discounted item without duplicate review or mutation", () => {
  const before = JSON.stringify(refundInvoiceFixture);
  render(<AdminReturnPreview sales={refundInvoiceFixture} businessDateLabel="Isolated test records" />); openInvoice();
  expect(screen.getAllByRole("checkbox")).toHaveLength(5);
  expect(screen.getAllByRole("row")).toHaveLength(6);
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Diapers, item 1" }));
  expect(screen.getByLabelText("Total Cash Refund")).toHaveTextContent("Rs. 1,125.00");
  const form = screen.getByRole("form", { name: "Demo return review" });
  fireEvent.submit(form); fireEvent.submit(form);
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  const summary = screen.getByRole("list", { name: "Refund Summary" });
  expect(within(summary).getAllByRole("listitem")).toHaveLength(1);
  expect(summary).toHaveTextContent("Diapers × 1"); expect(summary).not.toHaveTextContent("Milk Powder");
  expect(screen.queryByLabelText(/Item Condition/)).toBeNull();
  expect(JSON.stringify(refundInvoiceFixture)).toBe(before);
});
it("selects all remaining quantities after multiple previous returns, then clears only the selection", () => {
  render(<AdminReturnPreview sales={refundInvoiceFixture} businessDateLabel="Isolated test records" />); openInvoice();
  fireEvent.click(screen.getByRole("button", { name: "Select All Remaining Items" }));
  expect(screen.getByLabelText("Return Quantity — Hand Soap, item 3")).toHaveValue("2");
  expect(screen.getByLabelText("Return Quantity — Rice, item 5")).toHaveValue("3");
  expect(screen.getByLabelText("Total Cash Refund")).toHaveTextContent("Rs. 4,060.00");
  fireEvent.click(screen.getByRole("button", { name: "Review Refund" }));
  expect(within(screen.getByRole("list", { name: "Refund Summary" })).getAllByRole("listitem")).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  fireEvent.click(screen.getByRole("button", { name: "Clear Selection" }));
  expect(screen.getAllByRole("checkbox").every((item) => !(item as HTMLInputElement).checked)).toBe(true);
  expect(screen.getByLabelText("Total Cash Refund")).toHaveTextContent("Rs. 0.00");
  expect(screen.getAllByRole("row")).toHaveLength(6);
});
it("omits fully returned items and blocks quantities above the recorded remaining balance", () => {
  const sales = refundInvoiceFixture.map((line, index) => index ? line : { ...line, priorReturns: [{ id: "full", quantity: "2", refundPaise: 225000 }] });
  render(<AdminReturnPreview sales={sales} businessDateLabel="Isolated test records" />); openInvoice();
  expect(screen.getByRole("checkbox", { name: "Select Diapers, item 1" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Select All Remaining Items" }));
  expect(screen.getByLabelText("Return Quantity — Diapers, item 1")).toHaveValue("0");
  expect(screen.getByLabelText("Total Cash Refund")).toHaveTextContent("Rs. 1,810.00");
  const quantity = screen.getByLabelText("Return Quantity — Rice, item 5");
  fireEvent.change(quantity, { target: { value: "4" } }); fireEvent.click(screen.getByRole("button", { name: "Review Refund" }));
  expect(screen.getByRole("alert")).toHaveTextContent("remaining returnable quantity"); expect(quantity).toHaveFocus();
});
it("never turns partial missing payment or inconsistent history into a partial-looking total", () => {
  const lines = refundInvoiceFixture.map((line, index) => index ? line : { ...line, discountPercent: undefined });
  const invoice = groupReturnInvoices(lines)[0];
  expect(inspectInvoiceRefund(invoice, Object.fromEntries(lines.map((line) => [refundLineKey(line), "1"]))).totalRefundPaise).toBeNull();
  expect(remainingReturnQuantity({ ...lines[1], priorReturns: [{ id: "duplicate", quantity: "1", refundPaise: 1 }, { id: "duplicate", quantity: "1", refundPaise: 1 }] })).toBeNull();
});
