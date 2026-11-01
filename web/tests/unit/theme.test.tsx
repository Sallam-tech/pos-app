import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { parseTheme, resolveTheme, setThemePreference, THEME_STORAGE_KEY } from "@/lib/theme";

let systemDark = false;
const listeners = new Set<() => void>();
beforeEach(() => {
  systemDark = false;
  listeners.clear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    get matches() { return systemDark; },
    addEventListener: (_event: string, callback: () => void) => listeners.add(callback),
    removeEventListener: (_event: string, callback: () => void) => listeners.delete(callback),
  })));
  setThemePreference("system");
  localStorage.clear();
  document.documentElement.className = "";
});
afterEach(() => { vi.unstubAllGlobals(); });

const preview = () => render(<ThemeProvider><ThemeSelector /></ThemeProvider>);
function setSystem(dark: boolean) {
  act(() => { systemDark = dark; listeners.forEach((listener) => listener()); });
}

describe("theme preference", () => {
  it.each([null, "", "unknown", "<script>"])("falls back safely for %s", (value) => {
    expect(parseTheme(value)).toBe("system");
  });
  it("resolves explicit modes independently of the OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("persists a choice and restores it in a remounted provider", async () => {
    const first = preview();
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "dark" } });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
    first.unmount();
    preview();
    expect(screen.getByLabelText("Theme")).toHaveValue("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
  it("follows live OS changes only while System is selected", async () => {
    preview();
    expect(screen.getByLabelText("Theme")).toHaveValue("system");
    setSystem(true);
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "light" } });
    setSystem(false); setSystem(true);
    expect(document.documentElement).not.toHaveClass("dark");
  });
  it("synchronizes an external storage change", async () => {
    preview();
    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }));
    });
    await waitFor(() => expect(screen.getByLabelText("Theme")).toHaveValue("dark"));
  });
  it("keeps selection usable when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    preview();
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "dark" } });
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
    expect(screen.getByLabelText("Theme")).toHaveValue("dark");
  });
});
