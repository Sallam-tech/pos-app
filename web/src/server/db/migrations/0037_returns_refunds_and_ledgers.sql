-- RETURNS37 STEP
CREATE TABLE return_requests (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 request_key TEXT NOT NULL CHECK(length(request_key)=36) UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('REFUND','DISPOSITION')),
 context TEXT NOT NULL CHECK(length(context)=64 AND context NOT GLOB '*[^0-9a-f]*'),
 requester_role TEXT NOT NULL CHECK(requester_role IN ('ADMIN','SALESPERSON')) REFERENCES auth_principals(id),
 session_ref TEXT NOT NULL CHECK(length(session_ref) BETWEEN 1 AND 128),
 credential_version INTEGER NOT NULL CHECK(credential_version>0),
 auth_epoch INTEGER NOT NULL CHECK(auth_epoch>0),
 boot_generation TEXT NOT NULL CHECK(length(boot_generation)=36),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND length(CAST(payload_json AS BLOB))<=64000),
 payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64 AND payload_hash NOT GLOB '*[^0-9a-f]*'),
 evidence_hash TEXT NOT NULL CHECK(length(evidence_hash)=64 AND evidence_hash NOT GLOB '*[^0-9a-f]*'),
 created_at_ms INTEGER NOT NULL CHECK(created_at_ms>0),
 UNIQUE(id,request_key)
) STRICT;

-- RETURNS37 STEP
CREATE TABLE return_authorizations (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 request_id TEXT NOT NULL CHECK(length(request_id)=36) REFERENCES return_requests(id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('EXECUTE_REFUND','DISPOSE','RECORD_PRIOR_PAYOUT','RECORD_DISPOSITION')),
 admin_session_ref TEXT NOT NULL,
 admin_version INTEGER NOT NULL CHECK(admin_version>0),
 admin_epoch INTEGER NOT NULL CHECK(admin_epoch>0),
 boot_generation TEXT NOT NULL CHECK(length(boot_generation)=36),
 requester_session_ref TEXT NOT NULL,
 requester_version INTEGER NOT NULL CHECK(requester_version>0),
 requester_epoch INTEGER NOT NULL CHECK(requester_epoch>0),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>0),
 CHECK(expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=300000),
 UNIQUE(id,request_id)
) STRICT;

