# Owner-approved Settings, Login, Daily Closing and Backup contract

Status: UI/demo preparation only. No production authentication, database, closing or backup service is implemented.

## Display settings and receipts

Public shop name, address, phone, receipt footer and supported print layout may persist under the versioned browser-local display-settings key. Currency remains PKR. Only these allow-listed values may be saved; never credentials, recovery codes, transactions, costs or expense records. Validate lengths/formats, render plain escaped text, handle unavailable/corrupt browser storage and identify the device-local limitation. Production settings require authenticated Admin updates, database persistence and auditing.

Supported existing layouts: ordinary page and compact 80 mm browser print layout. Actual printer compatibility remains untested. New invoice/sample previews use current shop details; recorded historical receipts and sale snapshots remain unchanged. Settings previews issue no invoice number or financial record.

## Login and password security

The latest owner-approved presentation is password-only, with no username or role selector. This supersedes the proposed username/email Login presentation in the development/UI guides for this demo; the original SRS is unchanged and still requires separate Admin and Salesperson accounts. Future implementation must reconcile this owner direction with Better Auth before choosing the secure identity lookup.

The secure local service must verify credentials, determine a single unambiguous role and enforce authorization on every server page/action/API. Admin and Salesperson credentials must be distinct; do not introduce a shared master password, client-side password comparison or ambiguous role access. Keep the existing explicitly unprotected demo links until real authentication is implemented, then remove or securely gate them.

Password management is a non-operational interface. Its illustrative 8-128-character format allows letters, numbers and symbols without composition requirements; the final server policy must be reviewed with authentication implementation. Longer passwords remain recommended. Login opens with an empty password field, clears preview text on page restoration and never automatically chooses a role or signs in. Form and input autocomplete attributes discourage autofill, but browser-controlled autofill and save-password prompts cannot be reliably disabled. No password is sent, logged, persisted or claimed changed. Admin staff resets require re-authentication. Offline Admin recovery requires approved single-use recovery codes or another verified procedure, never a public reset or hidden emergency password. Hashing, local rate limiting, sessions, secure recovery and credential uniqueness require the future secure service.

## Daily Closing

Admin-only in production; the current prototype has no access enforcement. Use Asia/Karachi civil business dates consistently with reporting. The fixed example day, 2 November 2026, is not the current day.

A real closing reviews genuine saved sales, original sale-time costs, expenses and supported returns/refunds. Gross Profit remains revenue minus COGS. Do not infer Profit After Expenses while expense/refund information is incomplete, or invent how refunds affect profit; finalize return accounting with backend requirements.

Require explicit authenticated Admin confirmation. Save an immutable closing snapshot atomically with an idempotency key and a unique shop/business-date constraint; an unconfirmed response must be checked with the original key. Later corrections append audited adjustments rather than rewriting the snapshot. Permit subsequent business-day transactions without erasing earlier records.

Closing never deletes sales, receipts or expenses, resets inventory, investment or stock value, recalculates historical sale costs, or shuts down the computer. The current confirmation remains disabled until the durable transaction exists.

## Automatic offline backups — required backend work

- Run scheduled daily database-consistent backups while the local shop server is running, plus a backup after successful durable Daily Closing. A powered-off server cannot run scheduled jobs; show missed/overdue status and catch up on restart.
- Record a reliable post-closing backup job/outbox after the closing commits. Backup failure must be visible and retryable; never report a successful backup before verification.
- Allow an authorized Admin to configure a writable destination, preferably an external drive or separate storage. Report disconnected media, permissions, low space and failed copies. Core operation must not require public internet.
- Protect transactions, stock/movement ledgers, expenses, settings, auth/recovery data and required system metadata. Use appropriate encryption, protected keys and restricted access; never store secrets in this repository or browser preferences.
- Write to a temporary destination, verify completeness/checksum and database consistency, then publish atomically. Failed or partial backups must never replace a usable backup.
- Initial retention proposal: 7 daily and 4 weekly verified copies, adjustable after storage review. Rotate only verified copies and never silently delete the last usable backup.
- Persist last successful backup time, destination, result, failure and recovery status. The UI must distinguish pending, running, failed, overdue and verified success.
- Restore requires authenticated authorization, explicit confirmation, preservation of current data and a tested isolated restore/reconciliation procedure before any production replacement. Verify transactions, financial snapshots, stock, settings and login after restore.

No Windows service, scheduled task, PostgreSQL installation, backup archive or restore operation is created by this UI task.
