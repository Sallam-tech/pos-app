// Safe evidence: fixed names, booleans/counts and source hashes only. No token/cookie/key output.
import { readFileSync, readdirSync, lstatSync, readlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { diagnostics } from "./contracts.mjs";
const here = dirname(fileURLToPath(import.meta.url)), base = resolve(here, ".."), root = resolve(base, "../..");
const evidence = join(base, "test-results", "session-review-" + new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(evidence, { recursive: false });
const sha = p => createHash("sha256").update(readFileSync(p)).digest("hex");
const git = (...args) => execFileSync("git", ["-c", "safe.directory=D:/pos", "--no-optional-locks", ...args], { cwd: root, encoding: "utf8" });
const old = JSON.parse(readFileSync(join(base, "test-results", readdirSync(join(base, "test-results")).filter(n => n.startsWith("preservation-")).sort()[0]), "utf8"));
const paths = new Set(old.files.map(f => f.path));
for (const p of git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean)) {
  if (!p.startsWith("experiments/auth-b1b/session-review/")) paths.add(p);
}
function addTree(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const p = join(directory, entry.name);
    if (entry.isDirectory()) addTree(p); 
    else paths.add(p);
  }
}
// Every previous Part 2A result/database and its source/lock files is preserved.
for (const entry of readdirSync(join(base, "test-results"), { withFileTypes: true })) {
  const p = join(base, "test-results", entry.name);
  if (p === evidence) continue;
  if (entry.isDirectory()) addTree(p); else paths.add(p);
}
const snapshot = [...paths].sort().map(p => {
  const f = resolve(root, p);
  return lstatSync(f).isSymbolicLink() ? { path: p, link: readlinkSync(f) } : { path: p, sha256: sha(f) };
});
const initialGit = git("status", "--porcelain=v1", "--untracked-files=all");
writeFileSync(join(evidence, "preservation.json"), JSON.stringify({ files: snapshot, previousLinks: old.previousLinks ?? [], git: initialGit }, null, 2), { flag: "wx" });
const captured = [];
const original = Object.fromEntries(["log", "warn", "error", "info", "debug"].map(k => [k, console[k]]));
for (const k of Object.keys(original)) console[k] = (...args) => captured.push(args);
let result;
try { result = await diagnostics(); }
catch { result = { outcomes: [], facts: {}, secrets: new Set(), setupFailed: true }; }
finally { for (const k of Object.keys(original)) console[k] = original[k]; }
const differences = snapshot.filter(f => f.sha256 ? sha(resolve(root, f.path)) !== f.sha256 : readlinkSync(resolve(root, f.path)) !== f.link).map(f => f.path);
const sourceSha256 = Object.fromEntries(["contracts.mjs", "run.mjs"].map(p => [p, sha(join(here, p))]));
const summary = {
  verdict: "BLOCKED",
  scope: "Diagnostic negative control only. No protected-storage adapter or encryption proof was built.",
  probes: result.outcomes, passed: result.outcomes.filter(x => x.passed).length,
  failed: result.outcomes.filter(x => !x.passed).length, setupFailed: !!result.setupFailed,
  protectedSecurityGate: result.facts.storedValueEqualsIssuedBearer === true ? "FAILED_STORED_VALUE_IS_ACTIVE_BEARER" : "NOT_PROVEN",
  facts: result.facts, capturedConsoleMessages: captured.length, sourceSha256,
  preservation: { filesChecked: snapshot.length, differences },
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  existingSuitesRerun: false
};
const serialized = JSON.stringify(summary, null, 2);
const leak = [...result.secrets].some(s => serialized.includes(s));
if (leak) {
  writeFileSync(join(evidence, "summary.json"), JSON.stringify({ verdict: "BLOCKED", reason: "EVIDENCE_REDACTION_CHECK_FAILED" }), { flag: "wx" });
  process.stderr.write("BLOCKED: evidence redaction check failed; details withheld.\n"); process.exitCode = 1;
} else {
  writeFileSync(join(evidence, "summary.json"), serialized, { flag: "wx" });
  console.log(JSON.stringify({ verdict: summary.verdict, passed: summary.passed, failed: summary.failed, setupFailed: summary.setupFailed, protectedSecurityGate: summary.protectedSecurityGate, facts: summary.facts, preservation: summary.preservation, evidence }));
  // Exit 1 deliberately means the protection gate remains blocked, even when negative controls pass.
  process.exitCode = 1;
}
