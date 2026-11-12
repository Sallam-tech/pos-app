# Product and Stock crash recovery - bounded TEST implementation

11 November 2026. **PASS for the approved retained-profile TEST scope; owner acceptance pending. Production DISABLED.**

Owner explicitly approved all eight points in INVENTORY_CRASH_RECOVERY_SAFETY_GATE.md in this conversation. That approval supersedes the earlier proposal-only BLOCKED checkpoint. No cancellation fence, migration, server recovery registry or production activation was authorized or added.

## Implemented contract

- One IndexedDB slot, strictly validated <=512-byte marker: v, opaque context, UUID key, CREATE/RECEIVE kind, PENDING/CONFIRMED state. No payload, product name, cost, quantity, saved result, password, cookie, token or key in this store. Results/active form values remain RAM only.
- A strict-durability atomic read/compare/write transaction must COMMIT before the only mutation POST. Same-origin tabs share this authority; broadcast/focus/poll events only refresh UI. Another tab cannot replace an unresolved/unacknowledged key. Failed/unavailable/invalid storage denies the mutation; no RAM fallback. Conditional confirmation/deletion cannot resurrect an acknowledged marker or delete a newer key.
- New exact TEST GET /api/admin/inventory/recovery-context returns only an opaque SHA-256 namespace after real signed-cookie Admin authorization, current provisioning and exact reviewed18 checks. It uses genuine WeakMap-bound live scopes from the SAME native owner, validated canonical filename/dev/inode, reviewed18/provisioning identity and fixed ADMIN. A structural reader cannot mint it. It is NOT a bearer, production enrollment anchor or rollback/restore proof.
- POST mutations now require X-Inventory-Context, checked inside the existing authorized writer transaction before business work. Result lookup preserves its JSON contract and supplies server-derived X-Inventory-Context / X-Inventory-Operation headers from that same transaction. No success/context response is published before confirmed COMMIT. Existing origin/host/TLS/header/body/method protections remain.
- Recovery performs authenticated context/result GETs only, never replays a POST or reconstructs a lost payload. Wrong context/kind,404, timeout, SQL failure, expired authorization or interruption leaves UNKNOWN and blocks replacement. There is no expiry, abandon or delete button. Even an unwritten/rejected command may stay blocked; definitive cancellation needs separate approval.
- Confirmed markers survive reload until explicit Admin acknowledgement. Acknowledgement performs another fresh signed-cookie/SQL-authorized lookup and conditional IndexedDB deletion. Marker/display state alone grants nothing. Shared status/Resolve/Acknowledge controls are confined to the existing TEST Admin shell; fixture previews/layout remain. A stock dialog can close without cancelling/clearing the marker; recovered live forms are marked saved to avoid resubmitting their old values after acknowledgement.

## Actual focused verification

**20 distinct new checks +8 selected existing regressions =28 passes;0 final unresolved failures.** Aggregated focused runs, NOT one clean28-test execution. Initial backend run:3 passed/3 TEST assertion/interface failures; fixed actual stock column/connection usage. First expanded run:13/14 passed; CDP Browser.crash terminated Chromium but awaiting its response hung. Corrected test waits on bounded persistent-context closure; actual crash/relaunch then passed. These logs and initial TypeScript diagnostics are retained, not hidden.

New checks cover real native SQLite, Better Auth, signed cookies and CA/SAN-validated HTTPS: stable restart namespace versus copied-file mismatch; genuine Admin/forged/anonymous/Salesperson denial; required mutation binding; SQL-derived CREATE/RECEIVE; repeated lookup/no writes; actual deferred-FK COMMIT rollback (explicit injection-consumed assertion); missing provisioning/revocation; no unintended routes or secret/path disclosure.

Actual isolated Chromium retained profiles cover normal CREATE and5+2=7 PACK RECEIVE, confirmed-marker reload/acknowledgement, dropped successful HTTP response after COMMIT, actual Browser.crash/fresh launch/fresh Admin login, graceful close/relaunch, server restart and stale-cookie denial, two-tab admission, interrupted-before-arrival404, no age expiry, unavailable storage, failed durable write/zero POST, SQL session expiry and denied acknowledgement, kind/corrupt marker rejection, replacement TEST database at SAME origin with unrelated SAME-key result hidden, real10-second lookup timeout, delayed old acknowledgement versus a newly claimed marker, and lost RECEIVE/dialog recovery with exactly one receiving POST. Storage field allowlist/size and absence of credentials/business payload were asserted.

