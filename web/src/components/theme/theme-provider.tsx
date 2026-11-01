"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { applyTheme, readSystemDark, readThemePreference, resolveTheme, setThemePreference, subscribeSystemTheme, subscribeTheme, type ResolvedTheme, type ThemePreference } from "@/lib/theme";

const ThemeContext = createContext<{
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
} | null>(null);
const serverPreference = (): ThemePreference => "system";
const serverSystemDark = () => false;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(subscribeTheme, readThemePreference, serverPreference);
  const systemDark = useSyncExternalStore(subscribeSystemTheme, readSystemDark, serverSystemDark);
  useEffect(() => {
    // Read the current browser values even on the hydration commit: never
    // overwrite the prepaint script with the server's neutral snapshot.
    applyTheme(readThemePreference(), readSystemDark());
  }, [preference, systemDark]);

  return <ThemeContext.Provider value={{ preference, resolved: resolveTheme(preference, systemDark), setPreference: setThemePreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Theme controls require ThemeProvider");
  return context;
}
