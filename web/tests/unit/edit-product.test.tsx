import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { notFound } from "next/navigation";
import AddProductPage from "@/app/admin/products/new/page";
import EditProductPage, { generateStaticParams } from "@/app/admin/products/[productId]/edit/page";
import ProductNotFound from "@/app/admin/products/[productId]/edit/not-found";
import ProductsPage from "@/app/admin/products/page";
import * as validation from "@/lib/admin/product-preview";
import { getMockLowStockProducts, mockInventory } from "@/lib/admin/mock-inventory";
import { aggregateMockSales, getMockRevenuePaise, mockSales } from "@/lib/admin/mock-sales";
import { getMockSuggestedSellingPrice } from "@/lib/mock-suggested-prices";

vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("mock-product-not-found"); }) }));
const valid = {
  name: "Demo product", category: "", purchaseCost: "1000.00",
  suggestedSellingPrice: "", initialQuantity: "50", lowStockThreshold: "5",
};
function fillAdd() {
  for (const [label, value] of [
    ["Product Name *", valid.name], ["Buying Price (Rs.) *", valid.purchaseCost],
    ["Stock Quantity *", valid.initialQuantity], ["Low Stock Alert *", valid.lowStockThreshold],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
async function renderEdit(id = "diapers") {
  return render(await EditProductPage({ params: Promise.resolve({ productId: id }) }));
}

describe("product names and latest-only demo confirmations", () => {
  it.each(["", "  ", "0", "000", " 000 "])("rejects invalid name %j without confirming", (name) => {
    expect(validation.validateProductPreview({ ...valid, name }).name).toBe("Enter a valid product name.");
    render(<AddProductPage />);
    fillAdd();
    fireEvent.change(screen.getByLabelText("Product Name *"), { target: { value: name } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it.each(["7UP", "3M Tape", "Water Bottle 500ml", "Soap (2-pack) / 100g", "123"])("keeps legitimate product name %s intact", (name) => {
    expect(validation.validateProductPreview({ ...valid, name })).toEqual({});
    render(<AddProductPage />);
    fillAdd();
    fireEvent.change(screen.getByLabelText("Product Name *"), { target: { value: "  " + name + "  " } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status").querySelector("strong")?.textContent).toBe(name);
  });
  it.each([
    ["Product Name *", "0"], ["Category", "Drinks"], ["Buying Price (Rs.) *", "-1"],
    ["Selling Price (Rs.)", "0.001"], ["Stock Quantity *", "abc"], ["Low Stock Alert *", "-1"],
  ])("immediately clears Add confirmation when %s changes", (label, value) => {
    render(<AddProductPage />);
    fillAdd();
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status")).toBeVisible();
    const input = screen.getByLabelText(label);
    fireEvent.change(input, { target: { value } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(input).toHaveValue(value);
  });
  it("clears a prior confirmation even when validation rejects a new submission without an input event", () => {
    render(<AddProductPage />);
    fillAdd();
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status")).toBeVisible();
    const validator = vi.spyOn(validation, "validateProductPreview").mockReturnValueOnce({ name: "Enter a valid product name." });
    try {
      fireEvent.submit(screen.getByRole("form"));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Product Name *")).toHaveFocus();
      expect(screen.getByLabelText("Product Name *")).toHaveValue(valid.name);
    } finally { validator.mockRestore(); }
  });
});

describe("safe stable-ID Edit Product preview", () => {
  it("links every product to its own ID instead of matching display names", () => {
    render(<ProductsPage />);
    const table = screen.getByRole("region", { name: "Product list" });
    for (const product of mockInventory) {
      expect(within(table).getByRole("link", { name: "Edit " + product.name })).toHaveAttribute("href", "/admin/products/" + product.id + "/edit");
    }
    expect(generateStaticParams()).toEqual(mockInventory.map(({ id }) => ({ productId: id })));
  });
  it.each(mockInventory)("prefills $name while keeping quantity and absent purchase cost read-only", async (product) => {
    await renderEdit(product.id);
    expect(screen.getByLabelText("Product Name *")).toHaveValue(product.name);
    expect(screen.getByLabelText("Category")).toHaveValue("");
    expect(screen.getByLabelText("Selling Price (Rs.)")).toHaveValue(getMockSuggestedSellingPrice(product.id) ?? "");
    expect(screen.getByLabelText("Low Stock Alert *")).toHaveValue(String(product.lowStockThreshold));
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
    expect(screen.getByLabelText("Buying Price (Rs.)")).toHaveValue("");
    expect(screen.getByLabelText("Buying Price (Rs.)")).not.toBeRequired();
    expect(screen.getByText("Stock Quantity (read-only)").nextElementSibling).toHaveTextContent(String(product.quantity));
    expect(screen.getByText(/Current buying price not available in demo data/)).toBeVisible();
    expect(screen.queryByLabelText("Buying Price (Rs.) *")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Stock Quantity *")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/admin/products");
  });
  it("handles unknown IDs without falling back to another product", async () => {
    await expect(EditProductPage({ params: Promise.resolve({ productId: "not-a-product" }) })).rejects.toThrow("mock-product-not-found");
    expect(notFound).toHaveBeenCalled();
    render(<ProductNotFound />);
    expect(screen.getByRole("heading", { name: "Product not found" })).toBeVisible();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Products" })).toHaveAttribute("href", "/admin/products");
  });
  it("validates metadata without requiring or writing cost/quantity and leaves every financial invariant intact", async () => {
    const inventory = JSON.stringify(mockInventory);
    const sales = JSON.stringify(mockSales);
    await renderEdit();
    const name = screen.getByLabelText("Product Name *");
    fireEvent.change(name, { target: { value: "000" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(name).toHaveFocus();
    expect(screen.getByText("Enter a valid product name.")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.change(name, { target: { value: "Diapers - Demo" } });
    const suggestion = screen.getByLabelText("Selling Price (Rs.)");
    for (const value of ["-1", "abc", "100.999"]) {
      fireEvent.change(suggestion, { target: { value } });
      fireEvent.submit(screen.getByRole("form"));
      expect(suggestion).toHaveValue(value);
      expect(suggestion).toHaveAttribute("aria-invalid", "true");
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
    fireEvent.change(suggestion, { target: { value: "0.01" } });
    fireEvent.change(screen.getByLabelText("Low Stock Alert *"), { target: { value: "0" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Demo only — changes were not saved.");
    expect(JSON.stringify(mockInventory)).toBe(inventory);
    expect(JSON.stringify(mockSales)).toBe(sales);
    expect(getMockSuggestedSellingPrice("diapers")).toBe("1250.00");
    expect(mockInventory).toHaveLength(7);
    expect(mockInventory.reduce((sum, product) => sum + product.quantity, 0)).toBe(123);
    expect(getMockLowStockProducts()).toHaveLength(3);
    expect(mockSales).toHaveLength(8);
    expect(getMockRevenuePaise()).toBe(BigInt(2569000));
    expect(aggregateMockSales(mockSales).find((p) => p.productId === "diapers")?.revenuePaise).toBe(BigInt(749950));
  });
  it.each([
    ["Product Name *", "0"], ["Category", "Demo"], ["Selling Price (Rs.)", ""], ["Low Stock Alert *", "-1"],
    ["Buying Price (Rs.)", "000"],
  ])("clears Edit confirmation immediately when %s changes", async (label, value) => {
    await renderEdit();
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status")).toBeVisible();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("demo-only purchase-cost proposal", () => {
  it.each(["0", "00", "000", "0.0", "0.00", "-1", "abc", "100.999"])("rejects proposed cost %s without rounding, saving or changing current cost", async (value) => {
    await renderEdit();
    const proposal = screen.getByLabelText("Buying Price (Rs.)");
    fireEvent.change(proposal, { target: { value } });
    fireEvent.submit(screen.getByRole("form"));
    expect(proposal).toHaveFocus();
    expect(proposal).toHaveValue(value);
    expect(proposal).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(/Current buying price not available in demo data/)).toBeVisible();
    if (["0", "00", "000", "0.0", "0.00"].includes(value)) {
      expect(screen.getByText("Enter a buying price greater than Rs. 0.00.")).toBeVisible();
    }
  });

  it("previews a positive proposed cost while preserving all current stock, suggestions and historical sales", async () => {
    const inventory = JSON.stringify(mockInventory);
    const sales = JSON.stringify(mockSales);
    await renderEdit();
    const proposal = screen.getByLabelText("Buying Price (Rs.)");
    expect(proposal).toHaveValue("");
    fireEvent.change(proposal, { target: { value: "1100.50" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Demo only — buying price was not updated.");
    expect(screen.getByRole("status")).toHaveTextContent("No product changes were saved");
    expect(screen.getByText(/Current buying price not available in demo data/)).toBeVisible();
    expect(screen.getByText("Stock Quantity (read-only)").nextElementSibling).toHaveTextContent("5");
    expect(JSON.stringify(mockInventory)).toBe(inventory);
    expect(JSON.stringify(mockSales)).toBe(sales);
    expect(getMockSuggestedSellingPrice("diapers")).toBe("1250.00");
    expect(getMockRevenuePaise()).toBe(BigInt(2569000));
    fireEvent.change(proposal, { target: { value: "000" } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(proposal).toHaveValue("000");
  });
});
