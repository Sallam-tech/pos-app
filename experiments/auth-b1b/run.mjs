// Preserve every run separately, including failures. No application tests invoked.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { here, provenance } from "./fixture.mjs";
const dir = join(here, "test-results", "suite-" + new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(dir, { recursive: false });
const sources = ["package.json", "package-lock.json", "fixture.mjs", "transactions.test.mjs", "reopen-worker.mjs", "run.mjs"];
const sourceSha256 = Object.fromEntries(sources.map(p => [p, createHash("sha256").update(readFileSync(join(here, p))).digest("hex")]));
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-timeout=15000", "--test-reporter=tap", "--test-reporter-destination=" + join(dir, "results.tap"), "--test-reporter=spec", "--test-reporter-destination=stdout", "transactions.test.mjs"], {
  cwd: here, encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  env: { ...process.env, NODE_ENV: "test", BETTER_AUTH_TELEMETRY: "false" }
});
writeFileSync(join(dir, "stdout.txt"), result.stdout ?? "", { flag: "wx" });
writeFileSync(join(dir, "stderr.txt"), result.stderr ?? "", { flag: "wx" });
process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
let tap = "";
try { tap = readFileSync(join(dir, "results.tap"), "utf8"); } catch { /* recorded as runner failure */ }
const counters = {};
for (const k of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
  const matches = [...tap.matchAll(new RegExp("^# " + k + " (\\d+)$", "gm"))];
  counters[k] = matches.length ? Number(matches.at(-1)[1]) : null;
}
const ok = result.status === 0 && !result.error && counters.tests === 18 && counters.pass === 18 && ["fail", "cancelled", "skipped", "todo"].every(k => counters[k] === 0);
writeFileSync(join(dir, "summary.json"), JSON.stringify({ verdict: ok ? "PASS" : "BLOCKED", exitCode: result.status, signal: result.signal, runnerError: result.error?.message ?? null, counters, provenance: provenance(), sourceSha256, scope: "TEST-only adapter transactions; no login or production compatibility approval" }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ evidence: dir, counters, verdict: ok ? "PASS" : "BLOCKED" }));
process.exitCode = ok ? 0 : 1;
