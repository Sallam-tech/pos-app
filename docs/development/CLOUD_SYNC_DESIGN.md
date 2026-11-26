# Cloud sync design: remote viewing (Module 1) and cloud backup (Module 2)

Date: 26 November 2026, Asia/Karachi.
Status: Part 1 (cloud tables and security functions) written, **not yet run against any Supabase project**. Parts 2 and 3 are not started.

This implements architecture sections 9 and 11 of [BACKEND_SQLITE_ARCHITECTURE_V1.md](BACKEND_SQLITE_ARCHITECTURE_V1.md) (P10 hybrid and P11 backup). It changes one thing in that design, recorded below. Nothing else in the confirmed decisions moves.

## 1. The one design change: a read-only observer instead of an outbox

The architecture says every business transaction writes a `sync_outbox` row. The owner chose (26 Nov 2026) a **read-only sync observer** instead:

- A background worker opens its own read-only connection to the shop database, as the backup worker already does.
- It finds what changed, builds the owner records and publishes them.
- Schema stays **41**. No sale, return, stock, expense, correction or closing code changes.

Why this is safe in schema 41 (verified in `web/src/server/db/migrations`):

- Every business ledger table has `BEFORE UPDATE` and `BEFORE DELETE` guards, so rows are append-only and `rowid` grows in commit order. "Everything with a rowid above the last one sent" is therefore complete.
- Only `products` and `stock_balances` change in place, and both carry a `version`.

What it costs: updates reach the cloud within about 30 seconds instead of at commit, and a missed change shows up at the next daily digest check instead of never being created. The deferred offline edit queue and live tunnel (architecture section 11) are unchanged and still need separate approval.

## 2. What the owner can and cannot see

- The owner sees a read-only copy as of the shop's last successful publish, with that time always shown.
- If the shop laptop has no internet, the owner sees the last copy. Nothing is invented.
- Customer name and phone are **never** published. Passwords, session data, recovery keys, backup files and Windows paths never leave the laptop.
- A Salesperson has no access to any cloud feature.

## 3. Cloud database (migrations `supabase/migrations/20261126000001/2`)

All tables are in the private schema `pos`. It is not exposed by the Supabase API, row level security is on, and there is no policy, so no API role can touch a row directly.

| Table | Purpose |
| --- | --- |
| `shops` | The single shop (a unique index on a constant allows only one). Holds `visible_generation` and the generation counter. |
| `memberships` | The owner sign-in and the one active shop computer (`DEVICE`, bound to a generation). One active membership per user. |
| `device_enrollments` | 15-minute single-use connect codes. Only the SHA-256 is stored. |
| `sync_state` | Per generation: last contiguous batch number, complete flag, shop's "as of" time, last received time. |
| `batches` | One row per applied batch with its payload hash: replay and gap proof. |
| `entities` | Owner records (`product`, `invoice`, `day`, `month`, `expense`, `closing`, `shop`) as JSON with exact paisa strings. Tombstones for removals. |

### Callable functions (all `SECURITY DEFINER`, empty `search_path`, checked inside)

| Function | Who | What it does |
| --- | --- | --- |
| `pos_bootstrap_owner(name)` | owner, MFA | Creates the one shop and the owner membership. Harmless to repeat. |
| `pos_create_device_enrollment()` | owner, MFA | Returns a new 20-hex-character code (80 random bits), valid 15 minutes. Cancels any earlier unused code. |
| `pos_claim_device_enrollment(code,label)` | shop computer (anonymous user) | Redeems the code once, retires any previous shop computer, assigns a new generation. |
| `pos_device_status()` | shop computer | Its generation, last published batch number, complete flag. |
| `pos_publish_batch(generation,seq,hash,final,payload)` | shop computer | Applies one batch atomically (section 4). |
| `pos_restart_generation()` | shop computer | Starts a hidden new generation for a rebuild. |
| `pos_purge_old_generations(limit)` | shop computer | Deletes superseded generations in small chunks. |
| `pos_owner_status()` | owner, MFA | Shop name, freshness, rebuild flag, connected computer, storage bytes. |
| `pos_owner_list(type,from,to,query,after_date,after_id,limit)` | owner, MFA | Keyset-paged list (max 100). Products and the shop record by id; everything else newest first. |
| `pos_owner_get(type,id)` | owner, MFA | One record. |
| `pos_owner_devices()`, `pos_revoke_device(id)` | owner, MFA | List and revoke shop computers. A revoked computer is refused on its next call. |

Access rules:

