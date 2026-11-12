"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function TestInventoryExit({ label = "Back to Login" }: { label?: string }) {
 const [busy, setBusy] = useState(false), [error, setError] = useState(false);
 return <><Button variant="outline" size="sm" disabled={busy} onClick={async () => {
  setBusy(true); setError(false);
  try { const reply = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: "{}", redirect: "error" });
   if (!reply.ok) throw Error(); window.location.replace("/login");
  } catch { setError(true); setBusy(false); }
 }}>{label}</Button>{error && <span role="alert">Logout unconfirmed. Retry; access is not assumed.</span>}</>;
}