-- RETURNS37 STEP
CREATE TABLE return_operations (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 request_id TEXT NOT NULL CHECK(length(request_id)=36) REFERENCES return_requests(id) ON DELETE RESTRICT UNIQUE,
 request_key TEXT NOT NULL CHECK(length(request_key)=36) UNIQUE,
 authorization_id TEXT NOT NULL CHECK(length(authorization_id)=36) UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('REFUND','DISPOSITION')),
 actor_id TEXT NOT NULL CHECK(actor_id IN ('ADMIN','SALESPERSON')) REFERENCES auth_principals(id),
 actor_session_ref TEXT NOT NULL,
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 return_id TEXT UNIQUE,
 first_disposition_id TEXT UNIQUE,
 FOREIGN KEY(request_id,request_key) REFERENCES return_requests(id,request_key),
 FOREIGN KEY(authorization_id,request_id) REFERENCES return_authorizations(id,request_id) ON DELETE RESTRICT,
 FOREIGN KEY(return_id,id) REFERENCES returns(id,operation_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(first_disposition_id,id) REFERENCES return_dispositions(id,operation_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((kind='REFUND' AND return_id IS NOT NULL AND first_disposition_id IS NULL) OR (kind='DISPOSITION' AND return_id IS NULL AND first_disposition_id IS NOT NULL))
) STRICT;

-- RETURNS37 STEP
CREATE TABLE returns (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 operation_id TEXT NOT NULL CHECK(length(operation_id)=36) REFERENCES return_operations(id) ON DELETE RESTRICT UNIQUE,
 invoice_id TEXT NOT NULL CHECK(length(invoice_id)=36) REFERENCES sales(id) ON DELETE RESTRICT,
 original_payment_id TEXT NOT NULL CHECK(length(original_payment_id)=36),
 line_count INTEGER NOT NULL CHECK(line_count BETWEEN 1 AND 50),
 total_m INTEGER NOT NULL CHECK(total_m>0 AND total_m%100=0),
 cash_date TEXT NOT NULL CHECK(length(cash_date)=10),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 refund_payment_id TEXT NOT NULL CHECK(length(refund_payment_id)=36) UNIQUE,
 provenance TEXT NOT NULL CHECK(provenance IN ('OPERATOR_CONFIRMED','ADMIN_ATTESTED')),
 FOREIGN KEY(original_payment_id,invoice_id) REFERENCES sale_payments(id,invoice_id),
 FOREIGN KEY(refund_payment_id,id,total_m) REFERENCES refund_payments(id,return_id,amount_m) DEFERRABLE INITIALLY DEFERRED,
 UNIQUE(id,operation_id),
 UNIQUE(id,invoice_id)
) STRICT;

-- RETURNS37 STEP
CREATE TABLE return_lines (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 return_id TEXT NOT NULL CHECK(length(return_id)=36),
 invoice_id TEXT NOT NULL CHECK(length(invoice_id)=36),
 sale_line_id TEXT NOT NULL CHECK(length(sale_line_id)=36),
 product_id TEXT NOT NULL CHECK(length(product_id)=36),
 original_quantity_q INTEGER NOT NULL CHECK(original_quantity_q BETWEEN 1000000 AND 999999999999000000 AND original_quantity_q%1000000=0),
 original_paid_m INTEGER NOT NULL CHECK(original_paid_m>0 AND original_paid_m%100=0),
 original_cost_m INTEGER NOT NULL CHECK(original_cost_m>0),
 quantity_q INTEGER NOT NULL CHECK(quantity_q BETWEEN 1000000 AND 999999999999000000 AND quantity_q%1000000=0),
 refund_m INTEGER NOT NULL CHECK(refund_m>0 AND refund_m%100=0),
 prior_q INTEGER NOT NULL CHECK(prior_q>=0 AND prior_q%1000000=0),
 prior_m INTEGER NOT NULL CHECK(prior_m>=0 AND prior_m%100=0),
 after_q INTEGER NOT NULL CHECK(after_q BETWEEN 1000000 AND 999999999999000000 AND after_q%1000000=0),
 after_m INTEGER NOT NULL CHECK(after_m>0 AND after_m%100=0),
 original_cost_allocation_m INTEGER NOT NULL CHECK(original_cost_allocation_m>0),
 exact_numerator TEXT NOT NULL CHECK(length(exact_numerator) BETWEEN 1 AND 40 AND exact_numerator NOT GLOB '*[^0-9]*'),
 policy TEXT NOT NULL CHECK(policy='PKR_CUMULATIVE_HALF_UP_V1'),
 FOREIGN KEY(return_id,invoice_id) REFERENCES returns(id,invoice_id),
 FOREIGN KEY(sale_line_id,invoice_id,product_id,original_quantity_q,original_paid_m,original_cost_m) REFERENCES sale_lines(id,invoice_id,product_id,quantity_q,charged_m,cost_snapshot_m),
 CHECK(after_q=prior_q+quantity_q AND after_q<=original_quantity_q AND after_m=prior_m+refund_m AND after_m<=original_paid_m),
 CHECK(original_cost_allocation_m/(quantity_q/1000000)=original_cost_m AND original_cost_allocation_m%(quantity_q/1000000)=0),
 UNIQUE(return_id,sale_line_id),
 UNIQUE(sale_line_id,after_q),
 UNIQUE(id,product_id)
) STRICT;

-- RETURNS37 STEP
CREATE TABLE refund_payments (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 return_id TEXT NOT NULL CHECK(length(return_id)=36) REFERENCES returns(id) ON DELETE RESTRICT UNIQUE,
 invoice_id TEXT NOT NULL CHECK(length(invoice_id)=36),
 original_payment_id TEXT NOT NULL CHECK(length(original_payment_id)=36),
 amount_m INTEGER NOT NULL CHECK(amount_m>0 AND amount_m%100=0),
 cash_date TEXT NOT NULL CHECK(length(cash_date)=10),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 confirmation TEXT NOT NULL CHECK(confirmation IN ('CASH_HANDED_OVER','ADMIN_VERIFIED_PRIOR_PAYOUT')),
 FOREIGN KEY(original_payment_id,invoice_id) REFERENCES sale_payments(id,invoice_id),
 UNIQUE(id,return_id,amount_m)
) STRICT;

-- RETURNS37 STEP
CREATE TABLE return_dispositions (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 operation_id TEXT NOT NULL CHECK(length(operation_id)=36) REFERENCES return_operations(id) ON DELETE RESTRICT,
 return_line_id TEXT NOT NULL CHECK(length(return_line_id)=36),
 product_id TEXT NOT NULL CHECK(length(product_id)=36),
 decision TEXT NOT NULL CHECK(decision IN ('RESTOCK','WRITE_OFF')),
 quantity_q INTEGER NOT NULL CHECK(quantity_q BETWEEN 1000000 AND 999999999999000000 AND quantity_q%1000000=0),
 original_cost_m INTEGER NOT NULL CHECK(original_cost_m>0),
 current_cost_m INTEGER,
 cogs_reversal_m INTEGER NOT NULL CHECK(cogs_reversal_m>=0),
 valuation_delta_m INTEGER NOT NULL,
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 160),
 FOREIGN KEY(return_line_id,product_id) REFERENCES return_lines(id,product_id),
 CHECK((decision='RESTOCK' AND current_cost_m>0 AND cogs_reversal_m>0 AND cogs_reversal_m/(quantity_q/1000000)=original_cost_m AND cogs_reversal_m%(quantity_q/1000000)=0) OR (decision='WRITE_OFF' AND current_cost_m IS NULL AND cogs_reversal_m=0 AND valuation_delta_m=0)),
 UNIQUE(operation_id,return_line_id,decision),
 UNIQUE(id,product_id),
 UNIQUE(id,operation_id)
) STRICT;

