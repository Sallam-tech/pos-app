# B1b Part 3D - Owner credential UX, recovery, enrollment and restore contract

CURRENT INITIAL-RELEASE AMENDMENT - Part3G,10 November2026: the owner now approves
8..128 Unicode scalar /<=512 UTF-8-byte passwords for BOTH ADMIN and SALESPERSON,
without composition rules or credential transformations. This supersedes the initial
15-character policy AND the4-digit Salesperson PIN requirement below. PIN remains
DISABLED; Part3F did not demonstrate its required device/fresh-input/retry protections.
Part3G integrates the reviewed password callbacks/screening/private TEST provisioning;
real enrollment/login/recovery/restore remain gated. Fresh authentication on every
specified transition, no UI credential storage, unchanged business/closing data and
additional strong Remote Admin authentication remain requirements.

The dated3D text below is preserved as historical recovery/design review. Its old
credential minima, unintegrated-code descriptions and proposed next task are superseded
by Part3G; its recovery/portable-backup/owner-custody proposals remain pending, not implemented.

10 November 2026. **Revised for the latest owner requirements. Documentation only.**
The earlier 15-character UX assumption is superseded. Part3B/3C code is unchanged.
**Four-digit Salesperson PIN activation is BLOCKED with the current foundation.**
Recovery, enrollment, login and restore remain unimplemented/unapproved for real use.

## 1. Confirmed owner UX requirements

| Area | Confirmed requirement |
| --- | --- |
| Admin | Minimum 8-character password; longer allowed. No mandatory uppercase, symbols or character-class composition rules. |
| Shared Salesperson | Minimum 4-digit numeric PIN; longer allowed. Allowed ONLY as a device-bound LOCAL authenticator with persistent attempt limits and protection against offline guessing. No ordinary server-password fallback. |
| Fresh authentication | Re-enter the selected role's credential on app reopen, logout, Back to Login and role change. No convenience storage/prefill or cached authenticator unlock that skips fresh input. |
| Offline | Normal local login/recovery needs neither internet, Remote Admin nor the developer laptop. |
| Recovery | Admin recovery codes reset credentials; they never directly log in. Authenticated Admin may reset/re-enroll the Salesperson PIN without granting Salesperson Admin capabilities. |
| Remote Admin | The short local password alone is insufficient. Additional strong authentication is mandatory; mechanism pending approval. |
| Shop state | Login/logout/restart never reset sales, stock, invoices, expenses, closing or backups. Daily Closing remains Admin-only; previous-day closing pending never blocks next-day sales. |

Exactly ADMIN and shared SALESPERSON remain the identities; no individual employee accounts
or attribution. Retain private server authorization, RAM sessions and authoritative SQLite
checks. A navigation action must actually end prior access; changing a screen is not logout.
Protected device keys are not remembered passwords/PINs and must not bypass fresh input.

**Input details proposed for approval:** Admin maximum128 Unicode scalar values/512 UTF-8
bytes; PIN maximum12 ASCII digits. The minimum8/minimum4 and longer-input intent are
confirmed; maximums/encoding remain implementation decisions. Preserve leading zeros and
exact strings: no trim, case conversion, Unicode normalization, truncation or numeric coercion.
Reject malformed Unicode, excess length and unsupported digit encodings explicitly.
No composition rule may be introduced indirectly by requiring a nonnumeric Admin password.
Known-compromised/common-credential screening is separate from character-class rules;
its revised coverage must be reviewed. Eight characters is not a claim of inherent strength
or compliance with a single-factor password standard.

## 2. Current implementation conflicts and PIN security blocker

Part3B password.ts enforces15-128 scalars in BOTH hash and verify callbacks. Part3C
offline-password.ts/provision.ts reuse that minimum; their shipped blocklist only contains
eligible15+ values. The present gateway/provisioner expect password credential records for
both roles. auth_credentials accepts a fixed161-character salted-scrypt representation,
with no device-authenticator metadata. **These components cannot be used unchanged.**
Earlier passing tests prove the previous policy, not the new owner UX. Older memory/report
text does not override the confirmed UX above or imply that source code has been updated.

A four-digit space contains only10,000 values. SQLite counters can limit requests to the
running service but cannot limit guesses against a copied database. Salts, scrypt,
encrypted backups, an enrollment latch or DPAPI alone do not establish a device-bound,
rate-limited PIN authenticator. Encrypting a software key solely with the PIN is insufficient.

