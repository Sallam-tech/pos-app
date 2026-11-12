CREATE TABLE inventory_cancellations (
 request_key TEXT PRIMARY KEY NOT NULL CHECK(
  length(request_key)=36 AND length(replace(request_key,'-',''))=32 AND
  request_key NOT GLOB '*[^0-9a-f-]*' AND
  substr(request_key,9,1)='-' AND substr(request_key,14,1)='-' AND
  substr(request_key,19,1)='-' AND substr(request_key,24,1)='-' AND
  substr(request_key,15,1)='4' AND substr(request_key,20,1) IN ('8','9','a','b')),
 context_fingerprint TEXT NOT NULL CHECK(length(context_fingerprint)=64 AND context_fingerprint NOT GLOB '*[^0-9a-f]*'),
 kind TEXT NOT NULL CHECK(kind IN ('CREATE','EDIT','SELLING_PRICE','STATUS','ARCHIVE','REPRICE','RECEIVE','ADJUST')),
 actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id) ON DELETE RESTRICT,
 actor_session_ref TEXT NOT NULL CHECK(length(actor_session_ref) BETWEEN 1 AND 128),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;
