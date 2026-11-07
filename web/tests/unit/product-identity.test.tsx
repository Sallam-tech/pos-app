import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AddProductPreview } from "@/components/admin/add-product-preview";
import { ProductListPreview } from "@/components/admin/product-list-preview";
import { mockInventory } from "@/lib/admin/mock-inventory";
import { validateProductPreview } from "@/lib/admin/product-preview";
import { matchesProductIdentity, productUnitDisplay, suggestProductCode, validateProductCode } from "@/lib/product-identity-preview";
const variants = [
  { ...mockInventory[0], id: "test-dairy", name: "Milk", productCode: "POS-0001", category: "Dairy", unitLabel: "Liter (L)" },
  { ...mockInventory[1], id: "test-powder", name: "Milk", productCode: "pos-0002", category: "Powder", unitLabel: "Pack" },
];
function fillValidAdd() {
  for (const [label, value] of [["Product Name *", "Demo Milk"], ["Buying Price (Rs.) *", "100"], ["Stock Quantity *", "2"], ["Low Stock Alert *", "1"]]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}
describe("optional product identity previews", () => {
  it("suggests the next unused readable code independently of names and detects case-insensitive conflicts", () => {
    expect(suggestProductCode(variants)).toBe("POS-0003");
    expect(validateProductCode("", variants)).toBeUndefined();
    expect(validateProductCode("  ", variants)).toBeUndefined();
    expect(validateProductCode(" pos-0001 ", variants)).toMatch(/already used/);
    expect(validateProductCode("POS-0001", variants, "test-dairy")).toBeUndefined();
    for (const code of ["bad code", "-bad", "bad<script>", "x".repeat(33)]) expect(validateProductCode(code, variants)).toBeTruthy();
    expect(validateProductCode("NEW_4.2", variants)).toBeUndefined();
    expect(productUnitDisplay(mockInventory[0])).toBe("Piece (display fallback)");
  });
  it("accepts blank code, free category and optional unit without altering the original validation or catalog", () => {
    const original = JSON.stringify(mockInventory);
    render(<AddProductPreview catalog={variants} />);
    expect(screen.getByLabelText("Product Code (Optional)")).toHaveValue("POS-0003");
    fillValidAdd();
    fireEvent.change(screen.getByLabelText("Product Code (Optional)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Owner custom category" } });
    fireEvent.change(screen.getByLabelText("Unit (Optional)"), { target: { value: "Kilogram (kg)" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status")).toHaveTextContent("Product code: Not set; Category: Owner custom category; Unit: Kilogram (kg)");
    expect(JSON.stringify(mockInventory)).toBe(original);
  });
  it("blocks conflicting or invalid codes and focuses the field; leaves suggested codes editable and cleared", () => {
    render(<AddProductPreview catalog={variants} />);
    fillValidAdd();
    const code = screen.getByLabelText("Product Code (Optional)");
    fireEvent.change(code, { target: { value: "pos-0002" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(code).toHaveFocus(); expect(code).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.change(code, { target: { value: "new-safe-code" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status")).toHaveTextContent("new-safe-code");
    fireEvent.change(code, { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Product Name *"), { target: { value: "Another name" } });
    expect(code).toHaveValue("");
  });
  it("preserves an edited product's ID, category and unit, and never merges same-name variants", () => {
    render(<AddProductPreview product={variants[0]} catalog={variants} />);
    expect(screen.getByLabelText("Category")).toHaveValue("Dairy");
    expect(screen.getByLabelText("Unit (Optional)")).toHaveValue("Liter (L)");
    fireEvent.change(screen.getByLabelText("Product Code (Optional)"), { target: { value: "NEW-MILK" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByRole("status")).toHaveTextContent("Internal ID: test-dairy (unchanged)");
    expect(variants[0].id).toBe("test-dairy");
    // The current validator has no duplicate-name rejection. Identity fields do not replace that policy.
    expect(validateProductPreview({ name: "Milk", category: "Dairy", purchaseCost: "100", suggestedSellingPrice: "", initialQuantity: "1", lowStockThreshold: "0" })).toEqual({});
  });
  it("searches name or code and displays each stable-ID variant with category and unit", () => {
    render(<ProductListPreview products={variants} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    for (const summary of screen.getAllByText("Details", { exact: true })) fireEvent.click(summary);
    expect(within(screen.getByRole("region", { name: "Product list" })).getByText("Dairy")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Product list" })).getByText("Powder")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Find product by name or code"), { target: { value: "POS-0002" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Product list" })).toHaveTextContent("Pack");
    expect(matchesProductIdentity(variants[0], "milk")).toBe(true);
    expect(matchesProductIdentity(variants[0], "pos-0001")).toBe(true);
  });
});
