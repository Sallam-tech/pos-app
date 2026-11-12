import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { inspectMaintenanceRecordCandidates, type MaintenanceRecordBinding } from "../../src/server/bootstrap/maintenance-record-contract";
import { enrollmentDigest } from "../../src/server/bootstrap/database";
import { reviewedMigrations } from "../../src/server/db/reviewed-schema";
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const bytes = (v: unknown) => Buffer.from(JSON.stringify(v));
function records() {
  const binding: MaintenanceRecordBinding = { installationId: randomUUID(), deviceId: randomUUID(), enrollmentIntentId: randomUUID(),
    vaultDigest: digest("TEST-vault"), databaseFingerprint: digest("TEST-file"), anchorDigest: digest("TEST-anchor"), enrollmentCommittedDigest: digest("TEST-enrollment-commit") };
  const migrations = reviewedMigrations(), manifest = (n: number) => enrollmentDigest(migrations.slice(0, n).map(m => [m.version, m.name, m.checksum]));
  const intent = ["POS_MAINTENANCE_V1", "INTENT", randomUUID(), ...Object.values(binding), manifest(8), manifest(18), digest("TEST-preserved-rows"),
    randomUUID(), digest("TEST-ciphertext"), digest("TEST-UNVERIFIED-restore-evidence"), randomUUID(), digest("TEST-UNVERIFIED-owner-evidence"), "1900000000000"];
  const completion = [...intent]; completion[1] = "COMPLETION"; completion.push(digest(intent), "COMMIT_CONFIRMED", intent[12], "1900000000001");
  const inspect = (input: unknown = [bytes(intent), bytes(completion)], expected = binding) => inspectMaintenanceRecordCandidates(input, expected);
  return { binding, intent, completion, inspect };
}
function neverAuthorizes(value: ReturnType<typeof inspectMaintenanceRecordCandidates>) {
  expect(Object.isFrozen(value)).toBe(true);
  for (const [key, field] of Object.entries(value)) if (key !== "status") expect(field).toBe(false);
}
it("requires absent records without fabricating maintenance or recovery", () => {
  const f = records(), value = f.inspect([]); expect(value.status).toBe("RECORDS_REQUIRED"); neverAuthorizes(value);
});
it("classifies intent-only as recovery review and never a safe automatic retry", () => {
  const f = records(), value = f.inspect([bytes(f.intent)]); expect(value.status).toBe("INTENT_REQUIRES_RECOVERY_REVIEW"); neverAuthorizes(value);
});
it("treats a syntactically matching completion as unverified, NOT proof of real COMMIT or restore", () => {
  const value = records().inspect(); expect(value.status).toBe("PREREQUISITES_UNVERIFIED"); neverAuthorizes(value);
});
it("rejects completion without intent, reversed order and repeated records", () => {
  const f = records(); for (const input of [[bytes(f.completion)], [bytes(f.completion), bytes(f.intent)], [bytes(f.intent), bytes(f.intent)], [bytes(f.completion), bytes(f.completion)]]) {
    const value = f.inspect(input); expect(value.status).toBe("INVALID_RECORDS"); neverAuthorizes(value);
  }
});
it.each([10, 11])("rejects unreviewed manifest at position %i", position => {
  const f = records(); f.intent[position] = digest("TEST-unknown-manifest"); expect(f.inspect([bytes(f.intent)]).status).toBe("INVALID_RECORDS");
});
it("rejects installation/file/vault/anchor and original enrollment identity mismatches", () => {
  const f = records(); for (const key of Object.keys(f.binding) as (keyof MaintenanceRecordBinding)[]) {
    const expected = { ...f.binding, [key]: key.endsWith("Id") ? randomUUID() : digest("TEST-other-identity") };
    expect(f.inspect(undefined, expected).status).toBe("INVALID_RECORDS");
  }
});
it("rejects old-operation replay and mismatched backup/owner/restore/data bindings", () => {
  for (const index of [2, 12, 13, 14, 15, 16, 17]) {
    const f = records(); f.completion[index] = [2, 13, 16].includes(index) ? randomUUID() : digest("TEST-other-binding");
    expect(f.inspect().status).toBe("INVALID_RECORDS");
  }
});
it("rejects unknown COMMIT outcomes and damaged intent/completion digests", () => {
  for (const index of [19, 20, 21]) { const f = records(); f.completion[index] = index === 20 ? "COMMIT_UNKNOWN" : digest("TEST-wrong-outcome"); expect(f.inspect().status).toBe("INVALID_RECORDS"); }
});
it("rejects malformed UTF8/JSON, objects/duplicate-property objects and unknown tuple fields", () => {
  const f = records(); for (const bad of [Buffer.from([255]), Buffer.from("["), Buffer.from('{"kind":"INTENT","kind":"COMPLETION"}'), bytes({ kind: "INTENT" }), bytes([...f.intent, "extra"]), bytes(f.intent.map((x, i) => i === 18 ? 1 : x))]) {
    expect(f.inspect([bad]).status).toBe("INVALID_RECORDS");
  }
});
it("bounds record bytes and count before accepting any content", () => {
  const f = records(); for (const input of [[new Uint8Array(8193)], [new Uint8Array()], [bytes(f.intent), bytes(f.completion), bytes(f.intent)], ["not-bytes"], {}]) expect(f.inspect(input).status).toBe("INVALID_RECORDS");
});
it("rejects unsafe/noncanonical timestamps and completion before preparation", () => {
  for (const time of ["0", "-1", "01", "8640000000000001", "9223372036854775808"]) { const f = records(); f.intent[18] = time; expect(f.inspect([bytes(f.intent)]).status).toBe("INVALID_RECORDS"); }
  const f = records(); f.completion[22] = "1899999999999"; expect(f.inspect().status).toBe("INVALID_RECORDS");
});
it("rejects caller-provided verification flags rather than trusting them", () => {
  const f = records(); const forged = { ...f.binding, recoveryVerified: true, ownerAuthorized: true };
  expect(f.inspect(undefined, forged).status).toBe("INVALID_RECORDS");
});
it("does not expose record identities, evidence digests, arbitrary input or credential-looking fields", () => {
  const f = records(), value = f.inspect(), json = JSON.stringify(value);
  for (const field of f.intent) expect(json).not.toContain(field);
  const malformed = { password: "TEST-NONCREDENTIAL-MARKER", hash: "TEST-NONCREDENTIAL-MARKER" };
  expect(JSON.stringify(f.inspect([bytes(malformed)]))).not.toContain("TEST-NONCREDENTIAL-MARKER"); neverAuthorizes(value);
});
