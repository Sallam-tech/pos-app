# Phase2 native recovery entry: material security review

15 November2026. PROPOSED, NOT APPROVED. Production and native writer promotion remain disabled. This does not reopen the approved Phase1 restore/CURRENT primitives or desktop architecture items1-9.

The actual packaged TEST app now passes both-role authentication, protected data persistence, drained restart and installer lifecycle. Settings creates and verifies an isolated restore and explicitly returns LOGIN_PENDING. The desktop entry currently starts only the original protected root. It must not silently adopt a selected/restored database.

A native restore command that publishes CURRENT introduces a new human authorization entry and retires the previous writer. A historical archive can contain older inherited credentials. The current account owner cannot simply be opened concurrently against a staged candidate while the maintenance source retains its native fence. A generic password/hash checker, another unfenced SQLite owner, a renderer flag or the current Admin password alone must not substitute for candidate-bound restored authentication.

## Proposed grouped disposable TEST scope

1. Add an owner-facing native recovery entry, separate from the frozen web frontend. Native file selection and narrow sender-validated IPC only; no renderer filesystem, SQL, shell, arbitrary target or production capability.
2. Define and implement a fenced, candidate-bound inherited-credential verification step before writer selection. Preserve the genuine password/attempt policy and opaque proof lifecycle. No extra unfenced account owner, new account writer, credential reset, invented ENROLLED record or B-only admission. R issuance/reset stays disabled. The precise attempt-state and candidate proof must be reviewed and tested as part of this new boundary.
3. Consume existing known-COMMITTED restore, fresh TLS/key lineage and one-use native confirmation bound to the exact operation/file/digests before existing CURRENT selection. UNKNOWN work remains fenced; no automatic repeat, rollback or deletion. All original databases and evidence remain retained.
4. At restart, resolve only the native authenticated CURRENT chain to its exact protected candidate; retain original-root provenance and current-generation admission/history. Missing, stale, retired, tampered or uncertain state fails closed.
5. Require an explicitly authenticated backup-configuration handoff to the selected database namespace. Preserve original custody, archives and configuration; never silently reuse the old namespace or create replacement recovery authority after interrupted setup. Test actual process interruption and role login across restart.

Requested decision: approve items1-5 for reversible/disposable TEST development and verification, or keep native writer promotion disabled. Any real custody, replacement-device ceremony, signing, irreversible real-data action, production activation or client handover still requires separate explicit authorization.

Approval requirement: repository [AGENTS.md](../../AGENTS.md) says "Ask before destructive operations, deployments, or major architectural changes." The owner's approved [desktop review](PHASE2_DESKTOP_ARCHITECTURE_REVIEW.md) also reserves separate approval for material scope changes, real signing/custody and irreversible operations. This request concerns the new staged-authentication/native recovery entry, not routine fixes or reapproval of existing primitives.
Owner decision received15 November2026: APPROVED items1-5 for reversible, isolated, disposable TEST implementation and verification ONLY, with genuine candidate-bound inherited passwords, persistent failed-attempt state, replay/expiry/interruption/tamper/concurrent-writer tests, both-role login and restart. Production/client/signing/real custody/irreversible operations remain unauthorized. The proposed status above is historical; implementation and verification remain in progress.
