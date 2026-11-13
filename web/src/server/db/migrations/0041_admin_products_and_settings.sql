-- SETTINGS41 STEP
CREATE TABLE shop_settings_operations (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, request_key TEXT NOT NULL UNIQUE CHECK(request_key=id), context TEXT NOT NULL CHECK(length(context)=64 AND context NOT GLOB '*[^0-9a-f]*'), expected_revision INTEGER NOT NULL CHECK(expected_revision>=0), result_revision INTEGER NOT NULL UNIQUE CHECK(result_revision=expected_revision+1), payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND length(CAST(payload_json AS BLOB))<=8192), payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64 AND payload_hash NOT GLOB '*[^0-9a-f]*'), result_json TEXT NOT NULL CHECK(json_valid(result_json) AND length(CAST(result_json AS BLOB))<=8192), result_hash TEXT NOT NULL CHECK(length(result_hash)=64 AND result_hash NOT GLOB '*[^0-9a-f]*'), actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL CHECK(length(session_ref)>0), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- SETTINGS41 STEP
CREATE TABLE shop_settings_revisions (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, revision INTEGER NOT NULL UNIQUE CHECK(revision>0), previous_id TEXT UNIQUE REFERENCES shop_settings_revisions(id), operation_id TEXT NOT NULL UNIQUE REFERENCES shop_settings_operations(id), shop_name TEXT NOT NULL CHECK(length(shop_name) BETWEEN 1 AND 80), address TEXT NOT NULL CHECK(length(address)<=240), phone TEXT NOT NULL CHECK(length(phone)<=32), footer TEXT NOT NULL CHECK(length(footer)<=160), receipt_layout TEXT NOT NULL CHECK(receipt_layout IN ('ordinary','compact')), currency TEXT NOT NULL CHECK(currency='PKR'), timezone TEXT NOT NULL CHECK(timezone='Asia/Karachi'), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 160), actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL CHECK(length(session_ref)>0), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0), CHECK((revision=1 AND previous_id IS NULL) OR (revision>1 AND previous_id IS NOT NULL))
) STRICT;

