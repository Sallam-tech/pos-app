// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The business services must stay portable: they may depend on the gateway/transaction interfaces and the
// DB layer, but never on the Windows desktop shell, DPAPI/PowerShell helpers, backup custody or HTTP hosting.
// That boundary is what lets the same services run behind a different host if a web edition is ever requested.
const root = path.resolve(__dirname, "../../src/server");
const portable = ["inventory", "sales", "returns", "expenses", "invoices", "cash", "reports"];
const forbidden = /from\s+["'](?:\.\.\/)+(?:bootstrap|desktop|backup|hosting)(?:\/|["'])/;
const processSpawning = /node:child_process|from\s+["']child_process["']|powershell/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("portable business services", () => {
  for (const area of portable) {
    it(`${area}/ does not import desktop, bootstrap, backup or hosting code`, () => {
      const offenders = files(path.join(root, area)).filter(f => forbidden.test(readFileSync(f, "utf8")));
      expect(offenders.map(f => path.relative(root, f))).toEqual([]);
    });
    it(`${area}/ never spawns processes or references PowerShell`, () => {
      const offenders = files(path.join(root, area)).filter(f => processSpawning.test(readFileSync(f, "utf8")));
      expect(offenders.map(f => path.relative(root, f))).toEqual([]);
    });
  }
});
