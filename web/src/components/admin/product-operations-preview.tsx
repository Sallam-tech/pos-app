"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MockInventoryProduct } from "@/lib/admin/mock-inventory";
import { stockCorrectionDifference, validateStockCorrection, type StockCorrectionErrors } from "@/lib/admin/product-operations-preview";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

function StockCorrectionPreview({ product, ready }: { product: MockInventoryProduct; ready: boolean }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<StockCorrectionErrors>({});
  const [confirmed, setConfirmed] = useState(false);
  const quantityRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (window.location.hash === "#stock-correction" && disclosureRef.current) {
      disclosureRef.current.open = true;
      disclosureRef.current.querySelector("summary")?.focus();
    }
  }, []);
  const difference = stockCorrectionDifference(String(product.quantity), quantity);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmed(false);
    if (!ready) return;
    const nextErrors = validateStockCorrection(quantity, reason);
    setErrors(nextErrors);
    if (nextErrors.quantity || nextErrors.reason) {
      (nextErrors.quantity ? quantityRef : reasonRef).current?.focus();
      return;
    }
    if (difference !== null && difference !== "0") setConfirmed(true);
  }

  return <details ref={disclosureRef} id="stock-correction" className="summary-panel text-card-foreground" onToggle={(event) => {
    setOpen(event.currentTarget.open);
    setConfirmed(false);
  }}>
    <summary tabIndex={0} className="flex min-h-14 cursor-pointer items-center rounded-lg px-4 py-3 font-semibold sm:px-6">Correct Stock (Demo)<span aria-hidden="true" className="ml-auto">{open ? "−" : "+"}</span></summary>
    {open && <div className="border-t p-4 sm:p-6">
      <p className="mb-4 text-sm text-muted-foreground">Correct a stock count. This does not receive purchased stock.</p>
      <dl className="mb-4"><dt className="text-sm font-semibold">Current Available Quantity</dt><dd className="numeric mt-1" data-testid="correction-current-quantity">{product.quantity}</dd></dl>
      <form data-unsaved-changes={Boolean(quantity || reason)} onSubmit={submit} noValidate aria-label="Stock correction demo">
        <fieldset disabled={!ready} className="grid min-w-0 gap-4">
          <legend className="sr-only">Stock count correction</legend>
          <Field id="correction-quantity" label="Correct Quantity" error={errors.quantity}
            hint="Required. Up to 6 decimal places in this preview.">
            <Input ref={quantityRef} id="correction-quantity" name="correctQuantity" inputMode="decimal" autoComplete="off"
              value={quantity} className="numeric" required aria-required="true" aria-invalid={Boolean(errors.quantity) || undefined}
              aria-describedby={"correction-quantity-hint" + (errors.quantity ? " correction-quantity-error" : "")}
              onBlur={() => setErrors((previous) => ({ ...previous, quantity: validateStockCorrection(quantity, reason).quantity }))}
              onChange={(event) => {
                setQuantity(event.target.value);
                setConfirmed(false);
                setErrors((previous) => ({ ...previous, quantity: validateStockCorrection(event.target.value, reason).quantity }));
              }} />
          </Field>
          <Field id="correction-reason" label="Reason for Correction" error={errors.reason}>
            <Input ref={reasonRef} id="correction-reason" name="correctionReason" autoComplete="off" placeholder="e.g. 3 damaged items"
              value={reason} required aria-required="true" aria-invalid={Boolean(errors.reason) || undefined}
              aria-describedby={errors.reason ? "correction-reason-error" : undefined}
              onBlur={() => setErrors((previous) => ({ ...previous, reason: validateStockCorrection(quantity, reason).reason }))}
              onChange={(event) => {
                setReason(event.target.value);
                setConfirmed(false);
                setErrors((previous) => ({ ...previous, reason: validateStockCorrection(quantity, event.target.value).reason }));
              }} />
          </Field>
          <div><p id="correction-difference-label" className="text-sm font-semibold">Difference</p>
            <output htmlFor="correction-quantity" aria-labelledby="correction-difference-label" className="numeric mt-1 block break-all text-xl font-semibold">{difference ?? "—"}</output>
          </div>
          {difference === "0" && <p role="status" className="text-sm text-muted-foreground">No correction is needed. The quantity is unchanged.</p>}
          <div><Button type="submit">Preview Correction</Button></div>
        </fieldset>
      </form>
      {confirmed && <p role="status" className="mt-4 rounded-md border border-primary bg-accent p-3 text-sm" data-testid="correction-confirmation">
        Demo only — stock was not changed. Proposed difference: {difference}. No inventory record or history entry was created.
      </p>}
    </div>}
  </details>;
}

function ProductStatusPreview({ product, ready }: { product: MockInventoryProduct; ready: boolean }) {
  // The fixture has no persisted status. This is a local demonstration only.
  const [previewActive, setPreviewActive] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const action = previewActive ? "Stop Selling (Demo)" : "Resume Selling (Demo)";

  return <section aria-labelledby="product-status-title" className="summary-panel p-5 text-card-foreground sm:p-6">
    <h2 id="product-status-title" className="section-title">Product Status</h2>
    <p className="mt-2 text-sm text-muted-foreground">Active means offered for sale. Inactive stops new sales.</p>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <Badge tone={previewActive ? "success" : "neutral"}>{previewActive ? "Active (demo preview)" : "Inactive (demo preview)"}</Badge>
      <Button variant="outline" disabled={!ready} onClick={() => { setNotice(null); setConfirming(true); }}>{action}</Button>
    </div>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">The demo starts Active. No status is saved or enforced in POS. Stock availability is separate.</p>
    {notice && <p role="status" className="mt-4 rounded-md border bg-muted p-3 text-sm">{notice}</p>}
    <Dialog open={confirming} onOpenChange={setConfirming} title={action}
      description={"Preview " + (previewActive ? "stopping" : "resuming") + " sales of " + product.name + "? Nothing is saved or applied to POS."}>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => {
          setNotice(previewActive
            ? "Demo only — the product is not actually deactivated. Stock, history and POS eligibility are unchanged."
            : "Demo only — the product is not actually reactivated. Stock, history and POS eligibility are unchanged.");
          setPreviewActive((active) => !active);
          setConfirming(false);
        }}>{"Confirm " + action}</Button>
        <Button variant="outline" onClick={() => setConfirming(false)}>Cancel status preview</Button>
      </div>
    </Dialog>
  </section>;
}

export function ProductOperationsPreview({ product }: { product: MockInventoryProduct }) {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  return <section aria-label="Product operations preview" className="mt-5 grid max-w-3xl gap-5">
    <StockCorrectionPreview product={product} ready={ready} />
    <ProductStatusPreview product={product} ready={ready} />
  </section>;
}

// Future status changes require persistent, audited Admin authorization and POS
// filtering. React preview state is not product status and grants no access control.
