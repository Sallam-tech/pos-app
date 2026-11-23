# Final production release audit - 23 November 2026

**Production release: NO-GO.** Security corrections and the listed installed TEST acceptance checks are verified. Critical production admission, trust, recovery and acceptance gates remain open. No final production installer was built; production activation, Git commit/push and client handover did not occur.

Machine-readable result: [FINAL_RELEASE_STATUS.json](../../build/final-release-audit-20261123/FINAL_RELEASE_STATUS.json). Evidence directory: `build/final-release-audit-20261123/`.

The reproduced executable-verification bypass is fixed: a forged writable metadata cache previously admitted altered runtime bytes. Every payload member is now hashed on every admission; historical caches are ignored. The original failed rejection test is retained. Electron was updated from 45.3.3 to the checksum-verified official 45.4.1 runtime containing upstream [security backports](https://releases.electronjs.org/release/v45.4.1). Node 24.22.3 remains pinned to its [official release checksum](https://nodejs.org/en/blog/release/v24.22.3). Normal admission rejects the older Electron pin. Upgrade inspection requires an exact authorized manifest and checks the manifest digest actually verified.

149 server checks passed with zero failures/skips: settings/startup/TLS drain 8; inventory audit guards 77; sales 46; shared login 9; backup crypto 3; report money 2; native fences 2; settings authorization fault 1; authenticated restore/selection 1. The restore case records eight genuine steps including inherited credentials, proof expiry, replay refusal, selected CURRENT, backup namespace reopening and retired-writer denial. The 35 original desktop checks passed; 32 unchanged cases retain source equivalence, while the three updater checks were rerun with nine current integrity/runtime cases (12/12 PASS). This is focused evidence across runs, not one newly executed full suite.

The actual installed EXE passed both existing role passwords, saved-invoice reopening, normal close/reopen, Products navigation, genuine saved-report loading and final normal shutdown. It ran with a restricted inherited PATH, without global Node/development tools. The first native script is retained as FAIL because it searched for a hyperlink named `Sales Report`; approved markup uses `View Sales Report`. A bounded continuation on the same existing process completed only Reports and shutdown. No login, financial action or successful scenario was replayed to hide that failure. The application is now closed; its application mutex is absent.

| Actual installed observation | Result |
| --- | --- |
| First post-update EXE to visible login | 40.33 seconds |
| Reopened EXE to visible login | 26.04 seconds |
| Products navigation to Add Product link readiness | 2.50 seconds |
| View Sales Report to saved Sales Details | 1.38 seconds |
| Existing Admin / Salesperson logins | PASS / PASS |
| Normal drains | PASS before restart and after focused continuation |

OS caches were not controlled. Earlier 32.80/19.04-second launches used the metadata reuse path. No overall startup improvement is claimed. Mandatory full hashing remains enabled; startup performance acceptance remains open. Current normal drains do not establish the cause or permanent resolution of the historical windowless Electron hang.

Readonly SQLite verification: schema41, WAL, integrity `ok`, zero foreign-key violations. All 64 tables remain present; 62 table row digests are identical, including all business, account, credential and migration tables. Only `auth_login_attempts` and `auth_session_authorizations` changed as expected from genuine logins (authorization rows 50 to 52). No financial writes, password changes, database reset, migration or owner-root restore occurred. Both program-only updates retained the complete previous program and proved every nonbrowser data file byte-identical before launch.

The four original invoice headers and saved line quantities/discounts/costs reconcile exactly. Across all recorded TEST dates, the unchanged financial-event ledger yields net revenue Rs.1,130.00, COGS Rs.860.00, gross profit Rs.270.00, expenses Rs.51.00 and net profit Rs.219.00. Original immutable invoice snapshots total Rs.1,280.00 revenue and Rs.420.00 gross profit before adjustments. These are recorded TEST totals, not a physical-cash attestation or a claim about a particular selected-day screen.

No frontend or backend application source was edited during this audit. All 138 installed backend source entries match the workspace. The existing 374-file frontend/configuration fingerprint remains `6f848eaac32624ca485875563154caff806106538d2f3acd3a0d6b673797c5fb`; BUILD_ID remains `ZU4pxOMYR9pnE1xbXRtyP`. All 41 migrations and four original source documents match the retained preservation hashes. A historical register disagrees on globals.css despite no live CSS worktree change; that stale register is not presented as a current byte-exact certificate. The start/end complete source fingerprint proves this audit introduced no frontend change.

| A-Z | Area | Strict outcome |
| --- | --- | --- |
| A | Requirements and amendments | Reviewed; original documents retained. Approved SQLite/Electron direction supersedes the original proposed PostgreSQL/Docker stack. |
| B | Approved frontend | PASS this audit: complete source fingerprint unchanged; no redesign. |
| C | Installed functionality | Listed cases PASS across initial run plus bounded continuation; original selector FAIL retained. |
| D | Data/accounts | PASS: all business/account/credential tables unchanged; auth-only effects identified. |
| E | Passwords/sessions/proofs | Current shared-login and authorization checks PASS; original security controls preserved. |
| F | HTTPS/Origin/roles/IPC | Current affected checks plus unchanged boundary evidence PASS; no public listener added. |
| G | PKR and historical profit | PASS current raw reconciliation and exact-money/sales cases. |
| H | Products/stock/valuation | Guard tests PASS; unchanged prior workflow evidence retained; no owner stock writes. |
| I | Sales/concurrency/idempotency | 46 current core cases PASS; owner operations were not replayed. |
| J | Invoices/history/corrections | Current saved receipt and original snapshots PASS; unchanged correction evidence retained. |
| K | Returns/refunds | Unchanged implementation/module evidence retained; no owner cash/refund performed. |
| L | Expenses | Unchanged module evidence and affected guard checks retained; expense ledger unchanged. |
| M | Cash counting | Prior scoped evidence retained; no new count on protected owner data. |
| N | Closing/calendar | Prior scoped evidence retained; no owner closing or date alteration. |
| O | Reports | Saved report actually loaded; current money checks and raw ledger reconciliation PASS. |
| P | SQLite/migrations/WAL | PASS schema41/integrity/FK/preservation; no production migration executed. |
| Q | Writer fencing/rollback | Current native and authenticated selected-writer cases PASS on disposable fixtures. |
| R | Encrypted backup | Software crypto/restore evidence PASS; independent real custody/media acceptance OPEN. |
| S | Recovery | Same-machine disposable restore/selection PASS; replacement profile/device proof OPEN. |
| T | Offline/runtime closure | Bundled operation/restricted PATH and local-only source controls verified; target outage acceptance OPEN. Internet was not disconnected on this host. |
| U | Electron/lifecycle | 45.4.1 installed; current normal drains PASS; historical hang cause OPEN. |
| V | Windows updates/retention | Two guarded TEST updates PASS, with distinct complete retained program folders and unchanged pre-launch data. Prior un/reinstall evidence retained. |
| W | Printing | Existing virtual/PDF/layout evidence retained; current Print control present. Physical printer deferred/unverified. |
| X | Performance/capacity | Current timings above; startup remains slow. Prior qualified 50,002-record evidence retained, not rerun or promoted to new throughput certification. |
| Y | Supply chain/release trust | Current production lock has zero registry advisories; exact lock unchanged. Pinned runtime/archive/full payload verified. Signed production trust remains OPEN. |
| Z | Production/owner acceptance | NO-GO: production bootstrap/adoption, independent recovery and owner/target acceptance unfinished. |

Actual installed TEST artifact, for owner review only:

- Installer: `D:\pos\build\usability-correction-1795416091185\runtime-security-20261123\installers-b0ced4b0-117a-4a94-b44d-d25ca496b960\ShopPOS-TEST-0.2.0-test.21r2-security-fix-20261123-win-x64-setup.exe`
- Installer SHA256: `d1a66643abdea985a313a5f9faeabb083783d13ff689ea41c7cddaadd2352270`
- Installed EXE: `%LOCALAPPDATA%\Programs\SalamTech\ShopPOSTest\0.2.0-test.21r2\Shop POS TEST.exe`
- EXE SHA256: `264d2a08737a48fbfde835d84e910127ad85429a7697f66f73f563a1dea557ce`
- Payload manifest SHA256: `7ace7fa2025151d75d5104baf8c4b9bb4accf632e94c00a0faeaed2da62bed16`; 8,683 files; fuses `010000001`.

Known TEST packaging limitation: its root third-party summary still labels Electron45.3.3; actual45.4.1 MIT/Chromium licence files are included. The source summary is corrected for future packaging. This metadata-only correction did not trigger another TEST rebuild. The artifact is explicitly unsigned TEST and must not be handed to the client as production.

Remaining production work is concrete and gated:

- Review a separate production bootstrap/data-adoption contract preserving existing records, immutable invoice identities, schema history, credentials, original operation keys and recovery authority. Current entry/admission deliberately enables authentication/business only in confined TEST storage; production storage exposes health. Changing TEST labels/flags is insufficient.
- Establish owner-approved signing/trust and custody. The production release must authenticate the complete executable/runtime/backend inventory, including root executable/DLL assets, and preserve offline operation. Current TEST manifest/checksums do not constitute an independent signed release trust anchor.
- Obtain real separate backup custody/media and witness replacement-profile/device recovery plus old-writer fencing; retain power-loss/disk-full/RPO/RTO and client-device evidence as pending until exercised safely.
- Resolve or explicitly bound the historical lifecycle incident, define acceptable cold/warm startup behavior, and perform the owner business walkthrough and target internet-outage acceptance. Client hardware and physical printing remain deferred, not fabricated PASS or a reason to repeat independent software work.
- Build the final production installer only after critical gates pass, verify that installed production candidate, then obtain explicit owner FINAL GO before activation or client handover. Major architectural/deployment changes require review under [AGENTS.md](../../AGENTS.md); no such change was implemented here.

Primary proofs: `runtime-update-tests.log`, `desktop-release-tests.log`, `affected-server-tests.json`, `security-financial-tests.json`, `runtime-dependency-audit.json`, `installed-audit-result.json`, `installed-continuation-result.json`, `data-before.json`, `data-after.json`, `data-comparison.json`, `final-source-identity.json`, and the two guarded `installation-result.json` records under the retained TEST build directories. No unchanged full suite, frontend rebuild or 50k benchmark was repeated.