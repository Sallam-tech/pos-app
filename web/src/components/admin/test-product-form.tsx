"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
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
export function TestProductForm() {
 const [values, setValues] = useState({ name: "", purchaseCost: "", suggestedSellingPrice: "", initialQuantity: "", lowStockThreshold: "", category: "", code: "", unit: "PACK" });
 const [validation, setValidation] = useState<string | null>(null), [saved, setSaved] = useState<MutationResult | null>(null);
 const form = useRef<HTMLFormElement>(null), mutation = useInventoryMutation(setSaved);
 function submit(event: FormEvent) {
  event.preventDefault(); setValidation(null);
  try {
   if (!values.name || values.name !== values.name.trim()) throw Error();
   const buying = paisa(values.purchaseCost), selling = values.suggestedSellingPrice === "" ? null : paisa(values.suggestedSellingPrice);
   if (selling !== null && BigInt(selling) < BigInt(buying)) throw Error();
   void mutation.submit("/api/admin/products", { name: values.name, category: values.category || null,
    ...(values.code ? { code: values.code } : {}), unit: values.unit, buyingPricePaisa: buying, sellingPricePaisa: selling,
    sellingActive: selling !== null, openingQuantity: whole(values.initialQuantity), lowStockThreshold: whole(values.lowStockThreshold) });
  } catch { setValidation("Check required fields, positive prices and whole PACK/BOX quantities. Selling price cannot be below buying price."); form.current?.querySelector<HTMLInputElement>("input")?.focus(); }
 }
 function field(name: typeof fields[number][0]) {
  const entry = fields.find(f => f[0] === name)!, optional = name === "category" || name === "suggestedSellingPrice";
  return <Field id={"new-product-" + name} label={entry[1] + (optional ? "" : " *")} hint={name === "suggestedSellingPrice" ? "Optional. Without a price, selling stays stopped." : name === "initialQuantity" || name === "lowStockThreshold" ? "Whole PACK/BOX units only." : undefined}>
   <Input id={"new-product-" + name} name={name} value={values[name]} autoComplete="off" required={!optional} maxLength={name === "name" ? 120 : name === "category" ? 80 : 16}
    inputMode={name === "name" || name === "category" ? undefined : "decimal"}
    onChange={event => setValues(previous => ({ ...previous, [name]: event.target.value }))} />
  </Field>;
 }
 return <Card className="max-w-3xl shadow-none">
  <form ref={form} onSubmit={submit} noValidate aria-label="Add product" data-unsaved-changes={mutation.uncertain || (!saved && Object.values(values).some(v => v && v !== "PACK"))}>
   <fieldset disabled={mutation.busy || mutation.uncertain || !!saved} className="grid min-w-0 gap-5">
    <legend className="sr-only">Product details</legend><p className="text-sm text-muted-foreground">Fields marked * are required.</p>
    {field("name")}<div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">{field("purchaseCost")}{field("suggestedSellingPrice")}</div>
    <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">{field("initialQuantity")}<Field id="product-unit" label="Unit *"><Select id="product-unit" name="unitLabel" value={values.unit} onChange={event => setValues(v => ({ ...v, unit: event.target.value }))}><option value="PACK">Pack</option><option value="BOX">Box</option></Select></Field></div>
    {field("lowStockThreshold")}
    <details className="optional-details border-y"><summary>More Details (Optional)</summary><div className="grid min-w-0 items-start gap-4 pb-4 sm:grid-cols-2">{field("category")}<Field id="product-code" label="Product Code (Optional)" hint="Leave empty for an automatic unique code."><Input id="product-code" name="productCode" value={values.code} autoComplete="off" maxLength={32} onChange={event => setValues(v => ({ ...v, code: event.target.value }))} /></Field></div></details>
   </fieldset>
   <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><Button asChild variant="outline"><Link href="/admin/products" prefetch={false}>Cancel</Link></Button><Button type="submit" disabled={mutation.busy || mutation.uncertain || !!saved}>{mutation.busy ? "Saving..." : "Save Product"}</Button></div>
   <p className="mt-3 text-xs text-muted-foreground">Isolated TEST database only. No production shop data.</p>
   {(validation || mutation.error) && <p role="alert" className="mt-3 text-sm text-danger">{validation || mutation.error}</p>}
  </form>
  {saved && <p role="status" className="mt-5 rounded-md border border-primary bg-accent p-4 text-sm">Saved <strong>{saved.product.name}</strong> to the TEST database. <Link href="/admin/products" prefetch={false} className="underline">View Products</Link></p>}
 </Card>;
}
