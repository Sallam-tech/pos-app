import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardPage from "@/app/admin/dashboard/page";
import AvailableStockPage from "@/app/admin/inventory/available-stock/page";
import { getMockLowStockProducts, getMockStockStatus, mockInventory } from "@/lib/admin/mock-inventory";

function expectOverallTotals() {
  const totals = screen.getByLabelText("Overall inventory totals");
  expect(within(totals).getByText("Total Stock Units").nextElementSibling).toHaveTextContent("123");
  expect(within(totals).getByText("Total Products").nextElementSibling).toHaveTextContent("7");
}

describe("Available Stock read-only drilldown", () => {
  it("links the dashboard card to the canonical route without changing other card destinations or totals", () => {
    render(<DashboardPage />);
    const overview = screen.getByRole("region", { name: "Shop overview" });
    const stock = within(overview).getByRole("group", { name: "Available Stock" });
    const link = within(stock).getByRole("link", { name: "Available Stock" });
    expect(link).toHaveAttribute("href", "/admin/inventory/available-stock");
    expect(link).toHaveAccessibleDescription(/123 Mock data only/);
    expect(link).not.toHaveAttribute("tabindex", "-1");
    expect(within(overview).getAllByRole("link").map((item) => item.getAttribute("href"))).toEqual([
      "/admin/products", "/admin/inventory/available-stock", "/admin/inventory/low-stock",
    ]);
    expect(within(stock).getByText("123")).toHaveAttribute("value", "123");
    expect(getMockLowStockProducts()).toHaveLength(3);
  });

  it("shows totals and every configured quantity, threshold and status from the unchanged fixture", () => {
    render(<AvailableStockPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Available Stock" })).toBeVisible();
    expect(screen.getByText("Demo Data", { exact: true })).toBeVisible();
    expect(screen.getByRole("region", { name: "Inventory breakdown" })).toHaveAccessibleDescription(/Mock data only. Read-only/);
    expectOverallTotals();
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Product name", "Available quantity", "Low-stock threshold", "Stock status",
    ]);
    const table = screen.getByRole("table", { name: "Mock available-stock inventory" });
    for (const product of mockInventory) {
      const row = within(table).getByRole("rowheader", { name: product.name }).closest("tr")!;
      expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
        String(product.quantity), String(product.lowStockThreshold), getMockStockStatus(product),
      ]);
    }
    expect(screen.getAllByRole("rowheader")).toHaveLength(7);
    expect(screen.getByRole("link", { name: "Back to Admin Dashboard" })).toHaveAttribute("href", "/admin/dashboard");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/Add product|Edit product|Delete product|Receive stock|Adjust stock/i)).not.toBeInTheDocument();
  });

  it("keeps each summary label and value together in its own metric container", () => {
    render(<AvailableStockPage />);
    const totals = screen.getByLabelText("Overall inventory totals");
    expect(totals.children).toHaveLength(2);
    const stockBlock = within(totals).getByText("Total Stock Units").parentElement!;
    const productsBlock = within(totals).getByText("Total Products").parentElement!;
    expect(stockBlock).not.toBe(productsBlock);
    expect(within(stockBlock).getByText("123")).toBeVisible();
    expect(within(stockBlock).queryByText("Total Products")).not.toBeInTheDocument();
    expect(within(productsBlock).getByText("7", { exact: true })).toBeVisible();
  });

  it.each([
    ["all", ["Diapers", "Milk Powder", "Baby Wipes", "Hand Soap", "Rice", "Shampoo", "Toothpaste"]],
    ["Available", ["Baby Wipes", "Hand Soap", "Rice", "Shampoo"]],
    ["Low stock", ["Diapers", "Milk Powder"]],
    ["Out of stock", ["Toothpaste"]],
  ])("filters %s with overall totals separate from results", (status, names) => {
    render(<AvailableStockPage />);
    fireEvent.change(screen.getByRole("combobox", { name: "Stock status" }), { target: { value: status } });
    expect(screen.getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(names);
    expect(screen.getByRole("status")).toHaveTextContent("Showing " + names.length + " of 7 mock products.");
    expectOverallTotals();
    if (status === "Out of stock") {
      expect(within(screen.getByRole("table")).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["0", "5", "Out of stock"]);
    }
  });

  it("combines trimmed case-insensitive name search with status and handles no matches and reset", () => {
    render(<AvailableStockPage />);
    const search = screen.getByRole("searchbox", { name: "Search by product name" });
    const status = screen.getByRole("combobox", { name: "Stock status" });
    fireEvent.change(search, { target: { value: "  MILK  " } });
    fireEvent.change(status, { target: { value: "Low stock" } });
    expect(screen.getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["Milk Powder"]);
    fireEvent.change(status, { target: { value: "Available" } });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No mock products match your search and stock status.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 0 of 7 mock products.");
    expectOverallTotals();
    fireEvent.change(search, { target: { value: "   " } });
    fireEvent.change(status, { target: { value: "all" } });
    expect(screen.getAllByRole("rowheader")).toHaveLength(7);
    fireEvent.change(search, { target: { value: "123" } });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expectOverallTotals();
  });
});
