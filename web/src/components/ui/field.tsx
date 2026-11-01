import type { ReactNode } from "react";
export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return <div className="grid min-w-0 gap-2">
    <label htmlFor={id} className="text-sm font-semibold">{label}</label>
    {children}
    {hint && <p id={id + "-hint"} className="text-sm text-muted-foreground">{hint}</p>}
    {error && <p id={id + "-error"} role="alert" className="text-sm text-danger">{error}</p>}
  </div>;
}
