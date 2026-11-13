"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { validatePasswordPreview } from "@/lib/shop-display-settings";

type Live={blocked:boolean;onChange:(target:"Admin"|"Salesperson",password:string,newPassword:string)=>Promise<void>};
function PasswordDialog({ role, onClose, live }: { role: "Admin" | "Salesperson"; onClose: () => void;live?:Live }) {
  const [current,setCurrent]=useState("");
  const [values, setValues] = useState({ password: "", confirmation: "" });
  const [visible, setVisible] = useState({ password: false, confirmation: false });
  const [touched, setTouched] = useState({ password: false, confirmation: false });
  const errors = validatePasswordPreview(values.password, values.confirmation);
  const form = useRef<HTMLFormElement>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched({ password: true, confirmation: true });
    const field = errors.password ? "password" : errors.confirmation ? "confirmation" : null;
    if (field) (form.current?.elements.namedItem(field) as HTMLInputElement | null)?.focus();
    else if(live&&!live.blocked&&current){const pw=current,next=values.password;setCurrent("");setValues({password:"",confirmation:""});void live.onChange(role,pw,next);onClose();}
  }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title={role + " Password"}
    description={live?"Signed Admin and fresh current Admin proof required. Saved once; original-key recovery after interruption.":"Secure setup pending. UI preview only: use made-up text. No password is checked, sent, saved or changed."}>
    <form ref={form} autoComplete="off" noValidate onSubmit={submit} className="grid gap-4">
      {live&&<Field id="security-current-admin" label="Current Admin password"><Input id="security-current-admin" type="password" value={current} autoComplete="off" onChange={e=>setCurrent(e.target.value)} /></Field>}
      {(["password", "confirmation"] as const).map((key) => {
        const label = key === "password" ? "New password" : "Confirm password";
        const id = "security-preview-" + key;
        return <Field key={key} id={id} label={label} error={touched[key] ? errors[key] : undefined}
          hint={key === "password" ? "8–128 characters. Longer passwords are recommended. Letters, numbers and symbols are allowed; no particular combination is required." : undefined}>
          <div className="relative">
            <Input id={id} name={key} type={visible[key] ? "text" : "password"} value={values[key]} autoComplete="off" spellCheck={false} className="pr-20"
              aria-invalid={Boolean(touched[key] && errors[key]) || undefined}
              aria-describedby={(key === "password" ? id + "-hint " : "") + (touched[key] && errors[key] ? id + "-error" : "") || undefined}
              onBlur={() => setTouched((previous) => ({ ...previous, [key]: true }))}
              onChange={(event) => setValues((previous) => ({ ...previous, [key]: event.target.value }))} />
            <Button variant="ghost" size="sm" className="absolute inset-y-0 right-0 px-3" aria-controls={id} aria-pressed={visible[key]}
              aria-label={(visible[key] ? "Hide " : "Show ") + label.toLowerCase()} onClick={() => setVisible((previous) => ({ ...previous, [key]: !previous[key] }))}>{visible[key] ? "Hide" : "Show"}</Button>
          </div>
        </Field>;
      })}
      <p className="text-sm leading-6 text-muted-foreground">{live?"Changing this password revokes all sessions for that role. Changing Admin requires a new login.":"Changes require secure local setup. Recovery is not available yet."}</p>
      <div className="flex flex-wrap gap-3 border-t pt-4"><Button type="submit" disabled={!live||live.blocked||!current}>{live?"Save Password Change":"Secure setup required"}</Button><Button variant="outline" onClick={onClose}>Cancel</Button></div>
    </form>
  </Dialog>;
}
export function PasswordSecurityPreview({live}:{live?:Live}={}) {
  const [role, setRole] = useState<"Admin" | "Salesperson" | null>(null);
  return <Card className="p-4 sm:p-5">
    <h2 className="text-base font-semibold">Passwords</h2>
    <div className="mt-2">
      <div className="flex items-center justify-between gap-3 py-2"><div><p className="text-sm font-medium">Admin Password</p><p className="mt-1 text-xs text-muted-foreground">Owner account</p></div>
        <Button variant="outline" size="sm" disabled={live?.blocked} aria-label="Change Admin password" onClick={() => setRole("Admin")}>Change</Button></div>
      <div className="mt-2 flex items-center justify-between gap-3 border-t pt-3"><div><p className="text-sm font-medium">Salesperson Password</p><p className="mt-1 text-xs text-muted-foreground">Staff account</p></div>
        <Button variant="outline" size="sm" disabled={live?.blocked} aria-label="Change Salesperson password" onClick={() => setRole("Salesperson")}>Change</Button></div>
    </div>
    {role && <PasswordDialog role={role} live={live} onClose={() => setRole(null)} />}
  </Card>;
}
