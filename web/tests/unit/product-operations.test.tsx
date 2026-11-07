import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import EditProductPage from "@/app/admin/products/[productId]/edit/page";
import { ProductOperationsPreview } from "@/components/admin/product-operations-preview";
import { stockCorrectionDifference, validateStockCorrection } from "@/lib/admin/product-operations-preview";
import { getMockLowStockProducts, mockInventory } from "@/lib/admin/mock-inventory";
import { aggregateMockSales, getMockRevenuePaise, mockSales } from "@/lib/admin/mock-sales";
import { getMockSuggestedSellingPrice } from "@/lib/mock-suggested-prices";
import { previewProducts } from "@/lib/pos-preview";

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
const dialogMethods = ["showModal", "close"] as const;
const originalDialogMethods = dialogMethods.map((name) => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterAll(() => dialogMethods.forEach((name, index) => {
  const original = originalDialogMethods[index];
  if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
}));
const wipes = mockInventory.find((product) => product.id === "baby-wipes")!;
async function openCorrection() {
  fireEvent.click(screen.getByText("Correct Stock (Demo)"));
  return screen.findByLabelText("Correct Quantity");
}

describe("exact stock correction previews", () => {
  it.each([
    ["20", "17", "-3"], ["20", "25", "+5"], ["20", "0", "-20"], ["20", "20", "0"],
    ["0.1", "0.3", "+0.2"], ["1.25", "0.125", "-1.125"],
    ["20", "20.000001", "+0.000001"],
    ["0", "999999999999.999999", "+999999999999.999999"],
  ])("calculates %s to %s as %s without binary rounding", (current, corrected, difference) => {
    expect(stockCorrectionDifference(current, corrected)).toBe(difference);
  });
  it.each(["", "  ", "-1", "abc", "NaN", "Infinity", "1e3", "0.0000001", "1000000000000", "0".repeat(33)])(
    "rejects invalid or oversized corrected quantity %j", (quantity) => {
      expect(validateStockCorrection(quantity, "Counted again").quantity).toBeTruthy();
      expect(stockCorrectionDifference("20", quantity)).toBeNull();
    },
  );
  it("requires an explanatory reason and permits zero with the existing provisional precision", () => {
    for (const reason of ["", "  ", "...", "000"]) expect(validateStockCorrection("17", reason).reason).toBeTruthy();
    for (const reason of ["3 damaged items", "Counted again", "دوبارہ گنتی"]) {
      expect(validateStockCorrection("0", reason)).toEqual({});
    }
    expect(stockCorrectionDifference("invalid", "17")).toBeNull();
  });
  it("starts collapsed, announces field errors and preserves invalid typed input", async () => {
    render(<ProductOperationsPreview product={wipes} />);
    expect(screen.queryByLabelText("Correct Quantity")).not.toBeInTheDocument();
    const quantity = await openCorrection();
    expect(screen.getByTestId("correction-current-quantity")).toHaveTextContent("20");
    fireEvent.click(screen.getByRole("button", { name: "Preview Correction" }));
    expect(quantity).toHaveFocus();
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a reason explaining the correction.")).toBeVisible();
    fireEvent.change(quantity, { target: { value: "17.0000001" } });
    fireEvent.change(screen.getByLabelText("Reason for Correction"), { target: { value: "3 damaged items" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview Correction" }));
    expect(quantity).toHaveValue("17.0000001");
    expect(screen.getByLabelText("Difference")).toHaveTextContent("—");
    expect(screen.queryByTestId("correction-confirmation")).not.toBeInTheDocument();
  });
  it("previews decreases, increases and zero, clears stale results and never changes current stock", async () => {
    const inventory = JSON.stringify(mockInventory);
    render(<ProductOperationsPreview product={wipes} />);
    const quantity = await openCorrection();
    const reason = screen.getByLabelText("Reason for Correction");
    fireEvent.change(reason, { target: { value: "3 damaged items" } });
    for (const [value, difference] of [["17", "-3"], ["25", "+5"], ["0", "-20"]]) {
      fireEvent.change(quantity, { target: { value } });
      expect(screen.queryByTestId("correction-confirmation")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Difference")).toHaveTextContent(difference);
      fireEvent.click(screen.getByRole("button", { name: "Preview Correction" }));
      expect(screen.getByTestId("correction-confirmation")).toHaveTextContent("Demo only — stock was not changed.");
      expect(screen.getByTestId("correction-current-quantity")).toHaveTextContent("20");
    }
    fireEvent.change(reason, { target: { value: "Counted again" } });
    expect(screen.queryByTestId("correction-confirmation")).not.toBeInTheDocument();
    fireEvent.change(quantity, { target: { value: "20.000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview Correction" }));
    expect(screen.getByText("No correction is needed. The quantity is unchanged.")).toBeVisible();
    expect(screen.queryByTestId("correction-confirmation")).not.toBeInTheDocument();
    expect(JSON.stringify(mockInventory)).toBe(inventory);
  });
});

describe("separate, non-persistent product status preview", () => {
  it("requires confirmation, supports cancel/focus restoration and demonstrates both directions without data changes", () => {
    const inventory = JSON.stringify(mockInventory);
    const sales = JSON.stringify(mockSales);
    const options = JSON.stringify(previewProducts);
    render(<ProductOperationsPreview product={wipes} />);
    expect(screen.getByText("Active (demo preview)")).toBeVisible();
    const stop = screen.getByRole("button", { name: "Stop Selling (Demo)" });
    stop.focus();
    fireEvent.click(stop);
    let dialog = screen.getByRole("dialog", { name: "Stop Selling (Demo)" });
    expect(within(dialog).getByRole("button", { name: "Close dialog" })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel status preview" }));
    expect(stop).toHaveFocus();
    expect(screen.getByText("Active (demo preview)")).toBeVisible();
    fireEvent.click(stop);
    dialog = screen.getByRole("dialog", { name: "Stop Selling (Demo)" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm Stop Selling (Demo)" }));
    expect(screen.getByText("Inactive (demo preview)")).toBeVisible();
    expect(screen.getByText(/the product is not actually deactivated/)).toBeVisible();
    expect(screen.getByText(/No status is saved or enforced in POS/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Resume Selling (Demo)" }));
    expect(screen.queryByText(/the product is not actually deactivated/)).not.toBeInTheDocument();
    dialog = screen.getByRole("dialog", { name: "Resume Selling (Demo)" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm Resume Selling (Demo)" }));
    expect(screen.getByText("Active (demo preview)")).toBeVisible();
    expect(screen.getByText(/the product is not actually reactivated/)).toBeVisible();
    expect(JSON.stringify(mockInventory)).toBe(inventory);
    expect(JSON.stringify(mockSales)).toBe(sales);
    expect(JSON.stringify(previewProducts)).toBe(options);
    expect(mockInventory).toHaveLength(7);
    expect(mockInventory.reduce((total, product) => total + product.quantity, 0)).toBe(123);
    expect(getMockLowStockProducts()).toHaveLength(3);
    expect(mockSales).toHaveLength(8);
    expect(getMockRevenuePaise()).toBe(BigInt(2569000));
    expect(aggregateMockSales(mockSales).find((product) => product.productId === "diapers")?.revenuePaise).toBe(BigInt(749950));
    expect(getMockSuggestedSellingPrice("diapers")).toBe("1250.00");
  });
  it("does not treat zero stock as inactive or add a persisted status to the fixture", async () => {
    const toothpaste = mockInventory.find((product) => product.id === "toothpaste")!;
    render(<ProductOperationsPreview product={toothpaste} />);
    expect(screen.getByText("Active (demo preview)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop Selling (Demo)" })).toBeEnabled();
    await openCorrection();
    expect(screen.getByTestId("correction-current-quantity")).toHaveTextContent("0");
    expect(toothpaste).not.toHaveProperty("active");
    expect(toothpaste).not.toHaveProperty("status");
  });
  it("keeps Save Changes separate from stock/status preview actions", async () => {
    render(await EditProductPage({ params: Promise.resolve({ productId: wipes.id }) }));
    const quantity = await openCorrection();
    fireEvent.change(quantity, { target: { value: "17" } });
    fireEvent.change(screen.getByLabelText("Reason for Correction"), { target: { value: "3 damaged items" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(screen.getByText(/Demo only — changes were not saved/)).toBeVisible();
    expect(screen.queryByTestId("correction-confirmation")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Active (demo preview)")).toBeVisible();
    expect(screen.getByTestId("correction-current-quantity")).toHaveTextContent("20");
  });
});
