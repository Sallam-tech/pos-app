CREATE TABLE auth_provisioning (
  id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
  format_version INTEGER NOT NULL CHECK(format_version = 1),
  admin_id TEXT NOT NULL UNIQUE CHECK(admin_id = 'ADMIN') REFERENCES auth_principals(id) ON DELETE RESTRICT,
  salesperson_id TEXT NOT NULL UNIQUE CHECK(salesperson_id = 'SALESPERSON') REFERENCES auth_principals(id) ON DELETE RESTRICT,
  completed_at_ms INTEGER NOT NULL CHECK(completed_at_ms > 0)
) STRICT;
