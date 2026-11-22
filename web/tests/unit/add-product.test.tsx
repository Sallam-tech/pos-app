import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AddProductPage from "@/app/admin/products/new/page";
import ProductsPage from "@/app/admin/products/page";
import { emptyProductPreview, parseProductMoneyPaise, validateProductPreview } from "@/lib/admin/product-preview";
import { getMockLowStockProducts, mockInventory } from "@/lib/admin/mock-inventory";
import { aggregateMockSales, getMockRevenuePaise, mockSales } from "@/lib/admin/mock-sales";
import { getMockSuggestedSellingPrice } from "@/lib/mock-suggested-prices";

const valid = {
  name: "Demo new product", category: "", purchaseCost: "1000.00",
  suggestedSellingPrice: "", initialQuantity: "50", lowStockThreshold: "5",
};
function fillRequired() {
  for (const [label, value] of [
    ["Product Name *", valid.name], ["Buying Price (Rs.) *", valid.purchaseCost],
    ["Stock Quantity *", valid.initialQuantity], ["Low Stock Alert *", valid.lowStockThreshold],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("Admin Add Product preview", () => {
  it.skip("offers Add Product navigation, existing SRS fields, optional identity and Cancel", () => {
    const { unmount } = render(<ProductsPage />);
    expect(screen.getByRole("link", { name: "Add Product" })).toHaveAttribute("href", "/admin/products/new");
    unmount();
    render(<AddProductPage />);
    expect(screen.getByRole("heading", { name: "Add Product", level: 1 })).toBeVisible();
    expect(screen.getByText("Demo Data")).toBeVisible();
    expect(screen.getAllByRole("textbox")).toHaveLength(7);
    expect(screen.getByLabelText("Buying Price (Rs.) *")).toBeRequired();
    expect(screen.getByLabelText("Selling Price (Rs.)")).not.toBeRequired();
    expect(screen.getByLabelText("Category")).not.toBeRequired();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/admin/products");
    expect(screen.getByText(/Demo only. No product or stock will be saved/)).toBeVisible();
    expect(screen.queryByLabelText(/SKU|barcode|unit$/i)).not.toBeInTheDocument();
  });

  it.skip("announces required errors and focuses the first invalid field", () => {
    render(<AddProductPage />);
    fireEvent.click(screen.getByRole("button", { name: "Save Product" }));
    expect(screen.getAllByRole("alert")).toHaveLength(4);
    expect(screen.getByLabelText("Product Name *")).toHaveFocus();
    expect(screen.getByLabelText("Product Name *")).toHaveAccessibleDescription("Enter a valid product name.");
    expect(screen.getByLabelText("Buying Price (Rs.) *")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.skip("confirms only a local demo with a blank suggestion and preserves inventory and all eight sales", () => {
    const inventory = JSON.stringify(mockInventory);
    const sales = JSON.stringify(mockSales);
    render(<AddProductPage />);
    fillRequired();
    expect(screen.getByLabelText("Selling Price (Rs.)")).toHaveValue("");
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Demo complete for Demo new product. No product or stock was saved.");
    expect(screen.getByRole("status")).toHaveTextContent("This entry is not available in POS.");
    expect(screen.getByLabelText("Buying Price (Rs.) *")).toHaveValue("1000.00");
    expect(screen.getByLabelText("Selling Price (Rs.)")).toHaveValue("");
    expect(JSON.stringify(mockInventory)).toBe(inventory);
    expect(JSON.stringify(mockSales)).toBe(sales);
    expect(mockInventory).toHaveLength(7);
    expect(mockInventory.reduce((sum, product) => sum + product.quantity, 0)).toBe(123);
    expect(getMockLowStockProducts()).toHaveLength(3);
    expect(mockSales).toHaveLength(8);
    expect(getMockRevenuePaise()).toBe(BigInt(2569000));
    expect(aggregateMockSales(mockSales).find((p) => p.productId === "diapers")?.revenuePaise).toBe(BigInt(749950));
  });

  it.skip.each(["purchaseCost", "suggestedSellingPrice"] as const)("rejects over-precise %s without rounding or confirmation", (field) => {
    render(<AddProductPage />);
    fillRequired();
    const input = screen.getByLabelText(field === "purchaseCost" ? "Buying Price (Rs.) *" : "Selling Price (Rs.)");
    fireEvent.change(input, { target: { value: "100.999" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("100.999");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a price with no more than 2 decimal places.")).toBeVisible();
    fireEvent.submit(screen.getByRole("form"));
    expect(input).toHaveFocus();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "100.99" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status")).toBeVisible();
    expect(input).toHaveValue("100.99");
  });

  it.skip("does not copy prices or publish draft suggestions and clears confirmation on editing", () => {
    render(<AddProductPage />);
    fillRequired();
    fireEvent.change(screen.getByLabelText("Selling Price (Rs.)"), { target: { value: "999.99" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status")).toBeVisible();
    expect(screen.getByLabelText("Buying Price (Rs.) *")).toHaveValue("1000.00");
    fireEvent.change(screen.getByLabelText("Product Name *"), { target: { value: "" } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(getMockSuggestedSellingPrice("diapers")).toBe("1250.00");
    expect(getMockSuggestedSellingPrice("mock-diapers")).toBe("1250.00");
    expect(getMockSuggestedSellingPrice("milk-powder")).toBeNull();
    expect(getMockSuggestedSellingPrice("mock-milk")).toBeNull();
  });
});

describe("exact product-preview validation", () => {
  it.each([
    ["0.01", "1"], ["100", "10000"], ["100.5", "10050"],
    ["100.50", "10050"], ["100.99", "10099"], ["1,250.25", "125025"],
    ["999999999999.99", "99999999999999"],
  ])("accepts positive PKR %s exactly and independently of cost", (value, paise) => {
    expect(parseProductMoneyPaise(value)).toBe(BigInt(paise));
    expect(validateProductPreview({ ...valid, suggestedSellingPrice: value })).toEqual({});
  });

  it.each(["-1", "-0.01", "100.999", "0.001", "100.000", "1.2.3", "NaN", "Infinity", "1e3", "1,20", "Rs. 10", "1000000000000"])(
    "rejects invalid suggested price %s without altering the draft", (value) => {
      const draft = { ...valid, suggestedSellingPrice: value };
      expect(validateProductPreview(draft).suggestedSellingPrice).toBeTruthy();
      expect(parseProductMoneyPaise(value)).toBeNull();
      expect(draft.suggestedSellingPrice).toBe(value);
    },
  );

  it("requires positive cost while preserving zero quantities and provisional precision", () => {
    expect(validateProductPreview(emptyProductPreview)).toMatchObject({
      name: "Enter a valid product name.", purchaseCost: "Enter a purchase cost in PKR.",
      initialQuantity: "Enter an initial quantity.", lowStockThreshold: "Enter a low-stock threshold.",
    });
    expect(validateProductPreview({ ...valid, purchaseCost: "-1" }).purchaseCost).toBeTruthy();
    expect(validateProductPreview({ ...valid, purchaseCost: "1000.00", suggestedSellingPrice: "", initialQuantity: "0", lowStockThreshold: "0" })).toEqual({});
    expect(validateProductPreview({ ...valid, initialQuantity: "0.125", lowStockThreshold: "1.5" })).toEqual({});
    for (const value of ["-1", "1e3", "0.0000001", "1000000000000"]) {
      expect(validateProductPreview({ ...valid, initialQuantity: value }).initialQuantity).toBeTruthy();
      expect(validateProductPreview({ ...valid, lowStockThreshold: value }).lowStockThreshold).toBeTruthy();
    }
    expect(validateProductPreview({ ...valid, name: "   " }).name).toBeTruthy();
  });
});

it.each(["0", "00", "000", "0.0", "0.00", " 000 "])("rejects zero-valued product prices %j but keeps zero quantities valid", (value) => {
  // Parsing is exact; the field policy, rather than rounding, rejects a zero price.
  expect(parseProductMoneyPaise(value)).toBe(BigInt(0));
  for (const mode of ["add", "edit"] as const) {
    expect(validateProductPreview({ ...valid, purchaseCost: value }, mode).purchaseCost).toBe("Enter a purchase cost greater than Rs. 0.00.");
    expect(validateProductPreview({ ...valid, suggestedSellingPrice: value }, mode).suggestedSellingPrice).toBe("Enter a suggested selling price greater than Rs. 0.00.");
  }
  expect(validateProductPreview({ ...valid, initialQuantity: value, lowStockThreshold: value })).toEqual({});
});

it.skip("blocks zero purchase cost in the form and clears its prior valid confirmation", () => {
  render(<AddProductPage />);
  fillRequired();
  fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByRole("status")).toBeVisible();
  const cost = screen.getByLabelText("Buying Price (Rs.) *");
  for (const value of ["000", "0.00", "-1", "abc"]) {
    fireEvent.change(cost, { target: { value } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole("form"));
    expect(cost).toHaveFocus();
    expect(cost).toHaveValue(value);
    expect(cost).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  }
  fireEvent.change(cost, { target: { value: "0.01" } });
  fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByRole("status")).toBeVisible();
});
