import "server-only";
import { LocalRuntimeRejected } from "./ownership";

// November11 security release: earlier24.x contains HIGH TLS/SNI defects.
// This floor is an admission check, not a claim that future releases need no review.
export const MINIMUM_SECURE_NODE24 = "24.22.3";
export function isPatchedNode24(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^24\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/.exec(value);
  if (!match) return false;
  const minor = Number(match[1]), patch = Number(match[2]);
  return minor > 22 || (minor === 22 && patch >= 3);
}
export function assertPatchedLocalRuntime(): void {
  if (!isPatchedNode24(process.versions.node)) throw new LocalRuntimeRejected();
}
