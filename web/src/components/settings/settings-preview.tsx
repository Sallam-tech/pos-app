"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeading } from "@/components/shell/page-heading";
import { ReceiptPreview } from "@/components/demo/receipt-preview";
import { ReceiptShopFooter, ReceiptShopHeader } from "./shop-identity";
import { PasswordSecurityPreview } from "./password-security-preview";
import { saveShopSettings, useShopSettings } from "./use-shop-settings";
import { normalizeShopSettings, validateShopSettings, type ShopDisplaySettings, type ShopSettingsErrors } from "@/lib/shop-display-settings";

function ShopDetailsForm({ saved, onSaved, onEdit }: { saved: ShopDisplaySettings; onSaved: (success: boolean) => void; onEdit: () => void }) {
  const [values, setValues] = useState(saved);
  const [errors, setErrors] = useState<ShopSettingsErrors>({});
  const form = useRef<HTMLFormElement>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = validateShopSettings(values); setErrors(next);
    const first = Object.keys(next)[0];
    if (first) { (form.current?.elements.namedItem(first) as HTMLInputElement | null)?.focus(); return; }
    onSaved(saveShopSettings(values));
  }
  function field(key: "shopName" | "address" | "phone" | "footer", label: string, limit: number, placeholder?: string) {
    const id = "shop-setting-" + key;
    return <div className="settings-field"><Field id={id} label={label} error={errors[key]}>
      <Input id={id} name={key} value={values[key]} maxLength={limit} required={key === "shopName"} autoComplete="off"
        type={key === "phone" ? "tel" : "text"} placeholder={placeholder} className="min-h-11"
        aria-invalid={Boolean(errors[key]) || undefined} aria-describedby={errors[key] ? id + "-error" : undefined}
        onChange={(event) => { const next = { ...values, [key]: event.target.value }; setValues(next); onEdit(); if (errors[key]) setErrors(validateShopSettings(next)); }} />
    </Field></div>;
  }
  return <form ref={form} noValidate aria-label="Shop and receipt settings" onSubmit={submit} className="settings-details-form mt-3 grid gap-3"
    data-unsaved-changes={JSON.stringify(normalizeShopSettings(values)) !== JSON.stringify(saved)}>
    {field("shopName", "Shop Name", 80)}
    <div className="grid items-start gap-3 sm:grid-cols-2">
      {field("phone", "Phone Number", 32, "03xx-xxxxxxx")}
      <div className="settings-field"><Field id="shop-setting-receiptLayout" label="Receipt Paper" error={errors.receiptLayout}>
        <Select id="shop-setting-receiptLayout" name="receiptLayout" value={values.receiptLayout} className="min-h-11"
          onChange={(event) => { setValues((previous) => ({ ...previous, receiptLayout: event.target.value as ShopDisplaySettings["receiptLayout"] })); onEdit(); }}>
          <option value="ordinary">Ordinary page</option><option value="compact">Compact receipt (80 mm)</option>
        </Select>
      </Field></div>
    </div>
    {field("address", "Shop Address", 240, "Enter shop address")}
    {field("footer", "Receipt Message", 160, "Thank you for shopping with us!")}
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <ReceiptPreview developerCredit triggerLabel="Preview Receipt" backLabel="Back to Settings" initialLayout={saved.receiptLayout}
        triggerClassName="border-0 bg-transparent px-0 text-sm font-medium text-primary hover:bg-transparent"
        description="Saved shop details only. Browser print preview; physical printer compatibility is untested. No transaction or invoice number.">
        <article className="sample-receipt-content grid gap-4 text-center"><ReceiptShopHeader />
          <p className="font-semibold">RECEIPT LAYOUT PREVIEW</p><p className="text-sm">No sale attached. No invoice issued.</p>
          <ReceiptShopFooter fallback="Thank you for shopping with us." /></article>
      </ReceiptPreview>
      <Button type="submit" size="sm">Save Settings</Button>
    </div>
  </form>;
}
export function SettingsPreview() {
  const settings = useShopSettings();
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  return <div className="mx-auto w-full max-w-3xl">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <PageHeading route="/admin/settings" className="text-xl font-semibold tracking-tight">Settings</PageHeading>
      <span className="text-xs text-muted-foreground">Shop Settings</span>
    </div>
    <div className="grid gap-3">
      <Card className="p-4 sm:p-5">
        <h2 className="text-base font-semibold">Shop &amp; Receipt Details</h2>
        <ShopDetailsForm key={JSON.stringify(settings)} saved={settings} onEdit={() => setMessage("")}
          onSaved={(success) => { setFailed(!success); setMessage(success ? "Settings saved on this browser only." : "Settings could not be saved. Browser storage is unavailable."); }} />
        {message && <p role={failed ? "alert" : "status"} className={"mt-2 text-sm " + (failed ? "text-danger" : "text-success")}>{message}</p>}
      </Card>
      <PasswordSecurityPreview />
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Automatic Backup</h2><span className="text-xs text-muted-foreground">Setup pending</span></div>
        <p className="mt-2 text-sm leading-5 text-muted-foreground">Daily backup and restore options will become available with the local database.</p>
      </Card>
    </div>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">Demo settings are saved in this browser only, not shared across devices. Currency stays PKR (Rs.).</p>
  </div>;
}
