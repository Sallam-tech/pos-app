import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardPage from "@/app/admin/dashboard/page";
import LowStockPage from "@/app/admin/inventory/low-stock/page";
import { getMockLowStockProducts, getMockStockStatus, mockInventory, type MockInventoryProduct } from "@/lib/admin/mock-inventory";

describe("mock low-stock filtering", () => {
  it.each([
    { quantity: 0, threshold: 5, status: "Out of stock" },
    { quantity: 0, threshold: 0, status: "Out of stock" },
    { quantity: 3, threshold: 5, status: "Low stock" },
    { quantity: 5, threshold: 5, status: "Low stock" },
    { quantity: 6, threshold: 5, status: "Available" },
  ])("classifies quantity $quantity at threshold $threshold as $status", ({ quantity, threshold, status }) => {
    expect(getMockStockStatus({ id: "example", name: "Example", quantity, lowStockThreshold: threshold })).toBe(status);
  });

  it("preserves all six original products and appends only the zero-stock Toothpaste example", () => {
    expect(mockInventory.map(({ name, quantity, lowStockThreshold }) => [name, quantity, lowStockThreshold])).toEqual([
      ["Diapers", 5, 5], ["Milk Powder", 3, 5], ["Baby Wipes", 20, 5],
      ["Hand Soap", 30, 8], ["Rice", 40, 10], ["Shampoo", 25, 5], ["Toothpaste", 0, 5],
    ]);
    expect(getMockLowStockProducts().map((product) => product.name)).toEqual(["Diapers", "Milk Powder", "Toothpaste"]);
  });

  it("includes below and exactly-at-threshold quantities, including zero, and excludes above", () => {
    const inventory: readonly MockInventoryProduct[] = [
      { id: "below", name: "Below", quantity: 3, lowStockThreshold: 5 },
      { id: "equal", name: "Equal", quantity: 5, lowStockThreshold: 5 },
      { id: "above", name: "Above", quantity: 6, lowStockThreshold: 5 },
      { id: "zero", name: "Zero", quantity: 0, lowStockThreshold: 0 },
    ];
    expect(getMockLowStockProducts(inventory).map((product) => product.id)).toEqual(["below", "equal", "zero"]);
    expect(inventory).toHaveLength(4);
  });

  it("returns no low-stock products for empty or healthy fixtures", () => {
    expect(getMockLowStockProducts([])).toEqual([]);
    expect(getMockLowStockProducts([{ id: "healthy", name: "Healthy", quantity: 8, lowStockThreshold: 2 }])).toEqual([]);
  });
});

describe("Low Stock Products card and list", () => {
  it("preserves the low-stock link alongside the other approved inventory links", () => {
    render(<DashboardPage />);
    const overview = screen.getByRole("region", { name: "Shop overview" });
    const card = within(overview).getByRole("group", { name: "Low Stock Products" });
    const link = within(card).getByRole("link", { name: "Low Stock Products" });
    expect(within(overview).getAllByRole("link")).toHaveLength(8);
    expect(within(overview).getByRole("link", { name: "Total Products" })).toHaveAttribute("href", "/admin/products");
    expect(link).toHaveAttribute("href", "/admin/inventory/low-stock");
    expect(link).toHaveAccessibleDescription(/Mock data only/);
    expect(link).not.toHaveAttribute("tabindex", "-1");
    expect(link).toHaveAccessibleName("Low Stock Products");
    expect(within(overview).queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the dashboard count and all displayed rows consistent with the same fixture", () => {
    render(<><DashboardPage /><LowStockPage /></>);
    const products = getMockLowStockProducts();
    const count = within(screen.getByRole("group", { name: "Low Stock Products" })).getByText(String(products.length), { exact: true });
    expect(count).toHaveAttribute("value", String(products.length));
    const table = screen.getByRole("table", { name: "Mock low-stock inventory" });
    expect(within(table).getAllByRole("row")).toHaveLength(products.length + 1);
    expect(screen.getByRole("heading", { name: "Low-stock list (" + products.length + ")" })).toBeVisible();
    for (const product of products) {
      const heading = within(table).getByRole("rowheader", { name: product.name });
      expect(heading).toHaveAttribute("scope", "row");
      const cells = within(heading.closest("tr")!).getAllByRole("cell");
      expect(cells.map((cell) => cell.textContent)).toEqual([
        String(product.quantity), String(product.lowStockThreshold), getMockStockStatus(product),
      ]);
    }
    for (const product of mockInventory.filter((product) => product.quantity > product.lowStockThreshold)) {
      expect(within(table).queryByRole("rowheader", { name: product.name })).not.toBeInTheDocument();
    }
  });

  it("labels mock data and all columns, with a canonical dashboard return link and no inventory controls", () => {
    render(<LowStockPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Low Stock Products" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Low-stock list (3)" })).toHaveAccessibleDescription(/Mock data only/);
    expect(screen.getByText("Demo Data", { exact: true })).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Breadcrumbs" })).not.toBeInTheDocument();
    expect(screen.queryByText("Mock UI", { exact: true })).not.toBeInTheDocument();
    expect(screen.getAllByText("Low stock", { exact: true })).toHaveLength(2);
    expect(screen.getByText("Out of stock", { exact: true })).toHaveClass("text-danger");
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Product name", "Remaining quantity", "Low-stock threshold", "Status",
    ]);
    expect(screen.getByRole("link", { name: "Back to Inventory" })).toHaveAttribute("href", "/admin/inventory/available-stock");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
