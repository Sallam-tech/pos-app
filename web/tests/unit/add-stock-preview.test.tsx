import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProductListPreview } from "@/components/admin/product-list-preview";
import InvestmentPage from "@/app/admin/investment/page";
import DashboardPage from "@/app/admin/dashboard/page";
import { mockInventory } from "@/lib/admin/mock-inventory";
import { missingBuyingCostsMessage } from "@/lib/admin/stock-investment-preview";

const methods = ["showModal", "close"] as const;
const originals = methods.map((name) => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterAll(() => methods.forEach((name, index) => {
  if (originals[index]) Object.defineProperty(HTMLDialogElement.prototype, name, originals[index]!);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
}));

function openStock(name = "Diapers") {
  const stock = screen.getByRole("button", { name: "Add stock for " + name });
  stock.focus(); fireEvent.click(stock);
  return screen.getByRole("dialog", { name: "Add Stock — " + name });
}
function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
}

describe("separate Add Stock purchase preview", () => {
  it("opens a product-specific dialog, prefills only a known selling guide, and returns focus on Cancel", () => {
    render(<ProductListPreview products={mockInventory} />);
    const stock = screen.getByRole("button", { name: "Add stock for Diapers" });
    const dialog = openStock();
    expect(dialog).toHaveAccessibleDescription(/Unsaved demo stock purchase/);
    expect(within(dialog).getByText("5 units")).toBeVisible();
    expect(screen.getByLabelText("Buying Price per Unit (Rs.)", { exact: true })).toHaveValue("");
    expect(screen.getByLabelText("Selling Price per Unit (Rs.)", { exact: true })).toHaveValue("1250.00");
    expect(within(dialog).getByRole("button", { name: "Close dialog" })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(stock).toHaveFocus();
    expect(screen.getByRole("link", { name: "Edit Diapers" })).toHaveAttribute("href", "/admin/products/diapers/edit");
    openStock("Milk Powder");
    expect(screen.getByLabelText("Selling Price per Unit (Rs.)", { exact: true })).toHaveValue("");
    expect(screen.queryByTestId("stock-purchase-notice")).not.toBeInTheDocument();
  });
  it("blocks incomplete submission, focuses the first error and preserves an invalid price", () => {
    render(<ProductListPreview products={mockInventory} />);
    const dialog = openStock();
    fireEvent.submit(within(dialog).getByRole("form"));
    expect(screen.getByLabelText("Quantity Bought", { exact: true })).toHaveFocus();
    expect(screen.getByText("Enter a buying price in PKR.")).toBeVisible();
    fill("Quantity Bought", "2"); fill("Buying Price per Unit (Rs.)", "100.999");
    fireEvent.submit(within(dialog).getByRole("form"));
    expect(screen.getByLabelText("Buying Price per Unit (Rs.)", { exact: true })).toHaveFocus();
    expect(screen.getByLabelText("Buying Price per Unit (Rs.)", { exact: true })).toHaveValue("100.999");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a price with no more than 2 decimal places.");
    expect(screen.queryByTestId("stock-purchase-notice")).not.toBeInTheDocument();
  });
  it("closes on a valid demo preview, announces exact expenditure and leaves quantities and prices unchanged", () => {
    const original = JSON.stringify(mockInventory);
    render(<ProductListPreview products={mockInventory} />);
    const dialog = openStock();
    fill("Quantity Bought", "2"); fill("Buying Price per Unit (Rs.)", "1250.25");
    fill("Selling Price per Unit (Rs.)", "1500");
    fireEvent.submit(within(dialog).getByRole("form"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("stock-purchase-notice")).toHaveTextContent("Rs. 2,500.50");
    expect(screen.getByTestId("stock-purchase-notice")).toHaveTextContent("No stock, prices or investment were saved or changed.");
    const card = screen.getByRole("article", { name: "Diapers" });
    expect(card).toHaveTextContent("5 units"); expect(card).toHaveTextContent("Rs. 1,250.00");
    expect(screen.getByRole("button", { name: "Add stock for Diapers" })).toHaveFocus();
    openStock(); expect(screen.getByLabelText("Quantity Bought", { exact: true })).toHaveValue("");
    expect(screen.getByLabelText("Selling Price per Unit (Rs.)", { exact: true })).toHaveValue("1250.00");
    expect(JSON.stringify(mockInventory)).toBe(original);
  });
});

describe("honest shared Stock Value overview", () => {
  it.skip("replaces manual entry with one unavailable summary and on-demand valuation rows", () => {
    render(<InvestmentPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Stock Value" })).toBeVisible();
    expect(screen.getAllByText(missingBuyingCostsMessage)).toHaveLength(1);
    expect(document.querySelector("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("View Product Details"));
    expect(screen.getByRole("group", { name: "Total Stock Value" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Total Investment" })).toBeNull();
    expect(screen.getAllByRole("columnheader").map((item) => item.textContent)).toEqual(["Product", "Available Quantity", "Buying Cost", "Stock Value"]);
    for (const product of mockInventory) {
      const row = screen.getByRole("rowheader", { name: product.name }).closest("tr")!;
      expect(within(row).getByText(product.quantity + " units")).toBeVisible();
      expect(within(row).getAllByText("Not available", { exact: true })).toHaveLength(2);
    }
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Rs. 0.00")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute("href", "/admin/dashboard");
  });
  it.skip("keeps the linked Stock Value Dashboard summary from the same incomplete source without replacing existing values", () => {
    render(<DashboardPage />);
    const overview = screen.getByRole("region", { name: "Shop overview" });
    expect(within(overview).getAllByRole("group")).toHaveLength(7);
    for (const label of ["Stock Value"]) {
      const card = within(overview).getByRole("group", { name: label });
      expect(within(card).getByText("Not available", { exact: true })).toBeVisible();
      expect(within(card).getByText("Buying costs not recorded.")).toBeVisible();
      expect(within(card).getByRole("link")).toHaveAttribute("href", "/admin/investment");
      expect(card.querySelector("data")).toBeNull();
    }
    for (const value of ["7", "123", "3", "Rs. 25,690.00", "Rs. 5,140.00"]) expect(within(overview).getByText(value, { exact: true })).toBeVisible();
  });
});
