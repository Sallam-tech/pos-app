"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type FieldErrors = { password?: string };
type PreviewState = "idle" | "loading" | "unavailable";
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function LoginForm() {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<PreviewState>("idle");
  const password = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
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

  return <form aria-label="Login UI preview" noValidate autoComplete="off" onSubmit={preview}>
    {!ready && <p className="mt-3 text-sm leading-5 text-muted-foreground">JavaScript is required to try the form preview. Sign-in remains unavailable.</p>}
    <fieldset disabled={!ready || state === "loading"} className="mt-4 grid min-w-0 gap-3">
      <legend className="sr-only">Preview login details</legend>
      {invalidCount > 0 && <div role="alert" className="rounded-md border border-danger bg-muted px-3 py-2 text-sm leading-5 text-danger">
        <p className="font-semibold">Check the form</p>
        <p>{invalidCount === 1 ? "Complete the required field below." : "Complete both required fields below."}</p>
      </div>}
      <Field id="login-password" label="Password" error={errors.password}>
        <div className="relative">
          <Input ref={password} id="login-password" type={showPassword ? "text" : "password"} required autoComplete="off"
            className="pr-20" placeholder="Made-up password" aria-describedby={errors.password ? "login-password-error" : undefined}
            aria-invalid={Boolean(errors.password)} onChange={() => clearError("password")} />
          <Button variant="ghost" size="sm" className="absolute inset-y-0 right-0 rounded-l-none px-3 text-primary"
            aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="login-password"
            onClick={() => setShowPassword((current) => !current)}>{showPassword ? "Hide" : "Show"}</Button>
        </div>
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={state === "loading"} aria-describedby="login-preview-description">
        {state === "loading" ? "Previewing…" : "Open Shop"}
      </Button>
    </fieldset>
    <div role="status" aria-live="polite" aria-atomic="true">
      {state === "loading" && <p className="mt-3 text-sm leading-5 text-muted-foreground">Loading preview only. No sign-in request is sent.</p>}
    </div>
    {state === "unavailable" && <div ref={feedback} role="alert" tabIndex={-1} className="mt-3 rounded-md border border-danger bg-muted px-4 py-3 text-sm leading-5">
      <p className="font-semibold text-danger">Sign-in is unavailable in this UI preview.</p>
      <p className="mt-1 text-muted-foreground">No credentials were checked. Nothing was sent or saved.</p>
    </div>}
  </form>;
}
