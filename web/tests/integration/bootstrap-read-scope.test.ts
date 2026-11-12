import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import { sql } from "kysely";
import { beforeAll, expect, it } from "vitest";
import { openDatabase } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { openAsyncOwner, type BootstrapReadScope } from "../../src/server/auth/database";
import type { AuthorizedTransaction } from "../../src/server/auth/types";
import { hasActiveBootstrapLease, withBootstrapOwnership, type BootstrapLease } from "../../src/server/bootstrap/ownership";
import { preflightEnrollmentToInventory } from "../../src/server/bootstrap/migration-preflight";
const root = path.resolve("test-results/sqlite-b1b-part1"); mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "owned-reader-")), auth8 = path.join(run, "auth8");
beforeAll(() => { mkdirSync(auth8); const source = path.resolve("src/server/db/migrations");
  for (const name of readdirSync(source).filter(n => /^000[1-8]_/.test(n))) copyFileSync(path.join(source, name), path.join(auth8, name));
});
function fixture() {
  const directory = mkdtempSync(path.join(run, "case-")), data = path.join(directory, "data"); mkdirSync(data);
  const config = { directory, database: { directory: data, filename: "test.sqlite3", mode: "test" as const, create: false }, migrationsDirectory: auth8 };
  const db = openDatabase({ ...config.database, create: true }); try { applyMigrations(db, auth8); } finally { db.close(); }
  return config;
}
async function owned(work: (owner: ReturnType<typeof openAsyncOwner>, lease: BootstrapLease, config: ReturnType<typeof fixture>) => Promise<void>) {
  const config = fixture(); let failure: unknown;
  await withBootstrapOwnership(config.database, async (retain, lease) => {
    const owner = openAsyncOwner(config);
    try { await work(owner, lease, config); } catch (error) { failure = error; throw error; }
    finally { try { await owner.close(); } catch { retain(); owner.quarantine(); } }
  }).catch(error => { throw failure ?? error; });
}
const denied = (value: Awaited<ReturnType<typeof preflightEnrollmentToInventory>>) => {
  expect(value.productionActivation).toBe(false); expect(value.upgradeAuthorized).toBe(false); expect(value.enrollmentAuthorized).toBe(false);
};
it("rejects a native structural reader outside any transaction (confirmed regression)", async () => {
  await owned(async (owner, lease, config) => {
    expect(owner.inTransaction()).toBe(false);
    await expect(owner.withBootstrapReadScope(lease, async () => true)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    const before = owner.get("SELECT total_changes() AS n");
    const result = await preflightEnrollmentToInventory(config, lease, owner.scope(() => {}));
    expect(result.status).toBe("LIFECYCLE_UNKNOWN"); denied(result); expect(owner.get("SELECT total_changes() AS n")).toEqual(before);
  });
});
it("rejects a legacy reader revived in a later real transaction (confirmed regression)", async () => {
  await owned(async (owner, lease, config) => {
    let legacy: AuthorizedTransaction | undefined;
    await owner.db.transaction().execute(async () => { legacy = owner.scope(() => { if (!owner.inTransaction()) throw new Error("TEST ended"); }); });
    await expect(legacy!.get("SELECT 1 AS n")).rejects.toThrow("TEST ended");
    await owner.db.transaction().execute(async () => {
      expect(await legacy!.get("SELECT 1 AS n")).toEqual({ n: BigInt(1) }); // Original defect's actual native condition.
      const result = await preflightEnrollmentToInventory(config, lease, legacy); expect(result.status).toBe("LIFECYCLE_UNKNOWN"); denied(result);
      await owner.withBootstrapReadScope(lease, async scope => {
        const before = owner.get("SELECT total_changes() AS n");
        const good = await preflightEnrollmentToInventory(config, lease, scope); expect(good.status).toBe("PROTECTED_RECORDS_REQUIRED"); denied(good);
        expect(owner.get("SELECT total_changes() AS n")).toEqual(before);
      });
    });
  });
});
it("expires the genuine capability at callback end and never revives it", async () => {
  await owned(async (owner, lease, config) => {
    let ended: BootstrapReadScope | undefined;
    await owner.db.transaction().execute(async () => {
      await owner.withBootstrapReadScope(lease, async scope => { ended = scope; expect(await scope.get("SELECT 1 AS n")).toEqual({ n: BigInt(1) }); });
      await expect(ended!.get("SELECT 1 AS n")).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    });
    await owner.db.transaction().execute(async () => {
      await expect(ended!.get("SELECT 1 AS n")).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      expect((await preflightEnrollmentToInventory(config, lease, ended)).status).toBe("LIFECYCLE_UNKNOWN");
    });
  });
});
it("rejects cloned, wrapped and forged capabilities within an otherwise valid transaction", async () => {
  await owned(async (owner, lease, config) => { await owner.db.transaction().execute(async () => owner.withBootstrapReadScope(lease, async scope => {
    for (const fake of [{}, { ...scope }, { get: scope.get, all: scope.all }]) {
      const result = await preflightEnrollmentToInventory(config, lease, fake); expect(result.status).toBe("LIFECYCLE_UNKNOWN"); denied(result);
    }
    expect((await preflightEnrollmentToInventory(config, lease, scope)).status).toBe("PROTECTED_RECORDS_REQUIRED");
  })); });
});
it("detects real COMMIT/BEGIN transaction replacement even while the callback remains live", async () => {
  await owned(async (owner, lease) => {
    await expect(owner.db.transaction().execute(async transaction => owner.withBootstrapReadScope(lease, async scope => {
      await sql.raw("/* TEST boundary */ COMMIT").execute(transaction);
      await sql.raw("/* TEST boundary */ BEGIN").execute(transaction);
      await expect(scope.get("SELECT 1 AS n")).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }))).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(owner.inTransaction()).toBe(false);
  });
});
it("rejects a genuine lease on the wrong actual native database owner", async () => {
  const correct = fixture(), different = fixture();
  await withBootstrapOwnership(correct.database, async () => {
    const owner = openAsyncOwner(different);
    try { await owner.db.transaction().execute(async () => {
      await expect(owner.withBootstrapReadScope({} as BootstrapLease, async () => true)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }); } finally { await owner.close(); }
  });
  await withBootstrapOwnership(correct.database, async (_retain, lease) => {
    const owner = openAsyncOwner(different);
    try { await owner.db.transaction().execute(async () => { await expect(owner.withBootstrapReadScope(lease, async () => true)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" }); }); }
    finally { await owner.close(); }
  });
});
it("rejects aborted scopes and permanently invalidates after callback failure", async () => {
  await owned(async (owner, lease, config) => {
    const abort = new AbortController(); let ended: BootstrapReadScope | undefined;
    await owner.db.transaction().execute(async () => {
      await expect(owner.withBootstrapReadScope(lease, async scope => {
        ended = scope; abort.abort(); await expect(scope.all("SELECT 1 AS n")).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
        expect((await preflightEnrollmentToInventory(config, lease, scope)).status).toBe("LIFECYCLE_UNKNOWN");
      }, abort.signal)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      await expect(ended!.get("SELECT 1 AS n")).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      await expect(owner.withBootstrapReadScope(lease, async scope => { ended = scope; throw new Error("TEST callback failure"); })).rejects.toThrow("TEST callback failure");
      await expect(ended!.get("SELECT 1 AS n")).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    });
  });
});
it("keeps forged and expired lease denial without publishing authority", async () => {
  const config = fixture(); let stale: BootstrapLease | undefined;
  await withBootstrapOwnership(config.database, async (_retain, lease) => { stale = lease; });
  const result = await preflightEnrollmentToInventory(config, stale!, {}); expect(result.status).toBe("OWNERSHIP_REQUIRED"); denied(result);
  expect((await preflightEnrollmentToInventory(config, {} as BootstrapLease, {})).status).toBe("OWNERSHIP_REQUIRED");
});

it("denies reads and preflight after native quarantine/close during an admitted callback", async () => {
  await owned(async (owner, lease, config) => {
    let deniedAfterClose = false;
    await expect(owner.db.transaction().execute(async () => owner.withBootstrapReadScope(lease, async scope => {
      expect(Object.keys(scope).sort()).toEqual(["all", "get"]);
      owner.quarantine();
      await expect(scope.get("SELECT 1 AS n")).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
      const result = await preflightEnrollmentToInventory(config, lease, scope);
      expect(result.status).toBe("LIFECYCLE_UNKNOWN"); denied(result); deniedAfterClose = true;
    }))).rejects.toThrow(); // The real driver also cannot COMMIT/ROLLBACK a closed handle.
    expect(deniedAfterClose).toBe(true);
  });
});

it("rejects same-path replacement of the closed TEST file and denies lease completion", async () => {
  const config = fixture(), filename = path.join(config.database.directory, config.database.filename), preserved = filename + ".preserved";
  for (const candidate of [filename, preserved]) expect(path.resolve(candidate).startsWith(run + path.sep)).toBe(true);
  let replacementDenied = false;
  await expect(withBootstrapOwnership(config.database, async (_retain, lease) => {
    expect(hasActiveBootstrapLease(lease, config.database)).toBe(true);
    // No SQLite handle is live; this is an identity fault, NOT a backup/restore.
    // Both new disposable files are retained. No previous data/evidence is touched.
    renameSync(filename, preserved); copyFileSync(preserved, filename);
    expect(hasActiveBootstrapLease(lease, config.database)).toBe(false);
    const result = await preflightEnrollmentToInventory(config, lease, {});
    expect(result.status).toBe("OWNERSHIP_REQUIRED"); denied(result); replacementDenied = true;
  })).rejects.toMatchObject({ name: "BootstrapRejected" });
  expect(replacementDenied).toBe(true);
});
