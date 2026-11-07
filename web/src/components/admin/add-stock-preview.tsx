"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MockInventoryProduct } from "@/lib/admin/mock-inventory";
import { parseProductMoneyPaise } from "@/lib/admin/product-preview";
import { quantityCostPaise, validateStockPurchase, type StockPurchaseErrors, type StockPurchaseValues } from "@/lib/admin/stock-investment-preview";
import { formatDemoMoney } from "@/lib/demo/money";
import { getMockSuggestedSellingPrice } from "@/lib/mock-suggested-prices";
import type { ProductIdentity } from "@/lib/product-identity-preview";

const fields = [
  { name: "quantity", label: "Quantity Bought", hint: "Required. Up to 6 decimal places in this preview." },
  { name: "buyingPrice", label: "Buying Price per Unit (Rs.)", hint: "Required. For this proposed purchase only; existing stock is not repriced." },
  { name: "sellingPrice", label: "Selling Price per Unit (Rs.)", hint: "Optional proposal. No selling price will be changed." },
] as const;

export function AddStockPreview({ product, onClose, onPreview }: {
  product: MockInventoryProduct & ProductIdentity;
  onClose: () => void;
  onPreview: (message: string) => void;
}) {
  const [values, setValues] = useState<StockPurchaseValues>(() => ({
    quantity: "", buyingPrice: "", sellingPrice: getMockSuggestedSellingPrice(product.id) ?? "",
  }));
  const [errors, setErrors] = useState<StockPurchaseErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const attempted = useRef(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    attempted.current = true;
    const next = validateStockPurchase(values);
    setErrors(next);
    const first = fields.find((field) => next[field.name]);
    if (first) { (formRef.current?.elements.namedItem(first.name) as HTMLInputElement | null)?.focus(); return; }
    const amount = quantityCostPaise(values.quantity, parseProductMoneyPaise(values.buyingPrice));
    if (amount === null) return;
    // Unsaved proposal only: no requests, storage or fixture mutations.
    onPreview("Demo only — proposed purchase of " + values.quantity.trim() + " " + (product.unitLabel || "units") +
      " of " + product.name + " for " + formatDemoMoney(amount) +
      ". No stock, prices or investment were saved or changed.");
  }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}
    title={"Add Stock — " + product.name}
    description="Unsaved demo stock purchase. Nothing is recorded or added to inventory.">
    <dl className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Current Stock:</dt>
      <dd className="numeric font-semibold">{product.quantity} {product.unitLabel || "units"}</dd>
    </dl>
    <form ref={formRef} noValidate aria-label="Add stock purchase preview" onSubmit={submit} className="grid min-w-0 gap-4">
      {fields.map((field) => {
        const id = "stock-purchase-" + field.name;
        const required = field.name !== "sellingPrice";
        return <Field key={field.name} id={id} label={field.label} hint={field.hint} error={errors[field.name]}>
          <Input id={id} name={field.name} value={values[field.name]} inputMode="decimal" autoComplete="off" required={required}
            aria-required={required || undefined} aria-invalid={Boolean(errors[field.name]) || undefined}
            aria-describedby={id + "-hint" + (errors[field.name] ? " " + id + "-error" : "")}
            className="numeric" onChange={(event) => {
              const next = { ...values, [field.name]: event.target.value };
              setValues(next);
              if (attempted.current) setErrors(validateStockPurchase(next));
            }} />
        </Field>;
      })}
      <div className="mt-1 flex flex-wrap justify-between gap-3 border-t pt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">Add Stock</Button>
      </div>
    </form>
  </Dialog>;
}
