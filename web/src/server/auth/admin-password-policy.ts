import "server-only";

import { passwordPolicy } from "./password-policy";
import { assertOfflinePassword } from "./offline-password";

// Retain the reviewed ADMIN entry point; BOTH roles now share its policy and
// screening implementation. No separate constants, verifier, PIN or fallback.
export const adminPasswordPolicy = passwordPolicy;
export function assertAdminPassword(value: unknown): asserts value is string {
  try { assertOfflinePassword(value); }
  catch { throw new Error("Admin password was rejected."); }
}
