"use client";

import { useSyncExternalStore } from "react";
import { defaultShopSettings, normalizeShopSettings, parseShopSettings, shopSettingsStorageKey, validateShopSettings, type ShopDisplaySettings } from "@/lib/shop-display-settings";
const changeEvent = "shop-pos-display-settings-changed";
let remote:ShopDisplaySettings|null=null,remoteJob:Promise<void>|null=null;const listeners=new Set<()=>void>();
export function refreshSharedShopSettings(){if(remoteJob)return;remoteJob=(async()=>{try{const r=await fetch("/api/shop/name",{credentials:"omit",cache:"no-store"});if(!r.ok)return;const v=await r.json();if(typeof v.shopName!=="string")return;remote={...defaultShopSettings,shopName:v.shopName};if(window.location.pathname!=="/login"){const d=await fetch("/api/shop/settings",{credentials:"same-origin",cache:"no-store"});if(d.ok){const saved=await d.json();remote=saved.settings??saved.saved?.settings??remote;}}}catch{/* Never manufacture saved fields. */}finally{for(const f of listeners)f();}})().finally(()=>{remoteJob=null;});}
let cachedRaw: string | null = null;
let cached = defaultShopSettings;
function snapshot() {
  if(remote)return remote;
  let raw: string | null;
  try { raw = localStorage.getItem(shopSettingsStorageKey); } catch { raw = null; }
  if (raw !== cachedRaw) { cachedRaw = raw; cached = parseShopSettings(raw); }
  return cached;
}
function subscribe(callback: () => void) {
  listeners.add(callback);refreshSharedShopSettings();
  const storageChanged = (event: StorageEvent) => { if (event.key === shopSettingsStorageKey || event.key === null) callback(); };
  window.addEventListener(changeEvent, callback);
  window.addEventListener("storage", storageChanged);
  return () => { listeners.delete(callback);window.removeEventListener(changeEvent, callback); window.removeEventListener("storage", storageChanged); };
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
