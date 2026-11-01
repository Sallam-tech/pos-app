export const THEME_STORAGE_KEY = "pos-theme";
export const THEME_EVENT = "pos-theme-change";
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function parseTheme(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

// Used only in a browser when storage writes are denied. Never stores business data.
let temporaryPreference: ThemePreference | null = null;

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  if (temporaryPreference) return temporaryPreference;
  try { return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY)); }
  catch { return "system"; }
}

export function setThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    temporaryPreference = null;
  } catch { temporaryPreference = preference; }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeTheme(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      temporaryPreference = null;
      listener();
    }
  };
  window.addEventListener(THEME_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readSystemDark() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

export function subscribeSystemTheme(listener: () => void) {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}

export function applyTheme(preference: ThemePreference, systemDark: boolean) {
  const resolved = resolveTheme(preference, systemDark);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
}

// Static, local, parser-blocking head script: runs before the first body paint.
// No user-supplied content is interpolated into executable code.
export const themeInitializationScript = String.raw
  `(()=>{let p="system";try{const s=localStorage.getItem("pos-theme");if(s==="light"||s==="dark")p=s}catch{}const d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);const h=document.documentElement;h.classList.toggle("dark",d);h.dataset.theme=d?"dark":"light";h.dataset.themePreference=p;h.style.colorScheme=d?"dark":"light"})();`;
