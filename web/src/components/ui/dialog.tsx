"use client";

import { useEffect, useId, useRef, type ReactNode, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function Dialog({ open, onOpenChange, title, description, children, variant = "dialog" }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; variant?: "dialog" | "drawer";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLElement>("[data-dialog-close]")?.focus();
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  function keepFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])') ?? [])
      .filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-disabled") !== "true");
    const first = elements[0], last = elements.at(-1);
    if (!first) { event.preventDefault(); ref.current?.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return <dialog ref={ref} className="ui-dialog" data-variant={variant} aria-labelledby={id + "-title"} aria-describedby={id + "-description"} onKeyDown={keepFocus}
    onCancel={(event) => { event.preventDefault(); onOpenChange(false); }}>
    <div className="mb-2 flex items-start justify-between gap-3">
      <h2 id={id + "-title"} className="section-title pt-2">{title}</h2>
      <Button data-dialog-close variant="ghost" size="icon" aria-label="Close dialog" onClick={() => onOpenChange(false)}><Icon name="close" /></Button>
    </div>
    <p id={id + "-description"} className="mb-6 text-sm leading-6 text-muted-foreground">{description}</p>
    {children}
  </dialog>;
}
