# SQLite B1a experiment report

9 November 2026, Windows x64. **PASS for hardened isolated B1a only; ready for owner closure review.** better-sqlite3 is a suitable candidate for the next reviewed phase on this tested runtime. This does not certify production operation or authorize B1b.

## Scope and installation

Read root/web instructions, project memory, active plan/checklist and the existing [architecture](BACKEND_SQLITE_ARCHITECTURE_V1.md). Its 16 sections, implementation phases, P01-P12 decisions and final acceptance gates are present. Earlier PostgreSQL/Docker instructions are superseded for this bounded experiment by the owner's SQLite direction.

All databases contain generic TEST records under experiments/sqlite-b1a/test-results/run-*. No shop database, business schema, fixtures or main-app dependencies were used. Before installation, checked local Node/npm, package engines, registry integrity and the published Windows x64 prebuilt. Installed only in the experiment using scripts disabled; no native compilation or system-component installation. The [pinned upstream package](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/package.json) declares Node >=22 and bundles prebuilds.

| Actual environment | Observed value |
| --- | --- |
| Platform / native machine | win32 / x64; PE machine 0x8664; native database open passed |
| Node / npm | v24.11.0 / 11.6.1; matches web's Node 24/npm 11 targets |
| Node ABI / N-API | 137 / 10 |
| Dependencies | better-sqlite3 13.0.3; node-addon-api 8.9.2; isolated lockfile v3 |
| Loaded SQLite | 3.53.4 |
| SQLite source ID | 2026-07-24 19:02:57 bf7c7f30031888f4e796e429ab3978879485813aaca6f641c7b33e4e09459bcc |
| Windows prebuilt SHA-256 | e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a |
| Relevant compile options | THREADSAFE=2, MUTEX_W32, DEFAULT_FOREIGN_KEYS, DEFAULT_SYNCHRONOUS=2, DEFAULT_WAL_SYNCHRONOUS=1, ENABLE_STAT4, MAX_VARIABLE_NUMBER=32766; no OMIT_FOREIGN_KEY/OMIT_TRIGGER |
| Explicit connection settings | journal_mode=wal, synchronous=2 (FULL), foreign_keys=1, defaultSafeIntegers(true); bounded busy_timeout |

