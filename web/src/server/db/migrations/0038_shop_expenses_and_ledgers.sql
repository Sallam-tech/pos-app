-- EXPENSES38 STEP
CREATE TABLE expense_requests (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, request_key TEXT NOT NULL UNIQUE CHECK(request_key=id),
 kind TEXT NOT NULL CHECK(kind IN ('CREATE','REVISE','REVERSE')),
 context TEXT NOT NULL CHECK(length(context)=64 AND context NOT GLOB '*[^0-9a-f]*'),
 requester_role TEXT NOT NULL REFERENCES auth_principals(id), session_ref TEXT NOT NULL,
 credential_version INTEGER NOT NULL CHECK(credential_version>0), auth_epoch INTEGER NOT NULL CHECK(auth_epoch>0), boot_generation TEXT NOT NULL,
 target_id TEXT REFERENCES expenses(id), expected_revision INTEGER,
 payload_json TEXT NOT NULL CHECK(length(payload_json)<=8192), payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
 created_at_ms INTEGER NOT NULL CHECK(created_at_ms>0),
 CHECK((kind='CREATE' AND requester_role='SALESPERSON' AND target_id IS NULL AND expected_revision IS NULL) OR (kind<>'CREATE' AND target_id IS NOT NULL AND expected_revision>0))
) STRICT;

-- EXPENSES38 STEP
CREATE TABLE expense_authorizations (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, request_id TEXT NOT NULL REFERENCES expense_requests(id), action TEXT NOT NULL CHECK(action IN ('EXECUTE','RECORD_PRIOR')),
 admin_session_ref TEXT NOT NULL, admin_version INTEGER NOT NULL CHECK(admin_version>0), admin_epoch INTEGER NOT NULL CHECK(admin_epoch>0), boot_generation TEXT NOT NULL,
 requester_session_ref TEXT NOT NULL, requester_version INTEGER NOT NULL CHECK(requester_version>0), requester_epoch INTEGER NOT NULL CHECK(requester_epoch>0),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0), expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=300000), UNIQUE(id,request_id)
) STRICT;

-- EXPENSES38 STEP
CREATE TABLE expense_operations (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, request_id TEXT NOT NULL UNIQUE REFERENCES expense_requests(id), request_key TEXT NOT NULL UNIQUE REFERENCES expense_requests(request_key),
 authorization_id TEXT UNIQUE, actor_id TEXT NOT NULL REFERENCES auth_principals(id), session_ref TEXT NOT NULL,
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0), revision_id TEXT NOT NULL UNIQUE REFERENCES expense_revisions(id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(authorization_id,request_id) REFERENCES expense_authorizations(id,request_id)
) STRICT;

-- EXPENSES38 STEP
CREATE TABLE expenses (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE REFERENCES expense_operations(id),
 business_date TEXT NOT NULL CHECK(length(business_date)=10), created_by TEXT NOT NULL CHECK(created_by='SALESPERSON') REFERENCES auth_principals(id),
 created_at_ms INTEGER NOT NULL CHECK(created_at_ms>0)
) STRICT;

-- EXPENSES38 STEP
CREATE TABLE expense_revisions (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, expense_id TEXT NOT NULL REFERENCES expenses(id), revision INTEGER NOT NULL CHECK(revision>0),
 previous_id TEXT UNIQUE REFERENCES expense_revisions(id), operation_id TEXT NOT NULL UNIQUE REFERENCES expense_operations(id),
 status TEXT NOT NULL CHECK(status IN ('POSTED','REVERSED')), amount_m INTEGER NOT NULL CHECK(amount_m>0 AND amount_m%100=0),
 effective_m INTEGER NOT NULL CHECK(effective_m>=0 AND effective_m%100=0), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 160),
 audit_reason TEXT NOT NULL CHECK(length(audit_reason) BETWEEN 1 AND 160), expense_delta_m INTEGER NOT NULL CHECK(expense_delta_m%100=0),
 cash_delta_m INTEGER NOT NULL CHECK(cash_delta_m=-expense_delta_m), cash_date TEXT CHECK(cash_date IS NULL OR length(cash_date)=10),
 evidence_mode TEXT NOT NULL CHECK(evidence_mode IN ('COUNTER_TAKEN','RECORDING_ERROR','ACTUAL_MOVEMENT','NO_CASH_CHANGE')),
 evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 1 AND 160), effective_date TEXT NOT NULL CHECK(length(effective_date)=10),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 CHECK((status='POSTED' AND effective_m=amount_m) OR (status='REVERSED' AND effective_m=0)),
 CHECK((cash_delta_m=0 AND cash_date IS NULL AND evidence_mode='NO_CASH_CHANGE') OR (cash_delta_m<>0 AND cash_date IS NOT NULL AND evidence_mode<>'NO_CASH_CHANGE')),
 CHECK((revision=1 AND previous_id IS NULL AND status='POSTED' AND expense_delta_m=amount_m AND evidence_mode='COUNTER_TAKEN') OR (revision>1 AND previous_id IS NOT NULL)),
 UNIQUE(expense_id,revision)
) STRICT;

