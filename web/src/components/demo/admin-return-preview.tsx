"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { inspectDemoReturn, type DemoReturnSale, type ReturnPreview } from "@/lib/demo/admin-preview";
import { proposedStockTreatment, validateReturnCondition, type ReturnCondition } from "@/lib/return-condition-preview";
import { formatDemoMoney } from "@/lib/demo/money";

export function AdminReturnPreview({ sales, businessDateLabel }: { sales: readonly DemoReturnSale[]; businessDateLabel: string }) {
  const [saleId, setSaleId] = useState("");
  const [lookup, setLookup] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState<ReturnCondition>("");
  const [conditionError, setConditionError] = useState<string | undefined>();
  const [result, setResult] = useState<ReturnPreview | null>(null);
  const sale = sales.find((item) => item.id === saleId);
  const conditionRef = useRef<HTMLSelectElement>(null);
  const saleRef = useRef<HTMLSelectElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (result && !result.error) reviewRef.current?.focus(); }, [result]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = inspectDemoReturn(sale, quantity);
    const nextConditionError = validateReturnCondition(condition);
    setConditionError(next.error ? undefined : nextConditionError);
    if (next.error) { setResult(next); if (!sale) saleRef.current?.focus(); else quantityRef.current?.focus(); return; }
    if (nextConditionError) { setResult(null); conditionRef.current?.focus(); return; }
    setResult(next);
  }
  function reset() { setLookup(""); setSaleId(""); setQuantity("1"); setCondition(""); setConditionError(undefined); setResult(null); saleRef.current?.focus(); }
  return <div className="mx-auto grid max-w-3xl gap-4">
    <Card>
      <CardTitle>Choose the original sale</CardTitle>
      <p className="mb-5 mt-2 text-sm leading-6 text-muted-foreground">Sample sales from {businessDateLabel}. Each sale contains one product.</p>
      <form data-unsaved-changes={Boolean(saleId || lookup || quantity !== "1" || condition)} noValidate aria-label="Demo return review" onSubmit={submit} className="space-y-5">
        <div><label htmlFor="return-lookup" className="mb-2 block text-base font-semibold">Find Sale</label>
          <Input id="return-lookup" type="search" placeholder="e.g. demo-sale-1" value={lookup} onChange={(event) => { setLookup(event.target.value); setSaleId(""); setResult(null); }} aria-controls="return-sale" aria-describedby="return-lookup-hint" />
          <p id="return-lookup-hint" className="mt-2 text-sm text-muted-foreground">Search by demo sale ID; official receipt numbers are not recorded.</p>
        </div>
        <div>
          <label htmlFor="return-sale" className="mb-2 block text-base font-semibold">Product / original sale</label>
          <Select ref={saleRef} id="return-sale" value={saleId} onChange={(event) => { setSaleId(event.target.value); setResult(null); }} aria-invalid={!!result?.error && !sale} aria-describedby={!sale && result?.error ? "return-error" : undefined}>
            <option value="">Choose a demo sale</option>
            {sales.filter((item) => item.id.toLowerCase().includes(lookup.trim().toLowerCase())).map((item) => <option key={item.id} value={item.id}>{item.id} - {item.productName} - {item.quantity} units at {formatDemoMoney(BigInt(item.unitPricePaise))}</option>)}
          </Select>
        </div>
        {lookup && !sales.some((item) => item.id.toLowerCase().includes(lookup.trim().toLowerCase())) && <p role="status" className="text-sm text-muted-foreground">No original demo sales match this ID.</p>}
        {sale && <dl className="grid gap-x-6 gap-y-4 rounded-lg border bg-muted/50 p-4 sm:grid-cols-2">
          <div><dt className="text-sm text-muted-foreground">Product in this sale</dt><dd className="mt-1 font-semibold">{sale.productName}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Original quantity sold</dt><dd className="numeric mt-1 font-semibold">{sale.quantity}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Recorded selling price per unit</dt><dd className="numeric mt-1 font-semibold">{formatDemoMoney(BigInt(sale.unitPricePaise))}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Original recorded line amount</dt><dd className="numeric mt-1 font-semibold">{formatDemoMoney(BigInt(sale.quantity) * BigInt(sale.unitPricePaise))}</dd></div>
        </dl>}
        <div>
          <label htmlFor="return-quantity" className="mb-2 block text-base font-semibold">Return Quantity</label>
          <Input ref={quantityRef} id="return-quantity" inputMode="decimal" autoComplete="off" value={quantity} onChange={(event) => { setQuantity(event.target.value); setResult(null); }} aria-invalid={!!result?.error && !!sale} aria-describedby={sale && result?.error ? "return-error" : "return-quantity-hint"} />
          <p id="return-quantity-hint" className="mt-2 text-sm leading-5 text-muted-foreground">Up to the quantity sold. Prior returns are not recorded; cumulative limits cannot be checked. Fractional quantities are illustrative.</p>
        </div>
        <div>
          <label htmlFor="return-condition" className="mb-2 block text-base font-semibold">Item Condition (optional)</label>
          <Select ref={conditionRef} id="return-condition" value={condition} onChange={(event) => { setCondition(event.target.value as ReturnCondition); setConditionError(undefined); setResult(null); }} aria-invalid={Boolean(conditionError) || undefined} aria-describedby={conditionError ? "return-condition-error" : "return-condition-hint"}>
            <option value="">Not specified</option><option value="good">Good / Can be sold again</option><option value="damaged">Damaged / Cannot be sold again</option>
          </Select>
          <p id="return-condition-hint" className="mt-2 text-sm text-muted-foreground">{proposedStockTreatment(condition)}</p>
          {conditionError && <p id="return-condition-error" role="alert" className="mt-2 text-sm text-danger">{conditionError}</p>}
        </div>
        {result?.error && <p id="return-error" role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{result.error}</p>}
        <div className="flex flex-wrap gap-3 border-t pt-4">
          <Button type="submit" className="text-base">Review Return</Button>
          <Button variant="outline" className="text-base" onClick={reset}>Reset Return Preview</Button>
        </div>
        <p className="text-sm leading-5 text-muted-foreground">Preview only. No refund or stock adjustment is recorded.</p>
      </form>
    </Card>
    {result && !result.error && sale && <Card aria-label="Return preview">
      <>
        <h2 ref={reviewRef} tabIndex={-1} className="section-title">Return Review - Demo Only</h2>
        <dl className="my-5 space-y-4">
          <div><dt className="text-sm text-muted-foreground">Original demo sale ID</dt><dd className="mt-1 font-semibold">{sale.id}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Item condition</dt><dd className="mt-1 font-semibold">{condition === "good" ? "Good / Can be sold again" : condition === "damaged" ? "Damaged / Cannot be sold again" : "Not specified"}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Proposed stock treatment</dt><dd className="mt-1 font-semibold">{proposedStockTreatment(condition)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-sm text-muted-foreground">Product</dt><dd className="font-semibold">{sale.productName}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-sm text-muted-foreground">Proposed return quantity</dt><dd className="numeric font-semibold">{result.returnedQuantity}</dd></div>
          <div className="border-t pt-4"><dt className="text-sm text-muted-foreground">Recorded price x selected quantity</dt><dd className="numeric mt-1 text-2xl font-bold">{formatDemoMoney(result.originalAmountPaise!)}</dd></div>
        </dl>
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="font-semibold">Refund amount not available for this demo sale.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Original discount and refund terms are missing. The recorded amount above is a reference only, not an approved refund.</p>
        </div>
        <p role="status" className="mt-4 text-sm font-semibold">Demo only — no refund or stock change was saved.</p>
      </>
    </Card>}
  </div>;
}
