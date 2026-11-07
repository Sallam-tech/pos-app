/** Additive checkout preview; existing sale arithmetic and fixtures remain untouched. */
import { demoMoneyDecimal, parseDemoMoney } from "@/lib/demo/money";

export type CheckoutErrors = Partial<Record<"discount" | "cash", string>>;
export type DemoCheckout = {
  subtotal: string; discountPercent: string; discountAmount: string; total: string;
  cashReceived: string | null; change: string | null; cashWarning: string | null;
};
export function calculateDemoCheckout(subtotal: string | null, discount = "", cash = ""): {
  value: DemoCheckout | null; errors: CheckoutErrors;
} {
  const errors: CheckoutErrors = {};
  const raw = discount.trim();
  let basis = BigInt(0);
  if (raw) {
    if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw) || raw.length > 8) {
      errors.discount = "Enter a discount from 0 to 100 with no more than 2 decimal places.";
    } else {
      const [whole = "", fraction = ""] = raw.split(".");
      basis = BigInt(whole || "0") * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
      if (basis > BigInt(10000)) errors.discount = "Enter a discount from 0 to 100.";
    }
  }
  const cashPaise = cash.trim() ? parseDemoMoney(cash) : null;
  if (cash.trim() && cashPaise === null) errors.cash = "Enter a non-negative cash amount with no more than 2 decimal places.";
  if (subtotal === null || !/^\d+\.\d{2,8}$/.test(subtotal)) return { value: null, errors };
  let discountAmount = "0.00", total = subtotal;
  // Without a discount preserve every existing exact total, including illustrative sub-paisa quantities.
  if (!errors.discount && basis !== BigInt(0)) {
    const subtotalPaise = /^\d+\.\d{2}$/.test(subtotal)
      ? BigInt(subtotal.replace(".", "")) : null;
    if (subtotalPaise === null || subtotalPaise * basis % BigInt(10000) !== BigInt(0)) {
      errors.discount = "This discount needs fractions of a paisa. Change the discount or amount; this demo never rounds.";
    } else {
      const deduction = subtotalPaise * basis / BigInt(10000);
      discountAmount = demoMoneyDecimal(deduction);
      total = demoMoneyDecimal(subtotalPaise - deduction);
    }
  }
  let change: string | null = null, cashWarning: string | null = null;
  if (cashPaise !== null && !errors.discount) {
    if (!/^\d+\.\d{2}$/.test(total)) errors.cash = "Cash preview requires a total with no fractions of a paisa.";
    else {
      const due = BigInt(total.replace(".", ""));
      if (cashPaise < due) cashWarning = "Cash received is less than the amount due. No payment has been processed.";
      else change = demoMoneyDecimal(cashPaise - due);
    }
  }
  if (Object.keys(errors).length) return { value: null, errors };
  return { errors, value: {
    subtotal, discountPercent: demoMoneyDecimal(basis).replace(/\.?0+$/, "") || "0",
    discountAmount, total, cashReceived: cashPaise === null ? null : demoMoneyDecimal(cashPaise), change, cashWarning,
  } };
}
