# Phase 2 desktop architecture: concrete review proposal

15 November 2026, Asia/Karachi. Starting checkpoint: `28350e2`.
Status: PROPOSED; new desktop security/install decisions await owner approval.
The new coordinated Phase 2 attachment authorizes integration, packaging and development verification. Production stays DISABLED; the independent final audit is reserved for a separate instruction. The earlier Phase 1-only stop is superseded.

## Proposed bounded TEST implementation

1. Preserve the existing Next custom HTTPS host and SQLite/native authorization owner. Do not replace it with `next start`, standalone output or an unrestricted framework proxy. Installed Next documentation says standalone output does not trace custom servers.
2. Use an isolated, pinned Electron x64 shell and a separate bundled, verified patched Node 24 runtime. Existing native SQLite runs under that Node ABI, rather than Electron. Candidate Electron 45.3.3 is listed with Node 24.22.3 by the official index; actual download/advisory/license checks remain required.
3. Sandbox renderers, enable context isolation/web security, disable Node integration and general filesystem/SQL/shell IPC. Allow only the exact two existing role HTTPS origins. Deny external navigation, new windows, downloads, permissions, remote content and distributed developer tools. Any printing bridge must be narrow, sender-validated and unable to change accounting.
4. Use fresh in-memory role partitions. Each role still requires its genuine password/session. Clear browser state at shutdown. Keep single-instance shell plus existing backend ownership, readiness-before-window, drained shutdown and fail-closed child-death behavior.
5. Pin provisioned TLS only within this application's exact loopback sessions after native protected identity validation. Preserve hostname, certificate validity and role isolation checks. No global certificate-ignore flag, Windows root-store change or distributed reusable private key.
6. Deliver a per-user offline installer and versioned application directory. Databases, DPAPI vaults, configuration and backups remain outside replaceable files under private ACL/identity rules. Uninstall retains business/recovery data; no silent deletion.
7. Stage upgrades into a new version directory. Verify artifact/runtime/schema compatibility and genuine protected backup before risky changes. Retain previous versions; no automatic migration, reset, uncertain-operation replay or rollback into an incompatible schema. Failed updates preserve the previous compatible app under existing admission rules.
8. Initial artifacts are explicitly unsigned DEVELOPMENT/TEST builds. Do not disable Defender/SmartScreen or install trust/driver changes. Production signing identity/certificate procurement remains a later owner release decision.
9. Download/review dependencies only in the project workspace, with exact versions, integrity, scripts and commercial notices reviewed. No global install, WSL, Docker, VM, security-policy or printer-driver changes. Check RAM/disk and run heavy builds sequentially.

## Excluded authority

No real-shop enrollment, credential reset, production activation, real custody ceremony, remote/LAN expansion, cloud connection, destructive changes, visual redesign, signing-certificate purchase or client deployment. Windows 11, replacement-PC/profile, physical printer and power/storage acceptance stay BLOCKED/NOT VERIFIED until suitable evidence exists.

## Independent work while review is pending

Verify existing authenticated UI/API/SQLite paths and frozen baseline; repair concrete integration defects; profile retained disposable 1k/10k/50k copies; verify ordinary/80mm saved-receipt output and failure/retry; run focused checks. Reuse completed Phase 1 evidence. Preserve all unrelated work.

Official references checked:

- [Electron release index](https://releases.electronjs.org/)
- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron session isolation and certificate verification](https://www.electronjs.org/docs/latest/api/session)
- Installed Next: `web/node_modules/next/dist/docs/01-app/02-guides/custom-server.md`.

Approval basis: repository `AGENTS.md` asks before major architecture changes; the permanent owner contract requires review of desktop security, signing, retention and updates. This is one grouped decision for items 1-9, not a request to reapprove Phase 1 or routine integration work.
## Owner approval received

15 November 2026: owner explicitly APPROVED desktop items 1-9 for disposable TEST implementation only, including Windows 10/11 x64 compatibility, isolated Electron windows, patched Node, protected HTTPS/role/data boundaries, safe uninstall/reinstall and frozen frontend preservation. Unsigned TEST builds only; no Windows security bypass or production activation. Separate approval remains required for material scope changes, real signing/custody or irreversible operations. Continue all Phase 2 work; independent Phase 3 remains separate.