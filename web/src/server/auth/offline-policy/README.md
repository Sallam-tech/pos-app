# Historical Part3C offline screening subset, version 1

SUPERSEDED for runtime use by Part3G. BOTH roles use the unchanged reviewed46,483-entry
[8+ artifact and shared screening](../admin-policy/README.md). This329-entry15+ subset
and its original provenance are retained for historical evidence/license; descriptions
below record the Part3C implementation, not the current password policy.

Used only by the server-only first-run module. It is not a password verifier.
No network access, optional remote API, downloaded executable or dependency is needed at runtime.

Source: SecLists, MIT, pinned commit 1a7bb9127eca9e6ff2fc0301c597fe6e16a0cb56:
https://github.com/danielmiessler/SecLists/blob/1a7bb9127eca9e6ff2fc0301c597fe6e16a0cb56/Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt

The filename says100k; the actual pinned file contains99,840 records,835,538 bytes.
Source Git blob38eb37702244f55fda75cab281eb2145cd7685b6 and SHA-256
c2e5696882c603b76bb67a47ee970897e5a76fc4c3f5547abe3d0ca340c576e0.
It contains331 values satisfying the EXISTING15-128 scalar /512-byte policy.
Case-folding and deduplication leave329 distinct digest records (21,385 bytes).
The source is an historical common-password corpus, not an exhaustive/current breach feed.

Derivation: decode strict UTF-8; split LF records, remove a final CR per record;
keep well-formed ORIGINAL values with15..128 Unicode scalar values and <=512 UTF-8 bytes;
lowercase for SCREENING ONLY; SHA-256 over UTF-8; deduplicate/sort lowercase64-char hex;
one digest per LF-terminated line. The original plaintext corpus was never saved.
See manifest.json and LICENSE.txt. No actual submitted credential or its membership digest
is added to this dataset or written to reports/logs.

Runtime code pins output SHA-256
ddcdfd3086502e9d0266b8b02ef9e33fec87ea56580a863496e39127d159047d,
size/count/hex/ordering. Missing/changed/unsupported data rejects setup; there is no fallback.
Updates require review of source, license, transform, tests and the code-pinned hash/count.
The artifact must be included by future Next/Windows packaging; packaging is unverified.

assertOfflinePassword also rejects whole-value repetitions of1..4 scalar values.
It does not impose required character classes or reject useful passphrases merely
because they contain a dictionary word. Case-folding only rejects weak candidates;
it NEVER modifies the original value supplied to the Part3B scrypt callbacks.
Byte-distinct Unicode credentials still authenticate independently.

Membership SHA-256 is fast because this PUBLIC list is only a rejection policy.
Persisted user credentials ALWAYS use the approved independently salted memory-hard
scrypt callbacks. Dataset membership is not proof that an unlisted password is strong.
Other breach coverage, context-specific dictionaries and refresh cadence need owner review.
Persistent login throttling remains essential and unimplemented.

Reference basis:
- https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#implement-proper-password-strength-controls

These inform whole-value offline screening. This is not a NIST compliance claim:
approved exact-input/no-normalization policy and owner-controlled browser-password policy
remain binding; broader security/deployment requirements are not certified here.
