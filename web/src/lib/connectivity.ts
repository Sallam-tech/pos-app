export type ConnectivityState = "checking" | "connected" | "disconnected" | "unknown";
export const HEALTH_TIMEOUT_MS = 5000;
export const HEALTH_POLL_MS = 30000;

export async function checkShopServer(signal: AbortSignal): Promise<Exclude<ConnectivityState, "checking">> {
  try {
    const response = await fetch("/api/health", { cache: "no-store", signal });
    if (!response.ok) return "disconnected";
    let data: unknown;
    try { data = await response.json(); } catch { return signal.aborted ? "disconnected" : "unknown"; }
    return typeof data === "object" && data !== null && "status" in data && data.status === "ok"
      && "service" in data && data.service === "pos-web" ? "connected" : "unknown";
  } catch { return "disconnected"; }
}
