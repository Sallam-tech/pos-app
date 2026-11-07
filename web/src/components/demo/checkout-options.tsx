"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { formatPreviewPKR } from "@/lib/pos-preview";
import type { CheckoutErrors, DemoCheckout } from "@/lib/demo/checkout";

export function CheckoutOptions({ discount, cash, onDiscount, onCash, errors, value, children }: {
  discount: string; cash: string; onDiscount: (value: string) => void; onCash: (value: string) => void;
  errors: CheckoutErrors; value: DemoCheckout | null; children?: ReactNode;
}) {
  return <section aria-labelledby="checkout-options-title" className="grid min-w-0 gap-4">
    <h3 id="checkout-options-title" className="sr-only">Discount & cash</h3>
    <Field id="sale-discount" label="Discount (%)" hint="Optional" error={errors.discount}>
      <Input id="sale-discount" inputMode="decimal" autoComplete="off" placeholder="No discount" maxLength={32}
        value={discount} aria-invalid={Boolean(errors.discount) || undefined}
        aria-describedby={"sale-discount-hint" + (errors.discount ? " sale-discount-error" : "")}
        onChange={(event) => onDiscount(event.target.value)} />
    </Field>
    {children}
    <Field id="sale-cash" label="Cash received (PKR, optional)" error={errors.cash}>
      <Input id="sale-cash" inputMode="decimal" autoComplete="off" placeholder="e.g. 2,500.00" maxLength={32}
        value={cash} aria-invalid={Boolean(errors.cash) || undefined} aria-describedby={errors.cash ? "sale-cash-error" : undefined}
        onChange={(event) => onCash(event.target.value)} />
    </Field>
    {value?.cashReceived !== null && value && <p className="rounded-md border border-input bg-surface px-3 py-3 text-sm font-semibold" role="status">
      {value.cashWarning ?? "Change to return: " + formatPreviewPKR(value.change!)}
    </p>}
  </section>;
}
