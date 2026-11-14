# Backup, restore and production security ? consolidated approval contract

14 November 2026, Asia/Karachi. **OWNER APPROVED for TEST-only implementation; real custody/production remain gated.**
Starting checkpoint: 2fb62d62aa53a673d257622927da74852373ffcd.
This is one coordinated recovery/security milestone before Windows packaging.
No production account, archive key, certificate trust installation, deployment,
real database migration or writer transfer is authorized by this document.

## Current evidence and inherited authority

- TEST41 records 44 distinct passing cases. All 319 current application source
  files match its retained isolated build byte for byte. Current Git has 34
  unrelated paths, including the earlier 33 and a later TEST41 report edit.
- Preserve schemas 0001?0041, original eight enrollment anchors, all historical
  business rules, approved screens and the existing sole auth/database owner.
- Current DPAPI/ACL vault, two-account atomic writer, scrypt, fixed-role
  loopback HTTPS, session registry, revocation and five-failure/30-second
  limits already exist. Reuse them; no alternate login/account writer.
- Current production HTTP is disabled. Protected enrollment verification remains
  based on schema8; current schema41 maintenance and portable recovery are not
  implemented. The desktop physical-owner entry is not physically accepted.
- Existing P11 requires running half-hourly and post-closing backups, independent
  local/external/cloud status, two owner recovery-key copies, isolated restore,
  preservation and single-writer fencing. AES-GCM in the older architecture is a
  proposal, not an approved encryption implementation.

## A. Portable encrypted backup and custody ? recommendation for approval

| Option | Benefit | Risk / cost |
| --- | --- | --- |
| **Recommended: standard age v1 via a pinned maintained age-encryption library** | Published interoperable streaming format; portable X25519 recovery identity; no hand-built encryption protocol | New dependency and transitive crypto/license review; owner must protect recovery identity; possession of recipient public key is not source authentication |
| Application-specific AES-256-GCM container using Node crypto | Existing runtime primitives; no new crypto package | Application must design/review framing, stream limits, unique-key/nonces, authenticated metadata, truncation and interoperability; larger protocol-review burden |
| DPAPI-only archives | Reuses existing local convenience protection | Does not meet independent replacement-PC recovery; **not acceptable for this mission** |

Approval A would authorize implementation/testing of the first option only,
with exact dependency/version/integrity and transitive-license review before
installation. No silent substitution if compatibility/security review fails.
Age's standard file key is 128 bits; its payload uses ChaCha20-Poly1305. This is
not an AES-256-GCM implementation and must not be described as one.

1. Generate a high-entropy portable age recovery identity B in disposable TEST
   setup first. Protect a local convenience copy with existing CurrentUser
   DPAPI/restricted ACL patterns. Never derive B from either login password.
2. Require two independently protected owner-held B copies for real custody,
   stored separately from backup archives and from each other. Actual locations
   and witnessed retrieval remain owner actions; TEST placeholders do not count.
   No developer escrow, console logging, ordinary JSON or browser key storage.
3. Use a separate archive-signing key, distinct from role/TLS keys, protected
   with DPAPI. Sign a versioned canonical allowlisted manifest containing
   snapshot SHA256/length, exact schema/migration hashes, archive/shop/installation
   IDs, recorded cutoff, key IDs and app compatibility. Put manifest/signature
   inside the age-encrypted payload. Trust the verification key from protected
   custody/owner kit, never solely from an untrusted archive. AEAD alone does
   not prove the archive came from this shop.
4. Payload v1 contains bounded manifest and exactly one SQLite snapshot;
   no executable files, compression, arbitrary extraction paths or restored
   session bearer/certificate/upload secrets. Record bounded lengths and reject
   trailing/truncated/oversized content. Revoke restored sessions; replacement
   TLS/role-signing credentials are freshly generated in gated recovery.
5. Use the already proposed supported SQLite backup API to protected disposable
   staging; derive all manifest facts from that snapshot. Validate full integrity,
   FKs, exact schema and every existing financial ledger before encryption.
   Plain staging lifetime is short; no promise of SSD secure erase.
6. Flush encrypted pending output, decrypt it into a fresh isolated protected
   directory, verify signature/hash/schema/ledger and actual app reopening,
   then publish by no-overwrite same-volume durable rename. Missing key,
   cancellation, corruption, disk/ACL failure or uncertain publication never
   becomes VERIFIED. Distinguish verified archive from successful full restore.
7. Retention proposal: 48 half-hourly + 7 daily + 4 weekly local points with
   overlaps deduplicated; external/cloud 7 daily + 4 weekly subject to capacity.
   Pin pre-maintenance/transfer copies; retain last known good plus an older
   verified point. No pruning until replacement is independently verified.
   Preserve pending required uploads; do not silently discard backlog.
   Configure budget after storage measurement; inability to fit is an alert.
8. Existing half-hour/post-closing/manual work uses one durable resumable
   coordinator, separate local/export/cloud states, exact original job IDs and
   fail-closed restart reconciliation. Archive publication and verification
   records use restricted immutable journal records outside financial SQLite,
   preserving schema41. This journal is not a global rollback/freshness oracle.