-- EXPENSES38 STEP
CREATE TABLE expense_cancellations (
 request_key TEXT NOT NULL CHECK(length(request_key)=36) PRIMARY KEY,
 context TEXT NOT NULL CHECK(length(context)=64), actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id),
 session_ref TEXT NOT NULL, evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 1 AND 160), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- EXPENSES38 STEP
CREATE TABLE cash_movements_expenses_next (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('SALE','REFUND','EXPENSE')),
 sale_payment_id TEXT UNIQUE REFERENCES sale_payments(id),
 refund_payment_id TEXT UNIQUE REFERENCES refund_payments(id),
 amount_m INTEGER NOT NULL CHECK(amount_m!=0 AND amount_m%100=0),
 cash_date TEXT NOT NULL CHECK(length(cash_date)=10),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 provenance TEXT NOT NULL CHECK(provenance IN ('SOURCE_RECORDED','OPERATOR_CONFIRMED','ADMIN_ATTESTED')),
 expense_revision_id TEXT UNIQUE REFERENCES expense_revisions(id),
 CHECK((expense_revision_id IS NULL AND ((kind='SALE' AND sale_payment_id IS NOT NULL AND refund_payment_id IS NULL AND amount_m>0) OR (kind='REFUND' AND sale_payment_id IS NULL AND refund_payment_id IS NOT NULL AND amount_m<0))) OR (kind='EXPENSE' AND expense_revision_id IS NOT NULL AND sale_payment_id IS NULL AND refund_payment_id IS NULL))
) STRICT;

-- EXPENSES38 STEP
INSERT INTO cash_movements_expenses_next(rowid,id,kind,sale_payment_id,refund_payment_id,amount_m,cash_date,recorded_at_ms,provenance) SELECT rowid,id,kind,sale_payment_id,refund_payment_id,amount_m,cash_date,recorded_at_ms,provenance FROM cash_movements;

-- EXPENSES38 STEP
DROP TABLE cash_movements;

-- EXPENSES38 STEP
ALTER TABLE cash_movements_expenses_next RENAME TO cash_movements;

-- EXPENSES38 STEP
CREATE TABLE financial_events_expenses_next (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('SALE','REFUND','RESTOCK','EXPENSE')),
 sale_line_id TEXT UNIQUE REFERENCES sale_lines(id),
 return_line_id TEXT UNIQUE REFERENCES return_lines(id),
 disposition_id TEXT UNIQUE REFERENCES return_dispositions(id),
 revenue_delta_m INTEGER NOT NULL,
 cogs_delta_m INTEGER NOT NULL,
 valuation_delta_m INTEGER NOT NULL,
 effective_date TEXT NOT NULL CHECK(length(effective_date)=10),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 expense_revision_id TEXT UNIQUE REFERENCES expense_revisions(id),
 expense_delta_m INTEGER NOT NULL DEFAULT 0 CHECK(expense_delta_m%100=0),
 CHECK((expense_revision_id IS NULL AND expense_delta_m=0 AND ((kind='SALE' AND sale_line_id IS NOT NULL AND return_line_id IS NULL AND disposition_id IS NULL AND revenue_delta_m>0 AND revenue_delta_m%100=0 AND cogs_delta_m>0 AND valuation_delta_m=0) OR (kind='REFUND' AND sale_line_id IS NULL AND return_line_id IS NOT NULL AND disposition_id IS NULL AND revenue_delta_m<0 AND revenue_delta_m%100=0 AND cogs_delta_m=0 AND valuation_delta_m=0) OR (kind='RESTOCK' AND sale_line_id IS NULL AND return_line_id IS NULL AND disposition_id IS NOT NULL AND revenue_delta_m=0 AND cogs_delta_m<0))) OR (kind='EXPENSE' AND expense_revision_id IS NOT NULL AND sale_line_id IS NULL AND return_line_id IS NULL AND disposition_id IS NULL AND revenue_delta_m=0 AND cogs_delta_m=0 AND valuation_delta_m=0 AND expense_delta_m<>0))
) STRICT;

