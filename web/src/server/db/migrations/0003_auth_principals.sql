CREATE TABLE auth_principals (
  id TEXT PRIMARY KEY NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  credential_version INTEGER NOT NULL CHECK(credential_version > 0),
  auth_epoch INTEGER NOT NULL CHECK(auth_epoch > 0),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  provisioned_at_ms INTEGER CHECK(provisioned_at_ms IS NULL OR provisioned_at_ms > 0),
  CHECK(active = 0 OR provisioned_at_ms IS NOT NULL),
  CHECK(id != 'ADMIN' OR provisioned_at_ms IS NULL OR active = 1)
) STRICT;