-- RETURNS37 STEP
CREATE TABLE cash_movements (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('SALE','REFUND')),
 sale_payment_id TEXT UNIQUE REFERENCES sale_payments(id),
 refund_payment_id TEXT UNIQUE REFERENCES refund_payments(id),
 amount_m INTEGER NOT NULL CHECK(amount_m!=0 AND amount_m%100=0),
 cash_date TEXT NOT NULL CHECK(length(cash_date)=10),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 provenance TEXT NOT NULL CHECK(provenance IN ('SOURCE_RECORDED','OPERATOR_CONFIRMED','ADMIN_ATTESTED')),
 CHECK((kind='SALE' AND sale_payment_id IS NOT NULL AND refund_payment_id IS NULL AND amount_m>0) OR (kind='REFUND' AND sale_payment_id IS NULL AND refund_payment_id IS NOT NULL AND amount_m<0))
) STRICT;

-- RETURNS37 STEP
CREATE TABLE financial_events (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('SALE','REFUND','RESTOCK')),
 sale_line_id TEXT UNIQUE REFERENCES sale_lines(id),
 return_line_id TEXT UNIQUE REFERENCES return_lines(id),
 disposition_id TEXT UNIQUE REFERENCES return_dispositions(id),
 revenue_delta_m INTEGER NOT NULL,
 cogs_delta_m INTEGER NOT NULL,
 valuation_delta_m INTEGER NOT NULL,
 effective_date TEXT NOT NULL CHECK(length(effective_date)=10),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 CHECK((kind='SALE' AND sale_line_id IS NOT NULL AND return_line_id IS NULL AND disposition_id IS NULL AND revenue_delta_m>0 AND revenue_delta_m%100=0 AND cogs_delta_m>0 AND valuation_delta_m=0) OR (kind='REFUND' AND sale_line_id IS NULL AND return_line_id IS NOT NULL AND disposition_id IS NULL AND revenue_delta_m<0 AND revenue_delta_m%100=0 AND cogs_delta_m=0 AND valuation_delta_m=0) OR (kind='RESTOCK' AND sale_line_id IS NULL AND return_line_id IS NULL AND disposition_id IS NOT NULL AND revenue_delta_m=0 AND cogs_delta_m<0))
) STRICT;

-- RETURNS37 STEP
CREATE TABLE return_cancellations (
 request_key TEXT NOT NULL CHECK(length(request_key)=36) PRIMARY KEY,
 context TEXT NOT NULL CHECK(length(context)=64 AND context NOT GLOB '*[^0-9a-f]*'),
 kind TEXT NOT NULL CHECK(kind IN ('REFUND','DISPOSITION')),
 actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id),
 admin_session_ref TEXT NOT NULL,
 attestation TEXT NOT NULL CHECK(attestation IN ('NO_CASH_PAID','NO_DISPOSITION_APPLIED')),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- RETURNS37 STEP
CREATE UNIQUE INDEX sale_lines_returns_binding ON sale_lines(id,invoice_id,product_id,quantity_q,charged_m,cost_snapshot_m);

