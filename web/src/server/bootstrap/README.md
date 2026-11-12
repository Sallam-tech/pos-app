# Private protected bootstrap ? Parts 3R/3S

Production HTTP authentication remains disabled. This is a server-only foundation,
with no automatic setup, public API, default password, owner-recovery bypass,
R/B issuance, portable restore, installer or business-data mutation.

## Trusted entry and the sole account writer

`createTrustedOwnerEnrollmentEntry` accepts a genuine opaque handle registered
by `bindTrustedDesktopOwnerInteraction`. Only a future trusted packaged desktop
may register that adapter. Its purpose-specific deliberate confirmation and
one-shot private RAM password reader are required on each attempt. An HTTP flag,
localhost, Windows SID, pristine DB or certificate does not establish owner identity.
There is no production desktop caller: physical owner authorization is **unverified**.
The constructor is privileged integration code, not an independent human authenticator.

Both fences (existing auth-process owner and machine-wide runtime guard) stay held
through confirmation, intent, provisioning and finalization. Native DB owners
open/close sequentially; no second live authorization owner is introduced.
Import/startup never invokes setup. Abort/cancellation denies completion;
an uncertain close retains ownership until a trusted restart.

`runTrustedFirstRunSetup` remains the only two-account writer. Its genuine live
bootstrap lease binds the SQL enrollment to the protected installation/device,
intent and vault digest. Its existing official Better Auth adapter transaction
creates ADMIN and shared SALESPERSON, both screened distinct passwords, principals,
zeroed counters, permanent completion latch and new binding atomically.
Native hashing stays outside the writer transaction. Exact-input 8?128 Unicode
scalars/max512 UTF-8 bytes, offline screening and scrypt are unchanged.
The prior unbound call is retained **only for path-confined isolated TEST mode**;
persistent setup requires the live lease and binding. No session is issued.

## Explicit migration prerequisite

Additive `0008_auth_enrollment_binding.sql` is STRICT with a singleton row/FK
to the existing completion latch. It contains non-secret UUIDs/vault ciphertext
digest, no credentials or seed DML. Migrations0001?0007 are unchanged.
Maintenance must explicitly apply all eight reviewed files before custody/setup;
no module migrates an existing DB. Existing enrolled data without this binding
requires reviewed recovery/transition, never re-provisioning or invented metadata.

## Protected local custody

The Part3R vault format stays unchanged: separate random role-signing secrets,
supplied validated TLS identity, installation/device UUIDs, Windows SID and
canonical DB path/file identity. The fixed protected-identity directory and files
require current-user ownership and only that SID/SYSTEM full-control ACLs.
CurrentUser DPAPI is user-profile protection, not owner proof, TPM attestation,
portable encryption or protection from the same user/admin/malware.

Creation is exclusive and pristine-only; read rejects missing/corrupt/replaced/
redirected/hard-linked/weak-ACL/unexpected material without repair or regeneration.
Private native IPC uses stdin/stdout, bounded helpers/generic errors, no secret
arguments/env/output. The trusted callback container rejects JSON and redacts
inspection; buffers clear after use. Managed strings/copies cannot reliably erase.
Encrypted PKCS8 disposable TEST keys use random RAM-only passphrases via stdin.
No system certificate store or Windows setting is changed.

## Enrollment intent, outcome and anchor

Under protected-identity/enrollment, immutable DPAPI records contain only bounded
non-secret metadata and fingerprints. They bind the vault ciphertext, file/path,
installation/device, reviewed schema/checksums and exact enrollment intent.

1. Publish/read back a numbered INTENT before calling the sole SQL writer.
2. On real confirmed SQL COMMIT, reopen/verify both complete accounts, versions,
   latch, counters and exact intent binding; then publish COMMITTED with fingerprints.
3. Publish enrolled.dpapi referencing that protected commit record, then independently
   re-read SQL/vault/journal before acknowledging completion. Activation stays false.

Supported journal storage is local NTFS. A CreateNew pending file receives DPAPI
ciphertext with WriteThrough + Flush(true), then same-directory
[MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)
with MOVEFILE_WRITE_THROUGH and **no overwrite/copy/delayed-reboot flags** publishes
its final name. Readers never accept pending/partial/unknown files. Actual native
publication is tested; storage-controller power-loss honesty and target-drive
power-cut behavior are not established. No directory-fsync or absolute hardware
durability guarantee is claimed. The inbox .NET helper compiles a P/Invoke stub;
there is no installed build tool/package or fallback if native protection fails.

| Observed state | Permitted behavior |
| --- | --- |
| Pristine, no journal | Fresh explicit trusted confirmation may start |
| Durable ABORTED after verified no-writes/driver rollback, pristine SQL | New confirmation, new linked intent, no reuse of old authorization |
| Intent-only, empty/partial directory, ambiguous COMMIT or mismatched/corrupt state | Halt for trusted recovery review; no reset, repair or automatic retry |
| Protected COMMITTED plus exact unchanged initial SQL, final anchor absent | Fresh reconciliation-purpose confirmation may publish only the anchor |
| Matching final anchor and bound SQL | Report ENROLLED; no login/session/production activation capability |
| Rolled-back pre-enrollment SQL, missing vault or wrong file/installation/schema | Halt; preserve records and evidence |

Reconciliation never reads passwords or calls the provisioner. A missing final
anchor is not auto-accepted: only matching protected COMMITTED plus exact initial
state permits owner-confirmed finalization, including in a fresh process.
If the commit record itself was lost/not durably acknowledged, SQL contents alone
cannot prove the outcome; recovery review is mandatory even if two accounts exist.
A corrupt/pending anchor is not overwritten. Publication followed by a lost reply
can be inspected as complete, without a second account write.

The completed anchor covers immutable enrollment identity, not every later
password/counter/shop write. Legitimate future password rotation must not require
rewriting this anchor. It detects pre-enrollment rollback and mismatched restore,
not every in-place replay of a later matching enrolled snapshot or simultaneous
rollback of all machine storage. No same-user/admin anti-tamper guarantee exists.
128 journal files bound inspection; admission reserves intent/commit/anchor space
before another setup attempt. Exhaustion fails closed for trusted review.

## Production and recovery gates

The future activation boundary must require matching enrollment state, trusted
desktop enrollment/owner participation, approved TLS trust/key lifecycle and
signed host/helper custody. Existing persistent hosting is health-only; raw
Better Auth endpoints and TEST activation are not enabled here.

Owner-held R stays Admin credential-reset-only; portable backup recovery B is
separate. Neither is generated or consumed here. Portable encrypted backup,
independent Windows/device replacement, profile/key loss, authorized rebind,
rollback review and lost-kit procedures remain unimplemented production gates.
Restore must preserve accounts/latch/binding/history/audit/shop records and obtain
approved new local custody; copying DPAPI files cannot make a portable restore.
Developer laptop/internet must not be needed by the eventual recovery procedure.
Missing state never authorizes a reset. Daily Closing and shop data are untouched.
