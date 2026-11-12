import "server-only";

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class BootstrapRejected extends Error {
  constructor() { super("Protected setup unavailable."); this.name = "BootstrapRejected"; }
}
export const rejectBootstrap = (): never => { throw new BootstrapRejected(); };

// Windows inbox PowerShell/.NET DPAPI, no package, shell interpolation, script
// policy bypass, profile, secret arguments or environment. The enrollment helper
// compiles only an inbox .NET P/Invoke declaration for the supported Win32 move.
export function windowsProtection(message: Readonly<Record<string, string>>): Promise<unknown> {
  if (process.platform !== "win32" || process.arch !== "x64" || !/^24\./.test(process.versions.node)) return Promise.reject(new BootstrapRejected());
  const root = process.env.SystemRoot;
  if (!root || !path.isAbsolute(root)) return Promise.reject(new BootstrapRejected());
  const executable = path.join(root, "System32/WindowsPowerShell/v1.0/powershell.exe");
  if (!existsSync(executable)) return Promise.reject(new BootstrapRejected());
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File",
      fileURLToPath(new URL(message.operation.startsWith("record-") ? "./windows-enrollment-records.ps1" : "./windows-protection.ps1", import.meta.url))], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let count = 0, errorBytes = 0, done = false;
    const finish = (failed: boolean) => {
      if (done) return; done = true; clearTimeout(timer);
      let combined: Buffer | undefined;
      try {
        if (failed) throw new BootstrapRejected();
        combined = Buffer.concat(chunks);
        resolve(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined)));
      } catch { reject(new BootstrapRejected()); }
      finally { combined?.fill(0); for (const chunk of chunks) chunk.fill(0); }
    };
    const timer = setTimeout(() => { child.kill(); finish(true); }, 10000); timer.unref();
    child.stdout.on("data", (chunk: Buffer) => {
      count += chunk.length;
      if (count > 192 * 1024) { child.kill(); finish(true); return; }
      chunks.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer) => { errorBytes += chunk.length; if (errorBytes > 8192) { child.kill(); finish(true); } });
    child.once("error", () => finish(true));
    child.once("close", code => finish(code !== 0 || errorBytes !== 0));
    child.stdin.on("error", () => finish(true));
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    child.stdin.end(payload, () => payload.fill(0));
  });
}
