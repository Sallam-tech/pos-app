# Shared ADMIN / SALESPERSON offline password policy, version 1

Part3G: the reviewed Part3E artifact now screens BOTH role passwords through
server-only offline-password.ts. password-policy.ts supplies the one8..128/512-byte
bounds policy to screening AND the real scrypt callbacks. admin-password-policy.ts
retains its Admin assertion by delegation, without duplicated constants/logic.
Private atomic provisioning invokes this screen for BOTH roles. No real enrollment,
login/session issuance or runtime internet access is enabled. The old329-entry subset
is retained as historical Part3C evidence only; it is not the active Salesperson list.

Bounds: 8..128 well-formed Unicode scalar values (not UTF-16 units or grapheme clusters),
at most512 UTF-8 bytes. At most4 bytes/scalar makes512 compatible with every allowed
128-scalar input and the existing crypto envelope. A256-unit precheck bounds work on
oversized inputs. Unpaired surrogates reject. No trimming, normalization, truncation,
case conversion of the credential, or mandatory character classes.
The assertion returns nothing; future authentication must use the ORIGINAL input.

## Provenance and reproducible transform

Source: [SecLists immutable NCSC-named common-password file](https://github.com/danielmiessler/SecLists/blob/1a7bb9127eca9e6ff2fc0301c597fe6e16a0cb56/Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt).
MIT notice: [existing full license](../offline-policy/LICENSE.txt), which must accompany
distribution. This is the same pinned source reviewed in Part3C, not a new dependency.

- Commit:1a7bb9127eca9e6ff2fc0301c597fe6e16a0cb56.
- Source835,538 bytes /99,840 actual records, despite the100k filename.
- Git blob38eb37702244f55fda75cab281eb2145cd7685b6.
- Source SHA-256 c2e5696882c603b76bb67a47ee970897e5a76fc4c3f5547abe3d0ca340c576e0.
-47,324 eligible original records;46,993 have8..14 scalars.
-46,483 unique screening digests, including ALL previous329 entries;46,154 additional
  unique entries. Artifact3,021,395 bytes, LF-terminated lowercase64-hex lines.
- Output SHA-256 f7d5f776bc1b4a59c507b67f09f80806a023c7fbb49ed465c4bb8362ac987734.

Generation used Node24.11.0: verify source size/SHA-256/Git-blob identity IN RAM; decode
strict UTF-8; split LF and remove the empty final record and one trailing CR per record;
retain ORIGINAL well-formed8..128-scalar/<=512-byte values; apply String.toLowerCase()
to a SCREENING COPY; SHA-256 its UTF-8; deduplicate/sort lowercase hex; append LF per
record. No source plaintext was saved or printed. Full metadata is in manifest.json.
This is Unicode lowercasing, not a claim of universal Unicode case folding.
No submitted credential or membership digest is added to the corpus or evidence.

Runtime opens only this static asset, checks regular-file/exact size BEFORE a fixed
allocation, bounds reads to artifact size plus one EOF-check byte, checks final size,
code-pinned SHA-256, record syntax/count/order/uniqueness, then performs whole-value
membership screening. No caller path, network fallback or mutable cache.
All file/crypto/close errors reject generically without underlying details or a cause.
Handles close on success/failure. The local .gitattributes keeps checkout bytes LF.

Supplementary rejection covers whole-value short cycles of1..4 scalars, including a
partial final cycle, and any complete repetition of a shorter unit at least twice.
No dictionary-substring ban, character-class rule or homemade entropy score.

## Limits and later use

This historical common/compromised-password collection is bounded, not a current or
exhaustive breach feed. It does not enumerate every weak, context-specific, modified
or leaked password. Passing screening is not proof of strength. Corpus refreshes need
review of provenance/license/transform/tests and the code-pinned hash/count.
Fast SHA-256 membership is ONLY public-list rejection, NEVER credential storage,
credential equality or authentication. Existing salted scrypt remains unchanged.

Read/hash/parse happens on each prospective-password validation; there is no stale
cache. This bounds memory by the fixed artifact and46,483 entries, but does synchronous
filesystem/CPU work. Use at trusted enrollment/change, NOT on every login.
Target Windows latency and packaged Next/EXE asset tracing/inclusion are unverified;
ship the asset and license with exact bytes and fail closed if unavailable.

[OWASP password controls](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#implement-proper-password-strength-controls)
and [NIST password guidance](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver)
inform whole-value blocklisting and avoiding composition requirements. The owner-approved
eight-character minimum is below their15-character single-factor guidance; this is NOT
a compliance or production-security approval. Exact-input/no-normalization remains binding.
Persistent throttling, protected deployment, recovery and extra strong Remote Admin
authentication remain separate mandatory gates. The4/5-digit PIN path stays DISABLED; the owner approved8+ passwords for BOTH roles.
