import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertAdminPassword } from "../../src/server/auth/admin-password-policy";

const io = vi.hoisted(() => ({
  opens: 0, closes: 0, reads: 0, bytesRequested: 0, metadataCalls: 0,
  fault: "" as "" | "open" | "metadata" | "directory" | "oversize" | "changed-size" |
    "short" | "read" | "append" | "tamper" | "close" | "crypto",
  detail: "",
}));
// Real file/crypto operations except explicitly named failure injections. No
// password bytes are captured by the instrumentation; source files never change.
vi.mock("node:fs", async importOriginal => {
  const real = await importOriginal<typeof import("node:fs")>();
  return { ...real,
    openSync: (...args: Parameters<typeof real.openSync>) => {
      io.opens++;
      if (io.fault === "open") throw new Error(io.detail);
      return real.openSync(...args);
    },
    fstatSync: (descriptor: number) => {
      io.metadataCalls++;
      if (io.fault === "metadata") throw new Error(io.detail);
      const stat = real.fstatSync(descriptor);
      if (io.fault === "directory") stat.isFile = () => false;
      if (io.fault === "oversize" || (io.fault === "changed-size" && io.metadataCalls > 1)) stat.size++;
      return stat;
    },
    readSync: (descriptor: number, buffer: Buffer, offset: number, length: number, position: number | null) => {
      io.reads++; io.bytesRequested += length;
      if (io.fault === "read") throw new Error(io.detail);
      if (io.fault === "short") return 0;
      const count = real.readSync(descriptor, buffer, offset, length, position);
      if (io.fault === "append" && length === 1) return 1;
      if (io.fault === "tamper" && count > 0) buffer[offset] ^= 1;
      return count;
    },
    closeSync: (descriptor: number) => {
      io.closes++; real.closeSync(descriptor);
      if (io.fault === "close") throw new Error(io.detail);
    },
  };
});
vi.mock("node:crypto", async importOriginal => {
  const real = await importOriginal<typeof import("node:crypto")>();
  return { ...real, createHash: (...args: Parameters<typeof real.createHash>) => {
    if (io.fault === "crypto") throw new Error(io.detail);
    return real.createHash(...args);
  } };
});

const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");
const corpus = realFs.readFileSync(new URL("../../src/server/auth/admin-policy/common-passwords.sha256", import.meta.url));
const listed = new Set(corpus.toString("ascii").split("\n").filter(Boolean));
const secrets = new Set<string>();
const remember = (value: string) => { secrets.add(value); return value; };
const digest = (value: string) => createHash("sha256").update(value.toLowerCase(), "utf8").digest("hex");
const containsSecret = (text: string) => [...secrets].some(value => value.length >= 8 && text.includes(value));

function fake(length: number, alphabet = "abcdefghijklmnopqrstuvwxyz"): string {
  for (;;) {
    const bytes = randomBytes(length);
    const candidate = Array.from(bytes, value => alphabet[value % alphabet.length]).join("");
    const repeated = [...Array(Math.floor(length / 2))].some((_, i) => {
      const period = i + 1;
      return (period <= 4 || length % period === 0) &&
        [...candidate].every((character, index) => character === candidate[index % period]);
    });
    if (!listed.has(digest(candidate)) && !repeated) return remember(candidate);
  }
}
function rejects(value: unknown): void {
  let caught: unknown;
  try { assertAdminPassword(value); } catch (error) { caught = error; }
  expect(caught instanceof Error).toBe(true);
  const error = caught as Error;
  expect(error.message === "Admin password was rejected.").toBe(true);
  expect(Object.hasOwn(error, "cause")).toBe(false);
  expect(containsSecret(JSON.stringify({ message: error.message, stack: error.stack }))).toBe(false);
}
function listedSample(length: number): string {
  const word = String.fromCharCode(112, 97, 115, 115, 119, 111, 114, 100);
  const candidates = Array.from({ length: 10 }, (_, start) =>
    Array.from({ length }, (_, i) => String((i + start) % 10)).join(""));
  if (length === 8) candidates.push(word);
  else for (let start = 0; start < 10; start++) candidates.push(word +
    Array.from({ length: length - 8 }, (_, i) => String((i + start) % 10)).join(""));
  const found = candidates.find(value => listed.has(digest(value)));
  expect(found !== undefined).toBe(true);
  return found!; // Public blocklist vector, not a generated credential.
}

beforeEach(() => {
  secrets.clear();
  Object.assign(io, { opens: 0, closes: 0, reads: 0, bytesRequested: 0, metadataCalls: 0, fault: "", detail: "" });
});
afterEach(() => {
  io.fault = "";
});

