import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardPage from "@/app/admin/dashboard/page";
import ProductsPage from "@/app/admin/products/page";
import { getMockLowStockProducts, getMockStockStatus, mockInventory } from "@/lib/admin/mock-inventory";

describe("Total Products and read-only mock product list", () => {
  it("uses one compact Demo Data header with a clear simulation label and no development banner or breadcrumb", () => {
    render(<ProductsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Products" })).toBeVisible();
    expect(screen.getByText("Demo Data", { exact: true })).toBeVisible();
    expect(screen.getByText("Simulated product information, not live inventory.")).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Breadcrumbs" })).not.toBeInTheDocument();
    expect(screen.queryByText("Mock UI", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText(/Authentication and business workflows/)).not.toBeInTheDocument();
  });

  it("shares the fixture count, preserves the low-stock boundary, and checks the independent stock example", () => {
    render(<><DashboardPage /><ProductsPage /></>);
    const overview = screen.getByRole("region", { name: "Shop overview" });
    const total = within(overview).getByRole("group", { name: "Total Products" });
    expect(within(total).getByRole("link", { name: "Total Products" })).toHaveAttribute("href", "/admin/products");
    expect(within(total).getByText(String(mockInventory.length), { exact: true })).toHaveAttribute("value", String(mockInventory.length));
    expect(within(overview).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/admin/products", "/admin/inventory/available-stock", "/admin/inventory/low-stock", "/admin/sales/today",
    ]);
    const stock = mockInventory.reduce((total, product) => total + product.quantity, 0);
    expect(stock).toBe(123);
    expect(within(within(overview).getByRole("group", { name: "Available Stock" })).getByText("123")).toHaveAttribute("value", String(stock));
    expect(getMockLowStockProducts().map(({ name, quantity, lowStockThreshold }) => [name, quantity, lowStockThreshold])).toEqual([
      ["Diapers", 5, 5], ["Milk Powder", 3, 5], ["Toothpaste", 0, 5],
    ]);
    const table = screen.getByRole("table", { name: "Mock products" });
    expect(within(table).getAllByRole("row")).toHaveLength(mockInventory.length + 1);
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Product name", "Suggested selling price", "Available stock", "Stock status", "Action",
    ]);
    for (const product of mockInventory) {
      const heading = within(table).getByRole("rowheader", { name: product.name });
      const cells = within(heading.closest("tr")!).getAllByRole("cell");
      expect(cells[0]).toHaveTextContent(product.id === "diapers" ? "Rs. 1,250.00" : "Not set");
      expect(cells[1]).toHaveTextContent(String(product.quantity));
      expect(cells[2]).toHaveTextContent(getMockStockStatus(product));
    }
    const list = screen.getByRole("region", { name: "Product list" });
    expect(list).toHaveAccessibleDescription(/Mock data only/);
    expect(within(list).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute("href", "/admin/dashboard");
    expect(within(list).queryByText(/purchase cost|profit|Add product|Edit product|Delete product/i)).not.toBeInTheDocument();
  });

  it.each([
    ["diap", "Diapers"],
    ["  MILK  ", "Milk Powder"],
    ["WIPES", "Baby Wipes"],
    ["toothpaste", "Toothpaste"],
  ])("filters names for %s without changing inventory", (query, name) => {
    render(<ProductsPage />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search by product name" }), { target: { value: query } });
    const table = screen.getByRole("table", { name: "Mock products" });
    expect(within(table).getAllByRole("rowheader").map((heading) => heading.textContent)).toEqual([name]);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of " + mockInventory.length + " mock products.");
    expect(mockInventory).toHaveLength(7);
    if (name === "Toothpaste") {
      expect(within(table).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Not set", "0", "Out of stock", "Edit"]);
      expect(within(table).getByText("Out of stock", { exact: true })).toHaveClass("text-danger");
    }
  });

  it("shows a clear no-results state and restores all rows and search focus on Clear search", () => {
    render(<ProductsPage />);
    const search = screen.getByRole("searchbox", { name: "Search by product name" });
    fireEvent.change(search, { target: { value: "no-such-product" } });
    expect(screen.getByText("No mock products match your search.")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 0 of 7 mock products.");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(screen.getAllByRole("rowheader")).toHaveLength(mockInventory.length);
  });

  it("treats whitespace as an empty query and searches names rather than quantity values", () => {
    render(<ProductsPage />);
    const search = screen.getByRole("searchbox", { name: "Search by product name" });
    fireEvent.change(search, { target: { value: "   " } });
    expect(screen.getAllByRole("rowheader")).toHaveLength(mockInventory.length);
    fireEvent.change(search, { target: { value: "20" } });
    expect(screen.getByRole("status")).toHaveTextContent("Showing 0 of 7 mock products.");
  });
});
