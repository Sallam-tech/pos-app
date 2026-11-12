# Coordinated TEST inventory recovery and Login report

12 November 2026, Asia/Karachi. **PASS for approved coordinated TEST recovery/Login scope:52 distinct focused checks have passing results across runs; no final unresolved test failures. Overall commercial system PARTIAL; production DISABLED.**

Recovered the interrupted checkpoint from actual files and logs. The prior coordinated34-check run had completed; the usage-limit-rejected edit had not executed. Continued that implementation and TEST Login, preserving earlier evidence.

## Implemented

- Exact owner-approved migrations0019-0035: cancellation-only STRICT table and16 pinned append-only/conflict/physical-rowid guards. Historical0001-0018 untouched. Actual trigger metadata is verified atomically; arbitrary trigger SQL, changed history, partial19-34, unreviewed objects, incompatible physical IDs and direct8-to35 adoption deny. Complete35 writes require a genuine path-confined TEST connection, not a structural clone.
- Same gateway/native owner validates exact35 before TEST listening and within guarded transactions. Explicit populated generic TEST18-to35 upgrade preserves auth records, provisioning latch, history, inventory and original operational context. No startup migration, new owner, auto-provisioning, real enrolled upgrade or anchor rewrite.
- Genuine Admin GET/POST operation recovery: matching original context/kind; committed evidence verified against command hash, event/result/movement; permanent cancellation serializes with execution. All eight existing mutation kinds respect cancellation. Success is published only after COMMIT. Missing results remain UNKNOWN.
- IndexedDB keeps only its existing bounded original key/context/kind/state marker. Explicit Admin resolve/cancel and fresh signed-SQL terminal acknowledgement precede clearing. Atomic cross-tab comparisons prevent stale confirmation/acknowledgement from clearing a replacement marker. No payload, cost, credential or bearer is stored there; unavailable storage denies saves.
- Existing Login design connects only on validated isolated TEST HTTPS role hosts. Native password verifier, persisted five-failure/30-second cooldown, genuine signed RAM session and current SQL authorization are reused. Admin enters protected Products. Salesperson gets truthful authenticated TEST status; operational /pos remains closed until real sales exists. Confirmed Back to Login revokes first; password input is cleared. Ordinary Next remains preview; raw framework/other Next routes remain inaccessible.
- Fixed a real shutdown hang: aborted Next renders could leave pending promises after all sockets closed. The page dispatcher now settles on response closure ONLY after its SQL gate has completed; no gateway or transaction is passed to Next. Auth/inventory writes still drain fully. Temporary diagnostic source changes were restored; no upstream patch.
- Removed a Login HTML truncation limit that could turn an oversized non-BMP password into a valid prefix. Existing scalar/byte policy rejects oversized full input before submission. Newline paste is rejected explicitly rather than silently transformed; backend hashing/password policy remains unchanged.

## Verification and evidence

Evidence: web/test-results/inventory-recovery-coordinated-216e70ef-990e-4e00-9d92-d043f98b8cb3/.