-- EXPENSES38 STEP
INSERT INTO financial_events_expenses_next(rowid,id,kind,sale_line_id,return_line_id,disposition_id,revenue_delta_m,cogs_delta_m,valuation_delta_m,effective_date,recorded_at_ms) SELECT rowid,id,kind,sale_line_id,return_line_id,disposition_id,revenue_delta_m,cogs_delta_m,valuation_delta_m,effective_date,recorded_at_ms FROM financial_events;

-- EXPENSES38 STEP
DROP TABLE financial_events;

-- EXPENSES38 STEP
ALTER TABLE financial_events_expenses_next RENAME TO financial_events;

-- EXPENSES38 STEP
CREATE TRIGGER expense_requests_insert_guard BEFORE INSERT ON expense_requests WHEN EXISTS(SELECT 1 FROM expense_requests WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM expense_requests WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM expense_requests WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM expense_cancellations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Expense history conflict.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_requests_no_update BEFORE UPDATE ON expense_requests BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_requests_no_delete BEFORE DELETE ON expense_requests BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_requests_positive_rowid AFTER INSERT ON expense_requests WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid expense history identity.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_authorizations_insert_guard BEFORE INSERT ON expense_authorizations WHEN EXISTS(SELECT 1 FROM expense_authorizations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM expense_authorizations WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM expense_authorizations WHERE id=NEW.id AND request_id=NEW.request_id) BEGIN SELECT RAISE(ABORT,'Expense history conflict.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_authorizations_no_update BEFORE UPDATE ON expense_authorizations BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_authorizations_no_delete BEFORE DELETE ON expense_authorizations BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_authorizations_positive_rowid AFTER INSERT ON expense_authorizations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid expense history identity.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_operations_insert_guard BEFORE INSERT ON expense_operations WHEN EXISTS(SELECT 1 FROM expense_operations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM expense_operations WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM expense_operations WHERE request_id=NEW.request_id) OR EXISTS(SELECT 1 FROM expense_operations WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM expense_operations WHERE authorization_id=NEW.authorization_id) OR EXISTS(SELECT 1 FROM expense_operations WHERE revision_id=NEW.revision_id) OR EXISTS(SELECT 1 FROM expense_cancellations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Expense history conflict.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_operations_no_update BEFORE UPDATE ON expense_operations BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_operations_no_delete BEFORE DELETE ON expense_operations BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_operations_positive_rowid AFTER INSERT ON expense_operations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid expense history identity.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expenses_insert_guard BEFORE INSERT ON expenses WHEN EXISTS(SELECT 1 FROM expenses WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM expenses WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM expenses WHERE operation_id=NEW.operation_id) BEGIN SELECT RAISE(ABORT,'Expense history conflict.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expenses_no_update BEFORE UPDATE ON expenses BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expenses_no_delete BEFORE DELETE ON expenses BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expenses_positive_rowid AFTER INSERT ON expenses WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid expense history identity.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_revisions_insert_guard BEFORE INSERT ON expense_revisions WHEN EXISTS(SELECT 1 FROM expense_revisions WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM expense_revisions WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM expense_revisions WHERE previous_id=NEW.previous_id) OR EXISTS(SELECT 1 FROM expense_revisions WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM expense_revisions WHERE expense_id=NEW.expense_id AND revision=NEW.revision) OR NOT EXISTS(SELECT 1 FROM expenses e WHERE e.id=NEW.expense_id AND e.business_date=NEW.effective_date AND ((NEW.revision=1 AND NOT EXISTS(SELECT 1 FROM expense_revisions r WHERE r.expense_id=e.id)) OR (NEW.revision>1 AND EXISTS(SELECT 1 FROM expense_revisions p WHERE p.id=NEW.previous_id AND p.expense_id=e.id AND p.revision=NEW.revision-1 AND p.status='POSTED' AND NEW.expense_delta_m=NEW.effective_m-p.effective_m)))) BEGIN SELECT RAISE(ABORT,'Expense history conflict.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_revisions_no_update BEFORE UPDATE ON expense_revisions BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_revisions_no_delete BEFORE DELETE ON expense_revisions BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_revisions_positive_rowid AFTER INSERT ON expense_revisions WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid expense history identity.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_cancellations_insert_guard BEFORE INSERT ON expense_cancellations WHEN EXISTS(SELECT 1 FROM expense_cancellations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM expense_cancellations WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM expense_operations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Expense history conflict.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_cancellations_no_update BEFORE UPDATE ON expense_cancellations BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_cancellations_no_delete BEFORE DELETE ON expense_cancellations BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER expense_cancellations_positive_rowid AFTER INSERT ON expense_cancellations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid expense history identity.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER cash_movements_insert_guard BEFORE INSERT ON cash_movements WHEN EXISTS(SELECT 1 FROM cash_movements WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_movements WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM cash_movements WHERE sale_payment_id=NEW.sale_payment_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE refund_payment_id=NEW.refund_payment_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE expense_revision_id=NEW.expense_revision_id) BEGIN SELECT RAISE(ABORT,'Expense history conflict.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER cash_movements_no_update BEFORE UPDATE ON cash_movements BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER cash_movements_no_delete BEFORE DELETE ON cash_movements BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER cash_movements_positive_rowid AFTER INSERT ON cash_movements WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid expense history identity.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER financial_events_insert_guard BEFORE INSERT ON financial_events WHEN EXISTS(SELECT 1 FROM financial_events WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM financial_events WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM financial_events WHERE sale_line_id=NEW.sale_line_id) OR EXISTS(SELECT 1 FROM financial_events WHERE return_line_id=NEW.return_line_id) OR EXISTS(SELECT 1 FROM financial_events WHERE disposition_id=NEW.disposition_id) OR EXISTS(SELECT 1 FROM financial_events WHERE expense_revision_id=NEW.expense_revision_id) BEGIN SELECT RAISE(ABORT,'Expense history conflict.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER financial_events_no_update BEFORE UPDATE ON financial_events BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER financial_events_no_delete BEFORE DELETE ON financial_events BEGIN SELECT RAISE(ABORT,'Expense history immutable.'); END;

-- EXPENSES38 STEP
CREATE TRIGGER financial_events_positive_rowid AFTER INSERT ON financial_events WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid expense history identity.'); END;

-- EXPENSES38 STEP
CREATE INDEX expenses_chronological ON expenses(business_date,created_at_ms,id);

-- EXPENSES38 STEP
CREATE INDEX expense_revisions_latest ON expense_revisions(expense_id,revision);

-- EXPENSES38 STEP
CREATE INDEX expense_requests_target ON expense_requests(target_id,created_at_ms);

-- EXPENSES38 STEP
CREATE INDEX expense_requests_role ON expense_requests(requester_role,created_at_ms);

-- EXPENSES38 STEP
CREATE INDEX expense_authorizations_request ON expense_authorizations(request_id,issued_at_ms,id);

-- EXPENSES38 STEP
CREATE INDEX cash_movements_date ON cash_movements(cash_date,recorded_at_ms,id);

-- EXPENSES38 STEP
CREATE INDEX financial_events_date ON financial_events(effective_date,recorded_at_ms,id);

-- EXPENSES38 STEP
CREATE INDEX expense_revisions_period ON expense_revisions(effective_date,recorded_at_ms,id);

