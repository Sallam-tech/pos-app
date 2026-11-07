"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { mockInventory, type MockInventoryProduct } from "@/lib/admin/mock-inventory";
import { Select } from "@/components/ui/select";
import { demoUnitLabels, productUnitDisplay, suggestProductCode, validateProductCode, type ProductIdentity } from "@/lib/product-identity-preview";
import { getMockSuggestedSellingPrice } from "@/lib/mock-suggested-prices";
import {
  emptyProductPreview, productPreviewFields, validateProductPreview,
  type ProductPreviewErrors, type ProductPreviewField,
} from "@/lib/admin/product-preview";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const fields: { name: ProductPreviewField; label: string; optional?: boolean; hint?: string; numeric?: boolean }[] = [
  { name: "name", label: "Product Name" },
  { name: "category", label: "Category", optional: true },
  { name: "purchaseCost", label: "Buying Price (Rs.)", numeric: true },
  { name: "suggestedSellingPrice", label: "Selling Price (Rs.)", optional: true, numeric: true,
    hint: "Optional. Editable again at checkout." },
  { name: "initialQuantity", label: "Stock Quantity", numeric: true },
  { name: "lowStockThreshold", label: "Low Stock Alert", numeric: true },
];

export function AddProductPreview({ product, catalog = mockInventory }: { product?: MockInventoryProduct & ProductIdentity; catalog?: readonly ProductIdentity[] }) {
  const editing = Boolean(product);
  const mode = editing ? "edit" : "add";
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [values, setValues] = useState(() => ({
    ...emptyProductPreview,
    ...(product && { name: product.name, category: product.category ?? "", suggestedSellingPrice: getMockSuggestedSellingPrice(product.id) ?? "", lowStockThreshold: String(product.lowStockThreshold) }),
  }));
  const [identity, setIdentity] = useState(() => ({ productCode: product?.productCode ?? (editing ? "" : suggestProductCode(catalog)), unitLabel: product?.unitLabel ?? (editing ? "" : "Piece") }));
  const [initialInput] = useState(() => JSON.stringify({ values, identity }));
  const hasUnsavedInput = JSON.stringify({ values, identity }) !== initialInput;
  const [codeError, setCodeError] = useState<string | undefined>();
  const [errors, setErrors] = useState<ProductPreviewErrors>({});
  const [demoName, setDemoName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmationRef = useRef<HTMLParagraphElement>(null);
  const attempted = useRef(false);
  const moreDetailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => { if (demoName !== null) confirmationRef.current?.focus(); }, [demoName]);

  useEffect(() => {
    if (ready && !editing) (formRef.current?.elements.namedItem("name") as HTMLInputElement | null)?.focus();
  }, [ready, editing]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDemoName(null);
    if (!ready) return;
    attempted.current = true;
    const nextErrors = validateProductPreview(values, mode);
    setErrors(nextErrors);
    const nextCodeError = validateProductCode(identity.productCode, catalog, product?.id);
    setCodeError(nextCodeError);
    const first = productPreviewFields.find((field) => nextErrors[field]);
    if (first) {
      const input = formRef.current?.elements.namedItem(first);
      if (input instanceof HTMLInputElement) {
        const details = input.closest("details");
        if (details) details.open = true;
        input.focus();
      }
      return;
    }
    if (nextCodeError) { if (moreDetailsRef.current) moreDetailsRef.current.open = true; formRef.current?.querySelector<HTMLInputElement>("[name=productCode]")?.focus(); return; }
    // Deliberately local component state only: no request, storage or fixture mutation.
    setDemoName(values.name.trim());
  }

  function renderField(field: typeof fields[number]) {
    const proposal = editing && field.name === "purchaseCost";
    const optional = field.optional || proposal;
    const label = field.label;
    const id = (editing ? "edit-product-" : "new-product-") + field.name;
    const hint = proposal ? "Current buying price not available in demo data. Optional demo proposal only." : field.hint || (optional ? "Optional." : undefined);
    const describedBy = [hint && id + "-hint", errors[field.name] && id + "-error"].filter(Boolean).join(" ") || undefined;
    return <Field key={field.name} id={id} label={label + (optional ? "" : " *")} hint={hint} error={errors[field.name]?.replace(/purchase cost/gi, "buying price").replace(/suggested selling price/gi, "selling price")}>
      <Input id={id} name={field.name} value={values[field.name]} autoComplete="off"
        inputMode={field.numeric ? "decimal" : undefined} className={field.numeric ? "numeric" : undefined}
        required={!optional} aria-required={!optional || undefined}
        aria-invalid={Boolean(errors[field.name]) || undefined} aria-describedby={describedBy}
        onBlur={(event) => {
          // Avoid moving an action between pointer-down and click. Save validates the entire form.
          const next = event.relatedTarget;
          if (next instanceof HTMLElement && event.currentTarget.form?.contains(next) && next.closest('button[type="submit"],a[href]')) return;
          setErrors((previous) => ({ ...previous, [field.name]: validateProductPreview(values, mode)[field.name] }));
        }}
        onChange={(event) => {
          const next = { ...values, [field.name]: event.target.value };
          setValues(next);
          setDemoName(null);
          if (attempted.current || errors[field.name]) {
            setErrors((previous) => ({ ...previous, [field.name]: validateProductPreview(next, mode)[field.name] }));
          }
        }} />
    </Field>;
  }

  function renderUnit() {
    return <Field id="product-unit" label="Unit (Optional)">
      <Select id="product-unit" name="unitLabel" value={identity.unitLabel} onChange={(event) => { setIdentity((previous) => ({ ...previous, unitLabel: event.target.value })); setDemoName(null); }}>
        <option value="">Not set (Piece display fallback)</option>
        {product?.unitLabel && !demoUnitLabels.some((unit) => unit === product.unitLabel) && <option>{product.unitLabel}</option>}
        {demoUnitLabels.map((unit) => <option key={unit}>{unit}</option>)}
      </Select>
    </Field>;
  }

  return <Card className="max-w-3xl shadow-none">
    <form data-unsaved-changes={hasUnsavedInput} ref={formRef} onSubmit={submit} noValidate aria-label={editing ? "Edit product preview" : "Add product preview"}>
      <fieldset disabled={!ready} className="grid min-w-0 gap-5">
        <legend className="sr-only">Product details</legend>
        <p className="text-sm text-muted-foreground">Fields marked * are required.</p>
        {renderField(fields.find((field) => field.name === "name")!)}
        <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">
          {renderField(fields.find((field) => field.name === "purchaseCost")!)}
          {renderField(fields.find((field) => field.name === "suggestedSellingPrice")!)}
        </div>
        <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">
          {product ? <div><p className="text-sm font-semibold">Stock Quantity (read-only)</p><p className="numeric mt-2 flex min-h-12 items-center rounded-md border bg-muted px-3 font-semibold" data-testid="edit-stock-quantity">{product.quantity}</p></div> : renderField(fields.find((field) => field.name === "initialQuantity")!)}
          {renderUnit()}
        </div>
        {renderField(fields.find((field) => field.name === "lowStockThreshold")!)}
        <details ref={moreDetailsRef} className="optional-details border-y">
          <summary>More Details (Optional)</summary>
          <div className="grid min-w-0 items-start gap-4 pb-4 sm:grid-cols-2">
          {renderField(fields.find((field) => field.name === "category")!)}
          <Field id="product-code" label="Product Code (Optional)" hint="Optional. Suggested automatically; you may change or clear it." error={codeError}>
    <Input id="product-code" name="productCode" value={identity.productCode} maxLength={64} autoComplete="off" aria-invalid={Boolean(codeError) || undefined} aria-describedby={"product-code-hint" + (codeError ? " product-code-error" : "")}
      onBlur={() => setCodeError(validateProductCode(identity.productCode, catalog, product?.id))}
      onChange={(event) => { const productCode = event.target.value; setIdentity((previous) => ({ ...previous, productCode })); setDemoName(null); setCodeError(validateProductCode(productCode, catalog, product?.id)); }} />
          </Field>
          </div>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button asChild variant="outline"><Link href="/admin/products">Cancel</Link></Button>
          <Button type="submit" aria-describedby="product-demo-note">{editing ? "Save Changes" : "Save Product"}</Button>
        </div>
        <p id="product-demo-note" className="text-xs text-muted-foreground">{editing ? "Demo only. Changes are not saved to Products, inventory or POS." : "Demo only. No product or stock will be saved or made available in POS."}</p>
      </fieldset>
      {!ready && <p className="mt-4 text-sm text-danger">Enable JavaScript to use this demo form. Nothing can be saved here.</p>}
    </form>
    {demoName !== null && <p ref={confirmationRef} tabIndex={-1} role="status" className="mt-5 rounded-md border border-primary bg-accent p-4 text-sm leading-6">
      {editing ? <>{values.purchaseCost.trim() ? "Demo only — buying price was not updated." : "Demo only — changes were not saved."} Preview for <strong>{demoName}</strong>. No product changes were saved; inventory and POS are unchanged.</>
        : <>Demo complete for <strong>{demoName}</strong>. No product or stock was saved. This entry is not available in POS.</>}
      <span className="mt-3 block">Product code: {identity.productCode.trim() || "Not set"}; Category: {values.category.trim() || "Not set"}; Unit: {productUnitDisplay(identity)}.</span>
      {product && <span className="mt-1 block">Internal ID: {product.id} (unchanged).</span>}
    </p>}
  </Card>;
}
