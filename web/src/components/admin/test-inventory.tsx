"use client";
import Link from "next/link";
import {Select} from "@/components/ui/select";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { inventoryRead, money, paisa, whole, useInventoryMutation, type AdminProduct, type MutationResult, type ProductPage } from "@/lib/inventory/client";
function useProducts(query: string, stock: string, cursor: string, revision: number,status="ALL"): { page?: ProductPage; error?: boolean } {
 const key = JSON.stringify([query, stock, cursor, revision,status]);
 const [state, setState] = useState<{ key: string; page?: ProductPage; error?: boolean }>({ key: "" });
 useEffect(() => {
  const controller = new AbortController();
  const params = new URLSearchParams({ query, stock,status, limit: "50", ...(cursor ? { cursor } : {}) });
  const timer = setTimeout(() => { void inventoryRead<ProductPage>("/api/admin/inventory?" + params, controller.signal).then(page => setState({ key, page }), () => { if (!controller.signal.aborted) setState({ key, error: true }); }); }, 150);
  return () => { clearTimeout(timer); controller.abort(); };
 }, [query, stock, status, cursor, key]);
 return state.key === key ? state : {};
}
const status = (p: AdminProduct) => p.stockStatus === "OUT" ? "Out of Stock" : p.stockStatus === "LOW" ? "Low Stock" : "Available";
function Details({ id }: { id: string }) {
 const [state, setState] = useState<AdminProduct | null>(null), [error, setError] = useState(false);
 useEffect(() => { const controller = new AbortController(); void inventoryRead<AdminProduct>("/api/admin/products/" + id, controller.signal).then(setState, () => { if (!controller.signal.aborted) setError(true); }); return () => controller.abort(); }, [id]);
 if (error) return <p role="alert">Details unavailable.</p>;
 if (!state) return <p role="status">Loading details...</p>;
 return <dl className="grid gap-x-5 gap-y-2 border-t pt-3 sm:grid-cols-2">
  <div><dt className="text-xs text-muted-foreground">Buying Price</dt><dd>{money(state.buyingPricePaisa)}</dd></div><div><dt className="text-xs text-muted-foreground">Low Stock Alert</dt><dd>{state.lowStockThreshold}</dd></div>
  <div><dt className="text-xs text-muted-foreground">Category</dt><dd>{state.category ?? "Not set"}</dd></div><div><dt className="text-xs text-muted-foreground">Product Code</dt><dd className="break-all">{state.code}</dd></div><div><dt className="text-xs text-muted-foreground">Unit</dt><dd>{state.unit}</dd></div>
 </dl>;
}
function StockForm({ product, onClose, onSaved,controls=false }: { product: AdminProduct; onClose: () => void; onSaved: (r: MutationResult) => void;controls?:boolean }) {
 const [quantity, setQuantity] = useState(""), [cost, setCost] = useState(() => (BigInt(product.buyingPricePaisa) / BigInt(100)).toString() + "." + (BigInt(product.buyingPricePaisa) % BigInt(100)).toString().padStart(2, "0"));
 const [confirmed,setConfirmed]=useState(false),enteredCost=(()=>{try{return paisa(cost);}catch{return null;}})(),changesCost=enteredCost!==null&&enteredCost!==product.buyingPricePaisa;
 const [reason, setReason] = useState(""), [validation, setValidation] = useState<string | null>(null), mutation = useInventoryMutation(onSaved);
 return <form aria-label="Add stock" data-unsaved-changes={!!quantity || !!reason || mutation.uncertain} className="grid min-w-0 gap-4" onSubmit={event => {
  event.preventDefault(); setValidation(null);
  try { if (whole(quantity) === "0" || !reason||controls&&(enteredCost===null||BigInt(enteredCost)%BigInt(100)!==BigInt(0)||changesCost&&!confirmed)) throw Error(); void mutation.submit("/api/admin/products/" + product.id + "/receive", { productId: product.id, expectedProductVersion: product.productVersion, expectedBalanceVersion: product.balanceVersion, quantity, unitBuyingPricePaisa: paisa(cost), reason }); }
  catch { setValidation("Enter a positive whole quantity, buying price and reason."); }
 }}>
  <p>Current Stock: <strong>{product.quantity} {product.unit}</strong></p>
  <fieldset disabled={mutation.busy || mutation.uncertain} className="grid gap-4"><legend className="sr-only">Stock details</legend>
   <Field id="stock-purchase-quantity" label="Quantity Bought" hint="Whole PACK/BOX units only."><Input id="stock-purchase-quantity" autoComplete="off" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} /></Field>
   <Field id="stock-purchase-buyingPrice" label="Buying Price per Unit (Rs.)" hint={controls?"A changed buying price applies atomically to all remaining and received stock. Historical sold costs stay unchanged.":"Same approved buying cost only. Different-cost receiving is unavailable."}><Input id="stock-purchase-buyingPrice" autoComplete="off" inputMode="decimal" value={cost} onChange={e => {setCost(e.target.value);setConfirmed(false);}} /></Field>
   <Field id="stock-reason" label="Reason"><Input id="stock-reason" autoComplete="off" maxLength={160} value={reason} onChange={e => setReason(e.target.value)} /></Field>
   {controls&&changesCost&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm the receiving price applies to all remaining and new inventory.</label>}
  </fieldset>
  {(validation || mutation.error) && <p role="alert" className="text-sm text-danger">{validation || mutation.error}</p>}
  <div className="mt-1 flex flex-wrap justify-between gap-3 border-t pt-4"><Button variant="outline" disabled={mutation.busy} onClick={onClose}>{mutation.uncertain ? "Close" : "Cancel"}</Button><Button type="submit" disabled={mutation.busy || mutation.uncertain}>Add Stock</Button></div>
 </form>;
}
function Stock({ id, onClose, onSaved,controls=false }: { id: string; onClose: () => void; onSaved: (r: MutationResult) => void;controls?:boolean }) {
 const [product, setProduct] = useState<AdminProduct | null>(null), [error, setError] = useState(false);
 useEffect(() => { const c = new AbortController(); void inventoryRead<AdminProduct>("/api/admin/products/" + id, c.signal).then(setProduct, () => { if (!c.signal.aborted) setError(true); }); return () => c.abort(); }, [id]);
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }} title={"Add Stock" + (product ? " ? " + product.name : "")} description={controls?"Receive whole PACK/BOX stock; changed buying cost reprices all remaining inventory.":"Receive stock in the isolated TEST database. Same buying cost only."}>
  {error ? <p role="alert">Product unavailable. Refresh Products before retrying.</p> : product ? <StockForm controls={controls} product={product} onClose={onClose} onSaved={onSaved} /> : <p role="status">Loading product...</p>}
 </Dialog>;
}
export function TestInventory({ mode = "products",controls=false }: { mode?: "products" | "available" | "low";controls?:boolean }) {
 const [query, setQuery] = useState(""), [stock, setStock] = useState(mode === "low" ? "LOW" : "ALL"), [cursor, setCursor] = useState(""), [revision, setRevision] = useState(0);
 const [statusFilter,setStatusFilter]=useState("ALL");
 const [selected, setSelected] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [details, setDetails] = useState<string | null>(null);
 const state = useProducts(query, stock, cursor, revision,statusFilter), page = state.page;
 return <section aria-label={mode === "products" ? "Product list" : mode === "low" ? "Low-stock products" : "Inventory breakdown"}>
  {mode !== "products" && page && <dl aria-label="Overall inventory totals" className="mb-4 grid gap-3 sm:grid-cols-2"><div className="summary-panel py-3 px-4"><dt className="text-sm text-muted-foreground">Total Stock Units</dt><dd className="numeric text-2xl font-bold">{page.overall.quantity}</dd></div><div className="summary-panel py-3 px-4"><dt className="text-sm text-muted-foreground">Total Products</dt><dd className="numeric text-2xl font-bold">{page.overall.products}</dd></div><div className="summary-panel py-3 px-4"><dt className="text-sm text-muted-foreground">Stock Value</dt><dd className="numeric text-2xl font-bold">{money(page.overall.stockValuePaisa)}</dd></div></dl>}
  <label htmlFor="inventory-live-search" className="sr-only">Find product by name or code</label><Input id="inventory-live-search" type="search" maxLength={120} autoComplete="off" placeholder="Find product by name or code..." value={query} onChange={e => { setQuery(e.target.value); setCursor(""); }} />
  {controls&&mode==="products"&&<div className="mt-3"><Field id="product-status-filter" label="Product Status"><Select id="product-status-filter" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setCursor("");}}>{[["ALL","All Products"],["SELLING","Selling"],["STOPPED","Stopped"],["ARCHIVED","Archived"]].map(([v,label])=><option value={v} key={v}>{label}</option>)}</Select></Field></div>}
  {mode === "available" && <fieldset className="mt-3"><legend className="mb-2 text-sm font-semibold">Stock Status</legend><div className="flex flex-wrap gap-2">{[["ALL", "All Products"], ["AVAILABLE", "Available"], ["LOW", "Low Stock"], ["OUT", "Out of Stock"]].map(([value, label]) => <Button key={value} size="sm" variant={stock === value ? "default" : "outline"} aria-pressed={stock === value} onClick={() => { setStock(value); setCursor(""); }}>{label}</Button>)}</div></fieldset>}
  {notice && <p role="status" className="my-3 rounded-lg border bg-card p-3 text-sm">{notice}</p>}
  {state.error ? <p role="alert" className="my-3">Inventory unavailable. Your Admin session or database may be unavailable. <Button variant="outline" onClick={() => setRevision(n => n + 1)}>Retry</Button></p> : !page ? <p role="status" className="my-3">Loading inventory...</p> : <>
   <p role="status" className="my-3 text-xs text-muted-foreground">Showing {page.items.length} of {page.filtered.products} TEST products.</p>
   {mode === "products" ? <div className="grid gap-3">{page.items.map(p => <article key={p.id} aria-label={p.name} className="min-w-0 rounded-xl border bg-card p-4 text-card-foreground">
    <div className="flex min-w-0 items-start justify-between gap-4"><div><h3 className="break-words text-base font-semibold">{p.name}</h3><p className={"mt-1 text-sm font-medium " + (p.stockStatus === "OUT" ? "text-danger" : p.stockStatus === "LOW" ? "text-warning" : "text-success")}>{status(p)}</p>{controls&&<p className="mt-1 text-xs text-muted-foreground">{p.archivedAtMs!==null?"Archived":p.sellingActive?"Selling":"Stopped"}{p.priceNeedsReview?" · Price needs review":""}</p>}</div><dl className="text-right"><dt className="text-xs text-muted-foreground">Selling Price</dt><dd className="numeric mt-1 font-semibold">{money(p.sellingPricePaisa)}</dd></dl></div>
    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><dl><dt className="text-xs text-muted-foreground">Available Stock</dt><dd className="numeric mt-1 font-semibold">{p.quantity} {p.unit}</dd></dl><details className="optional-details min-w-0 text-sm" onToggle={e => { if (e.currentTarget.open) setDetails(p.id); }}><summary aria-label={"Details for " + p.name}>Details</summary>{details === p.id && <Details id={p.id} />}</details><div className="flex gap-2"><Button variant="outline" size="sm" aria-label={"Add stock for " + p.name} disabled={p.archivedAtMs!==null} onClick={() => setSelected(p.id)}>Stock</Button>{controls?<Button size="sm" asChild><Link prefetch={false} href={"/admin/products/"+p.id+"/edit"}>Edit</Link></Button>:<Button size="sm" disabled title="Metadata editing is outside this TEST slice.">Edit</Button>}</div></div>
   </article>)}</div> : <TableRegion label="Inventory results"><Table className="min-w-[26rem]"><caption className="sr-only">TEST inventory</caption><thead><tr><TableHead>Product Name</TableHead><TableHead className="text-center">Available Quantity</TableHead>{mode === "low" && <TableHead>Low-stock threshold</TableHead>}<TableHead className="text-right">Stock Status</TableHead></tr></thead><tbody>{page.items.map(p => <tr key={p.id}><th scope="row" className="border-t font-semibold">{p.name}</th><TableCell className="numeric text-center">{p.quantity}</TableCell>{mode === "low" && <TableCell>{p.lowStockThreshold}</TableCell>}<TableCell className="text-right"><Badge tone={p.stockStatus === "OUT" ? "danger" : p.stockStatus === "LOW" ? "warning" : "success"}>{status(p)}</Badge></TableCell></tr>)}</tbody></Table></TableRegion>}
   {!page.items.length && <p className="rounded-md border bg-card p-4 text-sm">No saved products match this view.</p>}
   <div className="mt-3 flex gap-3">{cursor && <Button variant="outline" onClick={() => setCursor("")}>First page</Button>}{page.nextCursor && <Button variant="outline" onClick={() => setCursor(page.nextCursor!)}>Next page</Button>}</div>
  </>}
  {selected && <Stock controls={controls} id={selected} onClose={() => setSelected(null)} onSaved={result => { setSelected(null); setNotice("Confirmed saved stock for " + result.product.name + ". Inventory refreshed from SQLite."); setRevision(n => n + 1); }} />}
 </section>;
}
