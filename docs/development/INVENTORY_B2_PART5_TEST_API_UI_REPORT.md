# B2 Part5 - authenticated TEST Products and Inventory vertical slice

11 November2026. **PASS for the bounded disposable TEST workflow; owner acceptance pending.**
Production authentication/business activation is **DISABLED**. This is not an operational shop deployment or distributable demo.

## Implemented boundary and endpoints

The existing loopback HTTPS host, sole gateway/native DB owner and serialized lifecycle are reused. Activation requires the existing NODE_ENV=test PLUS validated mode=test/path confinement; persistent configurations stay health-only. Every business request re-enters genuine signed-cookie/authoritative SQLite ADMIN authorization. Exact reviewed schema18 is checked inside the same transaction, including operation-result reads. It is not enrollment/maintenance lineage approval.

| Exact method/path | Capability |
| --- | --- |
| GET /api/admin/products | Bounded literal search, keyset pagination, safe product DTOs and filtered/overall totals |
| POST /api/admin/products | Product plus one-time opening stock |
| GET /api/admin/products/:uuid | Current product details |
| POST /api/admin/products/:uuid/receive | Same-cost receiving; body product must match the path; optimistic versions |
| GET /api/admin/inventory | Summary and ALL/AVAILABLE/LOW/OUT views, bounded pages |
| GET /api/admin/inventory/operations/:requestKey | Reconcile only CREATE/RECEIVE results after an uncertain reply; key is NOT bearer authority |

Role is fixed by verified TLS/Host/SNI, never query/header/body identity. The existing auth login/logout/session dispatcher is retained. Headers remain capped at8KiB/64, sockets64; mutation bodies8192 bytes with fatal UTF-8, five-second absolute read deadline, flat string/boolean/null JSON and explicit duplicate-key rejection. Query URL<=1024, search<=120 characters and page<=100. Wrong methods/content types/origins/cookies/forwarding, bodies on GET and unsupported paths deny. POST requires exact same-origin Origin; GET validates any supplied Origin/Fetch Metadata. No CORS, raw Better Auth, arbitrary SQL/proxy, new normal Next API route or Server Action exists. Errors are fixed safe codes/messages; responses no-store. No cookie or token is returned by inventory.

Mutations use existing parameterized services: BigInt/int64 paisa, whole PACK/BOX, immutable historical snapshots, inclusive low stock including zero, operation-key/payload conflict checks and atomic balances/ledger/events. D05 different-cost receiving remains POLICY_PENDING; no P02/P08 decision, repricing, correction, sale or metadata edit was added.

## Actual UI and restart proof

Only four existing pages are admitted through the protected TEST host: /admin/products, /admin/products/new, /admin/inventory/available-stock and /admin/inventory/low-stock. Each page/RSC/static request is Admin-authorized before Next; only exact static JS/CSS/fonts are admitted. Other navigation remains unavailable. Dynamic server rendering receives a request-local TEST display mode, with no identity/DB capability or public flag. Real product data is client-fetched through the private API; no live business rows enter SSR/RSC. Normal Next preview pages retain their original fixture branch, confirmed using a separate sequential normal-Next negative control with a forged mode header.

Approved shell, fields, cards/tables, themes and navigation structure are retained. TEST labels, true loading/error/empty states, whole-unit choices and required receipt reason distinguish actual saved data. Edit/unsupported price operations stay unavailable. Stock success refetches SQLite rather than inventing a local balance. TEST Back to Login/Exit invokes real logout and ends on minimal session status; real Login UI remains unwired, and browser tests authenticate through the existing genuine TEST HTTPS login. There is no fake login shortcut.

Real Chromium created a product, searched it, read details, received5+2=7 PACK, saw stock value Rs.87.50 and correct low-stock filtering, then closed/restarted the SAME runtime/database. Old cookie was denied; fresh real password login restored the saved product and unchanged ledger/events. Refresh persistence, anonymous/Salesperson HTML/RSC/API denial and real logout/stale denial pass.

Pending mutation key/payload is RAM-only, with one in-flight admission and a leave warning. A real CDP response-stage disconnect AFTER server success left exactly one saved product; Resolve previous save fetched the SAME operation result, with one create POST total. No browser persistence was introduced. Browser crash/forced reload can lose RAM intent: do not blindly re-enter an uncertain operation; cross-crash reconciliation remains a deployment gate. No automatic new-key retry is implemented.

## Verification and retained failures

**33 distinct new checks PASS (30 real-socket/API,3 real-browser) +4 selected existing schema regressions PASS =37 distinct. Zero final unresolved failures.** This is aggregation of focused expanded/targeted runs, not one clean37-case suite. Scoped TypeScript/zero-warning ESLint pass; the separate actual UI production build passes after one type correction. Existing .next and previous evidence were not replaced. No historical frontend/browser full suite ran.