- Recovery: clean34-case pass (17 schema/migration/admission,11 HTTPS/service,6 Chromium) in type-login.log; that filename is historical and contains Vitest results, not a typecheck.
- Additional actual COMMIT-success/lost-acknowledgement case: final-app-commit-proof.log PASS. POST returns503/no cookie, committed cancellation persists, explicit authenticated terminal read proves CANCELLED, delayed execution is fenced and reopen preserves it. No automatic mutation retry. This makes35 distinct recovery checks across runs.
- All seven original Login cases PASS on final-app-login-integration.log; two selected recovery browser races PASS there too. Initial extra lost-COMMIT expectation failed because it incorrectly required owner quarantine even after an explicit fresh SQL read could prove the terminal outcome; corrected without a source/security relaxation.
- Nine selected historical regressions PASS: three native guard/real gateway cases (recursive triggers0/1), three SQLite foundation cases, three revocation/real COMMIT/RAM failure cases. selected-native-corrected.log, selected-foundation-regressions.log, selected-revocation-regressions.log. Old review fixture now checks its actual admitted35 history; selected auth fixture copies only intended0001-0008 before its TEST0009 guard.
- Final exact-input build PASS: build-password-final-app.log, isolated ui-password-final-app/. Scoped TypeScript type-exact-input-final.log PASS; scoped ESLint lint-exact-input-final.log PASS with zero warnings.
- Maximum128-scalar/512-byte Unicode credential, overlength rejection without prefix authentication, explicit newline-paste rejection and two role-form regressions: password-final-app-browser.log PASS (three cases: one new plus two role regressions). Total35 recovery +8 Login +9 selected regressions=52 distinct passing checks across runs, not one clean52-case run.
- Strengthened Admin Login preservation with a real committed product, quantity5, stock movement and audit ledger; repeated Login/Back to Login leaves all those rows unchanged. password-final-app-data-preservation.log PASS. Subsequent focused lint-login-sentinel.log and type-login-sentinel.log PASS. This is a stronger rerun of the same test, not an extra distinct count.
- Earlier28 crash checks and77 native-review checks reused, not rerun or added as new full-suite totals. No whole frontend/browser suite. All new data/certificates/profiles are disposable TEST; passwords/signing secrets generated in RAM and excluded from reports/logs/ordinary JSON. Browser trust uses only exact disposable leaf SPKI; Node verifies the actual CA/SAN. No global TLS disable or system certificate changes.

Initial failed diagnostics are retained. The Admin shutdown timeout was reproduced with actual closed sockets/pending render work, then fixed and tested. A parallel diagnostic runtime was correctly rejected by the machine-wide single-owner fence; final runtime checks were serialized. Neither those failures nor mocked behavior are counted as passing proof.

## Critical self-review and limits

Reviewed every changed source/SQL/config/test workflow: exact schema/trigger/history handling, native transaction/COMMIT rollback and uncertain outcomes, integer/stock integrity, ownership/closing, role/host/cookie/CSRF boundaries, terminal recovery, cross-tab marker lifecycle and credential non-disclosure. No known unresolved Critical/High defect identified in the tested scope; this is not a guarantee against all bugs.

- Guarantees require retained browser profile/storage/origin. Clearing/evicting storage, profile/device replacement and coherent privileged file rewrites are not solved. A missing marker/result is never proof of failed execution. Cancellation/audit records have no unapproved purge/expiry.
- Next caches render servers by directory. Browser scenarios use fresh test workers; no private cache reset is used. Packaged process/reopen/window lifecycle still needs independent verification. Future server components that perform DB work must revisit the pure-render drain assumption.
- A single-line password field explicitly rejects newline paste. Backend callbacks still preserve and accept their reviewed byte policy unchanged; future trusted enrollment UX must resolve this input compatibility before real account enrollment. No unapproved password-policy change.
- Actual hardware performance/power loss, browser password-manager behavior outside app control, Windows EXE/printer/TLS/key custody, protected current-schema maintenance, owner recovery/portable encrypted backup and independent Windows restore are not certified. No second Windows restore target/profile is available.
- Production auth/business HTTP remains disabled. No real accounts, financial data migration, lost-password recovery, remote Admin, PIN, sales/invoices/refunds/expenses/closing/backup implementation or financial-policy change. Login/logout never changes shop records.
- Real sales and dependent modules need explicit P02/D05/P08/cash/correction decisions and a separately reviewed business/ledger schema. Existing ADMIN-only inventory ledgers must not be repurposed as sales or bypassed with a parallel uncounted ledger. Remaining Products edit/history controls are recorded in the completion matrix.

## Preservation and exact files

Final preservation verification and exact changed/created file list follow below. HEAD/index and prior evidence must remain unchanged. No staging, commit, push, reset, clean, stash, existing project-file/data deletion, dependency/OS change or real-shop database access.

