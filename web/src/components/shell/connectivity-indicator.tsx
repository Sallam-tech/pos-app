"use client";

import { useEffect, useState } from "react";
import { checkShopServer, HEALTH_POLL_MS, HEALTH_TIMEOUT_MS, type ConnectivityState } from "@/lib/connectivity";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const labels: Record<ConnectivityState, string> = {
  checking: "Checking shop server…", connected: "Shop server connected",
  disconnected: "Cannot reach shop server", unknown: "Shop server status unknown",
};
export function ConnectivityIndicator({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<ConnectivityState>("checking");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true, sequence = 0;
    let controller: AbortController | undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    async function check() {
      controller?.abort();
      const current = ++sequence;
      const request = new AbortController();
      controller = request;
      const timeout = setTimeout(() => request.abort(), HEALTH_TIMEOUT_MS);
      timers.add(timeout);
      const result = await checkShopServer(request.signal);
      clearTimeout(timeout);
      timers.delete(timeout);
      if (active && current === sequence) setState(result);
    }
    const visibleCheck = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    const interval = setInterval(visibleCheck, HEALTH_POLL_MS);
    // Browser internet hints only trigger a real local probe; they never set status.
    window.addEventListener("online", visibleCheck);
    window.addEventListener("offline", visibleCheck);
    document.addEventListener("visibilitychange", visibleCheck);
    return () => {
      active = false; controller?.abort();
      clearInterval(interval); timers.forEach(clearTimeout);
      window.removeEventListener("online", visibleCheck);
      window.removeEventListener("offline", visibleCheck);
      document.removeEventListener("visibilitychange", visibleCheck);
    };
  }, [attempt]);

  return <div className="min-w-0">
    <div className="flex items-center gap-1">
      <span role="status" aria-live="polite" aria-atomic="true" data-connectivity-state={state}
        className={cn("inline-flex min-w-0 items-center gap-2 text-sm font-semibold", state === "connected" ? "text-success" : state === "disconnected" ? "text-danger" : "text-muted-foreground")}>
        <Icon name={state === "connected" ? "check" : state === "disconnected" ? "alert" : "refresh"} className="shrink-0" />
        <span>{labels[state]}</span>
      </span>
      <Button variant="ghost" size="icon" disabled={state === "checking"} aria-label="Check shop server connection"
        onClick={() => { setState("checking"); setAttempt((value) => value + 1); }}><Icon name="refresh" /></Button>
    </div>
    <p className={compact ? "sr-only" : "max-w-sm text-xs leading-5 text-muted-foreground"}>Advisory only. Connection status does not confirm a transaction.</p>
  </div>;
}
