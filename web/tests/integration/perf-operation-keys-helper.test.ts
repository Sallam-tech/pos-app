import { test, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openDesktopOperationKeys } from "../../src/server/desktop/operation-keys";
import { createProtectedLocalKeys, type LocalKeyConfiguration } from "../../src/server/bootstrap/keys";
import { createDesktopTestTls } from "../../src/server/desktop/tls";
import { storage } from "../../src/server/backup/storage";
import { openDatabase } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { applySalesMigration36 } from "../../src/server/db/sales-migrate";
import { applyReturnsMigration37 } from "../../src/server/db/returns-migrate";
import { applyExpensesMigration38 } from "../../src/server/db/expenses-migrate";
import { applyInvoicesMigration39 } from "../../src/server/db/invoices-migrate";
import { applyCashMigration40 } from "../../src/server/db/cash-migrate";
import { applySettingsMigration41 } from "../../src/server/db/settings-migrate";
import { acquireRuntimeOwnership } from "../../src/server/hosting/ownership";

const evidence = path.resolve("test-results/perf-proof-baseline-20261118");
mkdirSync(evidence, { recursive: true });
const base = path.resolve("test-results/sqlite-b1b-part1/keys-" + randomUUID().slice(0, 8));
mkdirSync(base, { recursive: true });
let root: LocalKeyConfiguration;

beforeAll(async () => {
  const directory = path.join(base, "root"), data = path.join(directory, "d");
  mkdirSync(directory); await storage(directory, "initialize");
  mkdirSync(data); await storage(data, "initialize");
  root = { directory, database: { directory: data, filename: "shop.sqlite3", mode: "test", create: false }, migrationsDirectory: path.resolve("src/server/db/migrations") };
  const db = openDatabase({ ...root.database, create: true });
  try {
    applyMigrations(db, root.migrationsDirectory);
    applySalesMigration36(db); applyReturnsMigration37(db); applyExpensesMigration38(db);
    applyInvoicesMigration39(db); applyCashMigration40(db); applySettingsMigration41(db);
  } finally { db.close(); }
  const tls = await createDesktopTestTls();
  try { await createProtectedLocalKeys(root, tls); } finally { Object.values(tls).forEach((b) => b.fill(0)); }
}, 180000);

test("long-lived DPAPI helper keeps CAS semantics and cuts repeated spawn tax", async () => {
  const lease = await acquireRuntimeOwnership(path.join(root.database.directory, root.database.filename));
  try {
    const access = await openDesktopOperationKeys(root, root, lease.assertHeld);
    const times: number[] = [];
    let revision = (await access("ADMIN", { module: "inventory", action: "read" })).revision;
    for (let i = 0; i < 5; i++) {
      const pending = { v: 1 as const, context: "a".repeat(64), key: randomUUID(), kind: "CREATE" as const, state: "PENDING" as const };
      const t0 = performance.now();
      const claimed = await access("ADMIN", { module: "inventory", action: "cas", revision, expected: null, next: pending });
      const confirmed = { ...pending, state: "CONFIRMED" as const };
      await access("ADMIN", { module: "inventory", action: "cas", revision: claimed.revision, expected: pending, next: confirmed });
      const cleared = await access("ADMIN", { module: "inventory", action: "cas", revision: (await access("ADMIN", { module: "inventory", action: "read" })).revision, expected: confirmed, next: null });
      times.push(performance.now() - t0);
      revision = cleared.revision;
      expect(cleared.marker).toBeNull();
    }
    await expect(access("SALESPERSON", { module: "inventory", action: "read" })).rejects.toThrow();
    access.close();
    await expect(openDesktopOperationKeys(root, root, lease.assertHeld).then((a) => a("ADMIN", { module: "inventory", action: "read" }))).resolves.toMatchObject({ marker: null });

    const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    // Baseline spawn tax was ~420ms per PowerShell; three CAS ops/cycle would exceed ~1200ms if spawning each time.
    expect(avgMs).toBeLessThan(900);
    writeFileSync(path.join(evidence, "operation-keys-helper.json"), JSON.stringify({
      measuredAt: new Date().toISOString(),
      cycleMs: times.map((x) => Math.round(x)),
      avgCycleMs: Math.round(avgMs),
      note: "Each cycle is claim+confirm+clear via long-lived helper (3 CAS).",
    }, null, 2));
  } finally {
    await lease.close();
  }
}, 180000);
