CREATE TABLE auth_session_authorizations (
  session_id TEXT PRIMARY KEY NOT NULL CHECK(length(session_id) BETWEEN 1 AND 128),
  principal_id TEXT NOT NULL REFERENCES auth_principals(id) ON DELETE RESTRICT,
  credential_version INTEGER NOT NULL CHECK(credential_version > 0),
  auth_epoch INTEGER NOT NULL CHECK(auth_epoch > 0),
  boot_generation TEXT NOT NULL CHECK(length(boot_generation) = 36),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms > 0),
  expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms > created_at_ms),
  revoked_at_ms INTEGER CHECK(revoked_at_ms IS NULL OR revoked_at_ms >= created_at_ms)
) STRICT;