-- RETURNS37 STEP
CREATE UNIQUE INDEX sale_payments_returns_binding ON sale_payments(id,invoice_id);

-- RETURNS37 STEP
CREATE TABLE stock_movements_returns_next (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 operation_id TEXT UNIQUE,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK(kind IN ('OPENING','RECEIVE','ADJUST','SALE','RETURN_RESTOCK')),
 before_q INTEGER NOT NULL CHECK(before_q BETWEEN 0 AND 999999999999000000 AND before_q%1000000=0),
 delta_q INTEGER NOT NULL CHECK(delta_q!=0 AND delta_q%1000000=0),
 after_q INTEGER NOT NULL CHECK(after_q BETWEEN 0 AND 999999999999000000 AND after_q%1000000=0),
 cost_snapshot_m INTEGER NOT NULL CHECK(cost_snapshot_m BETWEEN 1 AND 99999999999999),
 balance_version INTEGER NOT NULL CHECK(balance_version>0),
 sale_line_id TEXT UNIQUE,
 return_disposition_id TEXT UNIQUE,
 FOREIGN KEY(return_disposition_id,product_id) REFERENCES return_dispositions(id,product_id),
 FOREIGN KEY(sale_line_id,product_id) REFERENCES sale_lines(id,product_id) ON DELETE RESTRICT,
 FOREIGN KEY(operation_id,product_id) REFERENCES inventory_operations(id,product_id) ON DELETE RESTRICT,
 UNIQUE(product_id,balance_version),
 CHECK(after_q-before_q=delta_q),
 CHECK((kind='OPENING' AND before_q=0 AND delta_q>0 AND balance_version=1) OR
       (kind='RECEIVE' AND delta_q>0 AND balance_version>1) OR
       (kind='ADJUST' AND balance_version>1) OR (kind='SALE' AND delta_q<0 AND balance_version>1) OR (kind='RETURN_RESTOCK' AND delta_q>0 AND balance_version>1)),
 CHECK((kind='SALE' AND operation_id IS NULL AND sale_line_id IS NOT NULL AND return_disposition_id IS NULL) OR (kind IN ('OPENING','RECEIVE','ADJUST') AND operation_id IS NOT NULL AND sale_line_id IS NULL AND return_disposition_id IS NULL) OR (kind='RETURN_RESTOCK' AND operation_id IS NULL AND sale_line_id IS NULL AND return_disposition_id IS NOT NULL))
) STRICT;

-- RETURNS37 STEP
INSERT INTO stock_movements_returns_next(rowid,id,operation_id,product_id,kind,before_q,delta_q,after_q,cost_snapshot_m,balance_version,sale_line_id,return_disposition_id) SELECT rowid,id,operation_id,product_id,kind,before_q,delta_q,after_q,cost_snapshot_m,balance_version,sale_line_id,NULL FROM stock_movements;

-- RETURNS37 STEP
DROP TABLE stock_movements;

-- RETURNS37 STEP
ALTER TABLE stock_movements_returns_next RENAME TO stock_movements;

-- RETURNS37 STEP
CREATE UNIQUE INDEX stock_opening_unique ON stock_movements(product_id) WHERE kind='OPENING';

-- RETURNS37 STEP
CREATE TRIGGER stock_movements_insert_guard BEFORE INSERT ON stock_movements
WHEN EXISTS(SELECT 1 FROM stock_movements WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE id=NEW.id) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE operation_id=NEW.operation_id) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE product_id=NEW.product_id AND balance_version=NEW.balance_version) OR
 (NEW.kind='OPENING' AND EXISTS(SELECT 1 FROM stock_movements WHERE product_id=NEW.product_id AND kind='OPENING'))
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;

-- RETURNS37 STEP
CREATE TRIGGER stock_movements_no_update BEFORE UPDATE ON stock_movements
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;

-- RETURNS37 STEP
CREATE TRIGGER stock_movements_no_delete BEFORE DELETE ON stock_movements
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;

-- RETURNS37 STEP
CREATE TRIGGER stock_movements_positive_rowid AFTER INSERT ON stock_movements
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;

-- RETURNS37 STEP
CREATE TRIGGER stock_movements_sale_line_guard BEFORE INSERT ON stock_movements WHEN NEW.sale_line_id IS NOT NULL AND EXISTS(SELECT 1 FROM stock_movements WHERE sale_line_id=NEW.sale_line_id) BEGIN SELECT RAISE(ABORT,'Sale movement conflict.'); END;

