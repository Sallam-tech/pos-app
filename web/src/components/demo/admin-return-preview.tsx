"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { findReturnInvoices, groupReturnInvoices, inspectCashRefund, inspectInvoiceRefund, recordedPaidAmount,
  refundLineKey, remainingReturnQuantity, type RefundSaleLine, type InvoiceRefundSelection } from "@/lib/return-refund-preview";
import { stepPreviewQuantity } from "@/lib/pos-preview";
import { formatDemoMoney } from "@/lib/demo/money";

type Review = ReturnType<typeof inspectInvoiceRefund>;
export function AdminReturnPreview({ sales, businessDateLabel }: { sales: readonly RefundSaleLine[]; businessDateLabel: string }) {
  const invoices = useMemo(() => groupReturnInvoices(sales), [sales]);
  const [selected, setSelected] = useState(""), [lookup, setLookup] = useState("");
  const [selection, setSelection] = useState<InvoiceRefundSelection>({});
  const [error, setError] = useState<string>();
  const [review, setReview] = useState<Review | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const submitting = useRef(false);
  const invoice = invoices.find((item) => item.id === selected);
  const matches = findReturnInvoices(invoices, lookup);
  const preview = inspectInvoiceRefund(invoice, selection);
  function changeSelection(next: InvoiceRefundSelection) { setSelection(next); setError(undefined); setReview(null); submitting.current = false; }
  function selectInvoice(id: string) { setSelected(id); changeSelection({}); }
  function changeQuantity(line: RefundSaleLine, value: string) {
    const key = refundLineKey(line), next = { ...selection };
    if (value.trim() === "0") delete next[key]; else next[key] = value;
    changeSelection(next);
  }
  function toggle(line: RefundSaleLine, checked: boolean) {
    const key = refundLineKey(line), next = { ...selection };
    if (checked) {
      const remaining = remainingReturnQuantity(line);
      next[key] = remaining !== null && Number(remaining) < 1 ? remaining : "1";
    } else delete next[key];
    changeSelection(next);
  }
  function step(line: RefundSaleLine, direction: 1 | -1) {
    const next = stepPreviewQuantity(selection[refundLineKey(line)] ?? "0", direction);
    return next === "0" || (next !== null && !inspectCashRefund(line, next).error) ? next : null;
  }
  function selectAll() {
    const next: Record<string, string> = {};
    for (const line of invoice?.lines ?? []) {
      const remaining = remainingReturnQuantity(line);
      if (remaining !== null && remaining !== "0") next[refundLineKey(line)] = remaining;
    }
    changeSelection(next);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    if (preview.error) {
      setError(preview.error);
      if (!invoice) searchRef.current?.focus();
      else if (preview.errorLineKey) quantityRefs.current[preview.errorLineKey]?.focus();
      else quantityRefs.current[refundLineKey(invoice.lines[0])]?.focus();
      return;
    }
    submitting.current = true; setError(undefined); setReview(preview);
  }
  function closeReview() { setReview(null); submitting.current = false; }
  function reset() { setLookup(""); setSelected(""); changeSelection({}); searchRef.current?.focus(); }
  return <div className="mx-auto max-w-4xl">
    <Card>
      <form data-unsaved-changes={Boolean(selected || lookup)} noValidate aria-label="Demo return review" onSubmit={submit} className="space-y-5">
        <div><CardTitle><label htmlFor="return-lookup">Find Original Sale</label></CardTitle>
          <Input ref={searchRef} id="return-lookup" type="search" className="mt-3" placeholder="Search invoice number or product name..." autoComplete="off" maxLength={120}
            value={lookup} aria-controls="return-matches" aria-invalid={Boolean(error && !invoice) || undefined} aria-describedby={error && !invoice ? "return-error" : "return-sample-date"}
            onChange={(event) => { setLookup(event.target.value); setSelected(""); changeSelection({}); }} />
          <p id="return-sample-date" className="mt-2 text-xs text-muted-foreground">Sample sales — {businessDateLabel}</p>
          {lookup.trim() && !invoice && <div id="return-matches" className="mt-3 max-h-60 overflow-y-auto rounded-md border">
            {matches.length ? <ul aria-label="Matching original sales" className="divide-y">{matches.map((item) => <li key={item.id}>
              <button type="button" className="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted"
                aria-label={"Select " + (item.receiptNumber || item.id) + " — " + item.lines.map((line) => line.productName).join(", ")}
                onClick={() => selectInvoice(item.id)}>
                <span className="min-w-0 break-words font-semibold">{item.receiptNumber || item.id}</span>
                <span className="min-w-0 break-words text-muted-foreground">{item.lines.map((line) => line.productName).join(", ")}</span>
              </button>
            </li>)}</ul> : <p role="status" className="p-3 text-sm text-muted-foreground">No original sales match this search.</p>}
          </div>}
        </div>
        {invoice && <section aria-label="Selected original invoice">
          <h3 className="mb-3 break-words font-semibold">Invoice: {invoice.receiptNumber || invoice.id}</h3>
          <div className="mb-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={Boolean(invoice.error)} onClick={selectAll}>Select All Remaining Items</Button>
            <Button variant="outline" size="sm" onClick={() => changeSelection({})}>Clear Selection</Button></div>
          <TableRegion label="Original invoice items">
            <Table className="min-w-[42rem]">
              <thead><tr>{["Select", "Product", "Sold Qty", "Return Qty", "Paid Price", "Refund"].map((label) => <TableHead key={label} className="px-2">{label}</TableHead>)}</tr></thead>
              <tbody>{invoice.lines.map((line, index) => {
                const key = refundLineKey(line), picked = selection[key] !== undefined, quantity = selection[key] ?? "0";
                const remaining = remainingReturnQuantity(line), unavailable = remaining === null || remaining === "0" || Boolean(invoice.error);
                const linePreview = picked ? inspectCashRefund(line, quantity) : null;
                const paid = recordedPaidAmount(line);
                const perUnit = paid !== null && Number.isSafeInteger(line.quantity) && line.quantity > 0 && paid % BigInt(line.quantity) === BigInt(0) ? paid / BigInt(line.quantity) : null;
                const name = line.productName + ", item " + (index + 1);
                return <tr key={key + index}>
                  <TableCell className="px-2"><label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                    <input type="checkbox" className="size-5 accent-primary" aria-label={"Select " + name} checked={picked} disabled={unavailable} onChange={(event) => toggle(line, event.target.checked)} />
                  </label></TableCell>
                  <TableCell className="max-w-52 px-2"><span className="break-words font-semibold">{line.productName}</span>
                    {line.priorReturns?.length ? <span className="mt-1 block text-xs text-muted-foreground">{remaining === null ? "Return history unavailable" : "Remaining: " + remaining}</span> : null}</TableCell>
                  <TableCell className="numeric px-2">{line.quantity}</TableCell>
                  <TableCell className="px-2"><div className="flex w-40 gap-1">
                    <Button variant="outline" size="sm" className="w-11 px-0" aria-label={"Decrease " + name + " return quantity"} disabled={unavailable || step(line, -1) === null} onClick={() => changeQuantity(line, step(line, -1)!)}>−</Button>
                    <Input ref={(element) => { quantityRefs.current[key] = element; }} className="numeric min-w-0 px-1 text-center" inputMode="decimal" autoComplete="off" maxLength={32}
                      aria-label={"Return Quantity — " + name} disabled={unavailable} value={quantity} onChange={(event) => changeQuantity(line, event.target.value)}
                      aria-invalid={Boolean(error && preview.errorLineKey === key) || undefined} aria-describedby={error && preview.errorLineKey === key ? "return-error" : undefined} />
                    <Button variant="outline" size="sm" className="w-11 px-0" aria-label={"Increase " + name + " return quantity"} disabled={unavailable || step(line, 1) === null} onClick={() => changeQuantity(line, step(line, 1)!)}>+</Button>
                  </div></TableCell>
                  <TableCell className="numeric px-2">{perUnit !== null ? formatDemoMoney(perUnit) : paid !== null ? <>{formatDemoMoney(paid)}<span className="block text-xs text-muted-foreground">Line paid total</span></> : "Not recorded"}</TableCell>
                  <TableCell className="numeric px-2 font-semibold"><output aria-label={"Refund — " + name}>{!picked ? formatDemoMoney(BigInt(0)) : linePreview?.refundPaise !== null && !linePreview?.error ? formatDemoMoney(linePreview!.refundPaise!) : "Refund amount unavailable"}</output></TableCell>
                </tr>;
              })}</tbody>
            </Table>
          </TableRegion>
          <p className="mt-2 text-xs text-muted-foreground">{invoice.lines.every((line) => line.priorReturns !== undefined)
            ? "Recorded prior returns are included." : "Prior returns are not recorded for every item; cumulative limits cannot be checked."}</p>
          {invoice.error && <p className="mt-2 text-sm text-danger">{invoice.error}</p>}
        </section>}
        {error && <p id="return-error" role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <span className="font-semibold">Total Cash Refund</span><output aria-label="Total Cash Refund" aria-live="polite" className="numeric text-xl font-bold text-primary">
            {preview.totalRefundPaise !== null ? formatDemoMoney(preview.totalRefundPaise) : preview.rows.length ? "Refund amount unavailable" : "Rs. 0.00"}
          </output>
        </div>
        <div className="flex flex-wrap gap-3"><Button type="submit">Review Refund</Button><Button variant="outline" onClick={reset}>Reset</Button></div>
        <p className="text-xs text-muted-foreground">Demo only — no refund or stock change saved.</p>
      </form>
    </Card>
    {review && invoice && <Dialog open onOpenChange={(open) => { if (!open) closeReview(); }} title="Refund Review — Demo Only"
      description="Preview only. No cash refund, inventory change or return record is saved.">
      <p className="mb-3 break-words text-sm font-semibold">Invoice: {invoice.receiptNumber || invoice.id}</p>
      <ul aria-label="Refund Summary" className="divide-y rounded-md border px-3">
        {review.rows.map(({ line, key, preview: item }) => <li key={key} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
          <span className="min-w-0 break-words font-semibold">{line.productName} × {item.returnedQuantity}</span>
          <span className="numeric font-semibold">{item.refundPaise === null ? "Refund amount unavailable" : formatDemoMoney(item.refundPaise)}</span>
          {item.reason && <p className="w-full text-xs text-muted-foreground">{item.reason}</p>}
        </li>)}
      </ul>
      <div className="mt-4 border-t pt-3"><p className="text-sm">Total Cash Refund</p>
        <p className="numeric mt-1 text-2xl font-bold">{review.totalRefundPaise === null ? "Refund amount unavailable" : formatDemoMoney(review.totalRefundPaise)}</p></div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Returned goods remain pending inspection. No items are added to sellable stock.</p>
      <Button className="mt-5" variant="outline" onClick={closeReview}>Done</Button>
    </Dialog>}
  </div>;
}
