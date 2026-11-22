import { describe, expect, it } from "vitest";
import { nextProductCode, productCodePrefix } from "@/server/inventory/product-code";

describe("readable product codes", () => {
  it("takes the first three letters of the name", () => {
    expect(productCodePrefix("Diapers")).toBe("DIA");
    expect(productCodePrefix("Milk Powder 400g")).toBe("MIL");
    expect(productCodePrefix("7UP")).toBe("UPX");
    expect(productCodePrefix("123")).toBe("PRD");
  });
  it("numbers codes per prefix and never reuses one", () => {
    expect(nextProductCode("DIA", [])).toBe("DIA-001");
    expect(nextProductCode("DIA", ["DIA-001", "DIA-007", "DIAX-900", "MIL-050"])).toBe("DIA-008");
    expect(nextProductCode("DIA", ["DIA-999"])).toBe("DIA-1000");
  });
  it("always fits the product code rule", () => {
    expect(nextProductCode(productCodePrefix("Shampoo"), [])).toMatch(/^[A-Z0-9][A-Z0-9_-]{0,31}$/);
  });
});
