"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MockInventoryProduct } from "@/lib/admin/mock-inventory";
import { getMockSuggestedSellingPrice } from "@/lib/mock-suggested-prices";
import {
  emptyProductPreview, productPreviewFields, validateProductPreview,
  type ProductPreviewErrors, type ProductPreviewField,
} from "@/lib/admin/product-preview";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const fields: { name: ProductPreviewField; label: string; optional?: boolean; hint?: string; numeric?: boolean }[] = [
  { name: "name", label: "Product name" },
  { name: "category", label: "Category", optional: true },
  { name: "purchaseCost", label: "Purchase Cost (Rs.)", numeric: true, hint: "Admin cost information. Separate from the selling price." },
  { name: "suggestedSellingPrice", label: "Suggested Selling Price (Rs.)", optional: true, numeric: true,
    hint: "Optional. Shown to the salesperson as a price guide. The actual selling price may be different." },
  { name: "initialQuantity", label: "Initial quantity", numeric: true, hint: "Preview only. No opening stock is created." },
  { name: "lowStockThreshold", label: "Low-stock threshold", numeric: true, hint: "Low stock when the quantity is at or below this value." },
];

export function AddProductPreview({ product }: { product?: MockInventoryProduct }) {
  const editing = Boolean(product);
  const mode = editing ? "edit" : "add";
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [values, setValues] = useState(() => ({
    ...emptyProductPreview,
    ...(product && { name: product.name, suggestedSellingPrice: getMockSuggestedSellingPrice(product.id) ?? "", lowStockThreshold: String(product.lowStockThreshold) }),
  }));
  const [errors, setErrors] = useState<ProductPreviewErrors>({});
  const [demoName, setDemoName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmationRef = useRef<HTMLParagraphElement>(null);
  const attempted = useRef(false);

  useEffect(() => { if (demoName !== null) confirmationRef.current?.focus(); }, [demoName]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDemoName(null);
    if (!ready) return;
    attempted.current = true;
    const nextErrors = validateProductPreview(values, mode);
    setErrors(nextErrors);
    const first = productPreviewFields.find((field) => nextErrors[field]);
    if (first) {
      const input = formRef.current?.elements.namedItem(first);
      if (input instanceof HTMLInputElement) input.focus();
      return;
    }
    // Deliberately local component state only: no request, storage or fixture mutation.
    setDemoName(values.name.trim());
  }

  return <Card className="max-w-3xl">
    {product && <div className="mb-5 border-b pb-5">
      <dl aria-label="Read-only inventory information" className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm font-semibold">Available quantity (read-only)</dt><dd className="numeric mt-2">{product.quantity}</dd>
          <p className="mt-2 text-sm text-muted-foreground">Receiving and stock corrections need a separate audited workflow.</p></div>
        <div><dt className="text-sm font-semibold">Purchase cost (read-only)</dt><dd className="mt-2 text-sm text-muted-foreground">Current purchase cost not available in demo data</dd>
          <p className="mt-2 text-sm text-muted-foreground">Real updates will reprice remaining stock with audit history.</p></div>
      </dl>
    </div>}
    <form ref={formRef} onSubmit={submit} noValidate aria-label={editing ? "Edit product preview" : "Add product preview"}>
      <fieldset disabled={!ready} className="grid min-w-0 gap-5">
        <legend className="sr-only">Product details</legend>
        <p className="text-sm text-muted-foreground">Fields marked * are required.</p>
        <div className="grid min-w-0 items-start gap-5 sm:grid-cols-2">
          {fields.filter((field) => !editing || field.name !== "initialQuantity").map((field) => {
            const proposal = editing && field.name === "purchaseCost";
            const optional = field.optional || proposal;
            const label = proposal ? "New Purchase Cost (Demo)" : field.label;
            const id = (editing ? "edit-product-" : "new-product-") + field.name;
            const hint = proposal ? "Optional. Preview a proposed cost; current cost is unchanged." : field.hint || (optional ? "Optional." : undefined);
            const describedBy = [hint && id + "-hint", errors[field.name] && id + "-error"].filter(Boolean).join(" ") || undefined;
            return <Field key={field.name} id={id} label={label + (optional ? "" : " *")} hint={hint} error={errors[field.name]}>
              <Input id={id} name={field.name} value={values[field.name]} autoComplete="off"
                inputMode={field.numeric ? "decimal" : undefined} className={field.numeric ? "numeric" : undefined}
                required={!optional} aria-required={!optional || undefined}
                aria-invalid={Boolean(errors[field.name]) || undefined} aria-describedby={describedBy}
                onBlur={() => setErrors((previous) => ({ ...previous, [field.name]: validateProductPreview(values, mode)[field.name] }))}
                onChange={(event) => {
                  const next = { ...values, [field.name]: event.target.value };
                  setValues(next);
                  setDemoName(null);
                  if (attempted.current || errors[field.name]) {
                    setErrors((previous) => ({ ...previous, [field.name]: validateProductPreview(next, mode)[field.name] }));
                  }
                }} />
            </Field>;
          })}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Quantity precision is illustrative: up to 6 decimal places. The shop&apos;s final unit policy is pending.</p>
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="submit" aria-describedby="product-demo-note">{editing ? "Save Changes (Demo)" : "Save Product"}</Button>
          <Button asChild variant="outline"><Link href="/admin/products">Cancel</Link></Button>
        </div>
        <p id="product-demo-note" className="text-sm text-muted-foreground">{editing ? "Demo only. Changes are not saved to Products, inventory or POS." : "Demo only. No product or stock will be saved or made available in POS."}</p>
      </fieldset>
      {!ready && <p className="mt-4 text-sm text-danger">Enable JavaScript to use this demo form. Nothing can be saved here.</p>}
    </form>
    {demoName !== null && <p ref={confirmationRef} tabIndex={-1} role="status" className="mt-5 rounded-md border border-primary bg-accent p-4 text-sm leading-6">
      {editing ? <>{values.purchaseCost.trim() ? "Demo only — purchase cost was not updated." : "Demo only — changes were not saved."} Preview for <strong>{demoName}</strong>. No product changes were saved; inventory and POS are unchanged.</>
        : <>Demo complete for <strong>{demoName}</strong>. No product or stock was saved. This entry is not available in POS.</>}
    </p>}
  </Card>;
}