-- RETURNS37 STEP
CREATE TRIGGER stock_movements_return_guard BEFORE INSERT ON stock_movements WHEN NEW.return_disposition_id IS NOT NULL AND EXISTS(SELECT 1 FROM stock_movements WHERE return_disposition_id=NEW.return_disposition_id) BEGIN SELECT RAISE(ABORT,'Return movement conflict.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_requests_insert_guard BEFORE INSERT ON return_requests WHEN EXISTS(SELECT 1 FROM return_requests WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM return_requests WHERE id=NEW.id AND request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM return_requests WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM return_requests WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM return_cancellations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Return history conflict.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_requests_no_update BEFORE UPDATE ON return_requests BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_requests_no_delete BEFORE DELETE ON return_requests BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_requests_positive_rowid AFTER INSERT ON return_requests WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid return history identity.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_authorizations_insert_guard BEFORE INSERT ON return_authorizations WHEN EXISTS(SELECT 1 FROM return_authorizations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM return_authorizations WHERE id=NEW.id AND request_id=NEW.request_id) OR EXISTS(SELECT 1 FROM return_authorizations WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Return history conflict.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_authorizations_no_update BEFORE UPDATE ON return_authorizations BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_authorizations_no_delete BEFORE DELETE ON return_authorizations BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_authorizations_positive_rowid AFTER INSERT ON return_authorizations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid return history identity.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_operations_insert_guard BEFORE INSERT ON return_operations WHEN EXISTS(SELECT 1 FROM return_operations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM return_operations WHERE first_disposition_id=NEW.first_disposition_id) OR EXISTS(SELECT 1 FROM return_operations WHERE return_id=NEW.return_id) OR EXISTS(SELECT 1 FROM return_operations WHERE authorization_id=NEW.authorization_id) OR EXISTS(SELECT 1 FROM return_operations WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM return_operations WHERE request_id=NEW.request_id) OR EXISTS(SELECT 1 FROM return_operations WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM return_cancellations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Return history conflict.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_operations_no_update BEFORE UPDATE ON return_operations BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_operations_no_delete BEFORE DELETE ON return_operations BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_operations_positive_rowid AFTER INSERT ON return_operations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid return history identity.'); END;

