# Reviewed SQLite migrations

B1b Part 1 originally registered no production migrations. B1b Part 3A now adds
reviewed authentication-only definitions; importing these modules creates no shop database.
The runner's only infrastructure table is `schema_migrations`.

Numbered SQL examples live only in `web/tests/fixtures/sqlite-b1b/migrations`.
They are disposable TEST tables, never opening shop data or demo fixtures.

`applyMigrations(connection, reviewedAbsoluteDirectory)` is an explicit maintenance
operation. Files must be contiguous `0001_name.sql`, `0002_name.sql`, etc. Checksums
cover exact UTF-8 bytes, including line endings. Applied files must never be edited,
renamed, removed or reordered. Unknown/newer history and inconsistent `user_version`
fail closed. A pending batch, history inserts and version marker commit together.

Part 1 deliberately permits one additive `CREATE TABLE` or `CREATE [UNIQUE] INDEX`
statement per file. Identifiers must be unquoted ASCII names beginning with a letter,
followed by letters/digits/underscores. Whitespace between keywords may include
newlines/tabs; leading and trailing SQL comments are supported. Quoted or
schema-qualified identifiers, comments between keywords, IF NOT EXISTS, temporary
or virtual tables, views, triggers, drop/alter/data-rewrite, transaction-control
and PRAGMA migrations remain unsupported and reject explicitly. Native prepare
rejects multiple statements. Expansion requires a separately reviewed schema task.

SQL text only classifies the supported statement and its intended object name.
Immediately after each table creation, the SAME atomic transaction queries
`pragma_table_list` for that exact name in `main` and requires type=table and
strict=1. A misleading STRICT comment cannot authorize a non-STRICT table, nor
can an unrelated existing STRICT table satisfy the check. Rejection rolls back
the entire pending batch, migration history and version marker together.
No automatic migration runs during application startup or login.

Before use with real records, the future supervisor must enforce maintenance and
single-authority admission, free-space checks, a verified recovery snapshot and
controlled recovery/promotion. This foundation does not implement that supervisor,
backup/key custody, authentication or any business schema. Final financial/cash
migrations remain gated by P02/P08 and separate owner authorization.

## B1b Part 3A authentication definitions

0001 through0005 define auth_users, auth_credentials, auth_principals,
auth_session_authorizations and the principal/revocation index. Each file uses
the unchanged additive grammar and actual STRICT metadata validation above.
No rows, default credentials or secrets are inserted; no SQL session/token table
is created. The two fixed IDs/roles are constrained, state defaults inactive,
and no access is granted until both identities are securely provisioned.

The private gateway reads/checks history on opening; it never applies migrations.
Real maintenance/provisioning remains separately gated. Password storage reserves
the pinned scrypt salt:key encoding; format validation is not secure provisioning
or approval of the pinned normalization/verifier behavior. See
[auth foundation](../../auth/README.md) and the
[report](../../../../../docs/development/AUTH_B1B_PART3A_FOUNDATION_REPORT.md).

## B1b Part3C completion latch

0006_auth_provisioning.sql adds only a STRICT singleton completion record with format/time
and RESTRICT FKs to BOTH principals. No row or credential is seeded. Apply explicitly via
the original runner in maintenance; setup/open/import never applies it. Existing five SQL
files/checksums are unchanged. Private setup inserts the row with both complete accounts in
ONE transaction and has no supported reset/delete path. Gateway authorization requires it.

The latch is not an external tamper-proof enrollment anchor. Do not clear it for password
recovery or restore. Consistent backups must retain the entire account/credential/principal/
latch/history set. Owner recovery, pre-bootstrap restore/device replacement and external
custody remain gates before real use; privileged file edits/whole-DB rollback are not
prevented by SQL metadata. See the [Part3C recovery report](../../../../../docs/development/AUTH_B1B_PART3C_PROVISIONING_REPORT.md).


## B1b Part3H persistent login-attempt state

0007_auth_login_attempts.sql is one additive STRICT table;0001-0006 are unchanged.
Three allowlisted buckets and fixed integer slots bound storage; no credential/session/
request metadata and no seed DML. The folder-local LF rule applies ONLY to0007.
Apply explicitly in maintenance, never by gateway/login/import.

Private pristine provisioning now requires the reviewed seven-file schema and inserts
all three zeroed security rows with BOTH accounts/principals/latch in the SAME transaction.
Failures roll back the entire set; no startup/login reset/recreation exists.
For any already-enrolled v6 data, applying this table alone leaves login protection
unavailable and fail-closed; a future explicit reviewed maintenance transition is needed.
Do not rerun provisioning, delete accounts or invent default counters to repair it.
No real account or operational database was upgraded here.

## B1b Part3S enrollment identity binding

0008_auth_enrollment_binding.sql adds one STRICT singleton tied by RESTRICT FK
to auth_provisioning. Installation/device/intent UUIDs and vault ciphertext digest
are non-bearer metadata; there are no seeds/secrets. 0001?0007 bytes are unchanged;
0008 alone also receives an explicit LF attribute before any non-TEST application.

The existing sole provisioner inserts this binding in the SAME official adapter
transaction as BOTH accounts/principals/counters/latch, using a genuine private
bootstrap ownership lease. Legacy unbound provisioning is isolated-TEST-only.
Custody/setup require the reviewed eight-file schema but never apply it on open.
Previously enrolled unbound data cannot be adopted automatically: explicit reviewed
maintenance/recovery is required, without clearing the latch or replacing accounts.
The protected external intent/outcome/anchor mechanism and narrow reconciliation
are described in [bootstrap contract](../../bootstrap/README.md). Production HTTP
authentication and real desktop owner enrollment remain disabled/unverified.
