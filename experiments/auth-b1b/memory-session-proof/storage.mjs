// TEST ONLY. Intentionally volatile: no filesystem, serialization sink or persistence.
export function memoryStore({ maxEntries = 256 } = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error("TEST_INVALID_CAPACITY");
  const entries = new Map();
  const faults = { writes: false, reads: false };
  const stats = { gets: 0, sets: 0, deletes: 0, failedWrites: 0 };
  const live = key => {
    if (faults.reads) throw new Error("TEST_RAM_READ_FAILED");
    const row = entries.get(key);
    if (row && row.until <= Date.now()) { entries.delete(key); return undefined; }
    return row;
  };
  const writeCheck = () => {
    if (faults.writes) { stats.failedWrites++; throw new Error("TEST_RAM_WRITE_FAILED"); }
  };
  const put = (key, value, ttl) => {
    writeCheck();
    if (typeof key !== "string" || typeof value !== "string" ||
        (ttl !== undefined && (!Number.isFinite(ttl) || ttl <= 0))) throw new Error("TEST_INVALID_RAM_ENTRY");
    for (const [k, row] of entries) if (row.until <= Date.now()) entries.delete(k);
    if (!entries.has(key) && entries.size >= maxEntries) throw new Error("TEST_RAM_CAPACITY");
    entries.set(key, { value, until: ttl === undefined ? Infinity : Date.now() + ttl * 1000 });
  };
  const storage = {
    get(key) { stats.gets++; return live(key)?.value ?? null; },
    getAndDelete(key) { const row = live(key); writeCheck(); entries.delete(key); return row?.value ?? null; },
    increment(key, ttl) {
      const old = live(key); writeCheck();
      const n = old ? Number(old.value) + 1 : 1;
      if (!Number.isSafeInteger(n) || n < 1) throw new Error("TEST_INVALID_COUNTER");
      if (old) entries.set(key, { ...old, value: String(n) }); else put(key, "1", ttl);
      return n;
    },
    set(key, value, ttl) { stats.sets++; put(key, value, ttl); },
    delete(key) { stats.deletes++; writeCheck(); entries.delete(key); }
  };
  return { storage, faults, stats, size: () => entries.size, clear: () => entries.clear() };
}
