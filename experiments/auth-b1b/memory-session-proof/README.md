# TEST ONLY: memory-only Better Auth sessions

This disposable B1b Part 2C proof is not application authentication and must not be copied into production.

From D:\pos, with the existing parent experiment dependencies and the recorded local preservation baseline:

```powershell
node experiments/auth-b1b/memory-session-proof/run.mjs
```

No installation is required or authorized. The runner creates fresh TEST databases and separate evidence under this directory's ignored test-results/. It preserves prior runs. It requires exactly one baseline-*.json recorded for this review; it deliberately fails if that preservation baseline is unavailable.

host.mjs owns a private real Better Auth instance. The only request facade permits GET /api/auth/get-session, GET /proof/protected and POST /api/auth/sign-out. It reads committed SQLite authorization state for every allowed request, forces secondary-storage lookup rather than cookie-cache trust, and selects safe JSON fields. Do not mount its private auth.handler or export auth.api as an alternate path.

The privileged test control plane, including official testUtils session issuance, is available only to this experiment. There is no password verification, working login, network listener, role implementation or application integration.

See [REPORT.md](REPORT.md) for results, limits and the evidence manifest. STOP for owner review.
