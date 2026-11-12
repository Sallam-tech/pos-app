import "server-only";

import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { isValidPasswordInput } from "./password-policy";

// Reviewed Part3E screen, now shared by ADMIN and SALESPERSON.
const corpusCount = 46483;
const corpusBytes = corpusCount * 65;
const corpusHash = "f7d5f776bc1b4a59c507b67f09f80806a023c7fbb49ed465c4bb8362ac987734";
const rejected = () => new Error("Password was rejected.");

function readCorpus(): Set<string> {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(new URL("./admin-policy/common-passwords.sha256", import.meta.url), "r");
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size !== corpusBytes) throw rejected();
    // Fixed allocation/read bound, including if the file grows after fstat.
    const source = Buffer.alloc(corpusBytes);
    let offset = 0;
    while (offset < source.length) {
      const count = readSync(descriptor, source, offset, source.length - offset, null);
      if (count === 0) throw rejected();
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, null) !== 0 ||
        fstatSync(descriptor).size !== corpusBytes ||
        createHash("sha256").update(source).digest("hex") !== corpusHash) throw rejected();
    const lines = source.toString("ascii").split("\n");
    if (lines.pop() !== "" || lines.length !== corpusCount || lines.some((line, index) =>
      !/^[0-9a-f]{64}$/.test(line) || (index > 0 && lines[index - 1] >= line))) throw rejected();
    return new Set(lines);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * Validate a prospective password for EITHER role, without returning or changing it.
 * No IO at import; no credentials, credential hashes or sessions are created.
 * Call only during trusted enrollment/change, not on each login.
 */
export function assertOfflinePassword(value: unknown): asserts value is string {
  try {
    if (!isValidPasswordInput(value)) throw rejected();
    const characters = [...value];

    // Public blocklist membership ONLY, never a credential hash/comparison.
    // Screening lowercases a COPY; authentication must retain the ORIGINAL bytes.
    const corpus = readCorpus();
    const membership = createHash("sha256").update(value.toLowerCase(), "utf8").digest("hex");
    if (corpus.has(membership)) throw rejected();

    // Whole-value repetition: short cycles (1..4, even with a partial final cycle)
    // and any complete repeated unit. No class/word/substring/entropy requirements.
    for (let period = 1; period <= Math.floor(characters.length / 2); period++) {
      if (period > 4 && characters.length % period !== 0) continue;
      if (characters.every((character, index) => character === characters[index % period])) throw rejected();
    }
  } catch {
    // Includes unavailable/changed corpus and IO/crypto/close failures. No cause,
    // submitted value, membership digest or underlying file/error detail escapes.
    throw rejected();
  }
}
