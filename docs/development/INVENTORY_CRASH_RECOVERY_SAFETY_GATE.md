# Product/Stock crash recovery - owner approval gate

11 November2026. **BLOCKED before implementation; proposal only. Production DISABLED.**
This is a security-policy/contract decision, not evidence that browser recovery is impossible.

## Verified current state

- lib/inventory/client.ts:24-28 keeps the key/payload and in-flight flag in one page's RAM. Other tabs do not share that admission flag; browser death loses it.
- inventory/service.ts:31-37 queries committed CREATE/RECEIVE results by key, under genuine same-gateway Admin SQL authorization. NOT_FOUND is not a durable FAILED/CANCELLED state.
- migrations/0010_inventory_operations.sql:3,9-10 has a unique request key and committed payload/result, but no independent pending/cancelled/acknowledged recovery lifecycle. mutations.ts:28-36 rejects changed-payload same-key replay; a newly chosen key represents a new operation.
- hosting/runtime.ts:15-20 provides no durable public recovery-context identity. Actor.principalId is the shared fixed ADMIN identity and sessionId expires/restarts; neither alone identifies a TEST database across sessions. Generic TEST18 fixtures copy auth rows and need not have an enrollment binding. The protected enrollment inspector is explicitly8-only (bootstrap/database.ts:27); its anchor must not be invented/rebound for this feature.
- The previous sessionStorage key/path proposal was rejected by automatic approval review because it conflicted with the RAM-only plan. It was NOT executed. That rejection did not establish that every minimal, non-bearer browser marker is inherently unsafe. Simply restoring it would also omit installation binding, multi-tab coordination and retention decisions; sessionStorage alone does not provide the requested closed-browser recovery contract.

Latest request Step2 explicitly says: "If implementing it requires an unapproved security-policy decision, schema change or architectural change, STOP and recommend the safest solution for my approval." The binding/retention/unknown-outcome contract below has not previously been approved. No source/storage/database change was made.

## Recommended bounded TEST contract - requires approval

1. Persist only one bounded marker (<=512 encoded bytes) in a transactional IndexedDB slot shared across same-origin tabs: format version, opaque TEST database/Admin-context fingerprint, random UUID operation key, CREATE/RECEIVE kind and PENDING/CONFIRMED state. No payload, name, cost, quantity, credentials, cookies, tokens, signing key, result or customer data. Metadata is neither a secret nor an authorization capability.
2. Obtain the context only through the SAME confined HTTPS host and current signed-cookie/authoritative SQL ADMIN gateway. Proposed schema-free namespace: a domain-separated digest of the existing sole owner's validated canonical file identity plus reviewed18/provisioning identity and fixed Admin principal. It is an operational TEST binding, NOT a new production enrollment anchor or anti-rollback proof. Replacement/copy/changed identity must yield a mismatch, never automatic adoption. Its exact native-file binding/accessor must be reviewed/tested before use; no raw path/SQL/secret is returned.
3. Before sending any product/receive POST, atomically claim the slot and await successful persistence. Storage/locking/identity failure denies the mutation; no RAM-only fallback. Another tab must see the same unresolved record and cannot silently mint another key. Broadcast events are hints, not lock authority.
4. After reload/relaunch require genuine valid Admin authorization before context comparison or result lookup. Marker alone grants nothing; Salesperson/anonymous get no result/details. Tests must use fresh real Admin login, not assume restored session cookies are absent after a browser crash. Full production browser/Electron reopen enforcement remains separately gated.
5. For the matching context, use the EXISTING SQL result endpoint. Verify server-derived operation kind/context. A confirmed saved result is displayed without another POST. Keep a minimal CONFIRMED marker until explicit Admin acknowledgement, so crashing between lookup and display cannot silently discard the recovery notice.
6. A404, timeout, SQL error, stale/mismatched context or missing evidence means UNKNOWN, never failed/not-submitted. Retain the opaque marker, show an explicit pending state and block a replacement operation. Never reconstruct a lost payload or automatically issue a new key. A type/context mismatch must not display another operation as this one.
7. Retention proposal: at most ONE unresolved/unacknowledged slot per browser profile/origin; no automatic expiry or age-based eviction. Remove only after authoritative success plus explicit acknowledgement. Wrong-installation/stale records remain opaque and block new mutations in that profile pending owner review. Reads/login remain available. Approving this includes accepting that UNKNOWN may require manual review and cannot safely be auto-cleared.
8. Normal successful mutations use the same recovery discipline. No source-controlled credentials, public Next route, second DB owner, historical migration edit or production activation. Existing layout changes are limited to recovery status, Resolve Previous Operation and acknowledgement.

## Explicitly outside that approval

- Definitively abandoning an UNKNOWN key requires a separate server-side cancellation fence: in the same writer/authorization queue, either find the committed operation or durably prevent every delayed old request from ever writing. A lookup404 or browser timestamp is insufficient. This likely needs an additive reviewed schema/lifecycle extension and updated exact-schema authority. Do not add it or modify0001-0018 in the first implementation.
- Application-controlled IndexedDB persistence can be tested across browser crashes/relaunch with a retained isolated profile; it cannot promise recovery after profile deletion, storage clearing/eviction or physical disk/power loss. Private browsing/unsupported storage must fail closed. Stronger guarantees require a separately approved server recovery registry/trusted desktop storage. A different profile/origin/port does not automatically share a marker; don't claim universal browser recovery.
- Reconciliation must not create products/stock/operations/events. Existing gateway reads still take their reviewed no-change SQL writer reservation; they are not literally zero SQLite DML. No authorization rule should be weakened to remove that reservation.
- Session revocation, credential versions/epochs and mandatory SQL checks remain unchanged. Production enrollment,8-to18 maintenance, independent backup/restore, append-only triggers, TLS/key custody, desktop lifecycle and D05/P02/P08 remain open.

## Minimal implementation/test sequence after approval

1. Add the narrow authenticated TEST context binding; independently verify mismatch, DB replacement, restart, SQL denial and no enrollment/secret exposure.
2. Add bounded transactional marker storage/admission and explicit confirmation/UNKNOWN UI; preserve original key and payload only in RAM while that page remains alive.
3. Actual SQLite/HTTPS tests: normal create/receive, lost response after COMMIT, no replay write, same-key conflict, SQL/commit/shutdown failures, role/session denial and UNKNOWN behavior.
4. Real browser tests with an isolated retained profile: forced reload, actual browser crash/fresh launch plus fresh Admin login, server restart, two tabs, stale/malformed records, unavailable storage, explicit acknowledgement and sensitive-data absence. Scoped TypeScript/ESLint and only affected regressions; retain failures/evidence.

## This review's verification and files

Source/report/Git inspection only. ZERO new execution tests, ZERO databases/migrations/installations. Previous Part5 evidence records37 distinct passing checks; those are retained evidence, not a new crash-recovery test pass. Crash/relaunch recovery remains UNIMPLEMENTED/UNVERIFIED. No new Critical/High defect established by this bounded review; the documented loss/duplicate-intent risk remains an open release gate.

Created: docs/development/INVENTORY_CRASH_RECOVERY_SAFETY_GATE.md.
Modified only: docs/PROJECT_MEMORY.md; docs/MODULE_CHECKLIST.md.
Separate ignored preservation hashes: web/test-results/inventory-crash-recovery-gate-7e98b164-09bd-4f6b-addc-3e8f2c9a8690/.

**ONE next task:** owner approves or revises the eight-point bounded TEST contract above; only then implement/test it. UNKNOWN cancellation/server registry remains separately gated. STOP.
