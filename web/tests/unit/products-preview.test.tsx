import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import ProductsPage from "@/app/admin/products/page";
import DashboardPage from "@/app/admin/dashboard/page";
import { getMockLowStockProducts, mockInventory } from "@/lib/admin/mock-inventory";

it("renders seven separate product cards with existing prices, quantities and statuses; no table or delete action", () => {
  const original = JSON.stringify(mockInventory); render(<ProductsPage />);
  expect(screen.getByRole("heading", { name: "Products", level: 1 })).toBeVisible(); expect(screen.getByText("Demo Data")).toBeVisible();
  expect(screen.queryByRole("table")).toBeNull(); expect(screen.getAllByRole("article")).toHaveLength(7);
  for (const product of mockInventory) {
    const card = screen.getByRole("article", { name: product.name });
    expect(card).toHaveAttribute("data-product-id", product.id); expect(within(card).getByText(product.quantity + " units")).toBeVisible();
    expect(within(card).getByText("Selling Price").nextElementSibling).toHaveTextContent(product.id === "diapers" ? "Rs. 1,250.00" : "Not set");
    expect(within(card).getByText(product.quantity === 0 ? "Out of Stock" : product.quantity <= product.lowStockThreshold ? "Low Stock" : "Available")).toBeVisible();
    expect(within(card).getByRole("link", { name: "Edit " + product.name })).toHaveAttribute("href", "/admin/products/" + product.id + "/edit");
    expect(within(card).getByRole("button", { name: "Add stock for " + product.name })).toHaveAttribute("aria-haspopup", "dialog");
    expect(within(card).getByRole("button", { name: "Add stock for " + product.name })).toHaveAccessibleDescription(/separate unsaved purchase preview/);
  }
  expect(screen.queryByRole("button", { name: /delete/i })).toBeNull(); expect(JSON.stringify(mockInventory)).toBe(original);
  expect(screen.getByRole("link", { name: "Add Product" })).toHaveAttribute("href", "/admin/products/new");
});
it("retains metadata in a compact disclosure without inventing buying prices", () => {
  render(<ProductsPage />); const card = screen.getByRole("article", { name: "Diapers" });
  const details = within(card).getByText("Details", { exact: true }).closest("details")!; expect(details.open).toBe(false);
  fireEvent.click(within(card).getByText("Details", { exact: true })); expect(details.open).toBe(true);
  expect(within(details).getByText("Not available in demo data")).toBeVisible(); expect(within(details).getByText("Piece (display fallback)")).toBeVisible();
  expect(within(details).getByText("Low Stock Alert").nextElementSibling).toHaveTextContent("5");
});
it.each([["diap", "Diapers"], ["  MILK  ", "Milk Powder"], ["WIPES", "Baby Wipes"], ["toothpaste", "Toothpaste"]])("filters %s without changing records", (query, name) => {
  render(<ProductsPage />); fireEvent.change(screen.getByRole("searchbox", { name: "Find product by name or code" }), { target: { value: query } });
  expect(screen.getAllByRole("article")).toHaveLength(1); expect(screen.getByRole("article", { name })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 7 mock products."); expect(mockInventory).toHaveLength(7);
});
it("handles whitespace, empty results and Clear search with restored focus", () => {
  render(<ProductsPage />); const search = screen.getByRole("searchbox", { name: "Find product by name or code" });
  fireEvent.change(search, { target: { value: "   " } }); expect(screen.getAllByRole("article")).toHaveLength(7);
  fireEvent.change(search, { target: { value: "no-such-product" } }); expect(screen.queryByRole("article")).toBeNull();
  expect(screen.getByText("No mock products match your search.")).toBeVisible(); fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(search).toHaveFocus(); expect(search).toHaveValue(""); expect(screen.getAllByRole("article")).toHaveLength(7);
});
it("preserves the shared dashboard inventory totals and links", () => {
  render(<DashboardPage />); expect(mockInventory.reduce((sum, p) => sum + p.quantity, 0)).toBe(123); expect(getMockLowStockProducts()).toHaveLength(3);
  expect(screen.getByRole("link", { name: "Total Products" })).toHaveAttribute("href", "/admin/products");
});
