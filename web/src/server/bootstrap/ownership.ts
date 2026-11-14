import "server-only";

import { lstatSync } from "node:fs";
import { acquireRuntimeOwnership, assertRuntimeOwnership } from "../hosting/ownership";
import { resolveDatabaseLocation, type DatabaseOptions } from "../db/location";
import { rejectBootstrap } from "./windows";

const ownerKey = Symbol.for("shop-pos.authorization.single-process-owner");
const state = globalThis as typeof globalThis & { [key: symbol]: boolean | undefined };
const leases = new WeakMap<object, { filename: string; device: bigint; inode: bigint; retain: () => void; assertHeld: () => void }>();
export function retainBootstrapLease(lease: BootstrapLease): void { const owned = leases.get(lease); if (!owned) return rejectBootstrap(); owned.retain(); }
export interface BootstrapLease { readonly __bootstrapLease: unique symbol }
export function hasActiveBootstrapLease(lease: unknown, database: DatabaseOptions): lease is BootstrapLease {
  try {
    if (!lease || typeof lease !== "object" || state[ownerKey] !== true) return false;
    const entry = leases.get(lease), location = resolveDatabaseLocation({ ...database, create: false });
    if (!entry || entry.filename !== location.filename.toLowerCase()) return false;
    entry.assertHeld();
    const current = lstatSync(location.filename, { bigint: true });
    return current.dev === entry.device && current.ino === entry.inode;
  }
  catch { return false; }
}

// SAME auth process fence and existing machine-wide runtime guard. No second
// live gateway, DB owner, alternate guard port or automatic stale-lock repair.
export async function withBootstrapOwnership<T>(database: DatabaseOptions, work: (retainOwnership: () => void, lease: BootstrapLease) => Promise<T>): Promise<T> {
  if (state[ownerKey] || database.create === true) return rejectBootstrap();
  const filename = resolveDatabaseLocation({ ...database, create: false }).filename;
  const identity = lstatSync(filename, { bigint: true });
  state[ownerKey] = true;
  let guard: Awaited<ReturnType<typeof acquireRuntimeOwnership>> | undefined, releasable = true;
  const lease = Object.freeze({}) as BootstrapLease;
  try {
    guard = await acquireRuntimeOwnership(filename);
    guard.assertHeld();
    const current = lstatSync(filename, { bigint: true });
    if (current.dev !== identity.dev || current.ino !== identity.ino) return rejectBootstrap();
    leases.set(lease, { filename: filename.toLowerCase(), device: identity.dev, inode: identity.ino,
      retain: () => { releasable = false; }, assertHeld: guard.assertHeld });
    const result = await work(() => { releasable = false; }, lease);
    if (!hasActiveBootstrapLease(lease, database)) return rejectBootstrap();
    return result;
  } catch { return rejectBootstrap(); }
  finally {
    leases.delete(lease);
    // A failed release retains the existing runtime fence; do not claim recovery.
    if (!releasable) return rejectBootstrap();
    if (guard) {
      try { await guard.close(); }
      catch { rejectBootstrap(); }
    }
    delete state[ownerKey];
  }
}

// Borrow the SAME genuine runtime fence after its source native owner closes.
// This function takes ownership of the process marker synchronously, before any
// await. It never closes/reacquires the caller's machine-wide lease. This low-level
// scope alone grants no human, backup, migration, key or admission authority.
export async function withHeldBootstrapOwnership<T>(database: DatabaseOptions, runtime: unknown, work: (retainOwnership: () => void, lease: BootstrapLease) => Promise<T>): Promise<T> {
  if (state[ownerKey] || database.create === true || typeof work !== "function") return rejectBootstrap();
  assertRuntimeOwnership(runtime);
  const filename = resolveDatabaseLocation({ ...database, create: false }).filename;
  const identity = lstatSync(filename, { bigint: true });
  state[ownerKey] = true;
  let releasable = true;
  const lease = Object.freeze({}) as BootstrapLease;
  leases.set(lease, { filename: filename.toLowerCase(), device: identity.dev, inode: identity.ino,
    retain: () => { releasable = false; }, assertHeld: () => assertRuntimeOwnership(runtime) });
  try {
    if (!hasActiveBootstrapLease(lease, database)) return rejectBootstrap();
    const result = await work(() => { releasable = false; }, lease);
    if (!hasActiveBootstrapLease(lease, database)) return rejectBootstrap();
    return result;
  } catch { return rejectBootstrap(); }
  finally {
    leases.delete(lease);
    // Retention is fail-closed; the caller must retain its runtime fence too.
    if (!releasable) return rejectBootstrap();
    assertRuntimeOwnership(runtime);
    delete state[ownerKey];
  }
}