9. Implement verified encrypted export to a configured/test destination with
   native approved-volume/path confinement. Do not connect Supabase, issue cloud
   credentials or claim physical USB/off-site acceptance here. Cloud adapter
   readiness may be tested without a real account; actual integration needs the
   owner's destination/account permissions and separate credential custody.
10. Loss of all B copies and usable live key material makes retained archives
    unrecoverable. Stolen B can disclose retained archives. Key rotation retains
    old versions until all retained archives remain verifiably recoverable.
    Both independent B copies must be tested on suitable independent hardware.

## B. Production-security readiness and maintenance ? recommendation for approval

Approval B would authorize TEST-only implementation and verification of the
following integration, preserving the current authentication and business design:

1. Extend the existing protected intent/completion journal with purpose-bound,
   versioned maintenance/recovery records binding source file identity, original
   enrollment anchor, exact 0001?0041 manifest, source/destination snapshot hashes,
   operation ID and independently verified backup. Never rewrite original8 anchors,
   claim that schema validation is owner authorization, auto-migrate at startup or
   use an unprotected caller flag as maintenance authority.
2. Prepare exact schema41 enrollment/admission using the existing two-account
   writer and protected owner entry. Exercise only new disposable TEST databases.
   Existing real enrolled8?41 transition requires separately authorized maintenance
   and verified portable backup; no existing/original database is touched here.
3. Reuse DPAPI/strict owner+SYSTEM ACL patterns for new private artifacts, reject
   reparse points/hardlinks/weak ACLs, and retain sole gateway/runtime ownership.
   Account/session/version/epoch revocation, per-request SQL RBAC, safe DTOs,
   strict origin/host/SNI/cookie/CSRF/input limits and no public CORS remain.
4. Add TEST key-generation/rotation/recovery preparation with separate role,
   TLS and archive-signing purposes. Do not install a trusted CA or modify
   Windows security settings. Actual production trust/certificate lifecycle
   and physical-owner enrollment must remain explicit unaccepted gates.
5. Restore only into a new isolated RECOVERY environment. Authenticate the kit
   and archive; validate the full restored financial state; invalidate sessions
   and suppress jobs. B can decrypt, but **never grants login or writer activation**.
   Writer transfer requires explicit owner authority and proof the old writer is
   fenced. Uncertain old-device state stays read-only/recovery-locked.
6. Unsupported old-schema archives remain read-only/quarantined. A supported
   isolated migration may run only with an approved exact migration path,
   pre-copy, full revalidation and recoverable rollback. No downgrade or applied
   migration edits. No new financial schema migration is selected here.
7. Lost-password recovery-code issuance, reset authority and code-use freshness
   are not approved by choosing archive B. The older R-only healthy-device reset
   proposal remains pending. Preserve fail-closed behavior; if executable R
   recovery requires a schema/authority change, present its exact contract first.
8. No new security or recovery trade-off may be silently inferred from A+B.
   Production enrollment/activation, real-data operations and physical trust
   remain separately owner-authorized actions, even after TEST PASS.

## Verification and acceptance

Implement approved A+B together, using real disposable SQLite, HTTPS and
Chromium. Cover WAL/concurrent committed data, exact full-table and ledger
reconciliation, receipts/cost snapshots/stock/returns/expenses/corrections/cash/
closings/audit, original-key uncertain outcomes, old keys/wrong keys/missing keys,
untrusted signer, bit flips/truncation/disk-full/ACL denial, killed processes,
repeat restore, resume/rollback, unauthorized Admin/Staff access, offline and
retained 1k/10k/50k sources where applicable. Keep original source hashes fixed.
Use actual bounded disk/write fault injection; distinguish simulated disk-full
from an actual full-volume exercise. Record failures and fixes.

Run focused relevant regressions and scoped type/lint/build as justified by the
actual source changes. A TEST-only oracle with an unchanged 319-file app source
may reuse the exact prior build; changing runtime source requires a new build.
Commit only reviewed related files after a coherent verified checkpoint.
No archive/secrets/log/DB or unrelated path enters Git.

Independent replacement-PC recovery, target-PC ACL/TLS/physical power-loss,
physical USB/off-site custody and 50k performance acceptance remain **BLOCKED /
NOT VERIFIED** until actually performed. Same-machine simulation cannot clear
them. No Windows EXE, installer, printer or production activation is included.

## Owner decision requested

Approve A+B above for TEST-only implementation, or specify the preferred change.
This approval does not declare actual key custody accepted, supply cloud account
access, select an R-code reset policy, approve real-data migration, or activate
production. Those remaining owner/hardware gates will be explicitly reported.

References consulted 14 November 2026: [SQLite Online Backup API](https://sqlite.org/backup.html),
[age format](https://c2sp.org/age), [maintainer's TypeScript streaming implementation](https://github.com/FiloSottile/typage),
[license](https://github.com/FiloSottile/typage/blob/main/LICENSE),
[Microsoft DPAPI binding](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata).
Library capabilities and format references support this proposal, not product
security certification or hardware acceptance.
