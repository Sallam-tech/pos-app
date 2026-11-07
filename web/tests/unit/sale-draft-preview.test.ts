import { expect, it } from "vitest";
import { draftSubtotal } from "@/lib/sale-draft-preview";
import { previewProducts } from "@/lib/pos-preview";
const line = (quantity: string, price: string) => ({ product: previewProducts[0], quantity, price });
it("sums lines exactly without merging different prices", () => {
  expect(draftSubtotal([line("2", "1250.25"), line("1", "1500")])).toBe("4000.50");
  expect(draftSubtotal([line("1", "0.10"), line("1", "0.20")])).toBe("0.30"); expect(draftSubtotal([])).toBe("0.00");
});
it("keeps sub-paisa precision and large amounts", () => {
  expect(draftSubtotal([line("0.125", "0.10"), line("1", "0.10")])).toBe("0.1125");
  expect(draftSubtotal([line("999999999999", "999999999999"), line("1", "0.01")])).toBe("999999999998000000000001.01");
});
it.each([line("0", "100"), line("1", "100.999"), line("1", "0.001"), line("NaN", "1")])("rejects an invalid line without omitting or rounding it", (item) => {
  expect(draftSubtotal([line("1", "100"), item])).toBeNull();
});
