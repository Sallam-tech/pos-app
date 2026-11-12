import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { BetterAuthOptions } from "@better-auth/core";
import { isValidPasswordInput } from "./password-policy";

export { passwordPolicy } from "./password-policy";

type PasswordCallbacks = NonNullable<NonNullable<BetterAuthOptions["emailAndPassword"]>["password"]>;

// Existing SQL: 32 lowercase salt hex + ":" + 128 lowercase payload hex.
// Payload = ASCII "POSPW001" (8 public version bytes) + scrypt output (56 bytes).
// V001 fixes EVERY parameter below. No attacker-supplied work factors or fallback.
const markerHex = Buffer.from("POSPW001", "ascii").toString("hex");
const keyBytes = 56;
const work = Object.freeze({ N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 });
const maxConcurrent = 2;
let inFlight = 0;

const failed = () => new Error("Password operation failed.");
function encodePassword(value: unknown): Buffer | undefined {
  if (!isValidPasswordInput(value)) return;
  return Buffer.from(value, "utf8");
}

async function derive(password: Buffer, salt: Buffer): Promise<Buffer> {
  // No unbounded libuv queue. Saturation fails closed; persistent login throttling
  // belongs to the future login boundary, not this resource admission limit.
  if (inFlight >= maxConcurrent) throw failed();
  inFlight++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, keyBytes, work, (error, key) => {
        if (error) { key?.fill(0); reject(failed()); }
        else resolve(key);
      });
    });
  } finally { inFlight--; }
}

async function hash(password: string): Promise<string> {
  let bytes: Buffer | undefined, salt: Buffer | undefined, key: Buffer | undefined;
  try {
    bytes = encodePassword(password);
    if (!bytes) throw failed();
    salt = randomBytes(16); // Full 128-bit random salt, separate from version bytes.
    key = await derive(bytes, salt);
    return salt.toString("hex") + ":" + markerHex + key.toString("hex");
  } catch {
    throw failed(); // No password, underlying error details or nested cause.
  } finally {
    bytes?.fill(0); salt?.fill(0); key?.fill(0);
  }
}

async function compareExact(data: { hash: string; password: string }): Promise<boolean> {
  let bytes: Buffer | undefined, salt: Buffer | undefined;
  let expected: Buffer | undefined, actual: Buffer | undefined;
  try {
    if (!data || typeof data !== "object") throw failed();
    const encoded = data.hash;
    if (typeof encoded !== "string" || encoded.length !== 161 ||
        !/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(encoded) ||
        encoded.slice(33, 49) !== markerHex) throw failed(); // Public format/version.
    bytes = encodePassword(data.password);
    if (!bytes) throw failed();
    salt = Buffer.from(encoded.slice(0, 32), "hex");
    expected = Buffer.from(encoded.slice(49), "hex");
    actual = await derive(bytes, salt);
    return timingSafeEqual(actual, expected); // Fixed 56-byte binary keys only.
  } finally {
    bytes?.fill(0); salt?.fill(0); expected?.fill(0); actual?.fill(0);
  }
}

async function verify(data: { hash: string; password: string }): Promise<boolean> {
  try { return await compareExact(data); } catch { return false; } // Existing login failure semantics.
}

// PRIVATE policy helper for trusted stored hashes. Mismatch must be proven by
// successful native derivation; an error/invalid hash can NEVER prove non-reuse.
export async function assertPasswordNotReused(password: string, encoded: string): Promise<void> {
  try { if (await compareExact({ hash: encoded, password })) throw failed(); }
  catch { throw failed(); } // No secret/native cause escapes.
}

// Both callbacks are mandatory here: never inherit the pinned default verifier.
export const passwordCallbacks = Object.freeze({ hash, verify }) satisfies PasswordCallbacks;