Verified preservation: 480 baseline files remain; 25 existing files changed within the approved scope and 37 created. 18 historical migrations, both dependency manifests, both previously reported formatting drifts (plus preserved experiment whitespace), 22 prior crash-evidence files, HEAD and index are unchanged. Git: 14 modified tracked / 253 individually untracked; nothing staged. Current web/src matches the final built source snapshot.

Modified existing files:

- docs/IMPLEMENTATION_PLAN.md
- docs/MODULE_CHECKLIST.md
- docs/PROJECT_MEMORY.md
- docs/development/INVENTORY_RECOVERY_AND_AUDIT_SCHEMA_CONTRACT.md
- docs/development/MASTER_COMPLETION_MATRIX_AND_API_INVENTORY.md
- web/src/app/login/page.tsx
- web/src/components/admin/test-inventory-exit.tsx
- web/src/components/admin/test-inventory-recovery.tsx
- web/src/components/login/login-form.tsx
- web/src/lib/inventory/client.ts
- web/src/lib/inventory/recovery-store.ts
- web/src/server/auth/gateway.ts
- web/src/server/db/connection.ts
- web/src/server/db/migrate.ts
- web/src/server/db/reviewed-schema.ts
- web/src/server/db/validate-schema.ts
- web/src/server/hosting/inventory-http.ts
- web/src/server/hosting/inventory-pages.ts
- web/src/server/hosting/inventory-recovery-context.ts
- web/src/server/hosting/runtime.ts
- web/src/server/inventory/contracts.ts
- web/src/server/inventory/mutations.ts
- web/src/server/inventory/service.ts
- web/tests/integration/inventory-audit-guard-review.test.ts
- web/tests/integration/session-revocation.test.ts

Created files:

- docs/development/INVENTORY_COORDINATED_RECOVERY_AND_TEST_LOGIN_REPORT.md
- web/src/server/db/inventory-trigger-policy.ts
- web/src/server/db/migrations/0019_inventory_cancellations.sql
- web/src/server/db/migrations/0020_inventory_operations_insert_guard.sql
- web/src/server/db/migrations/0021_inventory_operations_no_update.sql
- web/src/server/db/migrations/0022_inventory_operations_no_delete.sql
- web/src/server/db/migrations/0023_stock_movements_insert_guard.sql
- web/src/server/db/migrations/0024_stock_movements_no_update.sql
- web/src/server/db/migrations/0025_stock_movements_no_delete.sql
- web/src/server/db/migrations/0026_product_events_insert_guard.sql
- web/src/server/db/migrations/0027_product_events_no_update.sql
- web/src/server/db/migrations/0028_product_events_no_delete.sql
- web/src/server/db/migrations/0029_inventory_cancellations_insert_guard.sql
- web/src/server/db/migrations/0030_inventory_cancellations_no_update.sql
- web/src/server/db/migrations/0031_inventory_cancellations_no_delete.sql
- web/src/server/db/migrations/0032_inventory_operations_positive_rowid.sql
- web/src/server/db/migrations/0033_stock_movements_positive_rowid.sql
- web/src/server/db/migrations/0034_product_events_positive_rowid.sql
- web/src/server/db/migrations/0035_inventory_cancellations_positive_rowid.sql
- web/src/server/db/schema-pins.ts
- web/src/server/hosting/login-render.ts
- web/src/server/inventory/recovery-context.ts
- web/src/server/inventory/recovery.ts
- web/tests/helpers/test-login-scenarios.ts
- web/tests/integration/inventory-schema35.test.ts
- web/tests/integration/inventory-terminal-browser.test.ts
- web/tests/integration/inventory-terminal-http.test.ts
- web/tests/integration/test-login-admin.test.ts
- web/tests/integration/test-login-cooldown.test.ts
- web/tests/integration/test-login-disclosure.test.ts
- web/tests/integration/test-login-failures.test.ts
- web/tests/integration/test-login-input.test.ts
- web/tests/integration/test-login-recovery.test.ts
- web/tests/integration/test-login-salesperson.test.ts
- web/tests/integration/test-login-ui.test.ts
- web/tsconfig.inventory-coordinated.json
- web/vitest.inventory-coordinated.config.mts
