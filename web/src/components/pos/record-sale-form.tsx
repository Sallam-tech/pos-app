"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { ProductCombobox } from "@/components/pos/product-combobox";
import { getMockSuggestedSellingPrice } from "@/lib/mock-suggested-prices";
import {
  createSaleSimulation, formatPreviewPKR, previewTotal, pricePrecisionError, stepPreviewQuantity, validatePreview,
  type PreviewErrors, type PreviewField, type PreviewProduct, type SaleSimulation,
} from "@/lib/pos-preview";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function RecordSaleForm() {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [product, setProduct] = useState<PreviewProduct | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<PreviewErrors>({});
  const [simulation, setSimulation] = useState<SaleSimulation | null>(null);
  const productRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);
  const resetting = useRef(false);
  const submitted = useRef(false);
  const total = previewTotal(quantity, price);
  const suggestedPrice = getMockSuggestedSellingPrice(product?.id);
  const decrease = stepPreviewQuantity(quantity, -1);
  const increase = stepPreviewQuantity(quantity, 1);

  useEffect(() => {
    if (simulation) confirmationRef.current?.focus();
    else if (resetting.current) {
      productRef.current?.focus();
      resetting.current = false;
    }
  }, [simulation]);

  function clearError(field: PreviewField) {
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || submitted.current) return;
    const nextErrors = validatePreview(product, quantity, price);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const first = nextErrors.product ? productRef : nextErrors.quantity ? quantityRef : priceRef;
      first.current?.focus();
      return;
    }
    const result = createSaleSimulation(product, quantity, price);
    if (result) {
      submitted.current = true;
      setSimulation(result);
    }
  }

  function reset() {
    setProduct(null);
    setQuantity("1");
    setPrice("");
    setErrors({});
    submitted.current = false;
    resetting.current = true;
    setSimulation(null);
  }

  function description(field: PreviewField, hint = false) {
    return [hint && "sale-" + field + "-hint", errors[field] && "sale-" + field + "-error"].filter(Boolean).join(" ") || undefined;
  }

  return <Card>
    {simulation ? <section aria-labelledby="simulation-title" className="grid gap-5">
      <div className="grid gap-2">
        <span className="grid size-11 place-items-center rounded-full bg-accent text-primary"><Icon name="check" className="size-6" /></span>
        <h2 ref={confirmationRef} tabIndex={-1} id="simulation-title" className="section-title rounded-sm">Sale simulation complete</h2>
        <p role="status" className="text-sm leading-6 text-muted-foreground">No sale was recorded. This is a preview, not a saved transaction.</p>
      </div>
      <dl className="grid gap-4">
        <div><dt className="text-sm text-muted-foreground">Product</dt><dd className="mt-1 font-semibold">{simulation.product.name}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Quantity</dt><dd className="numeric mt-1 break-all font-semibold" data-testid="confirmation-quantity">{simulation.quantity}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Selling price per unit (PKR)</dt><dd className="numeric mt-1 break-all font-semibold" data-testid="confirmation-price">{formatPreviewPKR(simulation.unitPrice)}</dd></div>
        <div className="rounded-md border bg-surface-subtle p-4">
          <dt className="text-sm font-semibold">Simulated total (PKR)</dt>
          <dd className="numeric mt-1 break-all text-2xl font-bold" data-testid="confirmation-total">{formatPreviewPKR(simulation.total)}</dd>
        </div>
      </dl>
      <Button size="lg" className="w-full" onClick={reset}>New Sale</Button>
    </section> : <form onSubmit={submit} noValidate aria-label="Record sale preview">
      <fieldset disabled={!ready} className="grid min-w-0 gap-4">
        <legend className="sr-only">Simulated sale details</legend>
        <Field id="sale-product" label="Product" error={errors.product}
          hint={product ? suggestedPrice === null ? "No suggested price" : "Suggested: " + formatPreviewPKR(suggestedPrice) : undefined}>
          <ProductCombobox value={product} inputRef={productRef} invalid={Boolean(errors.product)} describedBy={description("product", Boolean(product))}
            onChange={(value) => { setProduct(value); clearError("product"); }} />
        </Field>
        <Field id="sale-quantity" label="Quantity" error={errors.quantity}>
          <div className="flex min-w-0 gap-2">
            <Button variant="outline" size="icon" aria-label="Decrease quantity by one" disabled={!decrease}
              onClick={() => { if (decrease) { setQuantity(decrease); clearError("quantity"); } }}><span aria-hidden="true">−</span></Button>
            <Input ref={quantityRef} id="sale-quantity" inputMode="decimal" autoComplete="off" aria-required="true"
              aria-invalid={Boolean(errors.quantity) || undefined} aria-describedby={description("quantity")}
              value={quantity} maxLength={32} className="numeric text-center"
              onChange={(event) => { setQuantity(event.target.value); clearError("quantity"); }} />
            <Button variant="outline" size="icon" aria-label="Increase quantity by one" disabled={!increase}
              onClick={() => { if (increase) { setQuantity(increase); clearError("quantity"); } }}><span aria-hidden="true">+</span></Button>
          </div>
        </Field>
        <Field id="sale-price" label="Selling price per unit (PKR)" error={errors.price}>
          <Input ref={priceRef} id="sale-price" inputMode="decimal" autoComplete="off" placeholder="e.g. 1,200.00"
            aria-required="true" aria-invalid={Boolean(errors.price) || undefined} aria-describedby={description("price")}
            maxLength={32} value={price} className="numeric"
            onChange={(event) => {
              setPrice(event.target.value);
              setErrors((previous) => ({ ...previous, price: pricePrecisionError(event.target.value) }));
            }} />
        </Field>
        <div className="rounded-md border bg-surface-subtle p-4">
          <p id="sale-total-label" className="text-sm font-semibold">Sale total (PKR)</p>
          <output aria-labelledby="sale-total-label" htmlFor="sale-quantity sale-price" className="numeric mt-1 block break-all text-2xl font-bold" data-testid="sale-total">
            {total === null ? "—" : formatPreviewPKR(total)}
          </output>
          <p className="mt-1 text-sm text-muted-foreground">Quantity × selling price per unit</p>
        </div>
        <div className="grid gap-2">
          <Button size="lg" type="submit" className="w-full" aria-describedby="sale-simulation-note">Record Sale</Button>
          <p id="sale-simulation-note" className="text-center text-sm text-muted-foreground">Simulation only · Nothing is saved</p>
        </div>
      </fieldset>
      {!ready && <p className="mt-4 text-sm text-danger">Enable JavaScript to use this simulated form. No sale can be recorded here.</p>}
    </form>}
    <details className="mt-5 border-t pt-3 text-sm text-muted-foreground">
      <summary tabIndex={0} className="flex min-h-11 cursor-pointer items-center rounded-sm font-semibold text-foreground">About this preview <span aria-hidden="true" className="ml-auto">+</span></summary>
      <p className="mt-2 leading-6">This example uses one product. Fractional quantities and a zero price can be previewed; final quantity, pricing and checkout rules still need owner approval.</p>
      <p className="mt-2 leading-6">For this preview, each number supports up to 12 whole-number digits. Quantity supports 6 decimal places; selling price supports no more than 2. Totals keep every decimal place without rounding. The + and − controls adjust quantity by one.</p>
    </details>
  </Card>;
}
