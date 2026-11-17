// TEST-only dependency/preservation checks. Never opens a database.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, lstatSync, readlinkSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
assert.equal(here, resolve(root, "experiments/auth-b1b"));
assert.equal(process.platform, "win32"); assert.equal(process.arch, "x64");
assert.match(process.version, /^v24\./); assert.ok(Number(process.versions.node.split(".")[1]) >= 11);
const hash = (b, a = "sha256", e = "hex") => createHash(a).update(b).digest(e);
const resultDir = resolve(here, "test-results");
mkdirSync(resultDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const evidence = { at: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, arch: process.arch, abi: process.versions.modules, napi: process.versions.napi }, packages: [] };
const git = (...args) => execFileSync("git", ["-c", "safe.directory=D:/pos", "--no-optional-locks", ...args], { cwd: root, encoding: "utf8" });
const paths = new Set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean));
const previous = JSON.parse(readFileSync(resolve(root, "web/test-results/sqlite-b1b-part1/audit-fixes-96102074-cd2a-4cfc-87cd-b5c54edeff20/before-hashes.json"), "utf8"));
for (const f of previous.files) paths.add(f.path);
for (const p of ["web/node_modules/better-sqlite3/prebuilds/win32-x64.node", "web/test-results/sqlite-b1b-part1/audit-fixes-96102074-cd2a-4cfc-87cd-b5c54edeff20/full-part1.json", "web/test-results/sqlite-b1b-part1/audit-fixes-96102074-cd2a-4cfc-87cd-b5c54edeff20/verification-summary.json"]) paths.add(p);
const baseline = [...paths].filter(p => !p.replaceAll("\\", "/").startsWith("experiments/auth-b1b/")).sort().map(p => {
  const file = resolve(root, p); assert.ok(!relative(root, file).startsWith(".."));
  return lstatSync(file).isSymbolicLink() ? { path: p, link: readlinkSync(file) } : { path: p, sha256: hash(readFileSync(file)) };
});
writeFileSync(resolve(resultDir, "preservation-" + stamp + ".json"), JSON.stringify({ files: baseline, previousLinks: previous.links, git: git("status", "--porcelain=v1", "--untracked-files=all") }, null, 2), { flag: "wx" });
function entries(tar) {
  const out = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(x => x === 0)) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, "");
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, "").trim(), 8);
    assert.ok(Number.isSafeInteger(size) && size >= 0 && offset + 512 + size <= tar.length);
    out.set(name, tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}
const manifest = JSON.parse(readFileSync(resolve(here, "package.json"), "utf8"));
const pins = { ...manifest.dependencies, "node-addon-api": "8.9.2", "@better-auth/kysely-adapter": "1.7.18" };
for (const [name, version] of Object.entries(pins)) {
  const res = await fetch("https://registry.npmjs.org/" + name + "/" + version, { signal: AbortSignal.timeout(30000) });
  assert.equal(res.status, 200); const meta = await res.json();
  assert.equal(meta.name, name); assert.equal(meta.version, version);
  assert.ok(meta.dist.tarball.startsWith("https://registry.npmjs.org/"));
  const response = await fetch(meta.dist.tarball, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal("sha512-" + hash(bytes, "sha512", "base64"), meta.dist.integrity);
  const files = entries(gunzipSync(bytes));
  const pkg = JSON.parse(files.get("package/package.json").toString()); assert.equal(pkg.version, version);
  if (name === "better-sqlite3") {
    const lock = JSON.parse(readFileSync(resolve(root, "web/package-lock.json"), "utf8"));
    assert.equal(meta.dist.integrity, lock.packages["node_modules/better-sqlite3"].integrity);
    const native = files.get("package/prebuilds/win32-x64.node");
    assert.ok(native, "Bundled Windows x64 prebuild required, no compilation");
    assert.equal(native.readUInt16LE(0), 0x5a4d);
    assert.equal(native.readUInt16LE(native.readUInt32LE(0x3c) + 4), 0x8664);
    const expected = "e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a";
    assert.equal(hash(native), expected);
    assert.equal(hash(readFileSync(resolve(root, "web/node_modules/better-sqlite3/prebuilds/win32-x64.node"))), expected);
    evidence.native = { sha256: expected, architecture: "PE x64", bundled: true, matchesReviewedPart1: true };
  }
  evidence.packages.push({ name, version, engines: pkg.engines ?? null, integrity: meta.dist.integrity, tarballVerified: true, lifecycleScripts: pkg.scripts ?? {}, peerDependencies: pkg.peerDependencies ?? {} });
}
evidence.protectedFiles = baseline.length;
writeFileSync(resolve(resultDir, "preflight-" + stamp + ".json"), JSON.stringify(evidence, null, 2), { flag: "wx" });
console.log(JSON.stringify({ ok: true, protectedFiles: baseline.length, packages: evidence.packages.map(p => ({ name: p.name, version: p.version, engines: p.engines })), native: evidence.native }, null, 2));
