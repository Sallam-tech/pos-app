import { describe, expect, it } from "vitest";
import { calculateDemoCheckout } from "@/lib/demo/checkout";
import { formatDemoMoney, parseDemoMoney } from "@/lib/demo/money";
import { previewTotal } from "@/lib/pos-preview";

describe("isolated exact checkout demo", () => {
  it.each(["", "0", "0.00"])("keeps all no-discount cases unchanged (%s)", (discount) => {
    for (const [q, p] of [["2", "1250.25"], ["0.125", "0.10"], ["999999999999", "999999999999"]]) {
      const subtotal = previewTotal(q, p);
      expect(calculateDemoCheckout(subtotal, discount).value?.total).toBe(subtotal);
    }
  });
  it("reconciles subtotal, discount, total and cash using integer paise", () => {
    expect(calculateDemoCheckout("2400.00", "10", "2500").value).toEqual({
      subtotal: "2400.00", discountPercent: "10", discountAmount: "240.00", total: "2160.00",
      cashReceived: "2500.00", change: "340.00", cashWarning: null,
    });
  });
  it.each([["0", "2400.00"], ["100", "0.00"], ["12.50", "2100.00"], ["0.01", "2399.76"]])("calculates exact %s percent", (percent, total) => {
    expect(calculateDemoCheckout("2400.00", percent).value?.total).toBe(total);
  });
  it.each(["-1", "100.01", "101", "0.001", "10.000", "NaN", "1e1", "ten", "1,0"])("rejects unsupported percentage %s", (percent) => {
    const result = calculateDemoCheckout("2400.00", percent);
    expect(result.value).toBeNull();
    expect(result.errors.discount).toBeTruthy();
  });
  it("never rounds a fraction of a paisa or changes the existing sub-paisa preview", () => {
    expect(calculateDemoCheckout("0.01", "1").errors.discount).toMatch(/never rounds/);
    expect(calculateDemoCheckout("0.0125", "10").value).toBeNull();
    expect(calculateDemoCheckout("0.0125", "", "1").errors.cash).toMatch(/fractions of a paisa/);
    expect(calculateDemoCheckout("0.0125").value?.total).toBe("0.0125");
  });
  it("warns about insufficient cash without claiming a payment", () => {
    const value = calculateDemoCheckout("2400.00", "10", "2000").value!;
    expect(value.cashWarning).toMatch(/less than the amount due/);
    expect(value.change).toBeNull();
    expect(calculateDemoCheckout("2400.00", "10", "2160").value?.change).toBe("0.00");
  });
  it.each(["-1", "1.001", "NaN", "1e3", "1,20"])("rejects invalid cash %s", (cash) => {
    expect(calculateDemoCheckout("2400.00", "", cash).errors.cash).toBeTruthy();
  });
  it("does not produce a preview when sale input is invalid", () => {
    expect(calculateDemoCheckout(previewTotal("2", "100.999"), "10").value).toBeNull();
  });
});
describe("temporary Admin money", () => {
  it.each([["0", BigInt(0)], ["100.5", BigInt(10050)], ["1,250.00", BigInt(125000)], [".01", BigInt(1)], ["999999999999.99", BigInt(99999999999999)]])("parses %s exactly", (value, expected) => {
    expect(parseDemoMoney(value)).toBe(expected);
  });
  it.each(["", "-1", "0.001", "1000000000000", "1,20", "1e3", "Infinity"])("rejects %s without rounding", (value) => expect(parseDemoMoney(value)).toBeNull());
  it("formats BigInt exactly", () => expect(formatDemoMoney(BigInt(250050))).toBe("Rs. 2,500.50"));
});
