# Shop POS TEST delivery - 0.2.0-test.15

17 November2026. Phase2 remains OPEN for final owner business/external acceptance, performance limitations and unresolved historical startup triggers. Listed achievable laptop software checks PASS. Separate Phase3 source-bound A-Z software audit is recorded; production/client handover remains NO-GO.

Installer: D:\pos\desktop\test-results\installers-1eeac8df-9499-44a1-abd0-f3a34740585d\ShopPOS-TEST-0.2.0-test.15-win-x64-setup.exe
SHA256: a359908e5ab2a9e51b055b1ab119c3ec60aed4a31521633c8fbab54fd9f8f020
Installed EXE: D:\pos\desktop\test-results\owner-acceptance-c2f20086-7ac5-46fa-badd-3058e734a45f\Shop POS TEST installed\versions\0.2.0-test.15\Shop POS TEST.exe
EXE SHA256: b4551a40acee228ae534e38281eee9d2196b07597cd9d4190018fe6fc0828412
Payload manifest SHA256: 1789018911f416c3c9345e5695573317da90faf8e8a125f7c591f17fdcce6601

| Gate | Actual result |
| --- | --- |
| Current installed app |16 native checks PASS: fresh protected setup, neutral shared login, genuine both-role switches, zero empty cart/disabled submit, Dashboard genuine zero then sale150/profit50, Sales Report150, product/stock/sale/invoice, second-instance refusal, restart and original invoice reopening. |
| Financial/SQLite | Readonly full integrity_check ok; foreign_key_check empty; exactly one sale/operation/payment/snapshot, stock12 to11, PKR150 revenue/100 cost/50 profit. No financial replay. |
| Owner preservation | Code-only14 to15 upgrade preserves every original owner-data byte. Installed owner-root18 no-password/no-POST HTTPS/render/assets/denial checks PASS; original credentials and protected identity bytes unchanged, normal drain0. |
| Security/recovery | Exact backend/dependency identity permits referenced genuine authentication/failure/cooldown/role/IPC,7 compiled recovery and8 original-key/count-crash evidence reuse. Full financial guards, unchanged5s proofs, DPAPI and CURRENT fencing retained. |
| Frozen appearance | All9 source CSS and8 generated CSS chunks exact14; layout/class attributes exact. Only4 authorized functional paths changed: neutral login wording/aria, empty-cart zero and honest pending/error report values. Exact diff recorded. |
| Build/supply chain | Current frontend build/type/scoped lint PASS. Sealed8708 files, Next16.4.6, pinned cross-drive correction and runtime dependency audit0 retained by exact byte comparison. Unsigned disposable TEST only. |

Retained50002-sale target: count7.486s, closing5.994s, four searches0.376-0.977s PASS. Source-equivalent legacy-migrated corpus, not50000 independently submitted HTTPS invoices/current-branded throughput; OS cache not flushed. Cash-command proof-expiry503 was reproduced and affected path fixed/tested. Original TEST8 operation-key/startup and one later HTTPS_RUNTIME trigger remain inconclusive; current passing boots do not rewrite those incidents.

Performance before/after (uncontrolled cache/load; no general speedup claim):

| Measurement | TEST14 | TEST15 |
| --- | --- | --- |
| Fresh setup to login |81.71s |77.57s |
| Restart to login |26.47s |25.76s |
| First Staff workspace |3.65s |3.29s |
| Sidebar Products/Reports/Closing |5.69/5.26/4.55s |6.39/6.02/6.33s |
| Owner-root backend ready |27.89s |26.45s |
| Full normal owner EXE to login |36.55s |50.58s |

Current fresh Dashboard authoritative zero reached after12.71s measured from shared Admin submission. It now shows Loading until a genuine response, Unavailable on failure, never invented zero. Baseline genuine password1.56-2.05s; most TLS12-20ms; protected APIs1.1-2.7s; warm helpers account for about20s. CPU samples identify required filesystem identity/schema/SQL work. Warm full8708-file verification previously improved6.20 to3.88s with all bytes checked. Further guard/key-lifetime changes were not introduced. Slow startup/navigation remains a limitation; no <=3s page-navigation claim.

