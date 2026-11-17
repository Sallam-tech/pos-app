"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type FieldErrors = { password?: string };
type PreviewState = "idle" | "loading" | "unavailable" | "authenticated";
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function LoginForm({ testRole,testSales=false }: { testRole?: "ADMIN" | "SALESPERSON";testSales?:boolean }) {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<PreviewState>("idle");
  const password = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const [fresh, setFresh] = useState(false);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), resetSession = useRef<() => void>(() => {});
  const invalidCount = Object.values(errors).filter(Boolean).length;

  useEffect(() => {
    // Clear browser-restored preview text on opening and back/forward restoration.
    const clearPreviewPassword = () => { if (password.current) password.current.value = ""; };
    clearPreviewPassword();
    window.addEventListener("pageshow", clearPreviewPassword);
    return () => window.removeEventListener("pageshow", clearPreviewPassword);
  }, []);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    if (state === "unavailable") feedback.current?.focus();
  }, [state]);

  useEffect(() => {
    if (!testRole) return;
    let live = true;
    const reset = async () => {
      if (!live) return;
      const current = ++generation.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
      busy.current = true; setFresh(false); setErrors({}); setState("idle"); setShowPassword(false);
      if (password.current) password.current.value = "";
      try {
        const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: "{}", signal: abort.signal });
        if (!response.ok || (await response.json())?.ok !== true) throw Error();
        if (!live || generation.current !== current) return;
        if (password.current) password.current.value = "";
        busy.current = false; setFresh(true);
      } catch { if (live && generation.current === current) { busy.current = false; setState("unavailable"); } }
    };
    resetSession.current = () => { void reset(); };
    const restored = () => { void reset(); }; window.addEventListener("pageshow", restored);
    queueMicrotask(() => { void reset(); });
    const invalidate = () => { generation.current++; controller.current?.abort(); };
    return () => { live = false; invalidate(); resetSession.current = () => {}; window.removeEventListener("pageshow", restored); };
  }, [testRole]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    if (!testRole) { preview(event); return; }
    event.preventDefault();
    if (!ready || !fresh || busy.current) return;
    const supplied = password.current?.value ?? "";
    if (Array.from(supplied).length < 8 || Array.from(supplied).length > 128 || new TextEncoder().encode(supplied).length > 512) {
      setErrors({ password: "Enter your 8 to 128 character password." }); password.current?.focus(); return;
    }
    const current = ++generation.current, abort = new AbortController(); controller.current?.abort(); controller.current = abort;
    busy.current = true; setFresh(false); setErrors({}); setState("loading"); setShowPassword(false);
    if (password.current) password.current.value = "";
    try {
      if(window.shopPosRecovery?.login){
        const result=await window.shopPosRecovery.login(supplied);
        if(!result?.ok||generation.current!==current)throw Error();
        return; // Trusted native handoff performs the role-bound destination load.
      }
      const response = await fetch("/api/auth/login", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: supplied }), signal: abort.signal });
      if (!response.ok || (await response.json())?.ok !== true) throw Error();
      const status = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store", redirect: "error", signal: abort.signal });
      if (!status.ok || (await status.json())?.authenticated !== true || generation.current !== current) throw Error();
      // This UI result is never page/API authorization; each destination checks SQL.
      if (testRole === "ADMIN") window.location.replace("/admin/dashboard");
      else if(testSales)window.location.replace("/pos");
      else { busy.current = false; setState("authenticated"); }
    } catch {
      if (generation.current !== current) return;
      // Deny uncertain publication. The reviewed logout revokes any current-role
      // cookie that reached this browser; it never clears business data/markers.
      let cleared = false;
      try { const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: "{}", signal: abort.signal }); cleared = response.ok && (await response.json())?.ok === true; } catch {}
      if (generation.current === current) { busy.current = false; setFresh(cleared); setState("unavailable"); }
    }
  }

  function clearError(field: keyof FieldErrors) {
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (state === "unavailable") setState("idle");
  }

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy.current) return;
    // Only presence is checked. No identity, password policy or auth outcome is evaluated.
    const next: FieldErrors = {};
    if (!password.current?.value) next.password = "Enter a password.";
    setErrors(next);
    setState("idle");
    if (next.password) {
      password.current?.focus();
      return;
    }
    busy.current = true;
    // Discard preview input immediately; never serialize, send, log or persist it.
    if (password.current) password.current.value = "";
    setShowPassword(false);
    setState("loading");
    timer.current = setTimeout(() => {
      busy.current = false;
      timer.current = null;
      setState("unavailable");
    }, 700);
  }

  return <form aria-label={testRole ? "Secure TEST sign in" : "Login UI preview"} noValidate autoComplete="off" onSubmit={signIn}>
    {!ready && <p className="mt-3 text-sm leading-5 text-muted-foreground">{testRole ? "JavaScript is required for secure TEST sign-in." : "JavaScript is required to try the form preview. Sign-in remains unavailable."}</p>}
    <fieldset disabled={!ready || state === "loading" || (testRole !== undefined && (!fresh || state === "authenticated"))} className="mt-4 grid min-w-0 gap-3">
      <legend className="sr-only">{testRole ? "Sign-in details" : "Preview login details"}</legend>
      {invalidCount > 0 && <div role="alert" className="rounded-md border border-danger bg-muted px-3 py-2 text-sm leading-5 text-danger">
        <p className="font-semibold">Check the form</p>
        <p>{invalidCount === 1 ? "Complete the required field below." : "Complete both required fields below."}</p>
      </div>}
      <Field id="login-password" label="Password" error={errors.password}>
        <div className="relative">
          <Input ref={password} id="login-password" type={showPassword ? "text" : "password"} required autoComplete="off"
            className="pr-20" placeholder={testRole ? "Password" : "Made-up password"} aria-describedby={errors.password ? "login-password-error" : undefined}
            aria-invalid={Boolean(errors.password)} onChange={() => clearError("password")}
            onPaste={event => { if (testRole && /[\r\n]/.test(event.clipboardData.getData("text"))) { event.preventDefault(); if (password.current) password.current.value = ""; setErrors({ password: "Line breaks cannot be entered here. Nothing was submitted." }); } }} />
          <Button variant="ghost" size="sm" className="absolute inset-y-0 right-0 rounded-l-none px-3 text-primary"
            aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="login-password"
            onClick={() => setShowPassword((current) => !current)}>{showPassword ? "Hide" : "Show"}</Button>
        </div>
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={state === "loading"} aria-describedby="login-preview-description">
        {state === "loading" ? (testRole ? "Signing in..." : "Previewing\u2026") : "Open Shop"}
      </Button>
    </fieldset>
    <div role="status" aria-live="polite" aria-atomic="true">
      {state === "loading" && <p className="mt-3 text-sm leading-5 text-muted-foreground">{testRole ? "Verifying securely on this device..." : "Loading preview only. No sign-in request is sent."}</p>}
    </div>
    {state === "unavailable" && <div ref={feedback} role="alert" tabIndex={-1} className="mt-3 rounded-md border border-danger bg-muted px-4 py-3 text-sm leading-5">
      <p className="font-semibold text-danger">{testRole ? "Sign-in unavailable or details incorrect." : "Sign-in is unavailable in this UI preview."}</p>
      <p className="mt-1 text-muted-foreground">{testRole ? "Enter your password again. After five wrong attempts, wait 30 seconds. No password is saved." : "No credentials were checked. Nothing was sent or saved."}</p>
    </div>}
    {testRole && !fresh && state === "idle" && <p role="status" className="mt-3 text-sm text-muted-foreground">Preparing fresh sign-in...</p>}
    {testRole && state === "unavailable" && !fresh && <Button type="button" className="mt-3" variant="outline" onClick={() => resetSession.current()}>Retry Secure Sign-in</Button>}
    {testRole && state === "authenticated" && <div role="status" className="mt-3 text-sm leading-5">
      <p>Salesperson signed in for this TEST session. Sales processing is not connected.</p>
      <Button type="button" variant="outline" className="mt-3" onClick={() => resetSession.current()}>Back to Login</Button>
    </div>}
  </form>;
}
