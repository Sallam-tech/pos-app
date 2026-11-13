-- CASH40 STEP
CREATE TABLE cash_action_requests (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, request_key TEXT NOT NULL UNIQUE CHECK(request_key=id), context TEXT NOT NULL CHECK(length(context)=64), action TEXT NOT NULL CHECK(action IN ('OPEN_ANCHOR','START_COUNT','RECORD_COUNT','ABORT_COUNT','ACCEPT_VARIANCE','CLOSE_DAY','RESOLVE_EVIDENCE','RESOLVE_ADMISSION')),
actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL, credential_version INTEGER NOT NULL CHECK(credential_version>0), auth_epoch INTEGER NOT NULL CHECK(auth_epoch>0), boot_generation TEXT NOT NULL,
payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND length(CAST(payload_json AS BLOB))<=8192), payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- CASH40 STEP
CREATE TABLE cash_action_authorizations (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, request_id TEXT NOT NULL REFERENCES cash_action_requests(id), session_ref TEXT NOT NULL, credential_version INTEGER NOT NULL CHECK(credential_version>0), auth_epoch INTEGER NOT NULL CHECK(auth_epoch>0), boot_generation TEXT NOT NULL, issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0), expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=300000), UNIQUE(id,request_id)
) STRICT;

-- CASH40 STEP
CREATE TABLE cash_action_operations (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, request_id TEXT NOT NULL UNIQUE REFERENCES cash_action_requests(id), request_key TEXT NOT NULL UNIQUE REFERENCES cash_action_requests(request_key), authorization_id TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json) AND length(CAST(result_json AS BLOB))<=64000), result_hash TEXT NOT NULL CHECK(length(result_hash)=64), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0), FOREIGN KEY(authorization_id,request_id) REFERENCES cash_action_authorizations(id,request_id)
) STRICT;

-- CASH40 STEP
CREATE TABLE cash_action_cancellations (
request_key TEXT NOT NULL CHECK(length(request_key)=36) PRIMARY KEY, context TEXT NOT NULL CHECK(length(context)=64), actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL, evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 1 AND 160), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- CASH40 STEP
CREATE TABLE counter_cash_admissions (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, source_kind TEXT NOT NULL CHECK(source_kind IN ('SALE','REFUND','EXPENSE','INVOICE_CORRECTION')), source_key TEXT NOT NULL CHECK(length(source_key)=36), payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64), actor_id TEXT NOT NULL REFERENCES auth_principals(id), session_ref TEXT NOT NULL, boot_generation TEXT NOT NULL, admitted_at_ms INTEGER NOT NULL CHECK(admitted_at_ms>0), payload_json TEXT, payload_digest TEXT CHECK(payload_digest IS NULL OR length(payload_digest)=64), CHECK((source_kind='SALE' AND payload_json IS NOT NULL AND payload_digest IS NOT NULL AND json_valid(payload_json) AND length(CAST(payload_json AS BLOB))<=64000) OR (source_kind<>'SALE' AND payload_json IS NULL AND payload_digest IS NULL)), UNIQUE(source_kind,source_key)
) STRICT;

