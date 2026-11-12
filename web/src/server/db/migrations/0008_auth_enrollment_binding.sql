CREATE TABLE auth_enrollment_binding (
  id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
  format_version INTEGER NOT NULL CHECK(format_version = 1),
  provisioning_id INTEGER NOT NULL UNIQUE CHECK(provisioning_id = 1) REFERENCES auth_provisioning(id) ON DELETE RESTRICT,
  installation_id TEXT NOT NULL UNIQUE CHECK(length(installation_id) = 36 AND installation_id NOT GLOB '*[^0-9a-f-]*'),
  device_id TEXT NOT NULL CHECK(length(device_id) = 36 AND device_id NOT GLOB '*[^0-9a-f-]*'),
  intent_id TEXT NOT NULL UNIQUE CHECK(length(intent_id) = 36 AND intent_id NOT GLOB '*[^0-9a-f-]*'),
  vault_digest TEXT NOT NULL CHECK(length(vault_digest) = 64 AND vault_digest NOT GLOB '*[^0-9a-f]*')
) STRICT;
