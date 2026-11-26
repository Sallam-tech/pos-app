import "server-only";

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHelperScript, HelperSessionUnavailable, type HelperScript } from "./powershell-session";

export class BootstrapRejected extends Error {
  constructor() { super("Protected setup unavailable."); this.name = "BootstrapRejected"; }
}
export const rejectBootstrap = (): never => { throw new BootstrapRejected(); };

// Windows inbox PowerShell/.NET DPAPI, no package, shell interpolation, profile,
// secret arguments or environment. The enrollment helper compiles only an inbox
// .NET P/Invoke declaration for the supported Win32 move.
// "-ExecutionPolicy RemoteSigned" applies to this one process only: a new Windows
// computer defaults to Restricted and would refuse these local -File helpers.
// Internet-marked scripts stay blocked and no machine or user setting changes.
export function windowsProtection(message: Readonly<Record<string, string>>): Promise<unknown> {
  if (process.platform !== "win32" || process.arch !== "x64" || !/^24\./.test(process.versions.node)) return Promise.reject(new BootstrapRejected());
  const root = process.env.SystemRoot;
  if (!root || !path.isAbsolute(root)) return Promise.reject(new BootstrapRejected());
  const executable = path.join(root, "System32/WindowsPowerShell/v1.0/powershell.exe");
  if (!existsSync(executable)) return Promise.reject(new BootstrapRejected());
  const script: HelperScript = message.operation.startsWith("candidate-") ? "windows-candidate-records" : message.operation.startsWith("maintenance-") ? "windows-maintenance-records" : message.operation.startsWith("record-") ? "windows-enrollment-records" : "windows-protection";
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  // Normally one reused PowerShell process (powershell-session.ts) runs the unchanged helper; the
  // success rule is the same as a one-shot launch: exit 0, no stderr, bounded strict-UTF-8 JSON.
  return runHelperScript(script, payload, 30000).then(result => {
    try {
      if (result.code !== 0 || result.stderrBytes !== 0 || result.stdout.length > 192 * 1024) throw new BootstrapRejected();
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(result.stdout)) as unknown;
    } catch { throw new BootstrapRejected(); }
    finally { result.stdout.fill(0); }
  }, error => {
    if (error instanceof HelperSessionUnavailable) return oneShot(executable, script, payload);
    throw new BootstrapRejected();
  }).finally(() => payload.fill(0));
}

// The original launch-per-call path, used only when no helper session could be started (nothing was sent).
function oneShot(executable: string, script: HelperScript, payload: Buffer): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File",
      fileURLToPath(new URL("./" + script + ".ps1", import.meta.url))], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
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
    const timer = setTimeout(() => { child.kill(); finish(true); }, 30000); timer.unref();
    child.stdout.on("data", (chunk: Buffer) => {
      count += chunk.length;
      if (count > 192 * 1024) { child.kill(); finish(true); return; }
      chunks.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer) => { errorBytes += chunk.length; if (errorBytes > 8192) { child.kill(); finish(true); } });
    child.once("error", () => finish(true));
    child.once("close", code => finish(code !== 0 || errorBytes !== 0));
    child.stdin.on("error", () => finish(true));
    child.stdin.end(payload);
  });
}
