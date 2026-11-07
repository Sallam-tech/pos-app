"use client";

import { useRef, useState, type Ref } from "react";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { matchesProductIdentity } from "@/lib/product-identity-preview";
import { additionalCheckoutProducts } from "@/lib/demo/checkout-products";
import { cn } from "@/lib/utils";
import { previewProducts, type PreviewProduct } from "@/lib/pos-preview";

export function ProductCombobox({ value, onChange, inputRef, invalid, describedBy, onQueryChange }: {
  value: PreviewProduct | null;
  onChange: (product: PreviewProduct | null) => void;
  inputRef: Ref<HTMLInputElement>;
  invalid: boolean;
  describedBy?: string;
  onQueryChange?: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const results = [...previewProducts, ...additionalCheckoutProducts].filter((product) => matchesProductIdentity(product, value ? "" : query));

  const highlighted = active >= 0 && active < results.length ? active : (query.trim() && results.length === 1 ? 0 : -1);

  function choose(product: PreviewProduct) {
    setQuery(product.name);
    onChange(product);
    setOpen(false);
  }

  function move(index: number) {
    setActive(index);
    optionRefs.current[index]?.scrollIntoView?.({ block: "nearest" });
  }

  return <div className="relative min-w-0" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <Input
      ref={inputRef}
      id="sale-product"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls="sale-products"
      aria-activedescendant={open && results[highlighted] ? "sale-option-" + results[highlighted].id : undefined}
      aria-required="true"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      autoComplete="off"
      placeholder="Search by product name or code"
      value={query}
      onFocus={() => { setOpen(Boolean(query.trim())); setActive(-1); }}
      onClick={() => setOpen(true)}
      onChange={(event) => { setQuery(event.target.value); onQueryChange?.(event.target.value); onChange(null); setOpen(true); setActive(-1); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.repeat || event.nativeEvent.isComposing)) { event.preventDefault(); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const next = event.key === "ArrowDown" ? (open ? Math.min(highlighted + 1, results.length - 1) : 0) : (open ? (highlighted < 0 ? results.length - 1 : Math.max(0, highlighted - 1)) : results.length - 1);
          setOpen(true);
          move(Math.max(0, next));
        } else if (open && (event.key === "Home" || event.key === "End") && results.length) {
          event.preventDefault();
          move(event.key === "Home" ? 0 : results.length - 1);
        } else if (event.key === "Enter") {
          event.preventDefault();
          if (open && results[highlighted]) choose(results[highlighted]);
        } else if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        } else if (event.key === "Tab") setOpen(false);
      }}
    />
    {open && <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-md border border-input bg-popover p-1 text-popover-foreground shadow-md">
      <ul id="sale-products" role="listbox" aria-label="Mock products">
        {results.map((product, index) => <li key={product.id} role="presentation">
          <button type="button" role="option" id={"sale-option-" + product.id}
            ref={(element) => { optionRefs.current[index] = element; }}
            aria-selected={value?.id === product.id} tabIndex={-1}
            className={cn("flex min-h-11 w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left", highlighted === index && "bg-accent")}
            onPointerDown={(event) => event.preventDefault()}
            onPointerMove={() => setActive(index)}
            onClick={() => choose(product)}
          >{product.name}{value?.id === product.id && <Icon name="check" />}</button>
        </li>)}
      </ul>
      {!results.length && <p role="status" className="px-3 py-3 text-sm text-muted-foreground">No matching mock products. Try another name.</p>}
    </div>}
    <span className="sr-only" role="status">{open && results.length ? results.length + " mock products found. Use arrow keys and Enter to choose." : ""}</span>
  </div>;
}
