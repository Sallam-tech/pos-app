// Safe evidence only: fixed test names, booleans, counts and hashes.
import { readFileSync, readdirSync, lstatSync, readlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { here, containsSecret } from "./host.mjs";
import { proof } from "./proof.mjs";
const root = resolve(here, "../../..");
const sha = p => createHash("sha256").update(readFileSync(p)).digest("hex");
const git = (...args) => execFileSync("git", ["-c", "safe.directory=D:/pos", "--no-optional-locks", ...args], { cwd: root, encoding: "utf8" });
const baselines = readdirSync(join(here, "test-results")).filter(p => /^baseline-.*\.json$/.test(p));
if (baselines.length !== 1) throw new Error("TEST_BASELINE_REQUIRED");
const baseline = JSON.parse(readFileSync(join(here, "test-results", baselines[0]), "utf8"));
const evidence = join(here, "test-results", "suite-" + randomUUID()); mkdirSync(evidence);
const differences = () => baseline.files.filter(f => {
  try { return f.sha256 ? sha(resolve(root, f.path)) !== f.sha256 : readlinkSync(resolve(root, f.path)) !== f.link; }
  catch { return true; }
}).map(f => f.path);
const captured = [], original = {};
for (const k of ["log", "warn", "error", "info", "debug"]) { original[k] = console[k]; console[k] = (...args) => captured.push(args); }
let result;
try { result = await proof(); } catch { result = { outcomes: [], facts: {}, harnessFailed: true }; }
finally { for (const k of Object.keys(original)) console[k] = original[k]; }
const changed = differences();
const previousLinks = baseline.previousLinks.filter(f => {
  try { return readlinkSync(resolve(root, f.path)) !== (f.target ?? f.link); } catch { return true; }
});
const finalGit = git("status", "--porcelain=v1", "--untracked-files=all");
const outsideGit = finalGit.split("\n").filter(s => !s.includes("experiments/auth-b1b/memory-session-proof/")).join("\n");
const preservationPassed = changed.length === 0 && previousLinks.length === 0 && outsideGit === baseline.git &&
  git("rev-parse", "HEAD").trim() === baseline.head && git("diff", "--cached", "--name-only") === baseline.index;
result.outcomes.push({ name: "previous sources evidence links Git HEAD and empty index preserved", passed: preservationPassed });
const summary = {
  verdict: !result.harnessFailed && result.outcomes.every(t => t.passed) ? "PASS" : "BLOCKED",
  scope: "Disposable proof only. Custom private gateway required; not production authentication approval.",
  passed: result.outcomes.filter(t => t.passed).length, failed: result.outcomes.filter(t => !t.passed).length,
  harnessFailed: !!result.harnessFailed, tests: result.outcomes, facts: result.facts,
  capturedConsoleMessages: captured.length,
  consoleHasSecret: containsSecret(JSON.stringify(captured, (_, v) => v instanceof Error ? { message: v.message, stack: v.stack } : v)),
  preservation: { filesChecked: baseline.files.length, differences: changed, changedLinks: previousLinks, gitUnchangedOutsideProof: outsideGit === baseline.git },
  sourceSha256: Object.fromEntries(["storage.mjs", "host.mjs", "worker.mjs", "proof.mjs", "run.mjs"].map(f => [f, sha(join(here, f))])),
  runtime: { node: process.version, platform: process.platform, arch: process.arch, abi: process.versions.modules, napi: process.versions.napi },
  existingSuitesRerun: false
};
if (summary.consoleHasSecret || containsSecret(JSON.stringify(summary))) {
  writeFileSync(join(evidence, "summary.json"), JSON.stringify({ verdict: "BLOCKED", reason: "TEST_OUTPUT_REDACTION_FAILED" }), { flag: "wx" });
  console.log("BLOCKED: output redaction failed; values withheld."); process.exitCode = 1;
} else {
  writeFileSync(join(evidence, "summary.json"), JSON.stringify(summary, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ verdict: summary.verdict, passed: summary.passed, failed: summary.failed, harnessFailed: summary.harnessFailed,
    failures: summary.tests.filter(t => !t.passed), preservation: summary.preservation, evidence }));
  process.exitCode = summary.verdict === "PASS" ? 0 : 1;
}
