# B1a: isolated SQLite safety experiment

TEST-only Windows x64 / Node 24 experiment. No application code, business schema,
fixtures, credentials, cloud connection or production database belongs here.

From this directory, use the project's Node/npm versions:

```powershell
npm ci --ignore-scripts --no-audit --no-fund --cache .npm-cache
npm test
```

The pinned package contains its Windows x64 native binary. Install scripts are
disabled; stop on an unsupported/missing prebuilt instead of installing build tools.

Each run creates a new ignored test-results/run-* directory with disposable
SQLite/WAL/SHM files and evidence.json. Nothing is reset or reused from a prior run.
Database paths are constrained to this TEST area. Child processes run hidden and
are bounded; two cases deliberately terminate them while connections remain open.

Integer and candidate-backup guards demonstrate required protocols, not production
services. Raw Number reads and unchecked SQLite arithmetic have known precision
risks; the tests expose these explicitly. Process termination does not certify
power-loss durability. See the [B1a report](../../docs/development/SQLITE_B1A_EXPERIMENT_REPORT.md)
for actual results, limitations and the next approval boundary.

## Hardening boundaries

Only reviewed SQLite 3.53.4 is accepted. The WAL-fix minimum remains 3.51.3,
withdrawn 3.52.0 is explicitly rejected, and higher/unreviewed versions fail closed
until a separate compatibility review. A higher number is not proof of safety.

transaction() rejects recognized async/generator functions before BEGIN. Its later
thenable check can roll back synchronous effects but cannot prevent deferred work
hidden inside ordinary/bound/proxied/transpiled functions, timers or getters.
Use only inspected synchronous TEST callbacks. Never copy this helper unchanged
into production.

This harness assumes a trusted, stable local workspace with no hostile concurrent
filesystem mutation. Startup rejects redirected experiment/root paths; main-file
symlinks (including dangling links) reject. Lexical traversal/prefix escapes and
resolved parent paths are checked. Hard links, sidecars, validation/open races and
direct driver/filesystem access are not comprehensively contained. testPath() is
not a production security boundary. No ACL/junction/registry configuration changes
are made or needed.

Crash termination assertions target the observed Windows x64 / Node 24 result.
Graceful IPC-disconnect cleanup is a separate test, not a crash or power-cut test.
A 12-second worker timer and disconnect handler provide a small orphan safeguard;
blocked synchronous native I/O can delay timers. This is not process supervision.

Test 13 deliberately keeps its source quiescent while checking transferred-page
progress. It asserts rejection, ineligibility for successful publication, removal
of a NEW candidate on clean cancellation in pinned driver 13.0.3, and preservation
of the last good copy. Abrupt process/OS termination or filesystem removal failures
are not covered; no monotonic progress claim applies to concurrent source changes.

Evidence lists PASS, FAIL, SKIP, NOT_RUN and RUNNING states. Filtered bodies remain
NOT_RUN. Wrapper cancelled is null, not a fabricated zero: Node's runner summary
is authoritative for cancellations/timeouts and should be retained separately
with console output. Counters can be checked against that summary; selected body
counts exclude NOT_RUN. Each new run records hashes of the three harness sources.
