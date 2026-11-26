import "server-only";
import { spawn } from "node:child_process";
import { lstatSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDatabaseLocation } from "../db/location";
import { runHelperScript, HelperSessionUnavailable } from "../bootstrap/powershell-session";
export class BackupRejected extends Error {
  constructor() { super("Backup or recovery unavailable."); this.name = "BackupRejected"; }
}
export const fail = (): never => { throw new BackupRejected(); };
// No production caller/admission yet. Merely choosing mode=test is insufficient.
export function testDirectory(directory: string) {
  resolveDatabaseLocation({ directory, filename: "backup-proof.sqlite3", mode: "test", create: true });
}
export async function storage(directory: string, operation: "initialize" | "check" | "seal" | "unseal" | "seal-record" | "unseal-record" | "publish" | "space", fields: Record<string, string> = {}): Promise<unknown> {
  testDirectory(directory);
  if (process.platform !== "win32" || !process.env.SystemRoot || "operation" in fields || "directory" in fields) return fail();
  if (fields.filename || fields.source) {
    const name = fields.filename ?? fields.source;
    if (!/^[a-z0-9-]+\.(?:age|json|dpapi|sqlite3|pending)$/.test(name)) return fail();
    const st = lstatSync(path.join(directory, name));
    if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1) return fail();
  }
  const payload = Buffer.from(JSON.stringify({ directory, operation, ...fields }));
  // Normally one reused PowerShell process (bootstrap/powershell-session.ts) runs the unchanged storage.ps1;
  // the success rule is the same as a one-shot launch: exit 0, no stderr, bounded JSON output.
  return runHelperScript("storage", payload, 30000).then(result => {
    try {
      if (result.code !== 0 || result.stderrBytes !== 0 || result.stdout.length > 256 * 1024) throw new BackupRejected();
      return JSON.parse(result.stdout.toString("utf8")) as unknown;
    } catch { throw new BackupRejected(); }
    finally { result.stdout.fill(0); }
  }, error => {
    if (error instanceof HelperSessionUnavailable) return oneShot(payload);
    throw new BackupRejected();
  }).finally(() => payload.fill(0));
}

// The original launch-per-call path, used only when no helper session could be started (nothing was sent).
function oneShot(payload: Buffer): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", fileURLToPath(new URL("./storage.ps1", import.meta.url))],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = []; let bytes = 0, stderr = 0, done = false;
    const finish = (bad: boolean) => {
      if (done) return; done = true; clearTimeout(timer);
      try { if (bad) return reject(new BackupRejected()); resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new BackupRejected()); }
      finally { chunks.forEach(x => x.fill(0)); }
    };
    const timer = setTimeout(() => { child.kill(); finish(true); }, 30000); timer.unref();
    child.stdout.on("data", (b: Buffer) => { bytes += b.length; if (bytes > 256 * 1024) { child.kill(); finish(true); } else chunks.push(Buffer.from(b)); });
    child.stderr.on("data", (b: Buffer) => { stderr += b.length; if (stderr > 8192) { child.kill(); finish(true); } });
    child.once("error", () => finish(true)); child.once("close", code => finish(code !== 0 || stderr !== 0));
    child.stdin.once("error", () => finish(true));
    child.stdin.end(payload);
  });
}
