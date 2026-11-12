import "server-only";
import type { SecondaryStorage } from "@better-auth/core/db";

// Internal volatile store. No persistence, logging, debug dump or value enumeration.
export function createVolatileStorage() {
  const entries = new Map<string, { value: string; expires: number }>();
  const maxEntries = 2048, maxBytes = 128 * 1024, maxSeconds = 86400;
  const read = (key: string) => {
    const row = entries.get(key);
    if (row && row.expires <= Date.now()) { entries.delete(key); return undefined; }
    return row;
  };
  const put = (key: string, value: string, ttl = maxSeconds) => {
    if (typeof key !== "string" || key.length > 512 || typeof value !== "string" ||
        Buffer.byteLength(value) > maxBytes || !Number.isFinite(ttl) || ttl <= 0 || ttl > maxSeconds) {
      throw new Error("Volatile storage rejected an entry.");
    }
    for (const [k, row] of entries) if (row.expires <= Date.now()) entries.delete(k);
    if (!entries.has(key) && entries.size >= maxEntries) throw new Error("Volatile storage capacity exceeded.");
    entries.set(key, { value, expires: Date.now() + ttl * 1000 });
  };
  const storage: SecondaryStorage = Object.freeze({
    get(key: string) { return read(key)?.value ?? null; },
    getAndDelete(key: string) { const row = read(key); entries.delete(key); return row?.value ?? null; },
    increment(key: string, ttl: number) {
      const row = read(key), value = row ? Number(row.value) + 1 : 1;
      if (!Number.isSafeInteger(value) || value < 1) throw new Error("Volatile counter rejected.");
      if (row) entries.set(key, { ...row, value: String(value) }); else put(key, "1", ttl);
      return value;
    },
    set(key: string, value: string, ttl?: number) { put(key, value, ttl); },
    delete(key: string) { entries.delete(key); }
  });
  return Object.freeze({ storage, clear: () => entries.clear() });
}