-- SETTINGS41 STEP
CREATE TABLE shop_settings_cancellations (
request_key TEXT NOT NULL CHECK(length(request_key)=36) PRIMARY KEY, context TEXT NOT NULL CHECK(length(context)=64 AND context NOT GLOB '*[^0-9a-f]*'), action TEXT NOT NULL CHECK(action IN ('SETTINGS','PASSWORD_ADMIN','PASSWORD_SALESPERSON')), evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 1 AND 160), actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL CHECK(length(session_ref)>0), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- SETTINGS41 STEP
CREATE TABLE invoice_shop_snapshots (
invoice_id TEXT NOT NULL PRIMARY KEY REFERENCES sales(id), settings_id TEXT NOT NULL REFERENCES shop_settings_revisions(id), branding_json TEXT NOT NULL CHECK(json_valid(branding_json) AND length(CAST(branding_json AS BLOB))<=8192), branding_hash TEXT NOT NULL CHECK(length(branding_hash)=64 AND branding_hash NOT GLOB '*[^0-9a-f]*'), format_version INTEGER NOT NULL CHECK(format_version=1), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- SETTINGS41 STEP
CREATE TABLE shop_password_operations (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, request_key TEXT NOT NULL UNIQUE CHECK(request_key=id), context TEXT NOT NULL CHECK(length(context)=64 AND context NOT GLOB '*[^0-9a-f]*'), target TEXT NOT NULL CHECK(target IN ('ADMIN','SALESPERSON')) REFERENCES auth_principals(id), before_version INTEGER NOT NULL CHECK(before_version>0), after_version INTEGER NOT NULL CHECK(after_version=before_version+1), before_epoch INTEGER NOT NULL CHECK(before_epoch>0), after_epoch INTEGER NOT NULL CHECK(after_epoch=before_epoch+1), actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL CHECK(length(session_ref)>0), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- SETTINGS41 STEP
CREATE INDEX shop_settings_history ON shop_settings_revisions(revision,id);

-- SETTINGS41 STEP
CREATE INDEX shop_password_history ON shop_password_operations(recorded_at_ms,id);

-- SETTINGS41 STEP
CREATE TRIGGER shop_settings_operations_insert_guard BEFORE INSERT ON shop_settings_operations WHEN EXISTS(SELECT 1 FROM shop_settings_operations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM shop_settings_operations WHERE result_revision=NEW.result_revision) OR EXISTS(SELECT 1 FROM shop_settings_operations WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM shop_settings_operations WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Settings history conflict.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_settings_operations_no_update BEFORE UPDATE ON shop_settings_operations BEGIN SELECT RAISE(ABORT,'Settings history immutable.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_settings_operations_no_delete BEFORE DELETE ON shop_settings_operations BEGIN SELECT RAISE(ABORT,'Settings history immutable.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_settings_operations_positive_rowid AFTER INSERT ON shop_settings_operations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Settings history identity.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_settings_revisions_insert_guard BEFORE INSERT ON shop_settings_revisions WHEN EXISTS(SELECT 1 FROM shop_settings_revisions WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM shop_settings_revisions WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM shop_settings_revisions WHERE previous_id=NEW.previous_id) OR EXISTS(SELECT 1 FROM shop_settings_revisions WHERE revision=NEW.revision) OR EXISTS(SELECT 1 FROM shop_settings_revisions WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Settings history conflict.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_settings_revisions_no_update BEFORE UPDATE ON shop_settings_revisions BEGIN SELECT RAISE(ABORT,'Settings history immutable.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_settings_revisions_no_delete BEFORE DELETE ON shop_settings_revisions BEGIN SELECT RAISE(ABORT,'Settings history immutable.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_settings_revisions_positive_rowid AFTER INSERT ON shop_settings_revisions WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Settings history identity.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_settings_cancellations_insert_guard BEFORE INSERT ON shop_settings_cancellations WHEN EXISTS(SELECT 1 FROM shop_settings_cancellations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM shop_settings_cancellations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Settings history conflict.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_settings_cancellations_no_update BEFORE UPDATE ON shop_settings_cancellations BEGIN SELECT RAISE(ABORT,'Settings history immutable.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_settings_cancellations_no_delete BEFORE DELETE ON shop_settings_cancellations BEGIN SELECT RAISE(ABORT,'Settings history immutable.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_settings_cancellations_positive_rowid AFTER INSERT ON shop_settings_cancellations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Settings history identity.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER invoice_shop_snapshots_insert_guard BEFORE INSERT ON invoice_shop_snapshots WHEN EXISTS(SELECT 1 FROM invoice_shop_snapshots WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM invoice_shop_snapshots WHERE invoice_id=NEW.invoice_id) BEGIN SELECT RAISE(ABORT,'Settings history conflict.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER invoice_shop_snapshots_no_update BEFORE UPDATE ON invoice_shop_snapshots BEGIN SELECT RAISE(ABORT,'Settings history immutable.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER invoice_shop_snapshots_no_delete BEFORE DELETE ON invoice_shop_snapshots BEGIN SELECT RAISE(ABORT,'Settings history immutable.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER invoice_shop_snapshots_positive_rowid AFTER INSERT ON invoice_shop_snapshots WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Settings history identity.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_password_operations_insert_guard BEFORE INSERT ON shop_password_operations WHEN EXISTS(SELECT 1 FROM shop_password_operations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM shop_password_operations WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM shop_password_operations WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Settings history conflict.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_password_operations_no_update BEFORE UPDATE ON shop_password_operations BEGIN SELECT RAISE(ABORT,'Settings history immutable.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_password_operations_no_delete BEFORE DELETE ON shop_password_operations BEGIN SELECT RAISE(ABORT,'Settings history immutable.'); END;

-- SETTINGS41 STEP
CREATE TRIGGER shop_password_operations_positive_rowid AFTER INSERT ON shop_password_operations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Settings history identity.'); END;