-- CASH40 STEP
CREATE TABLE counter_cash_admission_resolutions (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, admission_id TEXT NOT NULL UNIQUE REFERENCES counter_cash_admissions(id), outcome TEXT NOT NULL CHECK(outcome IN ('POSTED','NO_EFFECT')), source_id TEXT, actor_id TEXT NOT NULL REFERENCES auth_principals(id), session_ref TEXT NOT NULL, evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 1 AND 160), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0), sale_operation_id TEXT UNIQUE REFERENCES sale_operations(id), return_operation_id TEXT UNIQUE REFERENCES return_operations(id), expense_operation_id TEXT UNIQUE REFERENCES expense_operations(id), invoice_operation_id TEXT UNIQUE REFERENCES invoice_correction_operations(id), recovery_operation_id TEXT UNIQUE REFERENCES cash_action_operations(id) DEFERRABLE INITIALLY DEFERRED, CHECK(recovery_operation_id IS NULL OR actor_id='ADMIN'), CHECK((sale_operation_id IS NOT NULL)+(return_operation_id IS NOT NULL)+(expense_operation_id IS NOT NULL)+(invoice_operation_id IS NOT NULL)=CASE WHEN source_id IS NULL THEN 0 ELSE 1 END), CHECK(source_id IS NULL OR source_id=coalesce(sale_operation_id,return_operation_id,expense_operation_id,invoice_operation_id)), CHECK((source_id IS NULL AND sale_operation_id IS NULL AND return_operation_id IS NULL AND expense_operation_id IS NULL AND invoice_operation_id IS NULL) OR (source_id=sale_operation_id AND return_operation_id IS NULL AND expense_operation_id IS NULL AND invoice_operation_id IS NULL) OR (source_id=return_operation_id AND sale_operation_id IS NULL AND expense_operation_id IS NULL AND invoice_operation_id IS NULL) OR (source_id=expense_operation_id AND sale_operation_id IS NULL AND return_operation_id IS NULL AND invoice_operation_id IS NULL) OR (source_id=invoice_operation_id AND sale_operation_id IS NULL AND return_operation_id IS NULL AND expense_operation_id IS NULL)), CHECK((outcome='POSTED' AND source_id IS NOT NULL) OR (outcome='NO_EFFECT' AND source_id IS NULL))
) STRICT;

-- CASH40 STEP
CREATE TABLE cash_count_sessions (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE REFERENCES cash_action_operations(id) DEFERRABLE INITIALLY DEFERRED, target_date TEXT NOT NULL CHECK(length(target_date)=10), started_at_ms INTEGER NOT NULL CHECK(started_at_ms>0), lease_until_ms INTEGER NOT NULL CHECK(lease_until_ms>started_at_ms AND lease_until_ms-started_at_ms<=180000), cash_cutoff INTEGER NOT NULL CHECK(cash_cutoff>=0), financial_cutoff INTEGER NOT NULL CHECK(financial_cutoff>=0), evidence_cutoff INTEGER NOT NULL CHECK(evidence_cutoff>=0), source_digest TEXT NOT NULL CHECK(length(source_digest)=64), boot_generation TEXT NOT NULL, actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL
) STRICT;

-- CASH40 STEP
CREATE TABLE cash_counts (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, session_id TEXT NOT NULL UNIQUE REFERENCES cash_count_sessions(id), outcome TEXT NOT NULL CHECK(outcome IN ('RECORDED','ABORTED','EXPIRED')), actual_m INTEGER CHECK(actual_m>=0 AND actual_m%100=0), counted_at_ms INTEGER, snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json) AND length(CAST(snapshot_json AS BLOB))<=64000), snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash)=64), evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 1 AND 160), actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL, recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0), operation_id TEXT NOT NULL UNIQUE REFERENCES cash_action_operations(id) DEFERRABLE INITIALLY DEFERRED, CHECK((outcome='RECORDED' AND actual_m IS NOT NULL AND counted_at_ms IS NOT NULL) OR (outcome<>'RECORDED' AND actual_m IS NULL AND counted_at_ms IS NULL)), UNIQUE(id,session_id)
) STRICT;

