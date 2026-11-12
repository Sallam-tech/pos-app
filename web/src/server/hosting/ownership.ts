import "server-only";

import { lstatSync, realpathSync } from "node:fs";
import net from "node:net";
import path from "node:path";

export class LocalRuntimeRejected extends Error {
  constructor() { super("Local service unavailable."); this.name = "LocalRuntimeRejected"; }
}
const reject = (): never => { throw new LocalRuntimeRejected(); };
const marker = Symbol.for("shop-pos.local-runtime.owner");
const state = globalThis as typeof globalThis & { [key: symbol]: boolean | undefined };

// Internal, called only AFTER the existing DB path validator. No PID/lock file,
// stale-lock deletion, process killing or second SQLite handle. A fixed application
// namespace rejects a second runtime EVEN with another DB or HTTPS port. It is
// machine-wide (deliberately stricter than per-Windows-user). Collisions deny.
export async function acquireRuntimeOwnership(filename: string): Promise<{ assertHeld(): void; close(): Promise<void> }> {
  try {
    if (state[marker] || !path.isAbsolute(filename)) return reject();
    const stat = lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
        realpathSync.native(filename).toLowerCase() !== path.resolve(filename).toLowerCase()) return reject();
  } catch { return reject(); }
  state[marker] = true;
  // Fixed application namespace v1, below default Windows dynamic ports. Never
  // change/probe/fall back while another application version might be running.
  const port = 36917;
  const server = net.createServer(socket => socket.destroy()); // Ownership only: no HTTP/API.
  try {
    await new Promise<void>((resolve, fail) => {
      server.once("error", fail);
      server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
        server.removeListener("error", fail); resolve();
      });
    });
  } catch { delete state[marker]; return reject(); }
  // An unexpected OS error must not become a misleading successful release.
  let broken = false;
  server.on("error", () => { broken = true; });
  let closing: Promise<void> | undefined;
  return Object.freeze({
    assertHeld() { if (broken || !server.listening || !state[marker]) return reject(); },
    close() {
      closing ??= new Promise<void>((resolve, fail) => server.close(error => {
        if (error || broken) { fail(new LocalRuntimeRejected()); return; }
        delete state[marker]; resolve();
      }));
      return closing;
    },
  });
}
