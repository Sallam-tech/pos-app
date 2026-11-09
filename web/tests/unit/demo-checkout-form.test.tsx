import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { RecordSaleForm } from "@/components/pos/record-sale-form";
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
function fillSale(q = "2", p = "1200") {
  render(<RecordSaleForm />); const search = screen.getByRole("combobox"); fireEvent.change(search, { target: { value: "dia" } }); fireEvent.keyDown(search, { key: "Enter" });
  fireEvent.change(screen.getByLabelText("Diapers quantity, item 1"), { target: { value: q } }); fireEvent.change(screen.getByLabelText("Diapers price (PKR), item 1"), { target: { value: p } });
}
it("keeps the optional percentage discount with one TOTAL and no invented payment or customer rows", () => {
  fillSale(); expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 2,400.00"); expect(screen.queryByText(/Cash received|Change to return/)).toBeNull();
  fireEvent.change(screen.getByLabelText("Diapers discount (%), item 1"), { target: { value: "10" } }); expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 2,160.00");
  fireEvent.submit(screen.getByRole("form", { name: "Make a sale preview" })); const receipt = screen.getByRole("dialog", { name: "Sample Invoice" });
  expect(within(receipt).getByText("Item discounts")).toBeVisible(); expect(within(receipt).getByTestId("receipt-total")).toHaveTextContent("Rs. 2,160.00");
  expect(receipt.querySelector(".receipt-sheet")).not.toHaveTextContent(/Cash Received|Change|Customer|Phone/);
});
it.each(["-1", "101", "10.001"])("blocks invalid discount %s", (value) => {
  fillSale(); const discount = screen.getByLabelText("Diapers discount (%), item 1"); fireEvent.change(discount, { target: { value } }); fireEvent.submit(screen.getByRole("form", { name: "Make a sale preview" }));
  expect(discount).toHaveFocus(); expect(discount).toHaveAttribute("aria-invalid", "true"); expect(screen.queryByRole("dialog")).toBeNull();
});
it("preserves sub-paisa totals without a discount and never rounds a discount", () => {
  fillSale("0.125", "0.10"); expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 0.0125");
  fireEvent.change(screen.getByLabelText("Diapers discount (%), item 1"), { target: { value: "10" } }); fireEvent.submit(screen.getByRole("form", { name: "Make a sale preview" })); expect(screen.getByRole("alert")).toHaveTextContent(/never rounds/);
  fireEvent.change(screen.getByLabelText("Diapers discount (%), item 1"), { target: { value: "" } }); fireEvent.submit(screen.getByRole("form", { name: "Make a sale preview" }));
  expect(within(screen.getByRole("dialog")).getByTestId("receipt-total")).toHaveTextContent("Rs. 0.0125"); expect(within(screen.getByRole("dialog")).queryByText(/Discount/)).toBeNull();
});