- **Owner** = signed in, not anonymous, active `OWNER` membership, and a two-step (`aal2`) session.
- **Shop computer** = anonymous Supabase user with an active `DEVICE` membership. It can call only the publish functions.
- EXECUTE is revoked from `public` and `anon`. Helper functions in `pos` are not callable through the API.
- No service-role key is used or shipped anywhere.

Errors map to PostgREST statuses: `PT400` bad input, `PT403` not allowed, `PT409` conflict or out of order.

## 4. The stream rules (why the owner never sees half a change)

1. A **generation** is one continuous stream from one shop computer. Batches are numbered 1, 2, 3 and must arrive in order.
2. Each batch is one transaction: all its records, the batch row and the new position, or nothing. The payload is sent as text and the function recomputes its SHA-256, so any corruption is rejected.
3. A resend of the same number with the same hash returns the same answer and changes nothing. A different hash for a used number, or a gap, is rejected with 409.
4. The shop publishes small incremental changes straight into the visible generation (up to 500 records or 1 MB per batch).
5. A change set bigger than one batch, a lost local sync memory, or a restored laptop starts a **new generation**. It builds hidden, and the owner keeps seeing the previous complete generation until the final batch flips `visible_generation` in one step. Old generations are then purged in chunks.
6. Because a batch is built from one read snapshot and contains whole bundles (an invoice with its lines, plus the affected day, month and shop totals), no screen can show a sale without its totals.

## 5. Record types (version 1; finalized with the Part 2 tests)

Money is always an exact paisa string, matching the local reports (`readFinancialSource`, inventory and invoice models). Search text is lower-case and contains no customer details.

| Type | Id | Date | Main fields |
| --- | --- | --- | --- |
| `product` | product id | none | name, code, size label, status, normal selling price, buying cost, stock quantity, threshold, stock status, stock value |
| `invoice` | invoice id | business date | invoice number, time, lines (name, code, quantity, unit price, discount, paid, cost snapshot), totals, payment, returns, refunds, corrections |
| `day` | `YYYY-MM-DD` | that day | revenue, refunds, COGS, gross profit, expenses, net profit, invoice count, per-product totals |
| `month` | `YYYY-MM` | first of month | the same fields for the month |
| `expense` | expense id | business date | reference, reason, status, revision, amount |
| `closing` | closing id | business date | immutable totals, adjustments |
| `shop` | `shop` | none | public settings, inventory overall, stock value, shop "as of" time |

## 6. Verification plan for Part 1

No Postgres, Supabase CLI or Docker exists on the build laptop, so the SQL cannot be executed locally. Verification is `web/tests/integration/cloud-staging.test.ts` against a separate staging project (skipped when `web/.env.cloud-staging` is absent). It covers:

- anonymous and unauthenticated calls refused; owner without MFA refused; shop computer refused owner functions and owner refused device functions;
- a connect code works once, only before it expires, and the wrong code gives the same message as an expired one;
- publish in order; resend is harmless; changed hash and gap are 409; damaged payload is 400; oversized batch is 400;
- a revoked computer is refused immediately; a newer computer retires the older one;
- hidden generation becomes visible only on its final batch; purge removes only superseded generations;
- paging returns every record once, with no duplicates or gaps.

The owner applies the migrations with `supabase db push` (so the database password never reaches an agent) or by pasting the two files into the Supabase SQL editor.

## 7. Owner prerequisites (once per project, staging first)

1. Reset the database password that was pasted into chat.
2. Create a free **staging** project. Production stays untouched until rollout.
3. In both: Authentication, turn email sign-ups **off**, anonymous sign-ins **on**, TOTP MFA **on**; then create the owner user in the dashboard.
4. Staging test credentials go in the git-ignored `web/.env.cloud-staging`: `CLOUD_STAGING_URL`, `CLOUD_STAGING_PUBLISHABLE_KEY`, `CLOUD_STAGING_OWNER_EMAIL`, `CLOUD_STAGING_OWNER_PASSWORD`. The first test run enrolls an MFA factor and saves its secret there as `CLOUD_STAGING_OWNER_TOTP_SECRET`. Never a service-role key.

## 8. Related finding: `public.rls_auto_enable()`

The earlier Supabase audit flagged `public.rls_auto_enable()` as an exposed `SECURITY DEFINER` function. It is not created by this repository. After finding who made it, the recommended fix is `REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;`. This needs the owner's approval and is not part of the migrations.

## 9. Limits and open items

- Supabase Free has 500 MB of database, 1 GB of storage, and pauses a project after a week without activity. The shop's sync keeps it active while the shop runs. Part 2 measures the projected history size on the 50,000-sale TEST data before any promise is made.
- Part 1 has not been executed. Treat every statement above about runtime behaviour as unverified until the staging test passes.
