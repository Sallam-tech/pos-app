"use client";

import { useSyncExternalStore } from "react";
import { defaultShopSettings, normalizeShopSettings, parseShopSettings, shopSettingsStorageKey, validateShopSettings, type ShopDisplaySettings } from "@/lib/shop-display-settings";
const changeEvent = "shop-pos-display-settings-changed";
let cachedRaw: string | null = null;
let cached = defaultShopSettings;
function snapshot() {
  let raw: string | null;
  try { raw = localStorage.getItem(shopSettingsStorageKey); } catch { raw = null; }
  if (raw !== cachedRaw) { cachedRaw = raw; cached = parseShopSettings(raw); }
  return cached;
}
function subscribe(callback: () => void) {
  const storageChanged = (event: StorageEvent) => { if (event.key === shopSettingsStorageKey || event.key === null) callback(); };
  window.addEventListener(changeEvent, callback);
  window.addEventListener("storage", storageChanged);
  return () => { window.removeEventListener(changeEvent, callback); window.removeEventListener("storage", storageChanged); };
}
export function useShopSettings() {
  return useSyncExternalStore(subscribe, snapshot, () => defaultShopSettings);
}
export function saveShopSettings(settings: ShopDisplaySettings): boolean {
  if (Object.keys(validateShopSettings(settings)).length) return false;
  try {
    localStorage.setItem(shopSettingsStorageKey, JSON.stringify(normalizeShopSettings(settings)));
    window.dispatchEvent(new Event(changeEvent));
    return true;
  } catch { return false; }
}
