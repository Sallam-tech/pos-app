import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { expect, it } from "vitest";
import { assertPatchedLocalRuntime, isPatchedNode24 } from "../../src/server/hosting/runtime-policy";

it("security floor rejects affected24.x, unreviewed majors and prerelease input", () => {
  for (const version of ["24.11.0", "24.22.2", "22.23.5", "25.0.0", "26.13.1", "24.22.3-rc.1", "024.22.3", "24.22.03", "24.22.3 ", null]) expect(isPatchedNode24(version)).toBe(false);
  expect(isPatchedNode24("24.22.3")).toBe(true);
  expect(isPatchedNode24(process.versions.node)).toBe(true);
  expect(() => assertPatchedLocalRuntime()).not.toThrow();
});

it("actual installed affected Node is denied while the verified portable process is admitted", async () => {
  const execute = promisify(execFile), probe = path.resolve("tests/helpers/runtime-security-probe.mjs");
  const flags = ["--experimental-transform-types", "--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", probe];
  const old = await execute("C:\\Program Files\\nodejs\\node.exe", flags, { cwd: process.cwd(), windowsHide: true });
  expect(JSON.parse(old.stdout)).toEqual({ version: "24.11.0", allowed: false });
  const current = await execute(process.execPath, flags, { cwd: process.cwd(), windowsHide: true });
  expect(JSON.parse(current.stdout)).toEqual({ version: "24.22.3", allowed: true });
});