-- CASH40 STEP
CREATE TABLE cash_anchors (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, count_id TEXT NOT NULL UNIQUE REFERENCES cash_counts(id), operation_id TEXT NOT NULL UNIQUE REFERENCES cash_action_operations(id) DEFERRABLE INITIALLY DEFERRED, cutoff INTEGER NOT NULL CHECK(cutoff>=0), activated_at_ms INTEGER NOT NULL CHECK(activated_at_ms>0), opening_date TEXT CHECK(opening_date IS NULL OR length(opening_date)=10), basis_json TEXT NOT NULL CHECK(json_valid(basis_json) AND length(CAST(basis_json AS BLOB))<=8192), actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL, recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- CASH40 STEP
CREATE TABLE cash_reconciliations (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, count_id TEXT NOT NULL UNIQUE REFERENCES cash_counts(id), operation_id TEXT NOT NULL UNIQUE REFERENCES cash_action_operations(id) DEFERRABLE INITIALLY DEFERRED, delta_m INTEGER NOT NULL CHECK(delta_m<>0 AND delta_m%100=0), observed_at_ms INTEGER NOT NULL CHECK(observed_at_ms>0), expected_m INTEGER NOT NULL, evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 1 AND 160), actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL, recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- CASH40 STEP
CREATE TABLE cash_movements_cash_next (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('SALE','REFUND','EXPENSE','INVOICE_CORRECTION','COUNTER_RECONCILIATION')),
 sale_payment_id TEXT UNIQUE REFERENCES sale_payments(id),
 refund_payment_id TEXT UNIQUE REFERENCES refund_payments(id),
 amount_m INTEGER NOT NULL CHECK(amount_m!=0 AND amount_m%100=0),
 cash_date TEXT NOT NULL CHECK(length(cash_date)=10),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 provenance TEXT NOT NULL CHECK(provenance IN ('SOURCE_RECORDED','OPERATOR_CONFIRMED','ADMIN_ATTESTED')),
 expense_revision_id TEXT UNIQUE REFERENCES expense_revisions(id),
 correction_adjustment_id TEXT UNIQUE REFERENCES invoice_cash_adjustments(id),
 reconciliation_id TEXT UNIQUE REFERENCES cash_reconciliations(id),
 CHECK((kind='COUNTER_RECONCILIATION' AND reconciliation_id IS NOT NULL AND sale_payment_id IS NULL AND refund_payment_id IS NULL AND expense_revision_id IS NULL AND correction_adjustment_id IS NULL AND provenance='ADMIN_ATTESTED') OR (reconciliation_id IS NULL AND ((kind='INVOICE_CORRECTION' AND correction_adjustment_id IS NOT NULL AND sale_payment_id IS NULL AND refund_payment_id IS NULL AND expense_revision_id IS NULL) OR (correction_adjustment_id IS NULL AND ((expense_revision_id IS NULL AND ((kind='SALE' AND sale_payment_id IS NOT NULL AND refund_payment_id IS NULL AND amount_m>0) OR (kind='REFUND' AND sale_payment_id IS NULL AND refund_payment_id IS NOT NULL AND amount_m<0))) OR (kind='EXPENSE' AND expense_revision_id IS NOT NULL AND sale_payment_id IS NULL AND refund_payment_id IS NULL))))))
) STRICT;

-- CASH40 STEP
INSERT INTO cash_movements_cash_next(rowid,id,kind,sale_payment_id,refund_payment_id,amount_m,cash_date,recorded_at_ms,provenance,expense_revision_id,correction_adjustment_id) SELECT rowid,id,kind,sale_payment_id,refund_payment_id,amount_m,cash_date,recorded_at_ms,provenance,expense_revision_id,correction_adjustment_id FROM cash_movements;

-- CASH40 STEP
DROP TABLE cash_movements;

-- CASH40 STEP
ALTER TABLE cash_movements_cash_next RENAME TO cash_movements;

