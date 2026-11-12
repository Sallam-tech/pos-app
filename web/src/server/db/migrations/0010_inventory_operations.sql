CREATE TABLE inventory_operations (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 request_key TEXT NOT NULL UNIQUE CHECK(length(request_key)=36),
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK(kind IN ('CREATE','EDIT','SELLING_PRICE','STATUS','ARCHIVE','REPRICE','RECEIVE','ADJUST')),
 actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id) ON DELETE RESTRICT,
 actor_session_ref TEXT NOT NULL CHECK(length(actor_session_ref) BETWEEN 1 AND 128),
 payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64 AND payload_hash NOT GLOB '*[^0-9a-f]*'),
 payload_json TEXT NOT NULL CHECK(length(payload_json)<=16000 AND json_valid(payload_json)),
 result_json TEXT NOT NULL CHECK(length(result_json)<=16000 AND json_valid(result_json)),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 160),
 reference TEXT CHECK(reference IS NULL OR length(reference) BETWEEN 1 AND 120),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 UNIQUE(id,product_id)
) STRICT;