Native creation AND receiving deferred-FK COMMIT failures roll back completely; original-key retry succeeds. Success is withheld while the native writer is uncommitted. Lost COMMIT acknowledgement and post-COMMIT shutdown return no false success, then reconcile the stored result without duplication. Concurrent duplicate/stale receiving, exact totals/ledger, five-failure30-second throttle, expiry/revocation/restart, missing latch, SQL failure/schema drift, immutable auth/credentials/latch/history and FK/quick_check pass. No policy changes or production records were used.

Positive behavior uses real installed Next16.4.3, Better Auth/core/official Kysely adapter1.7.18, Kysely0.29.0, better-sqlite313.0.3/SQLite3.53.4 and native scrypt. Faults/barriers observe or interrupt actual operations; they are not a mock authorizer or framework imitation. Generic auth8 TEST records are genuinely provisioned, then copied into a NEW schema18 created from EMPTY. No existing/enrolled8 database was upgraded, anchor adopted or production enrollment claimed.

Retained diagnostics: two initial TEST fault injections missed the monotonic-clock/quoted-SQL contracts, then passed after correcting injection only; one ambiguous browser alert locator was scoped correctly; one UI hook return type failed the initial isolated build and was corrected. A proposed browser-storage intent marker was rejected by automatic approval review and never executed; the implemented alternative is RAM-only. Earlier HTTP/hosting suites assume latest migrations still mean auth8; they were inspected, not rerun or rewritten. Their historical evidence is retained; fresh18 compatibility is demonstrated by this new harness.

Browser trust is an isolated disposable leaf-SPKI exception with ignoreHTTPSErrors=false, reused from reviewed Part3Q. It is NOT normal Windows production trust; Node clients independently verify the explicit TEST CA/SANs. TEST certificate private files are encrypted, passphrase/credentials/signing keys stay RAM-only. No Windows certificate store/profile configuration changed. Credentials, salted hashes, keys and signed-cookie values are checked against ordinary outputs/logs/browser storage; no trace/video/storageState containing secrets is exported.

Evidence: web/test-results/inventory-b2-part5-ff862457-bb9f-4f98-bd53-605e7daf7c17/. Initial failures, corrected outputs, build/type/lint logs and final verification/preservation manifests remain separate from previous evidence.

## Exact project files

Modified13:
- web/src/server/hosting/https.ts
- web/src/server/hosting/runtime.ts
- web/src/server/hosting/README.md
- web/src/server/inventory/service.ts
- web/src/server/inventory/README.md
- web/src/app/admin/layout.tsx
- web/src/app/admin/products/page.tsx
- web/src/app/admin/products/new/page.tsx
- web/src/app/admin/inventory/available-stock/page.tsx
- web/src/app/admin/inventory/low-stock/page.tsx
- web/src/components/shell/admin-shell.tsx
- docs/PROJECT_MEMORY.md
- docs/MODULE_CHECKLIST.md

Created12:
- web/src/server/hosting/inventory-http.ts
- web/src/server/hosting/inventory-pages.ts
- web/src/server/hosting/inventory-render.ts
- web/src/lib/inventory/client.ts
- web/src/components/admin/test-product-form.tsx
- web/src/components/admin/test-inventory.tsx
- web/src/components/admin/test-inventory-exit.tsx
- web/tests/helpers/inventory-http-fixture.ts
- web/tests/integration/inventory-http.test.ts
- web/vitest.inventory-http.config.mts
- web/tsconfig.inventory-http.json
- docs/development/INVENTORY_B2_PART5_TEST_API_UI_REPORT.md

Additional files are only fresh ignored TEST databases/encrypted certificates, isolated UI build copies and sanitized evidence. No dependencies, migrations0001-0018, prior auth/enrollment/reader foundations, original fixtures, previous reports/evidence or known formatting drifts changed. Baseline454 project files, HEAD/index and preserved prior evidence are checked separately; exact final live Git status is recorded in preservation-final.json. No staging/commit/push/reset/clean/stash or OS changes.

## Critical self-review and production gates

Reviewed every changed source/config/test and affected workflow: trusted admission and actual transport; sole-owner startup/drain; parser bounds/duplicate identities; exact-schema admission and per-operation SQL authorization; service transaction/idempotency and non-bearer reconciliation; display-mode separation; exact money/whole quantities; UI duplicate/error/uncertainty states; role/private-data and secret exposure. No unresolved Critical/High defect demonstrated in this bounded TEST slice. This is not a promise of zero possible bugs.

Not verified/implemented: crash-persistent browser intent/reconciliation, hostile privileged local tampering, DB-level append-only triggers, real enrolled8-to18 protected maintenance, independent portable encrypted backup/restore/owner recovery, production first-run schema18 enrollment, Windows TLS/signing-key custody/trust, browser/window/Electron fresh-auth lifecycle, real shop hardware/load/power failure, broad visual/manual accessibility acceptance, Remote Admin or production business activation. Existing known release gates remain; the TEST schema/history check grants none of them. D05/P02/P08 remain pending.

**ONE next task:** owner review and approval of crash-safe mutation reconciliation before extending this TEST workflow toward deployment. STOP for owner review; no next business module.
