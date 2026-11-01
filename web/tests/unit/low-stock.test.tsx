import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardPage from "@/app/admin/dashboard/page";
import LowStockPage from "@/app/admin/inventory/low-stock/page";
import { getMockLowStockProducts, mockInventory, type MockInventoryProduct } from "@/lib/admin/mock-inventory";

describe("mock low-stock filtering", () => {
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
  it("links only the low-stock summary card to the canonical route", () => {
    render(<DashboardPage />);
    const overview = screen.getByRole("region", { name: "Shop overview" });
    const card = within(overview).getByRole("group", { name: "Low Stock Products" });
    const link = within(card).getByRole("link", { name: "Low Stock Products" });
    expect(within(overview).getAllByRole("link")).toEqual([link]);
    expect(link).toHaveAttribute("href", "/admin/inventory/low-stock");
    expect(link).toHaveAccessibleDescription(/Mock data only/);
    expect(link).not.toHaveAttribute("tabindex", "-1");
    expect(within(link).getByText("View list")).toBeVisible();
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
        String(product.quantity), String(product.lowStockThreshold), "Low stock",
      ]);
    }
    for (const product of mockInventory.filter((product) => product.quantity > product.lowStockThreshold)) {
      expect(within(table).queryByRole("rowheader", { name: product.name })).not.toBeInTheDocument();
    }
  });

  it("labels mock data and all columns, with a canonical dashboard return link and no inventory controls", () => {
    render(<LowStockPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Low Stock Products" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Low-stock list (2)" })).toHaveAccessibleDescription(/Mock data only/);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Product name", "Remaining quantity", "Low-stock threshold", "Status",
    ]);
    expect(screen.getByRole("link", { name: "Back to Admin Dashboard" })).toHaveAttribute("href", "/admin/dashboard");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