-- CASH40 STEP
CREATE TABLE cash_flow_evidence (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, movement_id TEXT NOT NULL REFERENCES cash_movements(id), previous_id TEXT UNIQUE REFERENCES cash_flow_evidence(id), admission_id TEXT REFERENCES counter_cash_admissions(id), actual_date TEXT NOT NULL CHECK(length(actual_date)=10), earliest_at_ms INTEGER NOT NULL CHECK(earliest_at_ms>0), latest_at_ms INTEGER NOT NULL CHECK(latest_at_ms>=earliest_at_ms), evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 1 AND 160), actor_id TEXT NOT NULL REFERENCES auth_principals(id), session_ref TEXT NOT NULL, recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- CASH40 STEP
CREATE TABLE daily_closings (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, business_date TEXT NOT NULL UNIQUE CHECK(length(business_date)=10), operation_id TEXT NOT NULL UNIQUE REFERENCES cash_action_operations(id) DEFERRABLE INITIALLY DEFERRED, count_id TEXT REFERENCES cash_counts(id), status TEXT NOT NULL CHECK(status IN ('VERIFIED','UNRECONCILED')), snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json) AND length(CAST(snapshot_json AS BLOB))<=64000), snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash)=64), actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL, recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- CASH40 STEP
CREATE TABLE closing_adjustments (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, closing_id TEXT NOT NULL REFERENCES daily_closings(id), source_kind TEXT NOT NULL CHECK(source_kind IN ('FINANCIAL','CASH','EVIDENCE','RECONCILIATION')), source_id TEXT NOT NULL, effect_json TEXT NOT NULL CHECK(json_valid(effect_json) AND length(CAST(effect_json AS BLOB))<=8192), effect_hash TEXT NOT NULL CHECK(length(effect_hash)=64), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0), UNIQUE(closing_id,source_kind,source_id)
) STRICT;

