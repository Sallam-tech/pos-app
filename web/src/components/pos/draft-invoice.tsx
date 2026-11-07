"use client";

import { useState } from "react";
import { useShopSettings } from "@/components/settings/use-shop-settings";
import { InvoiceItemsTable, InvoicePaperHeader } from "./invoice-presentation";
import { ReceiptPreview } from "@/components/demo/receipt-preview";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { calculateDemoCheckout } from "@/lib/demo/checkout";
import { formatPreviewPKR } from "@/lib/pos-preview";
import { validateReceiptDraft, type ReceiptDraftDetails, type ReceiptDraftState } from "@/lib/receipt-draft-preview";
import type { DraftInvoice as Invoice } from "@/lib/sale-draft-preview";

export function DraftInvoice({ invoice, initialDraft, onDone, onEditSale }: {
  invoice: Invoice; initialDraft: ReceiptDraftState | null;
  onDone: () => void; onEditSale: (draft: ReceiptDraftState) => void;
}) {
  const settings = useShopSettings();
  const { checkout, customer } = invoice;
  const [details, setDetails] = useState<ReceiptDraftDetails>(() => ({
    shopName: settings.shopName, address: settings.address, shopPhone: settings.phone, footer: settings.footer || "Thank you for shopping!",
    ...initialDraft?.details, customerName: customer.name, customerPhone: customer.phone,
  }));
  const [layout, setLayout] = useState(initialDraft?.layout ?? settings.receiptLayout);
  const [cash, setCash] = useState(initialDraft?.cash ?? "");
  const errors = validateReceiptDraft(details);
  const payment = calculateDemoCheckout(checkout.subtotal, checkout.discountPercent, cash);
  const cashError = payment.errors.cash ?? payment.value?.cashWarning ?? undefined;
  const printDisabled = Object.keys(errors).length > 0 || payment.value === null || Boolean(cashError);
  const hasDiscount = checkout.discountPercent !== "0";
  const paidAmounts = payment.value && !cashError && payment.value.cashReceived !== null ? payment.value : null;
  const editSale = () => onEditSale({ details, cash, layout });
  const input = (key: "shopName" | "address" | "footer" | "customerName" | "customerPhone", label: string, maximum: number) => {
    const id = "receipt-draft-" + key;
    return <Field id={id} label={label} error={errors[key]}>
      <Input id={id} value={details[key]} maxLength={maximum} autoComplete="off" type={key === "customerPhone" ? "tel" : "text"}
        aria-invalid={Boolean(errors[key]) || undefined} aria-describedby={errors[key] ? id + "-error" : undefined}
        onChange={(event) => setDetails((previous) => ({ ...previous, [key]: event.target.value }))} />
    </Field>;
  };
  const controls = <div className="mb-4 grid gap-2">
    <details className="optional-details rounded-md border px-3">
      <summary>Edit Receipt Details</summary>
      <p className="pb-3 text-xs leading-5 text-muted-foreground">For this unsaved receipt only. Permanent shop changes belong in Admin Settings. Products, prices and totals can only be changed with Edit Sale.</p>
      <form aria-label="Draft receipt details" onSubmit={(event) => event.preventDefault()} className="grid gap-3 pb-3">
        {input("shopName", "Receipt Shop Name", 80)}
        <div className="grid gap-3 sm:grid-cols-2">{input("customerName", "Customer Name (optional)", 120)}{input("customerPhone", "Customer Phone (optional)", 32)}</div>
        {input("address", "Receipt Shop Address (optional)", 240)}
        {input("footer", "Receipt Message (optional)", 160)}
      </form>
    </details>
    <details className="optional-details rounded-md border px-3">
      <summary>Payment Details (optional)</summary>
      <div className="grid gap-3 pb-3">
        <Field id="receipt-draft-cash" label="Cash Received (PKR, optional)" error={cashError}
          hint="Leave blank if payment is unknown. No payment is saved.">
          <Input id="receipt-draft-cash" value={cash} inputMode="decimal" autoComplete="off" maxLength={32}
            aria-invalid={Boolean(cashError) || undefined} aria-describedby={"receipt-draft-cash-hint" + (cashError ? " receipt-draft-cash-error" : "")}
            onChange={(event) => setCash(event.target.value)} />
        </Field>
        {paidAmounts?.change !== null && paidAmounts && <p className="text-sm font-semibold" role="status">Change: {formatPreviewPKR(paidAmounts.change!)}</p>}
      </div>
    </details>
    {printDisabled && <p className="text-sm text-danger" role="alert">Correct the receipt or payment details before printing. The calculated sale total is unchanged.</p>}
  </div>;
  return <ReceiptPreview initialLayout={layout} onLayoutChange={setLayout} open onOpenChange={(open) => { if (!open) editSale(); }}
    onDone={onDone} developerCredit beforeReceipt={controls} printDisabled={printDisabled}
    extraActions={<Button variant="outline" onClick={editSale}>Edit Sale</Button>}
    title="Sample Invoice" backLabel="Start a fresh sale" description="Demo only. This sample invoice is not saved. Done starts a fresh sale; Edit Sale keeps this draft.">
    <article className="sample-receipt-content grid min-w-0 gap-4 text-sm !text-black">
      <InvoicePaperHeader shopName={details.shopName} address={details.address} phone={details.shopPhone} />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="font-semibold">Invoice #</dt><dd className="break-all">{invoice.sampleReference} (sample reference, not saved)</dd>
        <dt className="font-semibold">Date and time</dt><dd>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(invoice.previewedAt))} (Karachi)</dd>
        {details.customerName.trim() && <><dt className="font-semibold">Customer</dt><dd className="break-words [overflow-wrap:anywhere]">{details.customerName.trim()}</dd></>}
        {details.customerPhone.trim() && <><dt className="font-semibold">Customer Phone</dt><dd className="break-words">{details.customerPhone.trim()}</dd></>}
      </dl>
      <InvoiceItemsTable items={invoice.items} />
      <dl className="invoice-summary numeric">
        {hasDiscount && <><div><dt>Subtotal</dt><dd>{formatPreviewPKR(checkout.subtotal)}</dd></div>
          <div><dt>Discount ({checkout.discountPercent}%)</dt><dd>{formatPreviewPKR(checkout.discountAmount)}</dd></div></>}
        <div className="invoice-total"><dt>TOTAL</dt><dd data-testid="receipt-total">{formatPreviewPKR(checkout.total)}</dd></div>
        {paidAmounts && <><div><dt>Cash Received</dt><dd>{formatPreviewPKR(paidAmounts.cashReceived!)}</dd></div>
          <div><dt>Change</dt><dd>{formatPreviewPKR(paidAmounts.change!)}</dd></div></>}
      </dl>
      <div className="border-t border-dashed border-[#9ca3af] pt-3 text-center">
        {details.footer.trim() && <p className="break-words font-semibold [overflow-wrap:anywhere]">{details.footer.trim()}</p>}
        <p className="mt-2 text-[10px]">Demo only. No sale, payment or stock change was saved. Not a tax invoice.</p>
      </div>
    </article>
  </ReceiptPreview>;
}
