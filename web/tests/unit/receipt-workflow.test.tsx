import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { RecordSaleForm } from "@/components/pos/record-sale-form";
import { HistoricalReceipt } from "@/components/pos/historical-receipt";
import { SettingsPreview } from "@/components/settings/settings-preview";
import { validateReceiptDraft } from "@/lib/receipt-draft-preview";
import { defaultShopSettings, shopSettingsStorageKey } from "@/lib/shop-display-settings";
const credit = "Software Developed by: SalamTech";
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
const dialog = () => screen.getByRole("dialog", { name: "Sample Invoice" });
const paper = () => dialog().querySelector(".receipt-sheet")!;
function openSale(discount = "") {
  render(<RecordSaleForm />); const search = screen.getByRole("combobox", { name: "Find Product" });
  fireEvent.change(search, { target: { value: "dia" } }); fireEvent.keyDown(search, { key: "Enter" });
  fireEvent.change(screen.getByLabelText("Diapers quantity, item 1"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Diapers price (PKR), item 1"), { target: { value: "1250.25" } });
  fireEvent.change(screen.getByLabelText("Diapers discount (%), item 1"), { target: { value: discount } });
  fireEvent.click(screen.getByRole("button", { name: "Create Invoice" }));
}
it("uses saved shop details but permits one-receipt overrides without changing Settings or money", () => {
  const saved = { ...defaultShopSettings, shopName: "Owner Shop", address: "Main Road", phone: "0300-1234567", footer: "Saved message" };
  localStorage.setItem(shopSettingsStorageKey, JSON.stringify(saved));
  openSale("10"); const total = within(dialog()).getByTestId("receipt-total");
  expect(paper()).toHaveTextContent("Owner Shop"); expect(paper()).toHaveTextContent("Main Road"); expect(paper()).toHaveTextContent("Saved message");
  fireEvent.change(within(dialog()).getByLabelText("Receipt Shop Name"), { target: { value: "One receipt only" } });
  fireEvent.change(within(dialog()).getByLabelText("Receipt Shop Address (optional)"), { target: { value: "Temporary address" } });
  fireEvent.change(within(dialog()).getByLabelText("Receipt Message (optional)"), { target: { value: "One-time thanks" } });
  fireEvent.change(within(dialog()).getByLabelText("Customer Name (optional)"), { target: { value: "<Ali & Sons>" } });
  fireEvent.change(within(dialog()).getByLabelText("Customer Phone (optional)"), { target: { value: "+92 300 7654321" } });
  expect(paper()).toHaveTextContent("One receipt only"); expect(paper()).toHaveTextContent("Temporary address"); expect(paper()).toHaveTextContent("<Ali & Sons>");
  expect(paper().querySelector("Ali")).toBeNull(); expect(total).toHaveTextContent("Rs. 2,250.45");
  expect(paper()).toHaveTextContent("Subtotal"); expect(paper()).toHaveTextContent("Item discounts");
  expect(JSON.parse(localStorage.getItem(shopSettingsStorageKey)!)).toEqual(saved);
  expect(paper()).toHaveTextContent(credit); expect(dialog().querySelector('input[value*="AbdulSalam"]')).toBeNull();
});
it("omits empty customer and payment rows, never marks unknown payment as Paid and allows printing", () => {
  openSale(); expect(paper()).not.toHaveTextContent(/Customer|Cash Received|Change|Paid|Subtotal|Discount/);
  expect(within(dialog()).getByRole("button", { name: "Print" })).toBeEnabled();
  expect(paper()).toHaveTextContent(credit);
});
it.each(["100.999", "-1", "bad"])("rejects invalid optional cash %s without changing receipt totals", (cash) => {
  openSale(); const input = within(dialog()).getByLabelText("Cash Received (PKR, optional)");
  fireEvent.change(input, { target: { value: cash } });
  expect(input).toHaveAttribute("aria-invalid", "true"); expect(within(dialog()).getByRole("button", { name: "Print" })).toBeDisabled();
  expect(paper()).not.toHaveTextContent(/Cash Received|Change/); expect(within(dialog()).getByTestId("receipt-total")).toHaveTextContent("Rs. 2,500.50");
});
it("shows insufficient cash as an error; valid cash uses exact change and clearing it removes payment rows", () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  openSale(); const input = within(dialog()).getByLabelText("Cash Received (PKR, optional)");
  fireEvent.change(input, { target: { value: "100" } });
  expect(within(dialog()).getByText(/Cash received is less than/)).toBeInTheDocument(); expect(paper()).not.toHaveTextContent("Change");
  fireEvent.click(within(dialog()).getByRole("button", { name: "Print" })); expect(print).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "2600" } });
  expect(paper()).toHaveTextContent("Cash ReceivedRs. 2,600.00"); expect(paper()).toHaveTextContent("ChangeRs. 99.50");
  fireEvent.click(within(dialog()).getByRole("button", { name: "Print" })); expect(print).toHaveBeenCalledOnce();
  fireEvent.change(input, { target: { value: "" } }); expect(paper()).not.toHaveTextContent(/Cash Received|Change/);
  expect(within(dialog()).getByRole("button", { name: "Print" })).toBeEnabled();
});
it("validates receipt display details and never provides editable totals or identity", () => {
  openSale();
  fireEvent.change(within(dialog()).getByLabelText("Receipt Shop Name"), { target: { value: "" } });
  expect(within(dialog()).getByRole("button", { name: "Print" })).toBeDisabled();
  expect(within(dialog()).getByText("Enter your shop name.")).toBeInTheDocument();
  expect(within(dialog()).queryByLabelText(/Invoice #|TOTAL|Quantity|Rate|Discount/)).toBeNull();
  expect(paper()).toHaveTextContent("PREVIEW-001");
});
it("Edit Sale preserves customer, cart, discount, receipt overrides, cash and preview identity", () => {
  openSale("10");
  fireEvent.change(within(dialog()).getByLabelText("Receipt Shop Name"), { target: { value: "Draft name" } });
  fireEvent.change(within(dialog()).getByLabelText("Customer Name (optional)"), { target: { value: "Ali" } });
  fireEvent.change(within(dialog()).getByLabelText("Cash Received (PKR, optional)"), { target: { value: "2300" } });
  fireEvent.change(within(dialog()).getByLabelText("Print layout"), { target: { value: "compact" } });
  const originalDate = paper().querySelector("dl")!.textContent;
  fireEvent.click(within(dialog()).getByRole("button", { name: "Edit Sale" }));
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByLabelText("Diapers quantity, item 1")).toHaveValue("2");
  expect(screen.getByLabelText("Diapers price (PKR), item 1")).toHaveValue("1250.25"); expect(screen.getByLabelText("Diapers discount (%), item 1")).toHaveValue("10");
  expect(screen.getByLabelText("Name", { exact: true })).toHaveValue("Ali");
  fireEvent.click(screen.getByRole("button", { name: "Create Invoice" }));
  expect(within(dialog()).getByLabelText("Print layout")).toHaveValue("compact");
  expect(paper()).toHaveTextContent("Draft name"); expect(paper().querySelector("dl")!.textContent).toBe(originalDate);
  expect(within(dialog()).getByLabelText("Cash Received (PKR, optional)")).toHaveValue("2300");
  expect(within(dialog()).getByTestId("receipt-total")).toHaveTextContent("Rs. 2,250.45");
  fireEvent.click(within(dialog()).getByRole("button", { name: "Close dialog" }));
  expect(screen.getByLabelText("Diapers price (PKR), item 1")).toHaveValue("1250.25");
});
it("keeps fixed presentation attribution on new Settings and read-only historical receipt copies", () => {
  const settings = render(<SettingsPreview />); fireEvent.click(screen.getByRole("button", { name: "Preview Receipt" }));
  expect(screen.getByRole("dialog", { name: "Sample Receipt" })).toHaveTextContent(credit);
  settings.unmount();
  render(<HistoricalReceipt sale={{ id: "original", productName: "Diapers", quantity: 2, unitPricePaise: 125025, businessDate: "2026-11-02" }} />);
  fireEvent.click(screen.getByRole("button", { name: "View Receipt for original" }));
  expect(screen.getByRole("dialog", { name: "Sample Receipt" })).toHaveTextContent(credit);
  expect(screen.queryByRole("button", { name: "Edit Sale" })).toBeNull();
});
it("accepts long plain display text safely and rejects controls / invalid customer phones", () => {
  const details = { shopName: "S".repeat(80), address: "A".repeat(240), shopPhone: "", footer: "F".repeat(160), customerName: "C".repeat(120), customerPhone: "" };
  expect(validateReceiptDraft(details)).toEqual({});
  expect(validateReceiptDraft({ ...details, customerName: "bad\nname", customerPhone: "not a phone" })).toMatchObject({ customerName: expect.any(String), customerPhone: expect.any(String) });
});
