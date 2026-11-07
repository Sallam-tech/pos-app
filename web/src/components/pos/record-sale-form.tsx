"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { DraftInvoice } from "@/components/pos/draft-invoice";
import { calculateDemoCheckout } from "@/lib/demo/checkout";
import { ProductCombobox } from "@/components/pos/product-combobox";
import { getCheckoutDemoPrice } from "@/lib/demo/checkout-products";
import type { ReceiptDraftState } from "@/lib/receipt-draft-preview";
import "./sale-preview.css";
import { draftSubtotal, type DraftItem, type DraftInvoice as Invoice } from "@/lib/sale-draft-preview";
import {
  createSaleSimulation, formatPreviewPKR, previewTotal, stepPreviewQuantity, validatePreview,
  type PreviewErrors, type PreviewProduct,
} from "@/lib/pos-preview";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function RecordSaleForm() {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [errors, setErrors] = useState<PreviewErrors>({});
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraftState | null>(null);
  const [searchVersion, setSearchVersion] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const productRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(1);
  const previewSequence = useRef(1);
  const invoiceContext = useRef<{ previewedAt: string; sampleReference: string } | null>(null);
  const adding = useRef(false);
  const creating = useRef(false);
  const total = draftSubtotal(items);
  const checkout = calculateDemoCheckout(total, discount);
  useEffect(() => {
    if (ready && !invoice) { adding.current = false; productRef.current?.focus(); }
  }, [ready, searchVersion, invoice]);
  function clearSearch() { setQuery(""); setErrors({}); setSearchVersion((version) => version + 1); }
  function reset() {
    setInvoice(null); setItems([]); setDiscount(""); setCustomerName(""); setCustomerPhone(""); setReceiptDraft(null);
    adding.current = false; creating.current = false; invoiceContext.current = null; setAnnouncement(""); clearSearch();
  }
  function addProduct(product: PreviewProduct | null) {
    if (!ready || !product || adding.current) return;
    const price = getCheckoutDemoPrice(product.id);
    if (price === null || Object.keys(validatePreview(product, "1", price)).length) {
      setErrors({ product: "A valid demo price is unavailable for this product." }); return;
    }
    const existing = items.find((item) => item.product.id === product.id);
    if (existing) {
      const next = validatePreview(existing.product, existing.quantity, existing.price);
      const quantity = stepPreviewQuantity(existing.quantity, 1);
      if (Object.keys(next).length || quantity === null) {
        setAnnouncement("Correct this item's quantity or price before adding another.");
        document.getElementById("item-" + existing.key + (next.price ? "-price" : "-quantity"))?.focus(); return;
      }
      adding.current = true;
      setItems((current) => current.map((item) => item.key === existing.key ? { ...item, quantity } : item));
    } else {
      adding.current = true;
      const key = nextKey.current++;
      setItems((current) => [...current, { key, product, quantity: "1", price }]);
    }
    setAnnouncement(product.name + " added to current items."); clearSearch();
  }
  function editItem(key: number, field: "quantity" | "price", value: string) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, [field]: value } : item));
  }
  function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || creating.current) return;
    if (query.trim() || !items.length) {
      setErrors({ product: query.trim() ? "Choose a product from the search results, or clear the search before creating an invoice." : "Add at least one product to Current Items." });
      productRef.current?.focus(); return;
    }
    const invalid = items.find((item) => Object.keys(validatePreview(item.product, item.quantity, item.price)).length);
    if (invalid) {
      const next = validatePreview(invalid.product, invalid.quantity, invalid.price);
      document.getElementById("item-" + invalid.key + (next.quantity ? "-quantity" : "-price"))?.focus(); return;
    }
    if (!checkout.value) { document.getElementById("sale-discount")?.focus(); return; }
    creating.current = true;
    invoiceContext.current ??= { previewedAt: new Date().toISOString(), sampleReference: "PREVIEW-" + String(previewSequence.current++).padStart(3, "0") };
    setInvoice({ items: items.map((item) => createSaleSimulation(item.product, item.quantity, item.price)!),
      checkout: checkout.value, customer: { name: customerName, phone: customerPhone },
      ...invoiceContext.current });
  }
  return <>
    <form data-unsaved-changes={Boolean(query || items.length || discount || customerName || customerPhone || receiptDraft)} onSubmit={createInvoice} noValidate aria-label="Make a sale preview">
      <fieldset disabled={!ready || Boolean(invoice)} className="grid min-w-0 gap-5 rounded-lg border bg-card p-4 sm:p-6">
        <legend className="sr-only">Sample invoice draft</legend>
        <section aria-labelledby="find-product-title" className="grid min-w-0 gap-3">
          <h2 id="find-product-title" className="sr-only">Find Product</h2>
          <Field id="sale-product" label="Find Product" error={errors.product}>
            <ProductCombobox key={searchVersion} value={null} inputRef={productRef} invalid={Boolean(errors.product)}
              describedBy={errors.product ? "sale-product-error" : "sale-demo-prices"}
              onQueryChange={(value) => { setQuery(value); setErrors({}); }} onChange={addProduct} />
          </Field>
          <p id="sale-demo-prices" className="text-xs text-muted-foreground">Search, choose and press Enter to add. Temporary demo prices apply where no price is set; edit quantity and price in Current Items.</p>
        </section>
        <section aria-labelledby="current-items-title" className="min-w-0 border-t pt-4">
          <h2 id="current-items-title" className="mb-3 text-base font-semibold">Current Items {items.length > 0 && <span className="text-sm font-normal text-muted-foreground">({items.length})</span>}</h2>
          {!items.length ? <p className="py-2 text-sm text-muted-foreground">Find a product to start this sale.</p> : <ul className="grid min-w-0 divide-y">
            {items.map((item, index) => {
              const next = validatePreview(item.product, item.quantity, item.price);
              const lineTotal = previewTotal(item.quantity, item.price);
              const prefix = "item-" + item.key;
              return <li key={item.key} aria-label={item.product.name + " item " + (index + 1)} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-start gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_144px_104px_112px_44px]">
                <p className="col-span-2 break-words font-bold sm:col-span-1 sm:pt-8">{item.product.name}</p>
                <div className="col-span-3 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-auto sm:row-start-auto">
                  <Field id={prefix + "-quantity"} label="Quantity" error={next.quantity}>
                    <div className="flex min-w-0 gap-1">
                      <Button size="sm" variant="outline" className="w-11 px-0" aria-label={"Decrease " + item.product.name + " quantity, item " + (index + 1)} disabled={!stepPreviewQuantity(item.quantity, -1)} onClick={() => editItem(item.key, "quantity", stepPreviewQuantity(item.quantity, -1)!)}>-</Button>
                      <Input id={prefix + "-quantity"} aria-label={item.product.name + " quantity, item " + (index + 1)} inputMode="decimal" maxLength={32} value={item.quantity} aria-invalid={Boolean(next.quantity) || undefined} aria-describedby={next.quantity ? prefix + "-quantity-error" : undefined} className="numeric min-w-0 px-1 text-center" onChange={(event) => editItem(item.key, "quantity", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
                      <Button size="sm" variant="outline" className="w-11 px-0" aria-label={"Increase " + item.product.name + " quantity, item " + (index + 1)} disabled={!stepPreviewQuantity(item.quantity, 1)} onClick={() => editItem(item.key, "quantity", stepPreviewQuantity(item.quantity, 1)!)}>+</Button>
                    </div>
                  </Field>
                </div>
                <div className="col-span-3 col-start-1 row-start-3 min-w-0 sm:col-span-1 sm:col-start-auto sm:row-start-auto">
                  <Field id={prefix + "-price"} label="Price (PKR)" error={next.price}>
                    <Input id={prefix + "-price"} aria-label={item.product.name + " price (PKR), item " + (index + 1)} inputMode="decimal" maxLength={32} value={item.price} aria-invalid={Boolean(next.price) || undefined} aria-describedby={next.price ? prefix + "-price-error" : undefined} className="numeric min-w-0 px-2" onChange={(event) => editItem(item.key, "price", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
                  </Field>
                </div>
                <output aria-label={item.product.name + " line total, item " + (index + 1)} className="numeric col-span-3 row-start-4 break-all text-right font-bold sm:col-span-1 sm:row-start-auto sm:pt-9">{lineTotal === null ? "\u2014" : formatPreviewPKR(lineTotal)}</output>
                <Button variant="ghost" size="sm" className="sale-remove-button col-start-3 row-start-1 w-11 px-0 sm:col-start-auto sm:row-start-auto sm:mt-7" aria-label={"Remove " + item.product.name} onClick={() => { setItems((current) => current.filter((entry) => entry.key !== item.key)); setAnnouncement(item.product.name + " removed."); productRef.current?.focus(); }}><Icon name="close" /></Button>
              </li>;
            })}
          </ul>}
        </section>
        <div className="border-t pt-4">
          <Field id="sale-discount" label="Discount (%, optional)" error={checkout.errors.discount}>
            <Input id="sale-discount" inputMode="decimal" autoComplete="off" value={discount} maxLength={8} aria-invalid={Boolean(checkout.errors.discount) || undefined} aria-describedby={checkout.errors.discount ? "sale-discount-error" : undefined} className="numeric max-w-48" placeholder="No discount" onChange={(event) => setDiscount(event.target.value)} />
          </Field>
          <div className="mt-4 flex min-w-0 flex-wrap items-baseline justify-between gap-2 border-y py-4">
            <p id="sale-total-label" className="font-semibold">TOTAL</p>
            <output aria-labelledby="sale-total-label" data-testid="sale-total" className="numeric min-w-0 break-all text-3xl font-bold tracking-tight">{checkout.value === null ? "\u2014" : formatPreviewPKR(checkout.value.total)}</output>
          </div>
        </div>
        <details className="optional-details">
          <summary>Customer (Optional)</summary>
          <div className="grid gap-3 pb-2 pt-3 sm:grid-cols-2">
            <Field id="sale-customer-name" label="Name"><Input id="sale-customer-name" autoComplete="off" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></Field>
            <Field id="sale-customer-phone" label="Phone"><Input id="sale-customer-phone" type="tel" autoComplete="off" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></Field>
          </div>
        </details>
        <div className="grid gap-2">
          <Button type="submit" size="lg" className="w-full">Create Invoice</Button>
          <Button variant="ghost" className="w-full" onClick={reset}>Cancel Sale</Button>
          <p className="text-center text-xs text-muted-foreground">Demo only - Nothing is saved</p>
        </div>
      </fieldset>
      {!ready && <p className="mt-3 text-sm text-danger">Enable JavaScript to create a sample invoice. No sale can be recorded here.</p>}
    </form>
    <span role="status" className="sr-only">{announcement}</span>
    {invoice && <DraftInvoice invoice={invoice} initialDraft={receiptDraft} onDone={reset} onEditSale={(draft) => {
      setReceiptDraft(draft); setCustomerName(draft.details.customerName); setCustomerPhone(draft.details.customerPhone);
      creating.current = false; setInvoice(null);
    }} />}
  </>;
}