A possible future route is a non-exportable device key unlocked through a supported
hardware-backed, attempt-limited authenticator, with the server verifying fresh,
role/device/app-bound proof. PIN checking must not be duplicated as an offline-checkable
SQLite/backup verifier. No software fallback, hidden substitute password or invented
authentication protocol is approved.

[NIST activation-secret guidance](https://pages.nist.gov/800-63-4/sp800-63b.html#activation-secrets)
distinguishes a local key-unlock PIN from a remotely verified password and requires retry
limiting. It does not approve this POS or prove its hardware path exists.

Windows Hello is only a feasibility reference: its PIN/device-key model has anti-hammering,
but supported configurations can cache key-use authorization, and enrollment/reset may
depend on an identity provider. [Microsoft's FAQ](https://learn.microsoft.com/en-us/windows/security/identity-protection/hello-for-business/faq)
and [implementation details](https://learn.microsoft.com/en-us/windows/security/identity-protection/hello-for-business/how-it-works)
do NOT establish support for our app-specific shared PIN, four-digit minimum, fresh input
on every required transition, or fully offline recovery. Windows-user proof is not POS-role
authorization. Software-only fallback or an OS-wide unlock ticket is unacceptable.

Persistent throttling, device binding and such a native integration are absent here.
**BLOCKED until a separately approved proof demonstrates ALL requirements on target Windows.**
If the supported platform cannot do so, report incompatibility and seek owner approval for
another authenticator/policy. Never silently raise the PIN minimum or enable an unsafe PIN.

## 3. Necessary changes - proposals only, none authorized here

| Scope | Required separate work |
| --- | --- |
| Admin verification | Role-specific8-character policy and bounded native scrypt verification. Rebuild/review offline screening for8-14 characters too; do not just lower a shared constant to4 or8. |
| PIN verification | Separate supported device-authenticator proof path, fresh challenge/input, anti-replay and Admin-controlled reset. Better Auth's password callbacks alone do not provide this. Prove compatibility with the pinned framework; stop if it requires unsupported internals. |
| Provisioning | Keep both identities/latch atomic and inaccessible until BOTH credential types and owner custody are ready. Device enrollment outside SQL needs a crash journal. Revisit safe cross-type distinctness; hash/key inequality is not proof, and a private PIN prompt may not support the old equivalence check. |
| Schema/gateway | Review additive device/public-key/binding/version metadata, persistent bounded counters, recovery/audit/security state and gateway completeness checks. The existing password-table shape is not a device credential. Never edit applied0001-0006; review runner/allowlist extensions explicitly. |
| Attempt limits | Server limits for Admin/login/recovery plus hardware-enforced PIN limits surviving restart, copied DB/backup and reset attempts. Propose a finite failed-PIN cap with privileged re-enrollment, not an endlessly reset delay window; exact limits/availability risks need approval. |
| Frontend | Later, minimally adapt the existing role-based credential field: correct labels/minimums, masked PIN/text handling preserving zeros, blank on required transitions. No number-type conversion, convenience autofill/remembered plaintext input or automatic role login. Browser/OS caching must be checked in the chosen deployment, not assumed controllable by an HTML attribute. Native-prompt fit is unproven; no UI changes now. |
| Focused tests | New role-specific bounds, Unicode/exactness, leading zeros, weak-input handling; native fresh-input/caching, copied-file guessing, restart/rollback counter persistence, privilege bypass, atomic enrollment/reset, SQL failure and secrets non-disclosure. Prior15-character results cannot be relabeled. |

Remote Admin must remain disabled until a supported independent strong factor is enrolled
and tested; prefer a phishing-resistant passkey/hardware factor, subject to review.
Neither local password alone nor the Salesperson PIN can authorize remote access.
Remote enrollment/factor outages must not become prerequisites for basic local operation.

## 4. Simpler recovery kit and owner workflow - unapproved recommendation

Keep separate purposes: R = high-entropy single-use Admin recovery codes; B = portable
backup decryption root key. Neither is a login password or PIN.

**Replace the earlier blanket R+B proposal:** on a healthy, enrolled device, normal lost-Admin
recovery should require one CURRENT unused R, the trusted device/enrollment state and an
explicit owner-only local action. Do not require typing B merely to reset that password.
For lost-device encrypted restore, B is still necessary to decrypt; R/current owner
authorization and valid enrollment/fencing are ALSO required to activate a writer.
B alone never resets credentials or logs in.

This simplification requires owner/security approval: stolen R plus access to the trusted
local recovery channel can authorize reset. A staff-shared OS session alone is insufficient.
No receipt, shop invoice, staff PIN or developer override substitutes for missing owner proof.

Recommend one guided kit handover: a small code card (four independent256-bit R codes remain
a proposal), clear instructions and B recovery material. Keep R separate from B/backups.
Preserve the existing requirement for TWO independently protected owner B copies, each
tested on an independent compatible Windows machine; recommend redundant protected R copies.
No developer escrow, plaintext secrets in ordinary JSON/logs, unattended printing or cloud
copy of unprotected kit material.

Automate anchor/journal/receipt maintenance; do not ask the owner to transcribe generation
numbers/checksums or re-enter the backup key at every Salesperson reset. Guided owner
confirmation is appropriate for initial kit delivery, recovery-group/key replacement and
device transfer. Exact off-device acknowledgment timing remains a security decision:
missing required durable evidence must fail closed, never silently accept stale receipts.
Do not make an unavailable USB drive a hidden normal-login dependency.

Recovery/reset must atomically update the appropriate credential reference/hash and version,
both authorization epochs, all session/grant revocations, conditional code consumption where
used, and safe audit/security state. Prepare any new kit before invalidating the old group.
After commit clear RAM/rotate signing material and require fresh login for both roles.
Failed RAM cleanup cannot restore revoked access; SQL/commit failure cannot partially reset.
No recovery operation issues a login session or changes financial/business records.

## 5. Enrollment anchor, portable backups and independent restore remain required

Keep an authenticated external enrollment/security record outside SQLite, protected locally,
with matching IDs/sequence in SQLite and owner-held recovery evidence. Missing/older/mismatched
state means recovery-locked, not new-shop setup. A journal must reconcile SQL and filesystem
commits; uncertain crash state stays locked. Old backups cannot revive used recovery codes.

Automated receipts prove integrity, not global freshness. Whole-machine rollback/offline
clones cannot be fenced by a local flag. Uncertain old-device authority means isolated
read-only recovery at most; no automatic writer activation, fresh provisioning or merging.
Any exception requires separate approval.

Keep approved running30-minute/post-closing backups, verified USB/off-device copies and
encrypted cloud upload when online, with visible independent success status.
Use a supported consistent SQLite snapshot and reviewed authenticated-encryption format.
Preserve accounts, latch, migration history, audit and all shop records, plus portable
owner-wrapped key envelopes. Never archive raw session bearers or recover a PIN from backup.
Replacement hardware requires authorized new device-authenticator enrollment, not import
of an old unlocked PIN key.

DPAPI convenience protection alone is not portable. Keep B/key versions needed for retained
archives and independently verify both owner key copies and clean-machine restore.
Loss of all usable B copies/live keys makes backups unrecoverable; resetting credentials
cannot decrypt them. Stolen B can expose stolen archives permanently.
Restore into a new isolated directory, validate compatibility/integrity/FKs/cutoff/business
invariants, preserve current files, fence the old writer and invalidate all restored sessions.
Never reset or auto-close business days; disclose any actual backup data-loss gap.

Existing [backup requirements](SETTINGS_CLOSING_BACKUP_CONTRACT.md) and
[architecture recovery sections](BACKEND_SQLITE_ARCHITECTURE_V1.md) remain production gates,
not implemented features. [DPAPI limitations](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
and the [SQLite snapshot API](https://sqlite.org/backup.html) inform the design, not a security
approval or a claim that recovery is working.

## 6. Decisions pending and ONE next implementation task

Confirmed UX in section1 is not a security waiver. Owner review is still required for:
hardware/native PIN feasibility and fresh-input guarantees; limits/lockout recovery;
maximum lengths/encoding; safe cross-credential enrollment; Admin offline-guessing defenses;
remote additional factor; simplified R-only local reset versus B-required restore;
owner custody, anchor durability/receipt timing and lost/stolen-device authority.

**One concrete safe next task, requiring separate authorization:** implement an isolated
ADMIN-only password-policy/screening module and focused tests for minimum8, proposed
maximum128 scalars/512 bytes, exact input, no composition rules and reviewed common-password
coverage. Do NOT wire it into the shared callbacks, alter provisioning, enable PIN/login,
write real credentials or change frontend/schema. This is separable from the blocked PIN
path; those later integrations still require security review.

This update changes ONLY this contract. Part3B/3C implementation, prior reports, memory,
migrations, dependencies, UI and evidence remain unchanged. The15-character historical
state is recorded here as a compatibility conflict, NOT the owner's current UX policy.
**STOP for owner review.**
