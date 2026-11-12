import "server-only";

import { DatabaseFoundationError } from "./errors";

export const INT64_MIN = BigInt("-9223372036854775808");
export const INT64_MAX = BigInt("9223372036854775807");

export function int64(value: unknown): bigint {
  if (typeof value !== "bigint" || value < INT64_MIN || value > INT64_MAX) {
    throw new DatabaseFoundationError("UNSAFE_INTEGER", "SQLite integers must be signed 64-bit BigInt values.");
  }
  return value;
}

export function addInt64(left: bigint, right: bigint): bigint {
  return int64(int64(left) + int64(right));
}
