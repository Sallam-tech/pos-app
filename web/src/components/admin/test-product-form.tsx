"use client";
import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { paisa, whole, useInventoryMutation, type MutationResult } from "@/lib/inventory/client";
const fields = [
 ["name", "Product Name"], ["purchaseCost", "Buying Price (Rs.)"], ["suggestedSellingPrice", "Selling Price (Rs.)"],
 ["initialQuantity", "Stock Quantity"], ["lowStockThreshold", "Low Stock Alert"], ["category", "Category"],
] as const;
const emptyValues = { name: "", purchaseCost: "", suggestedSellingPrice: "", initialQuantity: "", lowStockThreshold: "0", category: "", code: "", unit: "PACK" };
export function TestProductForm() {
 const [values, setValues] = useState(emptyValues);
 const [fieldErrors, setFieldErrors] = useState<Partial<Record<typeof fields[number][0], string>>>({});
 const [validation, setValidation] = useState<string | null>(null), [saved, setSaved] = useState<MutationResult | null>(null);
 const form = useRef<HTMLFormElement>(null);
 const onSaved = useCallback((result: MutationResult) => {
  setSaved(result); setValues(emptyValues); setValidation(null);
  // Fields are re-enabled on the next render; focus then so another product can be typed at once.
  setTimeout(() => form.current?.querySelector<HTMLInputElement>("input")?.focus(), 0);
 }, []);
 const mutation = useInventoryMutation(onSaved);
 function submit(event: FormEvent) {
  event.preventDefault(); setValidation(null);
  const errors: Partial<Record<typeof fields[number][0], string>> = {};
  function parse(name: typeof fields[number][0], value: string, money: boolean) {
   try { return money ? paisa(value.trim()) : whole(value.trim()); }
   catch { errors[name] = money ? "Enter a price greater than 0, with at most 2 decimal places." : "Enter a whole quantity of 0 or more for PACK/BOX."; return null; }
  }
  const name = values.name.trim();
  if (!name) errors.name = "Enter a product name.";
  const buying = parse("purchaseCost", values.purchaseCost, true);
  const selling = values.suggestedSellingPrice.trim() === "" ? null : parse("suggestedSellingPrice", values.suggestedSellingPrice, true);
  const quantity = parse("initialQuantity", values.initialQuantity, false);
  const lowStock = parse("lowStockThreshold", values.lowStockThreshold.trim() || "0", false);
  if (buying !== null && selling !== null && BigInt(selling) < BigInt(buying)) errors.suggestedSellingPrice = "Selling price must be at least the buying price.";
  setFieldErrors(errors);
  const invalid = fields.find(([key]) => errors[key]);
  if (invalid || buying === null || quantity === null || lowStock === null) {
   setValidation("Please correct the marked fields.");
   if (invalid) form.current?.querySelector<HTMLInputElement>('[name="' + invalid[0] + '"]')?.focus();
   return;
  }
  void mutation.submit("/api/admin/products", { name, category: values.category || null,
   ...(values.code ? { code: values.code } : {}), unit: values.unit, buyingPricePaisa: buying, sellingPricePaisa: selling,
   sellingActive: selling !== null, openingQuantity: quantity, lowStockThreshold: lowStock });
 }
 function field(name: typeof fields[number][0]) {
  const entry = fields.find(f => f[0] === name)!, optional = name === "category" || name === "suggestedSellingPrice" || name === "lowStockThreshold";
  return <Field id={"new-product-" + name} label={entry[1] + (optional ? "" : " *")} error={fieldErrors[name]} hint={name === "suggestedSellingPrice" ? "Optional. Without a price, selling stays stopped." : name === "lowStockThreshold" ? "Optional. Leave blank for 0 (no low stock alert)." : name === "initialQuantity" ? "Whole PACK/BOX units only." : undefined}>
   <Input id={"new-product-" + name} name={name} value={values[name]} autoComplete="off" required={!optional} maxLength={name === "name" ? 120 : name === "category" ? 80 : 16}
    aria-invalid={!!fieldErrors[name] || undefined} aria-describedby={fieldErrors[name] ? "new-product-" + name + "-error" : undefined}
    inputMode={name === "name" || name === "category" ? undefined : "decimal"}
    onChange={event => { setSaved(null); setValidation(null); setFieldErrors(previous => ({ ...previous, [name]: undefined })); setValues(previous => ({ ...previous, [name]: event.target.value })); }} />
  </Field>;
 }
 return <Card className="max-w-3xl shadow-none">
  <form ref={form} onSubmit={submit} noValidate aria-label="Add product" data-unsaved-changes={mutation.uncertain || Object.values(values).some(v => v && v !== "PACK")}>
   <fieldset disabled={mutation.busy || mutation.uncertain} className="grid min-w-0 gap-5">
    <legend className="sr-only">Product details</legend><p className="text-sm text-muted-foreground">Fields marked * are required.</p>
    {field("name")}<div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">{field("purchaseCost")}{field("suggestedSellingPrice")}</div>
    <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">{field("initialQuantity")}<Field id="product-unit" label="Unit *"><Select id="product-unit" name="unitLabel" value={values.unit} onChange={event => setValues(v => ({ ...v, unit: event.target.value }))}><option value="PACK">Pack</option><option value="BOX">Box</option></Select></Field></div>
    {field("lowStockThreshold")}
    <details className="optional-details border-y"><summary>More Details (Optional)</summary><div className="grid min-w-0 items-start gap-4 pb-4 sm:grid-cols-2">{field("category")}<Field id="product-code" label="Product Code (Optional)" hint="Leave empty for an automatic code like DIA-001 (first 3 letters + number)."><Input id="product-code" name="productCode" value={values.code} autoComplete="off" maxLength={32} onChange={event => setValues(v => ({ ...v, code: event.target.value }))} /></Field></div></details>
   </fieldset>
   <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><Button asChild variant="outline"><Link href="/admin/products" prefetch={false}>Cancel</Link></Button><Button type="submit" disabled={mutation.busy || mutation.uncertain}>{mutation.busy ? "Saving..." : "Save Product"}</Button></div>
   <p className="mt-3 text-xs text-muted-foreground">Test mode: practice data only.</p>
   {(validation || mutation.error) && <p role="alert" className="mt-3 text-sm text-danger">{validation || mutation.error}</p>}
  </form>
  {saved && <p role="status" className="mt-5 rounded-md border border-primary bg-accent p-4 text-sm">Saved <strong>{saved.product.name}</strong> to the TEST database. <Link href="/admin/products" prefetch={false} className="underline">View Products</Link></p>}
 </Card>;
}