-- CASH40 STEP
CREATE TABLE closing_backup_jobs (
id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, closing_id TEXT NOT NULL UNIQUE REFERENCES daily_closings(id), state TEXT NOT NULL CHECK(state='BLOCKED_NOT_CONFIGURED'), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- CASH40 STEP
CREATE INDEX cash_movements_date ON cash_movements(cash_date,recorded_at_ms,id);

-- CASH40 STEP
CREATE INDEX cash_admissions_pending ON counter_cash_admissions(admitted_at_ms,id);

-- CASH40 STEP
CREATE INDEX cash_evidence_source ON cash_flow_evidence(movement_id,recorded_at_ms,id);

-- CASH40 STEP
CREATE INDEX cash_count_target ON cash_count_sessions(target_date,started_at_ms,id);

-- CASH40 STEP
CREATE INDEX cash_count_session ON cash_counts(session_id,id);

-- CASH40 STEP
CREATE INDEX cash_closing_date ON daily_closings(business_date,id);

-- CASH40 STEP
CREATE INDEX cash_adjustments_closing ON closing_adjustments(closing_id,recorded_at_ms,id);

-- CASH40 STEP
CREATE INDEX cash_action_pending ON cash_action_requests(recorded_at_ms,id);

-- CASH40 STEP
CREATE INDEX cash_anchors_time ON cash_anchors(activated_at_ms,id);

-- CASH40 STEP
CREATE TRIGGER cash_action_requests_insert_guard BEFORE INSERT ON cash_action_requests WHEN EXISTS(SELECT 1 FROM cash_action_requests WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_action_requests WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM cash_action_requests WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_requests_no_update BEFORE UPDATE ON cash_action_requests BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_requests_no_delete BEFORE DELETE ON cash_action_requests BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_requests_positive_rowid AFTER INSERT ON cash_action_requests WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_authorizations_insert_guard BEFORE INSERT ON cash_action_authorizations WHEN EXISTS(SELECT 1 FROM cash_action_authorizations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_action_authorizations WHERE id=NEW.id AND request_id=NEW.request_id) OR EXISTS(SELECT 1 FROM cash_action_authorizations WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_authorizations_no_update BEFORE UPDATE ON cash_action_authorizations BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_authorizations_no_delete BEFORE DELETE ON cash_action_authorizations BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_authorizations_positive_rowid AFTER INSERT ON cash_action_authorizations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_operations_insert_guard BEFORE INSERT ON cash_action_operations WHEN EXISTS(SELECT 1 FROM cash_action_operations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_action_operations WHERE authorization_id=NEW.authorization_id) OR EXISTS(SELECT 1 FROM cash_action_operations WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM cash_action_operations WHERE request_id=NEW.request_id) OR EXISTS(SELECT 1 FROM cash_action_operations WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_operations_no_update BEFORE UPDATE ON cash_action_operations BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_operations_no_delete BEFORE DELETE ON cash_action_operations BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_operations_positive_rowid AFTER INSERT ON cash_action_operations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_cancellations_insert_guard BEFORE INSERT ON cash_action_cancellations WHEN EXISTS(SELECT 1 FROM cash_action_cancellations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_action_cancellations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_cancellations_no_update BEFORE UPDATE ON cash_action_cancellations BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_cancellations_no_delete BEFORE DELETE ON cash_action_cancellations BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_action_cancellations_positive_rowid AFTER INSERT ON cash_action_cancellations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER counter_cash_admissions_insert_guard BEFORE INSERT ON counter_cash_admissions WHEN EXISTS(SELECT 1 FROM counter_cash_admissions WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM counter_cash_admissions WHERE source_kind=NEW.source_kind AND source_key=NEW.source_key) OR EXISTS(SELECT 1 FROM counter_cash_admissions WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER counter_cash_admissions_no_update BEFORE UPDATE ON counter_cash_admissions BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER counter_cash_admissions_no_delete BEFORE DELETE ON counter_cash_admissions BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER counter_cash_admissions_positive_rowid AFTER INSERT ON counter_cash_admissions WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER counter_cash_admission_resolutions_insert_guard BEFORE INSERT ON counter_cash_admission_resolutions WHEN EXISTS(SELECT 1 FROM counter_cash_admission_resolutions WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM counter_cash_admission_resolutions WHERE recovery_operation_id=NEW.recovery_operation_id) OR EXISTS(SELECT 1 FROM counter_cash_admission_resolutions WHERE invoice_operation_id=NEW.invoice_operation_id) OR EXISTS(SELECT 1 FROM counter_cash_admission_resolutions WHERE expense_operation_id=NEW.expense_operation_id) OR EXISTS(SELECT 1 FROM counter_cash_admission_resolutions WHERE return_operation_id=NEW.return_operation_id) OR EXISTS(SELECT 1 FROM counter_cash_admission_resolutions WHERE sale_operation_id=NEW.sale_operation_id) OR EXISTS(SELECT 1 FROM counter_cash_admission_resolutions WHERE admission_id=NEW.admission_id) OR EXISTS(SELECT 1 FROM counter_cash_admission_resolutions WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER counter_cash_admission_resolutions_no_update BEFORE UPDATE ON counter_cash_admission_resolutions BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER counter_cash_admission_resolutions_no_delete BEFORE DELETE ON counter_cash_admission_resolutions BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER counter_cash_admission_resolutions_positive_rowid AFTER INSERT ON counter_cash_admission_resolutions WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_count_sessions_insert_guard BEFORE INSERT ON cash_count_sessions WHEN EXISTS(SELECT 1 FROM cash_count_sessions WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_count_sessions WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM cash_count_sessions WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_count_sessions_no_update BEFORE UPDATE ON cash_count_sessions BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_count_sessions_no_delete BEFORE DELETE ON cash_count_sessions BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_count_sessions_positive_rowid AFTER INSERT ON cash_count_sessions WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_counts_insert_guard BEFORE INSERT ON cash_counts WHEN EXISTS(SELECT 1 FROM cash_counts WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_counts WHERE id=NEW.id AND session_id=NEW.session_id) OR EXISTS(SELECT 1 FROM cash_counts WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM cash_counts WHERE session_id=NEW.session_id) OR EXISTS(SELECT 1 FROM cash_counts WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_counts_no_update BEFORE UPDATE ON cash_counts BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_counts_no_delete BEFORE DELETE ON cash_counts BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_counts_positive_rowid AFTER INSERT ON cash_counts WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_anchors_insert_guard BEFORE INSERT ON cash_anchors WHEN EXISTS(SELECT 1 FROM cash_anchors WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_anchors WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM cash_anchors WHERE count_id=NEW.count_id) OR EXISTS(SELECT 1 FROM cash_anchors WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_anchors_no_update BEFORE UPDATE ON cash_anchors BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_anchors_no_delete BEFORE DELETE ON cash_anchors BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_anchors_positive_rowid AFTER INSERT ON cash_anchors WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_reconciliations_insert_guard BEFORE INSERT ON cash_reconciliations WHEN EXISTS(SELECT 1 FROM cash_reconciliations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_reconciliations WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM cash_reconciliations WHERE count_id=NEW.count_id) OR EXISTS(SELECT 1 FROM cash_reconciliations WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_reconciliations_no_update BEFORE UPDATE ON cash_reconciliations BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_reconciliations_no_delete BEFORE DELETE ON cash_reconciliations BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_reconciliations_positive_rowid AFTER INSERT ON cash_reconciliations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_flow_evidence_insert_guard BEFORE INSERT ON cash_flow_evidence WHEN EXISTS(SELECT 1 FROM cash_flow_evidence WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_flow_evidence WHERE previous_id=NEW.previous_id) OR EXISTS(SELECT 1 FROM cash_flow_evidence WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_flow_evidence_no_update BEFORE UPDATE ON cash_flow_evidence BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_flow_evidence_no_delete BEFORE DELETE ON cash_flow_evidence BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_flow_evidence_positive_rowid AFTER INSERT ON cash_flow_evidence WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER daily_closings_insert_guard BEFORE INSERT ON daily_closings WHEN EXISTS(SELECT 1 FROM daily_closings WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM daily_closings WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM daily_closings WHERE business_date=NEW.business_date) OR EXISTS(SELECT 1 FROM daily_closings WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER daily_closings_no_update BEFORE UPDATE ON daily_closings BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER daily_closings_no_delete BEFORE DELETE ON daily_closings BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER daily_closings_positive_rowid AFTER INSERT ON daily_closings WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER closing_adjustments_insert_guard BEFORE INSERT ON closing_adjustments WHEN EXISTS(SELECT 1 FROM closing_adjustments WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM closing_adjustments WHERE closing_id=NEW.closing_id AND source_kind=NEW.source_kind AND source_id=NEW.source_id) OR EXISTS(SELECT 1 FROM closing_adjustments WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER closing_adjustments_no_update BEFORE UPDATE ON closing_adjustments BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER closing_adjustments_no_delete BEFORE DELETE ON closing_adjustments BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER closing_adjustments_positive_rowid AFTER INSERT ON closing_adjustments WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER closing_backup_jobs_insert_guard BEFORE INSERT ON closing_backup_jobs WHEN EXISTS(SELECT 1 FROM closing_backup_jobs WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM closing_backup_jobs WHERE closing_id=NEW.closing_id) OR EXISTS(SELECT 1 FROM closing_backup_jobs WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER closing_backup_jobs_no_update BEFORE UPDATE ON closing_backup_jobs BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER closing_backup_jobs_no_delete BEFORE DELETE ON closing_backup_jobs BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER closing_backup_jobs_positive_rowid AFTER INSERT ON closing_backup_jobs WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_movements_insert_guard BEFORE INSERT ON cash_movements WHEN EXISTS(SELECT 1 FROM cash_movements WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_movements WHERE reconciliation_id=NEW.reconciliation_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE correction_adjustment_id=NEW.correction_adjustment_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE expense_revision_id=NEW.expense_revision_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE refund_payment_id=NEW.refund_payment_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE sale_payment_id=NEW.sale_payment_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Cash history conflict.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_movements_no_update BEFORE UPDATE ON cash_movements BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_movements_no_delete BEFORE DELETE ON cash_movements BEGIN SELECT RAISE(ABORT,'Cash history immutable.'); END;

-- CASH40 STEP
CREATE TRIGGER cash_movements_positive_rowid AFTER INSERT ON cash_movements WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Cash history identity.'); END;
