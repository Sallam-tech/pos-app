import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { RecordSaleForm } from "@/components/pos/record-sale-form";
import { getMockSuggestedSellingPrice } from "@/lib/mock-suggested-prices";
import { additionalCheckoutProducts, getCheckoutDemoPrice } from "@/lib/demo/checkout-products";
import { previewProducts } from "@/lib/pos-preview";
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
const search = () => screen.getByRole("combobox", { name: "Find Product" });
function choose(query = "dia") { fireEvent.change(search(), { target: { value: query } }); fireEvent.keyDown(search(), { key: "Enter" }); }
function add(query = "dia", q = "2", p = "1200", name = "Diapers", index = 1) {
  choose(query);
  fireEvent.change(screen.getByLabelText(name + " quantity, item " + index), { target: { value: q } });
  fireEvent.change(screen.getByLabelText(name + " price (PKR), item " + index), { target: { value: p } });
}
it("adds immediately at quantity one, clears search and retains the existing Diapers price", () => {
  render(<RecordSaleForm />); expect(search()).toHaveFocus(); choose();
  expect(screen.getByLabelText("Diapers quantity, item 1")).toHaveValue("1");
  expect(screen.getByLabelText("Diapers price (PKR), item 1")).toHaveValue("1250.00");
  expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 1,250.00"); expect(search()).toHaveValue(""); expect(search()).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Add Item" })).toBeNull();
  expect(getMockSuggestedSellingPrice("mock-diapers")).toBe("1250.00");
});
it("supplies all seven checkout demo prices without replacing the original fixtures or price guide", () => {
  expect(previewProducts).toHaveLength(5); expect(additionalCheckoutProducts).toHaveLength(2);
  expect(getMockSuggestedSellingPrice("mock-milk")).toBeNull();
  const expected = ["1250.00", "222.00", "800.00", "125.00", "850.00", "455.00", "180.00"];
  expect([...previewProducts, ...additionalCheckoutProducts].map((product) => getCheckoutDemoPrice(product.id))).toEqual(expected);
  expect(getCheckoutDemoPrice("unknown")).toBeNull();
  render(<RecordSaleForm />);
  for (const product of [...previewProducts, ...additionalCheckoutProducts]) choose(product.name);
  expect(screen.getAllByRole("listitem")).toHaveLength(7);
  expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 3,882.00");
});
it("adds three different products using Enter and supports deliberate mouse choice", () => {
  render(<RecordSaleForm />); choose("dia"); choose("milk"); choose("wipes");
  expect(screen.getAllByRole("listitem")).toHaveLength(3); expect(search()).toHaveFocus();
  expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 2,272.00");
  fireEvent.change(search(), { target: { value: "rice" } }); fireEvent.click(screen.getByRole("option", { name: "Rice" }));
  expect(screen.getByLabelText("Rice quantity, item 4")).toHaveValue("1"); expect(search()).toHaveFocus();
});
it("does not guess ambiguous matches, add on Escape, repeat Enter, or submit an empty search", () => {
  render(<RecordSaleForm />); fireEvent.change(search(), { target: { value: "m" } });
  expect(screen.getAllByRole("option")).toHaveLength(2); fireEvent.keyDown(search(), { key: "Enter" }); expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  fireEvent.keyDown(search(), { key: "ArrowDown" }); fireEvent.keyDown(search(), { key: "ArrowUp" }); fireEvent.keyDown(search(), { key: "Escape" });
  fireEvent.keyDown(search(), { key: "Enter" }); expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  fireEvent.change(search(), { target: { value: "dia" } }); fireEvent.keyDown(search(), { key: "Enter", repeat: true });
  expect(screen.queryAllByRole("listitem")).toHaveLength(0); fireEvent.keyDown(search(), { key: "Enter" }); fireEvent.keyDown(search(), { key: "Enter" });
  expect(screen.getAllByRole("listitem")).toHaveLength(1); expect(screen.getByLabelText("Diapers quantity, item 1")).toHaveValue("1");
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("increases an existing line by one without replacing its edited selling price", () => {
  render(<RecordSaleForm />); add("dia", "2", "1200.50"); choose("dia");
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByLabelText("Diapers quantity, item 1")).toHaveValue("3");
  expect(screen.getByLabelText("Diapers price (PKR), item 1")).toHaveValue("1200.50");
  expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 3,601.50");
});
it("keeps invalid existing edits visible rather than overwriting them on reselection", () => {
  render(<RecordSaleForm />); add("dia", "2", "100.999"); choose("dia");
  expect(screen.getByLabelText("Diapers price (PKR), item 1")).toHaveValue("100.999");
  expect(screen.getByLabelText("Diapers price (PKR), item 1")).toHaveFocus();
  expect(screen.getByLabelText("Diapers quantity, item 1")).toHaveValue("2");
});
it("edits, steps and removes the intended line without submitting from quantity or price", () => {
  render(<RecordSaleForm />); add(); add("milk", "1", "1500", "Milk Powder", 2);
  const quantity = screen.getByLabelText("Diapers quantity, item 1"), price = screen.getByLabelText("Diapers price (PKR), item 1");
  fireEvent.change(quantity, { target: { value: "3" } }); fireEvent.change(price, { target: { value: "1200.50" } });
  fireEvent.keyDown(quantity, { key: "Enter" }); fireEvent.keyDown(price, { key: "Enter" });
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 5,101.50");
  fireEvent.click(screen.getByRole("button", { name: "Increase Diapers quantity, item 1" })); fireEvent.click(screen.getByRole("button", { name: "Decrease Diapers quantity, item 1" }));
  const remove = screen.getByRole("button", { name: "Remove Milk Powder" }); expect(remove).toHaveClass("sale-remove-button"); fireEvent.click(remove);
  expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 3,601.50"); expect(search()).toHaveFocus();
});
it.each(["100.999", "0.001"])("retains and rejects invalid precision %s on invoice submission without rounding", (value) => {
  render(<RecordSaleForm />); add("dia", "2", value); const price = screen.getByLabelText("Diapers price (PKR), item 1");
  expect(price).toHaveValue(value); expect(screen.getByText("Enter a price with no more than 2 decimal places.")).toBeVisible();
  fireEvent.submit(screen.getByRole("form")); expect(price).toHaveFocus(); expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.change(price, { target: { value: "1250.25" } }); expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 2,500.50");
  fireEvent.submit(screen.getByRole("form")); expect(screen.getByRole("dialog", { name: "Sample Invoice" })).toBeVisible();
});
it.each(["100", "100.5", "100.50", "100.99", "1250.25", "0"])("keeps the existing valid price policy for %s", (value) => {
  render(<RecordSaleForm />); add("dia", "2", value);
  expect(screen.getByLabelText("Diapers price (PKR), item 1")).toHaveValue(value);
  fireEvent.submit(screen.getByRole("form")); expect(screen.getByRole("dialog", { name: "Sample Invoice" })).toBeVisible();
});
it.each(["0", "-1", "invalid"])("blocks invalid quantity %s without changing it", (value) => {
  render(<RecordSaleForm />); add("dia", value, "100");
  const quantity = screen.getByLabelText("Diapers quantity, item 1"); fireEvent.submit(screen.getByRole("form"));
  expect(quantity).toHaveFocus(); expect(quantity).toHaveValue(value); expect(screen.queryByRole("dialog")).toBeNull();
});
it("blocks an unresolved search rather than silently omitting it", () => {
  render(<RecordSaleForm />); choose(); fireEvent.change(search(), { target: { value: "m" } }); fireEvent.submit(screen.getByRole("form"));
  expect(search()).toHaveFocus(); expect(screen.getByText(/clear the search before creating/)).toBeVisible(); expect(screen.queryByRole("dialog")).toBeNull();
});
it("opens a single invoice directly with actual optional customer text, bottom actions and fixed credit", () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  render(<RecordSaleForm />); add(); add("milk", "1", "1500", "Milk Powder", 2);
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), { target: { value: " A & B <shop> " } });
  fireEvent.change(screen.getByLabelText("Phone", { exact: true }), { target: { value: "+92 300 1234567" } });
  fireEvent.submit(screen.getByRole("form")); fireEvent.submit(screen.getByRole("form", { name: "Make a sale preview" }));
  const dialog = screen.getByRole("dialog", { name: "Sample Invoice" });
  expect(within(dialog).getByTestId("receipt-total")).toHaveTextContent("Rs. 3,900.00");
  expect(within(dialog).getByText("A & B <shop>")).toBeVisible(); expect(within(dialog).getByText("+92 300 1234567")).toBeVisible();
  expect(within(dialog).getByText(/PREVIEW-001/)).toBeVisible(); expect(within(dialog).getByRole("heading", { name: "SALES INVOICE" })).toBeVisible();
  expect(within(dialog).getByText("Software Developed by: SalamTech")).toBeVisible();
  const paper = dialog.querySelector(".receipt-sheet")!, actions = dialog.querySelector("[data-receipt-actions]")!;
  expect(paper.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(dialog).getAllByRole("button", { name: "Print" })).toHaveLength(1);
  fireEvent.click(within(dialog).getByRole("button", { name: "Print" })); expect(print).toHaveBeenCalledOnce();
  expect(document.getElementById("shop-pos-print-receipt")).toHaveTextContent("Software Developed by: SalamTech");
  fireEvent.click(within(dialog).getByRole("button", { name: "Done" })); expect(screen.queryByRole("dialog")).toBeNull();
  expect(search()).toHaveFocus(); expect(screen.queryAllByRole("listitem")).toHaveLength(0); expect(document.getElementById("shop-pos-print-receipt")).toBeNull();
});
it("Cancel clears the draft; main checkout has no confidential values or payment fields", () => {
  render(<RecordSaleForm />); choose(); fireEvent.click(screen.getByRole("button", { name: "Cancel Sale" }));
  expect(search()).toHaveFocus(); expect(screen.getByTestId("sale-total")).toHaveTextContent("Rs. 0.00");
  expect(document.body.textContent).not.toMatch(/purchase cost|gross profit|remaining stock|cash received|change to return/i);
});