The actual runtime exceeds SQLite's documented fix threshold of 3.51.3; no backport assumption was needed. This is a version/provenance check, not an independent reproduction of the rare corruption race. See [SQLite's WAL-reset explanation](https://sqlite.org/wal.html#walreset). Full compile options are in local evidence.

## Original B1a results (historical)

Original console run of npm test in experiments/sqlite-b1a: **14 distinct checks passed, 0 failed, 0 skipped** in 2.95 seconds. Subsequently strengthened check 13 to verify the last-good copy before inducing failure; reran only native gate 01 and check 13: **2 passed, 0 failed**. These repeat checks do not increase the distinct count.

| Check | Observed result |
| --- | --- |
| 01 Native/runtime/features | Prebuilt loads; queried actual version/source/options; STRICT, RETURNING and JSON work. |
| 02 Connection configuration | Two independent connections both report WAL, FULL, FK ON and 125 ms requested busy timeout. FULL explicitly overrides the compiled WAL default. |
| 03 Constraints | FK, CHECK, UNIQUE and STRICT datatype violations rejected with expected codes; valid records unchanged. |
| 04 Atomic rollback | BEGIN IMMEDIATE plus parent/child writes and a later failure leaves neither record. |
| 05 Reopen | Successful multi-record commit survives closing/reopening, including 9007199254740993 exactly. |
| 06 Integer safety | Signed int64 minimum/maximum and adjacent values round-trip as BigInt. Out-of-range bindings and checked addition reject; Number/string inputs to the TEST int64 guard reject. STRICT overflow writes reject and SUM overflow throws. Raw-default limits are documented below. |
| 07 Parameters | Injection-looking text is stored literally; bound search does not alter SQL behavior. |
| 08 Lock contention | Writer B receives SQLITE_BUSY while A holds BEGIN IMMEDIATE; requested 125 ms, observed 201 ms (not a real-time deadline). WAL reader sees committed state; sequential updates finish at 2 without loss. |
| 09 Separate processes | Two concurrent same-key intents produce applied/replayed and one effect. Two distinct keys bring count to 3. Conflicting reuse rejects without another effect. |
| 10 Terminate before COMMIT | Child has 115392-byte WAL with uncommitted writes; observer sees zero and no committed acknowledgement. Forced kill/reopen recovers zero records; integrity/FK checks pass. |
| 11 Terminate after COMMIT | Child acknowledges only after COMMIT returns; forced kill with 144232-byte WAL recovers both exact 64 KiB payloads; integrity/FK checks pass. |
| 12 Snapshot/restore | Supported backup API captures live WAL source (49472-byte WAL, 6 pages). Candidate verified, then restored through the API into a second TEST DB. integrity_check=ok, no FK violations, exact parent/child values including int64 maximum. Later source write absent from restore. |
| 13 Backup failure | Cancellation after a transferred page and a missing-directory failure leave the verified last-good file's SHA-256 unchanged; exact records/integrity/FKs still valid. Cancelled candidate removed by driver. |
| 14 Isolation guards | Paths outside the TEST area and non-SQLite extensions reject. |

Evidence retained and Git-ignored:

- experiments/sqlite-b1a/test-results/run-24Sptl/evidence.json: full run, exact settings, hashes and outcomes.
- experiments/sqlite-b1a/test-results/run-PTrdiW/evidence.json: strengthened check 13 plus native gate.
- Disposable databases remain alongside evidence; no existing data was deleted/reset.

A preliminary inline native probe hit a PowerShell quoting SyntaxError before any database opened; the file-based native test passed. No installation/native compatibility blocker or safety-test failure occurred. No frontend suite/build was rerun; previous frontend results are historical.

## Targeted hardening after independent audit - 9 November 2026

**PASS with documented TEST-only limits; ready for owner closure review.** The independent audit reran the original 14 checks (run-xFOryX) and identified four Medium / three Low findings. This task changes only the four existing experiment sources/README plus this report and project memory.

| Audit finding | Resolution |
| --- | --- |
| Version gate (Medium) | WAL-fix minimum retained; withdrawn 3.52.0 rejects explicitly. Only reviewed 3.53.4 passes; higher/unreviewed versions require review. New check 15 covers malformed, older, withdrawn and unreviewed versions. [SQLite withdrawal](https://sqlite.org/releaselog/3_52_0.html). |
| Transaction callback (Medium) | Recognized async/generator functions reject before BEGIN/invocation. Check 16 proves no callback entry or writes after an event-loop turn; synchronous writes returning a thenable roll back. Hidden asynchronous side effects remain outside this helper's guarantees; never reuse unchanged in production. |
| Crash assertions (Medium) | Both crash cases now require code=null / signal=SIGKILL on the gated Windows x64 / Node 24 target; recovery checks remain. This does not prove physical power-loss durability. |
| TEST path boundary (Medium) | Startup rejects redirected experiment/root paths, lstat rejects main-file symlinks including dangling links; check 14 adds lexical traversal/prefix rejection. Trusted stable workspace remains mandatory: hard links, sidecars, raw API bypass and validation/open races are not comprehensively contained. No production security-boundary claim or filesystem configuration change. |
| Backup assertions (Low) | Check 13 asserts incomplete new-target cleanup, rejection/ineligibility for successful publication and inability to open the cancelled candidate as a valid readonly DB. Quiescent-source progress was 196 remaining pages then 195 before cancellation. Last-good checksum/integrity/exact records remain asserted. No monotonicity claim under concurrent writes. |
| Evidence counts (Low) | Records PASS/FAIL/SKIP/NOT_RUN/RUNNING, separate totals and harness hashes. Wrapper cancellation count is null; actual Node summary is authoritative. Check 18 covers status accounting. Full-run console and summary are captured separately and counts cross-checked. |
| Worker lifecycle (Low) | Small disconnect handler closes/rolls back and exits; 12-second lifetime timer replaces indefinite idle interval. Check 17 verifies disconnect exit and no persisted writes. Native blocking can delay timers; timer-expiry fault injection/process supervision are not certified. |

Actual verification: focused checks 01/10/11/13-18 **9 passed, 0 failed, 0 skipped/cancelled**; then **one complete npm test: 18 passed, 0 failed, 0 skipped/cancelled/todo** (2.66 seconds). Four checks were added to the original 14; repeated checks are not additional distinct tests. Syntax checks passed. Runtime/source ID/native hash/options match the original run; dependencies unchanged. No frontend suites/build.

Fresh ignored evidence under experiments/sqlite-b1a/test-results/:

- run-ApHL3U/evidence.json: focused 9 PASS, 9 NOT_RUN (name-filtered), no unfinished bodies. The one-off console-capture parser failed on Node's Unicode prefix after tests passed; original evidence was retained, and parsing was corrected for the full run.
- run-4S1g31/{evidence.json,runner-output.txt,runner-summary.json}: complete 18-check run. Wrapper counts match the captured Node summary; cancellation zero comes from the runner, while wrapper cancelled stays null.
- hardening-npm-cache-15957e261d584125a387abc0bb3a1952/: fresh npm metadata/logs only; no installation. Earlier runs/caches remain unchanged.

Exact edited files: experiments/sqlite-b1a/{helpers.cjs,worker.cjs,safety.test.cjs,README.md}, docs/development/SQLITE_B1A_EXPERIMENT_REPORT.md and docs/PROJECT_MEMORY.md. Of 419 protected pre-existing files outside those six, 418 remain byte-identical, including prior evidence/caches/native dependencies, app/fixtures and pending architecture/plan/checklist. One unexpected package.json final-line-ending change occurred during the task: the original CRLF terminator became two LF bytes; parsed configuration is identical. Reconstructing the prior terminator exactly matches its saved SHA-256 (7520732edef3f70cc129c8d9997a8b0242ed6dedd52e718ffe6558ac717875a5). No agent write targeted package.json; the current file was left untouched. Substituting its prior hash restores the full protected aggregate, confirming no other protected drift. Source hashes match the full-run evidence. Git master/approved HEAD unchanged, index empty, same three modified and ten untracked paths as task start; no staging/commit/push. B1b remains unauthorized.

## Limits and requirements for later work

- **Precision protection is a protocol requirement.** Turning safe integers off produced an unsafe Number for 9223372036854775807; unchecked SQLite MAX+1 became REAL. BigInt reads/bindings, rejection of Number input, range-checked arithmetic and STRICT INTEGER storage were tested. The driver alone does not prevent every unsafe conversion/expression. No production numeric adapter was implemented.
- **Duplicate protection is application logic.** The generic TEST key/fingerprint, uniqueness and transaction protocol prevented duplicates; SQLite does not automatically deduplicate arbitrary writes. The commit acknowledgement here is a child-process handshake, not a REST contract.
- Process-kill recovery does not prove physical power-loss durability, hardware flush behavior, disk-full handling or recovery on replacement hardware.
- The [driver backup API](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/docs/api.md#backupdestination-options---promise) was exercised with committed WAL data while the source stayed open. Concurrent mutation during backup, heavy-load scheduling and crash-during-publication were not tested. Always use a fresh candidate, verify it, then publish; do not overwrite the only good copy or copy only a live main database file.
- Small bounded tests establish behavior, not capacity/latency at shop scale. Keep synchronous transactions short; performance, schema/indexes, migrations, auth compatibility, Electron/native redistribution, encryption, retention and Supabase remain separately gated. A new runtime/native package needs compatibility verification.

## Files and Git preservation

Created exactly these eight experiment files under experiments/sqlite-b1a/:

- .gitignore
- .npmrc
- README.md
- helpers.cjs
- package.json
- package-lock.json
- safety.test.cjs
- worker.cjs

Also created docs/development/SQLITE_B1A_EXPERIMENT_REPORT.md (this report) and updated docs/PROJECT_MEMORY.md. Generated dependencies, local npm cache and TEST evidence/databases are ignored.

Branch master; HEAD unchanged at 1456ce4df2c6ff7d1c4d61833a019b0cbcee36a1; index empty. Working tree is **not clean**: the prior tracked edits to docs/IMPLEMENTATION_PLAN.md and docs/MODULE_CHECKLIST.md remain, docs/PROJECT_MEMORY.md remains modified with this handoff, the existing docs/development/BACKEND_SQLITE_ARCHITECTURE_V1.md remains untracked, and this report/eight experiment files are new untracked files.

Original B1a preservation check: all 264 protected files (all tracked files except memory, plus the prior untracked architecture) matched their start-of-task byte hashes, including prior plan/checklist edits, frontend, fixtures, dependency files and original requirements/design documents. Aggregate SHA-256: 4362edc4a4c1acb32cc1e3428ce343ee182b9d3f028e6ee5e02f36afa5c07f3d. Whitespace, local links and ignore coverage checked; no credentials introduced. No staging, commit, push, Windows configuration or application feature change.

**Stop at B1a.** Owner review and separate approval are required before B1b or any production schema, service, API, authentication, cloud or EXE work.
