CREATE TABLE auth_login_attempts (
  bucket TEXT PRIMARY KEY NOT NULL CHECK(bucket IN ('ADMIN','SALESPERSON','GLOBAL')),
  format_version INTEGER NOT NULL DEFAULT 1 CHECK(format_version = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  last_seen_ms INTEGER NOT NULL DEFAULT 0 CHECK(last_seen_ms >= 0),
  cooldown_until_ms INTEGER NOT NULL DEFAULT 0 CHECK(cooldown_until_ms >= 0),
  failed_1_ms INTEGER NOT NULL DEFAULT 0 CHECK(failed_1_ms >= 0),
  failed_2_ms INTEGER NOT NULL DEFAULT 0 CHECK(failed_2_ms >= 0),
  failed_3_ms INTEGER NOT NULL DEFAULT 0 CHECK(failed_3_ms >= 0),
  failed_4_ms INTEGER NOT NULL DEFAULT 0 CHECK(failed_4_ms >= 0),
  failed_5_ms INTEGER NOT NULL DEFAULT 0 CHECK(failed_5_ms >= 0),
  failed_6_ms INTEGER NOT NULL DEFAULT 0 CHECK(failed_6_ms >= 0),
  failed_7_ms INTEGER NOT NULL DEFAULT 0 CHECK(failed_7_ms >= 0),
  failed_8_ms INTEGER NOT NULL DEFAULT 0 CHECK(failed_8_ms >= 0),
  failed_9_ms INTEGER NOT NULL DEFAULT 0 CHECK(failed_9_ms >= 0),
  failed_10_ms INTEGER NOT NULL DEFAULT 0 CHECK(failed_10_ms >= 0),
  CHECK(bucket = 'GLOBAL' OR (failed_6_ms = 0 AND failed_7_ms = 0 AND failed_8_ms = 0 AND failed_9_ms = 0 AND failed_10_ms = 0))
) STRICT;
