import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkShopServer, HEALTH_TIMEOUT_MS } from "@/lib/connectivity";
import { ConnectivityIndicator } from "@/components/shell/connectivity-indicator";

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const healthy = () => response({ status: "ok", service: "pos-web" });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("local-server health contract", () => {
  it("checks the local endpoint without a response cache", async () => {
    const fetcher = vi.fn().mockResolvedValue(healthy());
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    expect(await checkShopServer(signal)).toBe("connected");
    expect(fetcher).toHaveBeenCalledWith("/api/health", { cache: "no-store", signal });
  });
  it.each([response({ status: "wrong", service: "pos-web" }), response({ status: "ok", service: "other" }), new Response("invalid JSON")])("treats an unexpected response as unknown", async (value) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(value));
    expect(await checkShopServer(new AbortController().signal)).toBe("unknown");
  });
  it("reports service and network failures without a transaction outcome", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({}, 503)).mockRejectedValueOnce(new TypeError("network"));
    vi.stubGlobal("fetch", fetcher);
    expect(await checkShopServer(new AbortController().signal)).toBe("disconnected");
    expect(await checkShopServer(new AbortController().signal)).toBe("disconnected");
  });
  it("does not let an offline browser hint override local success", async () => {
    vi.spyOn(Navigator.prototype, "onLine", "get").mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(healthy()));
    render(<ConnectivityIndicator />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Shop server connected"));
    expect(screen.getByText(/Advisory only/)).toHaveTextContent("does not confirm a transaction");
  });
  it("shows checking, unknown and successful retry states", async () => {
    let release: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(healthy()));
    render(<ConnectivityIndicator />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking shop server");
    await act(async () => { release(response({ unexpected: true })); });
    expect(screen.getByRole("status")).toHaveTextContent("status unknown");
    fireEvent.click(screen.getByRole("button", { name: "Check shop server connection" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Shop server connected"));
  });
  it("aborts a stalled probe at the deadline and clears timers on unmount", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const component = render(<ConnectivityIndicator />);
    await act(async () => { await vi.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS + 1); });
    expect(screen.getByRole("status")).toHaveTextContent("Cannot reach shop server");
    component.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
