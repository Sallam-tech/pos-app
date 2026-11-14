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
const leases=new WeakSet<object>();
const pins=new WeakMap<object,number>();
export function pinRuntimeOwnership(lease:unknown):()=>void {
 assertRuntimeOwnership(lease);const owned=lease as object;pins.set(owned,(pins.get(owned)??0)+1);let released=false;
 return ()=>{if(released)return reject();assertRuntimeOwnership(owned);const n=pins.get(owned);if(!n)return reject();released=true;if(n===1)pins.delete(owned);else pins.set(owned,n-1);};
}
export function assertRuntimeOwnership(lease:unknown){if(!lease||typeof lease!=="object"||!leases.has(lease))return reject();(lease as {assertHeld():void}).assertHeld();}
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
  const lease = Object.freeze({
    assertHeld() { if (broken || !server.listening || !state[marker]) return reject(); },
    close() {
      if(pins.get(lease))return Promise.reject(new LocalRuntimeRejected());
      closing ??= new Promise<void>((resolve, fail) => server.close(error => {
        if (error || broken) { fail(new LocalRuntimeRejected()); return; }
        delete state[marker]; resolve();
      }));
      return closing;
    },
  });
  leases.add(lease);return lease;
}