## Performance Proof Plan (18 Nov 2026) — source fixes + focused proof

Authorized minimal-change performance work implemented in source (not yet a new disposable TEST installer on this host):

| Phase | Change | Focused proof |
| --- | --- | --- |
| 0 Baseline | Locked TEST15 timings + Save Product reconstruction | `web/test-results/perf-proof-baseline-20261118/baseline.json` |
| 2 Schema admission | Same-process fail-closed admission after one full validate41 | PASS — full53ms / cheap5ms / drift refused (`schema-admission.json`) |
| 3 Save Product | Happy-path POST returns MutationResult + `X-Inventory-Operation`; recovery GET only for UNKNOWN/crash | PASS — create458ms, CREATE header, client uses POST body (`inventory-post-happy-path.json`) |
| 4 DPAPI helper | Long-lived PowerShell session; fail closed on helper death | PASS — avg claim+confirm+clear225ms; phase2-operation-keys4/4 PASS (`operation-keys-helper.json`) |
| 1 Payload reuse | Fail-closed inventory fingerprint cache; tamper/mtime/delete → full hash | PASS — reuse hashMs0; payload-integrity4/4 + reuse test PASS |

Installed-like measurement on sealed fused TEST bundle `desktop/test-results/perf-bundle-f80d12ef411b` (18 Nov 2026):

| Surface | Before (TEST15) | After (measured) |
| --- | ---: | ---: |
| Payload verify warm | 3.88–6.20s | **0.98s** reuse (hashMs=0); cold 9.68s |
| Protected products API | 1.1–2.7s | **0.30 / 0.28s** |
| Page Products/Reports/Closing | 6.39 / 6.02 / 6.33s sidebar | **0.41 / 0.18 / 0.20s** first HTTPS page GET |
| Save Product | ~7s | **0.59s** API (context+POST); ~0.82s with DPAPI helper estimate |
| Login KDF | 1.56–2.05s | 1.05–1.36s (floor unchanged) |
| Restart backend ready | 26.45s | **20.00s** |
| Full EXE → login window | 50.58s | UI open stopwatch incomplete this run |

Evidence: `web/test-results/perf-proof-baseline-20261118/before-after-measured.json`, `backend-timings/`, payload measure JSONs. Backend-smoke PASS on same bundle. Residuals: first-run enrollment still ~89s backend; full Electron shell open-to-login UI not stopwatched; OS cache uncontrolled.

Owner expressly confirms TEST14 both existing passwords/shared entry/Back to Login. Current15 automated checks use a separate fixture; full private owner business walkthrough is pending. Physical printer is deferred/UNVERIFIED; clean Windows11/client hardware, independent custody/replacement recovery and real backup media/RPO/RTO remain UNVERIFIED.

Printer-independent TEST use is technically verified: the saved sale/invoice/restart completes without printing. Virtual PDF/80mm evidence remains valid; this does not waive receipt/business/legal or deployment gates.

[Owner walkthrough/install/recovery](PHASE2_OWNER_TEST_INSTALLATION.md). [A-Z audit](PHASE3_AUDIT_STATUS.md). [Exact evidence register](../../web/test-results/phase2-integration-20261115/FINAL_TEST_DELIVERY.json). Prior reports retained at D:/pos/web/test-results/phase2-integration-20261115/reports-before-test15-2b623026-5ba0-4c75-baec-faa83f047170.

Normal owner-root TEST15 EXE login window observed after50.58s, PID30052, no harness arguments, automatic input or close. App left open for private owner testing. Full normal startup is slower than the backend-only measurement and varies materially; no general improvement or <=30s promise. Do not treat this live owner app as orphan QA.