describe("Part 3E private ADMIN prospective-password policy", () => {
  it("exports only a frozen policy and assertion; import performs no policy IO", async () => {
    vi.resetModules();
    const imported = await import("../../src/server/auth/admin-password-policy");
    expect(Object.keys(imported).sort()).toEqual(["adminPasswordPolicy", "assertAdminPassword"]);
    expect(Object.isFrozen(imported.adminPasswordPolicy)).toBe(true);
    expect(imported.adminPasswordPolicy).toEqual({ minCharacters: 8, maxCharacters: 128, maxUtf8Bytes: 512 });
    expect(io.opens).toBe(0);
  });
  it("rejects seven characters and accepts exactly eight without composition rules", () => {
    rejects(fake(7));
    expect(assertAdminPassword(fake(8)) === undefined).toBe(true);
  });
  it("accepts nonlisted passwords throughout the newly approved 8..14 range", () => {
    for (let length = 8; length <= 14; length++) expect(assertAdminPassword(fake(length)) === undefined).toBe(true);
  });
  it("accepts long nonlisted values up to 128 and rejects 129 without truncating", () => {
    expect(assertAdminPassword(fake(64)) === undefined).toBe(true);
    expect(assertAdminPassword(fake(128)) === undefined).toBe(true);
    const opens = io.opens;
    rejects(fake(129));
    expect(io.opens === opens).toBe(true);
  });
  it("counts astral characters as scalars and accepts the 512-byte maximum", () => {
    const value = remember(Array.from({ length: 128 }, (_, i) => String.fromCodePoint(0x1f300 + i)).join(""));
    expect([...value].length).toBe(128);
    expect(Buffer.byteLength(value)).toBe(512);
    expect(assertAdminPassword(value) === undefined).toBe(true);
    rejects(value + String.fromCodePoint(0x1f500));
  });
  it("rejects seven astral characters even though their UTF-16 length exceeds eight", () => {
    const value = remember(Array.from({ length: 8 }, (_, i) => String.fromCodePoint(0x1f300 + i)).join(""));
    rejects(value.slice(0, -2));
    expect(assertAdminPassword(value) === undefined).toBe(true);
  });
  it("rejects malformed Unicode, nonstrings and oversized inputs before corpus work", () => {
    let coerced = false;
    for (const value of [null, undefined, 12345678, {}, [], Object(fake(8)), Symbol(),
      { toString() { coerced = true; throw new Error("must not coerce"); } },
      fake(8) + "\ud800", "\udc00" + fake(8), "x".repeat(1_000_000)]) rejects(value);
    expect(coerced).toBe(false);
    expect(io.opens).toBe(0);
  });
  it("preserves significant whitespace and NUL with no trimming or normalization", () => {
    const candidate = remember(" " + fake(5) + "\u0000 ");
    const trim = vi.spyOn(String.prototype, "trim").mockImplementation(() => { throw new Error("unexpected trim"); });
    const normalize = vi.spyOn(String.prototype, "normalize").mockImplementation(() => { throw new Error("unexpected normalization"); });
    let succeeded = false;
    try { assertAdminPassword(candidate); succeeded = true; }
    finally { trim.mockRestore(); normalize.mockRestore(); }
    expect(succeeded).toBe(true);
    expect([...candidate].length).toBe(8);
  });
  it("accepts byte-distinct canonical and compatibility Unicode forms independently", () => {
    const prefix = fake(7);
    const composed = remember(prefix + "\u00e9"), decomposed = remember(prefix + "e\u0301");
    const ascii = fake(8);
    const fullwidth = remember([...ascii].map(character => String.fromCodePoint(character.codePointAt(0)! + 0xfee0)).join(""));
    for (const value of [composed, decomposed, ascii, fullwidth]) expect(assertAdminPassword(value) === undefined).toBe(true);
    expect(Buffer.byteLength(composed) !== Buffer.byteLength(decomposed)).toBe(true);
    expect(Buffer.byteLength(ascii) !== Buffer.byteLength(fullwidth)).toBe(true);
    // This module validates only. Actual byte-distinct authentication at 8..14
    // remains a later callback-integration test; shared callbacks still require15.
  });
  it("allows lowercase-only, digits-only and Unicode-only nonlisted candidates", () => {
    for (const value of [fake(8), fake(12, "0123456789"), fake(8, "\u7532\u4e59\u4e19\u4e01\u620a\u5df1\u5e9a\u8f9b\u58ec\u7678")])
      expect(assertAdminPassword(value) === undefined).toBe(true);
  });
  it("rejects actual corpus members at every length from eight through fourteen", () => {
    for (let length = 8; length <= 14; length++) rejects(listedSample(length));
    expect(io.opens).toBe(7);
  });
  it("screens case variants of common values while imposing no character classes", () => {
    const value = String.fromCharCode(112, 97, 115, 115, 119, 111, 114, 100);
    expect(listed.has(digest(value))).toBe(true);
    rejects(value);
    rejects(value.toUpperCase());
  });
  it("rejects unlisted short cycles and longer complete whole-value repetitions", () => {
    const unlistedRepeat = (unitLength: number, times: number) => {
      for (;;) {
        const candidate = fake(unitLength, "\u7532\u4e59\u4e19\u4e01\u620a\u5df1\u5e9a\u8f9b").repeat(times);
        if (!listed.has(digest(candidate))) return remember(candidate);
      }
    };
    const values = [unlistedRepeat(4, 2), unlistedRepeat(7, 2), unlistedRepeat(1, 12)];
    for (const value of values) {
      expect(listed.has(digest(value))).toBe(false);
      rejects(value);
    }
  });
  it("does not reject a useful longer value for containing a blocked substring", () => {
    const value = remember(fake(12) + listedSample(8) + fake(12));
    expect(listed.has(digest(value))).toBe(false);
    expect(assertAdminPassword(value) === undefined).toBe(true);
  });
  it("preserves every previous 15+ screening entry and verifies new artifact provenance", () => {
    const previous = realFs.readFileSync(new URL("../../src/server/auth/offline-policy/common-passwords.sha256", import.meta.url), "ascii").trimEnd().split("\n");
    const manifest = JSON.parse(realFs.readFileSync(new URL("../../src/server/auth/admin-policy/manifest.json", import.meta.url), "utf8"));
    expect(previous.every(value => listed.has(value))).toBe(true);
    expect(listed.size).toBe(46483);
    expect(corpus.length).toBe(3021395);
    expect(createHash("sha256").update(corpus).digest("hex") === manifest.outputSha256).toBe(true);
    expect(manifest.eligible8to14).toBe(46993);
    expect(realFs.existsSync(new URL("../../src/server/auth/offline-policy/LICENSE.txt", import.meta.url))).toBe(true);
  });
  it("fails closed on a missing or inaccessible corpus without leaking file errors", () => {
    io.detail = fake(24); io.fault = "open";
    rejects(fake(8));
    expect(io.closes).toBe(0);
  });
  it("rejects a directory or oversized corpus before allocating or reading its contents", () => {
    const value = fake(8);
    for (const fault of ["directory", "oversize"] as const) {
      io.fault = fault; rejects(value);
    }
    expect(io.reads).toBe(0);
    expect(io.closes).toBe(2);
  });
  it("rejects short reads, growth and post-read metadata changes with bounded reads", () => {
    const value = fake(8);
    for (const fault of ["short", "append", "changed-size"] as const) {
      io.fault = fault; io.bytesRequested = 0; rejects(value);
      expect(io.bytesRequested <= corpus.length + 1).toBe(true);
    }
    expect(io.closes).toBe(3);
  });
  it("rejects a same-size tampered corpus and never falls back to a stale cache", () => {
    const value = fake(8);
    expect(assertAdminPassword(value) === undefined).toBe(true);
    io.fault = "tamper"; rejects(value);
    io.fault = "";
    expect(assertAdminPassword(value) === undefined).toBe(true);
    expect(io.opens).toBe(3);
    expect(io.closes).toBe(3);
  });
  it("sanitizes metadata, read, close and crypto failures and closes acquired handles", () => {
    const value = fake(8);
    io.detail = fake(24);
    for (const fault of ["metadata", "read", "close", "crypto"] as const) {
      io.fault = fault; rejects(value);
    }
    expect(io.opens).toBe(4);
    expect(io.closes).toBe(4);
  });
  it("returns no credential data and emits no ordinary response or console secrets", () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(name => vi.spyOn(console, name).mockImplementation(() => {}));
    try {
      const value = fake(8);
      const result = assertAdminPassword(value);
      io.detail = fake(24); io.fault = "read";
      rejects(value);
      expect(result === undefined).toBe(true);
      const output = JSON.stringify({ result });
      expect(output === "{}").toBe(true);
      expect(containsSecret(output)).toBe(false);
      expect(output.includes(digest(value))).toBe(false);
      expect(spies.every(spy => spy.mock.calls.length === 0)).toBe(true);
    } finally { for (const spy of spies) spy.mockRestore(); }
  });
});