-- RETURNS37 STEP
CREATE TRIGGER returns_insert_guard BEFORE INSERT ON returns WHEN EXISTS(SELECT 1 FROM returns WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM returns WHERE id=NEW.id AND invoice_id=NEW.invoice_id) OR EXISTS(SELECT 1 FROM returns WHERE id=NEW.id AND operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM returns WHERE refund_payment_id=NEW.refund_payment_id) OR EXISTS(SELECT 1 FROM returns WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM returns WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Return history conflict.'); END;

-- RETURNS37 STEP
CREATE TRIGGER returns_no_update BEFORE UPDATE ON returns BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER returns_no_delete BEFORE DELETE ON returns BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER returns_positive_rowid AFTER INSERT ON returns WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid return history identity.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_lines_insert_guard BEFORE INSERT ON return_lines WHEN EXISTS(SELECT 1 FROM return_lines WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM return_lines WHERE id=NEW.id AND product_id=NEW.product_id) OR EXISTS(SELECT 1 FROM return_lines WHERE sale_line_id=NEW.sale_line_id AND after_q=NEW.after_q) OR EXISTS(SELECT 1 FROM return_lines WHERE return_id=NEW.return_id AND sale_line_id=NEW.sale_line_id) OR EXISTS(SELECT 1 FROM return_lines WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Return history conflict.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_lines_no_update BEFORE UPDATE ON return_lines BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_lines_no_delete BEFORE DELETE ON return_lines BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_lines_positive_rowid AFTER INSERT ON return_lines WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid return history identity.'); END;

-- RETURNS37 STEP
CREATE TRIGGER refund_payments_insert_guard BEFORE INSERT ON refund_payments WHEN EXISTS(SELECT 1 FROM refund_payments WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM refund_payments WHERE id=NEW.id AND return_id=NEW.return_id AND amount_m=NEW.amount_m) OR EXISTS(SELECT 1 FROM refund_payments WHERE return_id=NEW.return_id) OR EXISTS(SELECT 1 FROM refund_payments WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Return history conflict.'); END;

-- RETURNS37 STEP
CREATE TRIGGER refund_payments_no_update BEFORE UPDATE ON refund_payments BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER refund_payments_no_delete BEFORE DELETE ON refund_payments BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER refund_payments_positive_rowid AFTER INSERT ON refund_payments WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid return history identity.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_dispositions_insert_guard BEFORE INSERT ON return_dispositions WHEN EXISTS(SELECT 1 FROM return_dispositions WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM return_dispositions WHERE id=NEW.id AND operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM return_dispositions WHERE id=NEW.id AND product_id=NEW.product_id) OR EXISTS(SELECT 1 FROM return_dispositions WHERE operation_id=NEW.operation_id AND return_line_id=NEW.return_line_id AND decision=NEW.decision) OR EXISTS(SELECT 1 FROM return_dispositions WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Return history conflict.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_dispositions_no_update BEFORE UPDATE ON return_dispositions BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_dispositions_no_delete BEFORE DELETE ON return_dispositions BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_dispositions_positive_rowid AFTER INSERT ON return_dispositions WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid return history identity.'); END;

-- RETURNS37 STEP
CREATE TRIGGER cash_movements_insert_guard BEFORE INSERT ON cash_movements WHEN EXISTS(SELECT 1 FROM cash_movements WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_movements WHERE refund_payment_id=NEW.refund_payment_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE sale_payment_id=NEW.sale_payment_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Return history conflict.'); END;

-- RETURNS37 STEP
CREATE TRIGGER cash_movements_no_update BEFORE UPDATE ON cash_movements BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER cash_movements_no_delete BEFORE DELETE ON cash_movements BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER cash_movements_positive_rowid AFTER INSERT ON cash_movements WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid return history identity.'); END;

-- RETURNS37 STEP
CREATE TRIGGER financial_events_insert_guard BEFORE INSERT ON financial_events WHEN EXISTS(SELECT 1 FROM financial_events WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM financial_events WHERE disposition_id=NEW.disposition_id) OR EXISTS(SELECT 1 FROM financial_events WHERE return_line_id=NEW.return_line_id) OR EXISTS(SELECT 1 FROM financial_events WHERE sale_line_id=NEW.sale_line_id) OR EXISTS(SELECT 1 FROM financial_events WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Return history conflict.'); END;

-- RETURNS37 STEP
CREATE TRIGGER financial_events_no_update BEFORE UPDATE ON financial_events BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER financial_events_no_delete BEFORE DELETE ON financial_events BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER financial_events_positive_rowid AFTER INSERT ON financial_events WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid return history identity.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_cancellations_insert_guard BEFORE INSERT ON return_cancellations WHEN EXISTS(SELECT 1 FROM return_cancellations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM return_cancellations WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM return_operations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Return history conflict.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_cancellations_no_update BEFORE UPDATE ON return_cancellations BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_cancellations_no_delete BEFORE DELETE ON return_cancellations BEGIN SELECT RAISE(ABORT,'Return history immutable.'); END;

-- RETURNS37 STEP
CREATE TRIGGER return_cancellations_positive_rowid AFTER INSERT ON return_cancellations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid return history identity.'); END;

-- RETURNS37 STEP
CREATE INDEX return_requests_role ON return_requests(requester_role,created_at_ms,id);

-- RETURNS37 STEP
CREATE INDEX returns_invoice ON returns(invoice_id,recorded_at_ms,id);

-- RETURNS37 STEP
CREATE INDEX return_lines_original ON return_lines(sale_line_id,after_q);

-- RETURNS37 STEP
CREATE INDEX return_dispositions_line ON return_dispositions(return_line_id,recorded_at_ms,id);

-- RETURNS37 STEP
CREATE INDEX return_authorizations_request ON return_authorizations(request_id,issued_at_ms,id);

-- RETURNS37 STEP
INSERT INTO cash_movements SELECT p.id,'SALE',p.id,NULL,p.net_received_m,s.business_date,p.recorded_at_ms,'SOURCE_RECORDED' FROM sale_payments p JOIN sales s ON s.id=p.invoice_id;

-- RETURNS37 STEP
INSERT INTO financial_events SELECT l.id,'SALE',l.id,NULL,NULL,l.charged_m,l.cogs_m,0,s.business_date,s.recorded_at_ms FROM sale_lines l JOIN sales s ON s.id=l.invoice_id;
