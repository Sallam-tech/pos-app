import { describe, expect, it } from "vitest";
import { createSaleSimulation, formatPreviewPKR, previewProducts, previewTotal, stepPreviewQuantity, validatePreview } from "@/lib/pos-preview";

describe("exact, presentation-only sale calculations", () => {
  it.each([
    ["2", "1,200.50", "2401.00"],
    ["0.1", "0.2", "0.02"],
    ["0.125", "0.1", "0.0125"],
    ["9007199254.74", "0.01", "90071992.5474"],
    ["999999999999", "999999999999", "999999999998000000000001.00"],
    [".5", "0002.00", "1.00"],
    ["1.000001", "0.01", "0.01000001"],
    ["2", "0", "0.00"],
  ])("multiplies %s by %s without binary rounding", (quantity, price, expected) => {
    expect(previewTotal(quantity, price)).toBe(expected);
    expect(formatPreviewPKR(expected)).toMatch(/^Rs\. /);
  });

  it.each([
    ["100", "200.00"],
    ["100.5", "201.00"],
    ["100.50", "201.00"],
    ["100.99", "201.98"],
    ["1250.25", "2500.50"],
  ])("accepts a two-decimal-or-less unit price %s", (price, total) => {
    expect(validatePreview(previewProducts[0], "2", price).price).toBeUndefined();
    expect(previewTotal("2", price)).toBe(total);
    expect(createSaleSimulation(previewProducts[0], "2", price)?.total).toBe(total);
  });

  it.each(["100.999", "0.001", "100.000", "1,250.250", "1.23456789"])(
    "rejects excess unit-price precision %s without creating a simulation",
    (price) => {
      expect(validatePreview(previewProducts[0], "2", price).price).toBe("Enter a price with no more than 2 decimal places.");
      expect(previewTotal("2", price)).toBeNull();
      expect(createSaleSimulation(previewProducts[0], "2", price)).toBeNull();
    },
  );

  it("formats large and sub-paisa results without losing digits", () => {
    expect(formatPreviewPKR("999999999998000000000001.00")).toBe("Rs. 999,999,999,998,000,000,000,001.00");
    expect(formatPreviewPKR("0.0125")).toBe("Rs. 0.0125");
  });

  it("rejects malformed, negative, nonfinite and over-limit input", () => {
    for (const invalid of ["", "-1", "NaN", "Infinity", "1e3", "1,20", "Rs. 10", "1.0000001", "1000000000000"]) {
      expect(previewTotal("1", invalid), invalid).toBeNull();
      expect(validatePreview(previewProducts[0], "1", invalid).price, invalid).toBeTruthy();
    }
    for (const invalid of ["0", "-2", "", "1,000", "1e3", "0.0000001"]) expect(previewTotal(invalid, "2")).toBeNull();
  });

  it("steps exact fractional quantities without imposing whole-unit policy", () => {
    expect(stepPreviewQuantity("1.25", 1)).toBe("2.25");
    expect(stepPreviewQuantity("1.25", -1)).toBe("0.25");
    expect(stepPreviewQuantity("0.25", -1)).toBeNull();
    expect(stepPreviewQuantity("", 1)).toBeNull();
    expect(stepPreviewQuantity("999999999999", 1)).toBeNull();
  });

  it("requires a known selection and returns a safe simulated snapshot", () => {
    expect(validatePreview(null, "", "")).toEqual({
      product: "Choose a product from the search results.",
      quantity: "Enter a quantity.",
      price: "Enter a selling price in PKR.",
    });
    expect(createSaleSimulation({ id: "other", name: "Diapers" }, "1", "10")).toBeNull();
    const result = createSaleSimulation(previewProducts[0], "02.50", "1,200.50");
    expect(result).toEqual({ kind: "simulation", product: { id: "mock-diapers", name: "Diapers" }, quantity: "2.5", unitPrice: "1200.50", total: "3001.25" });
    for (const product of previewProducts) expect(Object.keys(product)).toEqual(["id", "name"]);
  });
});