Eight selected Part5 regressions pass: create/idempotent changed-payload rejection; same-cost receive/stale/D05/path checks; concurrent duplicates; CSRF/host/SNI/forwarded headers; live exact18 schema admission; native receiving COMMIT rollback with unchanged credentials/latch/enrollment/history/FKs; actual browser search/details/filters/totals/restart; invalid input and lost-response recovery. Existing tests now obtain required context and use the explicit recovery/acknowledgement controls. Prior evidence remains untouched.

Scoped TypeScript and zero-warning ESLint PASS. Fresh isolated Next16 UI build PASS; original web/.next and the earlier Part5 build preserved. No full historical/frontend/browser suite, dependency install or OS/trust-store change. Node socket clients validate disposable CA/SAN normally; browser trust is the existing TEST-only exact leaf-SPKI allowance with ignoreHTTPSErrors=false, not production Windows trust.

Evidence: web/test-results/inventory-crash-recovery-599f32a4-8819-415d-aa76-01e3f3597aca/ (logs, verification-summary.json, preservation-before/final.json). Disposable generic databases/profiles only; no shop database or real credentials. No trace/video/storageState/cookie/password exports.

## Exact project files

Modified (9):
- web/src/server/auth/database.ts
- web/src/server/hosting/inventory-http.ts
- web/src/lib/inventory/client.ts
- web/src/components/admin/test-product-form.tsx
- web/src/components/admin/test-inventory.tsx
- web/src/components/shell/admin-shell.tsx
- web/tests/integration/inventory-http.test.ts
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

Created (7):
- web/src/server/hosting/inventory-recovery-context.ts
- web/src/lib/inventory/recovery-store.ts
- web/src/components/admin/test-inventory-recovery.tsx
- web/tests/integration/inventory-recovery.test.ts
- web/vitest.inventory-recovery.config.mts
- web/tsconfig.inventory-recovery.json
- docs/development/INVENTORY_CRASH_RECOVERY_IMPLEMENTATION_REPORT.md

Separate ignored TEST evidence/build/databases/profiles added; no previous evidence deleted or overwritten. No staged/committed/pushed/reset/cleaned/stashed changes.467 baseline project files compared; only the9 listed existing files changed,7 new files,458 baseline files unchanged and none missing. ALL0001-0018, dependencies, original fixtures, enrollment/anchors, known formatting drifts, prior evidence, HEAD and index preserved.

## Critical self-review and remaining limits

Reviewed every changed source/test/config and the POST -> durable claim -> SQL COMMIT -> lookup -> display -> fresh-authorized conditional acknowledgement workflow, including writer rollback and cross-tab races. Found/corrected stock-dialog recovery access and stale live-form re-submission gaps with focused checks. No known Critical defect identified within this bounded verified scope; this is not a promise of zero possible bugs or production security approval.

Recovery depends on the SAME retained browser profile/origin/port and surviving IndexedDB. Profile deletion, storage clearing/eviction, private/incognito profiles, physical power/disk loss, new profile/origin and hostile same-user browser/storage tampering are NOT certified. Strict IndexedDB durability is not a promise against every hardware failure. Browser-crash tests deliberately clear any restored cookies and require genuine fresh Admin login; full production desktop reopen enforcement remains unimplemented. Context file/stat checks are operational binding, not handle-pinned anti-tamper or database anti-rollback authority. No claim of safe UNKNOWN cancellation or independent restore is made.

Production enrollment/8-to18 maintenance, independent portable encrypted backup/restore and recovery, append-only guards, certificate/signing-key custody/trust, desktop lifecycle and target hardware remain gates. D05/P02/P08 and all business policies unchanged. No real production shop readiness claim.

**ONE next task:** owner review a separately scoped durable UNKNOWN-operation cancellation/reconciliation contract; do not implement its schema/fence without explicit approval. STOP.
