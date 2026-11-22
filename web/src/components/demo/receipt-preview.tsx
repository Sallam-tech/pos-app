"use client";

import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { DeveloperCredit } from "./developer-credit";

export function ReceiptPreview({ children, triggerLabel, triggerDescription, backLabel, triggerClassName, open: controlledOpen, onOpenChange, title = "Sample Receipt", description = "Sample only. Printing opens your browser print dialog.", actionsAbove = false, initialLayout = "ordinary", beforeReceipt, extraActions, printDisabled = false, onDone, developerCredit = false, onLayoutChange, thermalOnly = false }: {
  onLayoutChange?: (layout: "ordinary" | "compact") => void; thermalOnly?: boolean;
  beforeReceipt?: ReactNode; extraActions?: ReactNode; printDisabled?: boolean; onDone?: () => void; developerCredit?: boolean;
  children: ReactNode; triggerLabel?: string; triggerDescription?: string; backLabel: string; triggerClassName?: string;
  open?: boolean; onOpenChange?: (open: boolean) => void; title?: string; description?: string; actionsAbove?: boolean; initialLayout?: "ordinary" | "compact";
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const [selectedLayout, setLayout] = useState<"ordinary" | "compact" | null>(null);
  const compact = thermalOnly || (selectedLayout ?? initialLayout) === "compact";
  const layoutId = useId();
  const [printError, setPrintError] = useState(false);
  const printReceipt = () => {
    setPrintError(false);
    try { window.print(); } catch { setPrintError(true); }
  };
  const actions = <div data-receipt-actions className="flex flex-wrap gap-3">
    <Button className="min-w-28" disabled={printDisabled} onClick={printReceipt} autoFocus={thermalOnly}>Print</Button>
    <Button className="min-w-28" variant="outline" title={backLabel} onClick={onDone ?? (() => setOpen(false))}>Done</Button>
    {extraActions}
    {printError && <p role="alert" className="basis-full text-sm text-danger">The print dialog could not open. Try Print again.</p>}
  </div>;
  return <>
    {controlledOpen === undefined && <Button variant="outline" className={triggerClassName} aria-label={triggerDescription} onClick={() => setOpen(true)}>{triggerLabel}</Button>}
    {open && <Dialog open={open} onOpenChange={setOpen} title={title} description={description}>
      {actionsAbove && <div className="mb-4">{actions}</div>}
      {!thermalOnly && <><label htmlFor={layoutId} className="mb-2 block font-semibold">Print layout</label>
      <Select id={layoutId} value={compact ? "compact" : "ordinary"} onChange={(event) => { const layout = event.target.value === "compact" ? "compact" : "ordinary"; setLayout(layout); onLayoutChange?.(layout); }} className="mb-5">
        <option value="ordinary">Ordinary page</option><option value="compact">Compact receipt (80 mm)</option>
      </Select></>}
      {beforeReceipt}
      <div className={thermalOnly ? "receipt-sheet thermal-paper mx-auto rounded-md border" : "receipt-sheet rounded-md border p-4 sm:p-6"}>{children}{developerCredit && <DeveloperCredit />}</div>
      {!actionsAbove && <div className="mt-5">{actions}</div>}
    </Dialog>}
    {open && createPortal(<div id="shop-pos-print-receipt" style={{ display: "none" }} data-layout={compact ? "compact" : "ordinary"}>
      {children}{developerCredit && <DeveloperCredit />}
      <style>{`@media print {
        @page { ${compact ? "size: 80mm auto; margin: 0;" : "margin: 10mm;"} }
        body > :not(#shop-pos-print-receipt) { display: none !important; }
        #shop-pos-print-receipt { display: block !important; color: #111; background: white; font: 12pt/1.5 system-ui,sans-serif; padding: 8mm; width: 100%; }
        #shop-pos-print-receipt[data-layout="compact"] { width: 72mm; max-width: 72mm; margin: 0 auto; padding: 2mm 0; font: 9pt/1.3 ui-monospace,Consolas,monospace; }
        #shop-pos-print-receipt table { width: 100%; }
        #shop-pos-print-receipt * { color: #111 !important; background: white !important; overflow-wrap: anywhere; }
      }`}</style>
    </div>, document.body)}
  </>;
}
