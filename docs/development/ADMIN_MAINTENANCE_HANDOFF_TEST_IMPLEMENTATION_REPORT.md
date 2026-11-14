# Fresh Admin maintenance source handoff - focused TEST evidence

14 November2026. Parent b437d2efddb83a200ca8083f35e90b9318661b50. Both security/candidate items1-8 OWNER APPROVED. **Source authorization/handoff only; full Phase1 IN PROGRESS, Phase2 not started, production DISABLED.**

## Implemented and reviewed

- Existing gateway privately consumes its genuine single-use fresh ADMIN credential receipt. Existing durable attempt protection, pinned Better Auth password verification, five-second monotonic acceptance deadline and credential/epoch/version checks remain. Forged/serialized/Staff/stale/used receipts and counterfeit runtime leases cannot enter. No session, password reader, alternate account writer, public endpoint or frontend change is added.
- Freeze new gateway admission synchronously, drain its already-admitted queue, check fresh exact8 or explicit41 schema and current Admin SQL inside the same private transaction machinery, and close the sole native owner. Enter borrowed bootstrap ownership without yielding between process-marker release/claim; the SAME genuine machine-wide runtime lease remains held throughout. Borrowed ownership never releases/reacquires the runtime port. Reentrant gateway close inside the maintenance callback denies instead of waiting on itself.
- After closure, independently reopen the source under that lease and recheck original file identity, exact schema and Admin credential state before minting a callback-only opaque source scope. Changed/replaced source or revoked credential denies. The scope binds operation ID/purpose, source file identity, schema, Admin version/epoch and live bootstrap/runtime leases; it rejects forgery, serialization, wrong operation/purpose/lease and use after callback. No credential, bearer or SQL interface is exposed in its facts.
- Shared provisioning/credential checks were extracted without weakening their conditions. Existing gateway methods and generic TEST migration restrictions remain. The source scope grants no owner confirmation, verified archive, candidate DDL, completion, key issuance or writer admission. Those separate approved capabilities remain required. Production remains independently disabled.

## Actual focused evidence

Ignored root: web/test-results/phase1-production-preflight-20261114/.

| Check | Evidence |
| --- | --- |
| Genuine source and continuous ownership | admin-handoff-initial.log:4 new cases PASS. Actual separate child cannot acquire the held machine-wide fence; nested gateway cannot open; exact8 logical source state preserved after fresh authentication baseline; used source scope/receipt deny; fresh BOTH-role login succeeds afterward |
| Negative authority | Same run: fake gateway/proof/runtime lease, Staff and actually expired receipt reject without calling source work. Receipt is burned on later failure; fake lease method never executes |
| Source changed at native close | Same run: actual disposable Admin epoch revocation and actual file replacement between source close/reopen deny scope. Replaced original retained as preserved-original8.sqlite3; no original artifact deleted |
| Drain and process death | admin-handoff-process-followup.log:3 PASS, including two affected repeats and one NEW actual child kill. Exact41 existing transaction drains; new work and duplicate transfer deny. Actual killed child was paused AFTER handoff and BEFORE any copy/DDL; its post-authentication logical source fingerprint survives and genuine fresh BOTH-role login succeeds. This does not prove candidate SQL/publication crash recovery |
| Distinct count | 5 new handoff cases have passing focused evidence; not one clean5-case run. Cumulative new phase26 +2 selected unchanged regressions =28 distinct across focused runs; repeated checks not counted twice |
| Type/lint | type-admin-handoff-final.log exit0; lint-admin-handoff-final.log five changed source/test files, zero warnings, exit0 |
| Exact-source build | admin-handoff-build.log exit0 on verified patched Node24.22.3. admin-handoff-build-complete-source-manifest.json includes all336 copied files, including ignored backup sources and hidden metadata. Five immutable metadata hashes and exactly2 expected generated Next type import changes verified; live file unchanged |
| Preservation/client output | admin-handoff-final-verification.json PASS:33 actual client JS files scanned; private markers absent. All34 unrelated paths,41 SQL migrations,4 source documents/prototype and165 frontend source files hash-preserved. Only3 existing server files changed |

Changes: src/server/auth/database.ts (private file-identity fact), src/server/auth/gateway.ts (private receipt consumer/source scope/close handoff), src/server/bootstrap/ownership.ts (borrowed genuine-runtime lease), tests/integration/production-security-enrollment.test.ts and tests/helpers/maintenance-runtime-probe.mjs, plus this report, memory and readiness register. API inventory remains102. Reviewed related-only LOCAL checkpoint; exact hash and index/preservation outcome are recorded in admin-handoff-local-checkpoint.json and live Git. No push/reset/clean.

## Diagnostics and remaining gates

Initial test-only type diagnostic used the wrong generic connection method; corrected to existing transaction API before execution. Initial inventory omitted ignore-hidden files from proof only; all files had already been copied. Complete336-file hash comparison corrected the proof without changing/rebuilding inputs. A read-only verifier initially assumed migration paths were repository-relative; corrected the manifest's actual basename convention. Earlier diagnostics and partial manifests retained; no application assertion/timeout weakened or uncertain operation replayed.

Still required: trusted deliberate owner/source confirmation, verified archive plus original-anchor/source binding, private fresh-copy/DDL/known-completion capabilities, actual preserving8-to41 candidate migration, destination keys/provenance, durable selection and final transaction/generation admission, old-source fencing, persistent41 restore, host/backup-worker maintenance orchestration and actual kills during copy/SQL/native publication. Existing generic TEST paths do not become production authorities. Physical old-device fencing/offline clones, independent Windows/profile recovery, owner B copies, TLS/media/power/hardware/printing/capacity and retention/RPO/RTO remain unverified release gates. No real data, enrollment, key activation, schema42, R reset, EXE or Phase3.
