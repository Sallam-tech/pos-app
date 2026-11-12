import "server-only";

// Owner-approved initial-release policy for BOTH fixed roles. Scalar values are
// code points, not UTF-16 units/graphemes; never transform credential input.
export const passwordPolicy = Object.freeze({
  minCharacters: 8, maxCharacters: 128, maxUtf8Bytes: 512,
});

export function isValidPasswordInput(value: unknown): value is string {
  if (typeof value !== "string" || value.length < passwordPolicy.minCharacters ||
      value.length > passwordPolicy.maxCharacters * 2 || !value.isWellFormed()) return false;
  const characters = [...value].length;
  return characters >= passwordPolicy.minCharacters && characters <= passwordPolicy.maxCharacters &&
    Buffer.byteLength(value, "utf8") <= passwordPolicy.maxUtf8Bytes;
}
