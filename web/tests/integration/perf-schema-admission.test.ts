import { test, expect, beforeAll } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { gateway, seed } from "../helpers/admin-products-settings-fixture";
import { clearReviewedSchemaAdmission, validateReviewedSchema } from "../../src/server/db/validate-schema";

beforeAll(seed);

test("same-process schema admission reuses full validate41 and fails closed on identity drift / clear", async () => {
  clearReviewedSchemaAdmission();
  const f = await gateway();
  try {
    let fullMs = 0, cheapMs = 0;
    await f.g.withAdminTransaction(f.admin, async (tx) => {
      clearReviewedSchemaAdmission();
      const t0 = performance.now();
      expect((await validateReviewedSchema(tx, 41)).ok).toBe(true);
      fullMs = performance.now() - t0;
      const t1 = performance.now();
      expect((await validateReviewedSchema(tx, 41)).ok).toBe(true);
      cheapMs = performance.now() - t1;
    });
    expect(fullMs).toBeGreaterThan(5);
    expect(cheapMs).toBeLessThan(Math.max(fullMs * 0.25, 5));

    // Drifted user_version must invalidate admission and refuse on the full path.
    const drifted = await f.g.withAdminTransaction(f.admin, async (tx) => {
      const fake = {
        get: async (sql: string, values?: readonly unknown[]) => {
          if (/pragma_user_version/i.test(sql)) return { user_version: BigInt(1) };
          return tx.get(sql, values as never);
        },
        all: async (sql: string, values?: readonly unknown[]) => tx.all(sql, values as never),
      };
      return validateReviewedSchema(fake, 41);
    });
    expect(drifted.ok).toBe(false);

    clearReviewedSchemaAdmission();
    const afterClearStart = performance.now();
    const restored = await f.g.withAdminTransaction(f.admin, async (tx) => validateReviewedSchema(tx, 41));
    const afterClearMs = performance.now() - afterClearStart;
    expect(restored.ok).toBe(true);
    expect(afterClearMs).toBeGreaterThan(cheapMs);

    const dir = path.resolve("test-results/perf-proof-baseline-20261118");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "schema-admission.json"), JSON.stringify({
      measuredAt: new Date().toISOString(),
      fullMs: Math.round(fullMs),
      cheapMs: Math.round(cheapMs),
      afterClearMs: Math.round(afterClearMs),
      schemaDriftRefused: !drifted.ok,
    }, null, 2));
  } finally {
    await f.g.close();
    clearReviewedSchemaAdmission();
  }
}, 180000);
