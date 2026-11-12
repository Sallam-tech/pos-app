-- INVOICES39 STEP
CREATE TABLE invoice_correction_requests (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, request_key TEXT NOT NULL UNIQUE CHECK(request_key=id),
 context TEXT NOT NULL CHECK(length(context)=64), invoice_id TEXT NOT NULL REFERENCES sales(id), expected_revision INTEGER NOT NULL CHECK(expected_revision>0),
 actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL,
 credential_version INTEGER NOT NULL CHECK(credential_version>0), auth_epoch INTEGER NOT NULL CHECK(auth_epoch>0), boot_generation TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND length(CAST(payload_json AS BLOB))<=64000), payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64), evidence_hash TEXT NOT NULL CHECK(length(evidence_hash)=64),
 created_at_ms INTEGER NOT NULL CHECK(created_at_ms>0)
) STRICT;

-- INVOICES39 STEP
CREATE TABLE invoice_correction_authorizations (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, request_id TEXT NOT NULL REFERENCES invoice_correction_requests(id),
 action TEXT NOT NULL CHECK(action IN ('EXECUTE','RECORD_PRIOR')), session_ref TEXT NOT NULL, credential_version INTEGER NOT NULL CHECK(credential_version>0), auth_epoch INTEGER NOT NULL CHECK(auth_epoch>0), boot_generation TEXT NOT NULL,
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0), expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=300000),
 recovery_evidence TEXT, UNIQUE(id,request_id)
) STRICT;

-- INVOICES39 STEP
CREATE TABLE invoice_correction_operations (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, request_id TEXT NOT NULL UNIQUE REFERENCES invoice_correction_requests(id), request_key TEXT NOT NULL UNIQUE REFERENCES invoice_correction_requests(request_key),
 authorization_id TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL,
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0), revision_id TEXT NOT NULL UNIQUE REFERENCES invoice_revisions(id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(authorization_id,request_id) REFERENCES invoice_correction_authorizations(id,request_id)
) STRICT;

-- INVOICES39 STEP
CREATE TABLE invoice_revisions (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES sales(id), revision INTEGER NOT NULL CHECK(revision>=2),
 previous_id TEXT UNIQUE REFERENCES invoice_revisions(id), operation_id TEXT NOT NULL UNIQUE REFERENCES invoice_correction_operations(id),
 line_count INTEGER NOT NULL CHECK(line_count BETWEEN 1 AND 50), charged_m INTEGER NOT NULL CHECK(charged_m>0 AND charged_m%100=0), cogs_m INTEGER NOT NULL CHECK(cogs_m>0), profit_m INTEGER NOT NULL CHECK(profit_m=charged_m-cogs_m),
 revenue_delta_m INTEGER NOT NULL CHECK(revenue_delta_m%100=0), cogs_delta_m INTEGER NOT NULL,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 160), stock_evidence TEXT NOT NULL CHECK(length(stock_evidence) BETWEEN 1 AND 160), settlement_evidence TEXT NOT NULL CHECK(length(settlement_evidence) BETWEEN 1 AND 160),
 effective_date TEXT NOT NULL CHECK(length(effective_date)=10), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json) AND length(CAST(receipt_json AS BLOB))<=64000), receipt_hash TEXT NOT NULL CHECK(length(receipt_hash)=64),
 CHECK((revision=2 AND previous_id IS NULL) OR (revision>2 AND previous_id IS NOT NULL)), UNIQUE(invoice_id,revision), UNIQUE(id,invoice_id)
) STRICT;

-- INVOICES39 STEP
CREATE TABLE invoice_revision_lines (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, revision_id TEXT NOT NULL, invoice_id TEXT NOT NULL, sale_line_id TEXT NOT NULL REFERENCES sale_lines(id), product_id TEXT NOT NULL REFERENCES products(id), line_no INTEGER NOT NULL CHECK(line_no BETWEEN 1 AND 50),
 quantity_q INTEGER NOT NULL CHECK(quantity_q BETWEEN 1000000 AND 999999999999000000 AND quantity_q%1000000=0), unit_price_m INTEGER NOT NULL CHECK(unit_price_m BETWEEN 100 AND 99999999999999 AND unit_price_m%100=0), discount_percent INTEGER NOT NULL CHECK(discount_percent BETWEEN 0 AND 100), unit_payable_m INTEGER NOT NULL CHECK(unit_payable_m>0 AND unit_payable_m%100=0), charged_m INTEGER NOT NULL CHECK(charged_m>0 AND charged_m%100=0), cost_snapshot_m INTEGER NOT NULL CHECK(cost_snapshot_m>0), cogs_m INTEGER NOT NULL CHECK(cogs_m>0),
 exact_unit_numerator INTEGER NOT NULL CHECK(exact_unit_numerator>0), exact_unit_denominator INTEGER NOT NULL CHECK(exact_unit_denominator=100),
 current_cost_m INTEGER NOT NULL CHECK(current_cost_m>0), changed INTEGER NOT NULL CHECK(changed IN (0,1)), revenue_delta_m INTEGER NOT NULL CHECK(revenue_delta_m%100=0), cogs_delta_m INTEGER NOT NULL, stock_delta_q INTEGER NOT NULL CHECK(stock_delta_q%1000000=0), valuation_delta_m INTEGER NOT NULL,
 stock_before_q INTEGER NOT NULL CHECK(stock_before_q>=0 AND stock_before_q%1000000=0), stock_after_q INTEGER NOT NULL CHECK(stock_after_q>=0 AND stock_after_q%1000000=0), balance_version INTEGER NOT NULL CHECK(balance_version>0), verified_stock_q INTEGER NOT NULL CHECK(verified_stock_q=stock_after_q),
 FOREIGN KEY(revision_id,invoice_id) REFERENCES invoice_revisions(id,invoice_id), FOREIGN KEY(sale_line_id,invoice_id,product_id) REFERENCES sale_lines(id,invoice_id,product_id),
 CHECK(stock_after_q=stock_before_q+stock_delta_q), CHECK(cogs_m/(quantity_q/1000000)=cost_snapshot_m AND cogs_m%(quantity_q/1000000)=0), CHECK(charged_m>=cogs_m),
 UNIQUE(revision_id,sale_line_id), UNIQUE(revision_id,line_no), UNIQUE(id,product_id), UNIQUE(id,invoice_id,product_id,quantity_q,charged_m,cost_snapshot_m)
) STRICT;

-- INVOICES39 STEP
CREATE TABLE invoice_cash_adjustments (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, revision_id TEXT NOT NULL UNIQUE REFERENCES invoice_revisions(id), operation_id TEXT NOT NULL UNIQUE REFERENCES invoice_correction_operations(id), invoice_id TEXT NOT NULL REFERENCES sales(id), original_payment_id TEXT NOT NULL,
 amount_m INTEGER NOT NULL CHECK(amount_m<>0 AND amount_m%100=0), cash_date TEXT NOT NULL CHECK(length(cash_date)=10), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0), evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 1 AND 160), confirmation TEXT NOT NULL CHECK(confirmation IN ('ACTUAL_CASH_CONFIRMED','ADMIN_VERIFIED_PRIOR_FACTS')),
 FOREIGN KEY(original_payment_id,invoice_id) REFERENCES sale_payments(id,invoice_id)
) STRICT;

-- INVOICES39 STEP
CREATE TABLE invoice_settlements (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY, revision_id TEXT NOT NULL UNIQUE, invoice_id TEXT NOT NULL, original_payment_id TEXT NOT NULL,
 received_m INTEGER NOT NULL CHECK(received_m>0 AND received_m%100=0), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0), evidence_hash TEXT NOT NULL CHECK(length(evidence_hash)=64),
 FOREIGN KEY(revision_id,invoice_id) REFERENCES invoice_revisions(id,invoice_id), FOREIGN KEY(original_payment_id,invoice_id) REFERENCES sale_payments(id,invoice_id), UNIQUE(id,invoice_id), UNIQUE(id,revision_id,invoice_id)
) STRICT;

-- INVOICES39 STEP
CREATE TABLE invoice_correction_cancellations (
 request_key TEXT NOT NULL CHECK(length(request_key)=36) PRIMARY KEY, context TEXT NOT NULL CHECK(length(context)=64), actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id), session_ref TEXT NOT NULL, evidence TEXT NOT NULL CHECK(length(evidence) BETWEEN 1 AND 160), recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- INVOICES39 STEP
CREATE UNIQUE INDEX sale_lines_invoice_binding39 ON sale_lines(id,invoice_id,product_id);

-- INVOICES39 STEP
CREATE TABLE stock_movements_invoices_next (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 operation_id TEXT UNIQUE,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK(kind IN ('OPENING','RECEIVE','ADJUST','SALE','RETURN_RESTOCK','INVOICE_CORRECTION')),
 before_q INTEGER NOT NULL CHECK(before_q BETWEEN 0 AND 999999999999000000 AND before_q%1000000=0),
 delta_q INTEGER NOT NULL CHECK(delta_q!=0 AND delta_q%1000000=0),
 after_q INTEGER NOT NULL CHECK(after_q BETWEEN 0 AND 999999999999000000 AND after_q%1000000=0),
 cost_snapshot_m INTEGER NOT NULL CHECK(cost_snapshot_m BETWEEN 1 AND 99999999999999),
 balance_version INTEGER NOT NULL CHECK(balance_version>0),
 sale_line_id TEXT UNIQUE,
 return_disposition_id TEXT UNIQUE,
 correction_line_id TEXT UNIQUE,
 FOREIGN KEY(correction_line_id,product_id) REFERENCES invoice_revision_lines(id,product_id),
 FOREIGN KEY(return_disposition_id,product_id) REFERENCES return_dispositions(id,product_id),
 FOREIGN KEY(sale_line_id,product_id) REFERENCES sale_lines(id,product_id) ON DELETE RESTRICT,
 FOREIGN KEY(operation_id,product_id) REFERENCES inventory_operations(id,product_id) ON DELETE RESTRICT,
 UNIQUE(product_id,balance_version),
 CHECK(after_q-before_q=delta_q),
 CHECK((kind='OPENING' AND before_q=0 AND delta_q>0 AND balance_version=1) OR
       (kind='RECEIVE' AND delta_q>0 AND balance_version>1) OR
       (kind='ADJUST' AND balance_version>1) OR (kind='SALE' AND delta_q<0 AND balance_version>1) OR (kind='RETURN_RESTOCK' AND delta_q>0 AND balance_version>1) OR (kind='INVOICE_CORRECTION' AND balance_version>1)),
 CHECK((kind='INVOICE_CORRECTION' AND correction_line_id IS NOT NULL AND operation_id IS NULL AND sale_line_id IS NULL AND return_disposition_id IS NULL) OR (correction_line_id IS NULL AND ((kind='SALE' AND operation_id IS NULL AND sale_line_id IS NOT NULL AND return_disposition_id IS NULL) OR (kind IN ('OPENING','RECEIVE','ADJUST') AND operation_id IS NOT NULL AND sale_line_id IS NULL AND return_disposition_id IS NULL) OR (kind='RETURN_RESTOCK' AND operation_id IS NULL AND sale_line_id IS NULL AND return_disposition_id IS NOT NULL))))
) STRICT;

-- INVOICES39 STEP
INSERT INTO stock_movements_invoices_next(rowid,id,operation_id,product_id,kind,before_q,delta_q,after_q,cost_snapshot_m,balance_version,sale_line_id,return_disposition_id) SELECT rowid,id,operation_id,product_id,kind,before_q,delta_q,after_q,cost_snapshot_m,balance_version,sale_line_id,return_disposition_id FROM stock_movements;

-- INVOICES39 STEP
DROP TABLE stock_movements;

-- INVOICES39 STEP
ALTER TABLE stock_movements_invoices_next RENAME TO stock_movements;

-- INVOICES39 STEP
CREATE TABLE cash_movements_invoices_next (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('SALE','REFUND','EXPENSE','INVOICE_CORRECTION')),
 sale_payment_id TEXT UNIQUE REFERENCES sale_payments(id),
 refund_payment_id TEXT UNIQUE REFERENCES refund_payments(id),
 amount_m INTEGER NOT NULL CHECK(amount_m!=0 AND amount_m%100=0),
 cash_date TEXT NOT NULL CHECK(length(cash_date)=10),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 provenance TEXT NOT NULL CHECK(provenance IN ('SOURCE_RECORDED','OPERATOR_CONFIRMED','ADMIN_ATTESTED')),
 expense_revision_id TEXT UNIQUE REFERENCES expense_revisions(id),
 correction_adjustment_id TEXT UNIQUE REFERENCES invoice_cash_adjustments(id),
 CHECK((kind='INVOICE_CORRECTION' AND correction_adjustment_id IS NOT NULL AND sale_payment_id IS NULL AND refund_payment_id IS NULL AND expense_revision_id IS NULL) OR (correction_adjustment_id IS NULL AND ((expense_revision_id IS NULL AND ((kind='SALE' AND sale_payment_id IS NOT NULL AND refund_payment_id IS NULL AND amount_m>0) OR (kind='REFUND' AND sale_payment_id IS NULL AND refund_payment_id IS NOT NULL AND amount_m<0))) OR (kind='EXPENSE' AND expense_revision_id IS NOT NULL AND sale_payment_id IS NULL AND refund_payment_id IS NULL))))
) STRICT;

-- INVOICES39 STEP
INSERT INTO cash_movements_invoices_next(rowid,id,kind,sale_payment_id,refund_payment_id,amount_m,cash_date,recorded_at_ms,provenance,expense_revision_id) SELECT rowid,id,kind,sale_payment_id,refund_payment_id,amount_m,cash_date,recorded_at_ms,provenance,expense_revision_id FROM cash_movements;

-- INVOICES39 STEP
DROP TABLE cash_movements;

-- INVOICES39 STEP
ALTER TABLE cash_movements_invoices_next RENAME TO cash_movements;

-- INVOICES39 STEP
CREATE TABLE financial_events_invoices_next (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('SALE','REFUND','RESTOCK','EXPENSE','INVOICE_CORRECTION')),
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
 correction_line_id TEXT UNIQUE REFERENCES invoice_revision_lines(id),
 CHECK((kind='INVOICE_CORRECTION' AND correction_line_id IS NOT NULL AND sale_line_id IS NULL AND return_line_id IS NULL AND disposition_id IS NULL AND expense_revision_id IS NULL AND expense_delta_m=0 AND revenue_delta_m%100=0) OR (correction_line_id IS NULL AND ((expense_revision_id IS NULL AND expense_delta_m=0 AND ((kind='SALE' AND sale_line_id IS NOT NULL AND return_line_id IS NULL AND disposition_id IS NULL AND revenue_delta_m>0 AND revenue_delta_m%100=0 AND cogs_delta_m>0 AND valuation_delta_m=0) OR (kind='REFUND' AND sale_line_id IS NULL AND return_line_id IS NOT NULL AND disposition_id IS NULL AND revenue_delta_m<0 AND revenue_delta_m%100=0 AND cogs_delta_m=0 AND valuation_delta_m=0) OR (kind='RESTOCK' AND sale_line_id IS NULL AND return_line_id IS NULL AND disposition_id IS NOT NULL AND revenue_delta_m=0 AND cogs_delta_m<0))) OR (kind='EXPENSE' AND expense_revision_id IS NOT NULL AND sale_line_id IS NULL AND return_line_id IS NULL AND disposition_id IS NULL AND revenue_delta_m=0 AND cogs_delta_m=0 AND valuation_delta_m=0 AND expense_delta_m<>0))))
) STRICT;

-- INVOICES39 STEP
INSERT INTO financial_events_invoices_next(rowid,id,kind,sale_line_id,return_line_id,disposition_id,revenue_delta_m,cogs_delta_m,valuation_delta_m,effective_date,recorded_at_ms,expense_revision_id,expense_delta_m) SELECT rowid,id,kind,sale_line_id,return_line_id,disposition_id,revenue_delta_m,cogs_delta_m,valuation_delta_m,effective_date,recorded_at_ms,expense_revision_id,expense_delta_m FROM financial_events;

-- INVOICES39 STEP
DROP TABLE financial_events;

-- INVOICES39 STEP
ALTER TABLE financial_events_invoices_next RENAME TO financial_events;

-- INVOICES39 STEP
CREATE TABLE returns_invoices_next (
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
 invoice_revision_id TEXT, invoice_settlement_id TEXT,
 FOREIGN KEY(invoice_revision_id,invoice_id) REFERENCES invoice_revisions(id,invoice_id),
 FOREIGN KEY(invoice_settlement_id,invoice_revision_id,invoice_id) REFERENCES invoice_settlements(id,revision_id,invoice_id),
 CHECK((invoice_revision_id IS NULL AND invoice_settlement_id IS NULL) OR (invoice_revision_id IS NOT NULL AND invoice_settlement_id IS NOT NULL)),
 FOREIGN KEY(original_payment_id,invoice_id) REFERENCES sale_payments(id,invoice_id),
 FOREIGN KEY(refund_payment_id,id,total_m) REFERENCES refund_payments(id,return_id,amount_m) DEFERRABLE INITIALLY DEFERRED,
 UNIQUE(id,operation_id),
 UNIQUE(id,invoice_id)
) STRICT;

-- INVOICES39 STEP
INSERT INTO returns_invoices_next(rowid,id,operation_id,invoice_id,original_payment_id,line_count,total_m,cash_date,recorded_at_ms,refund_payment_id,provenance) SELECT rowid,id,operation_id,invoice_id,original_payment_id,line_count,total_m,cash_date,recorded_at_ms,refund_payment_id,provenance FROM returns;

-- INVOICES39 STEP
DROP TABLE returns;

-- INVOICES39 STEP
ALTER TABLE returns_invoices_next RENAME TO returns;

-- INVOICES39 STEP
CREATE TABLE return_lines_invoices_next (
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
 original_line_source_id TEXT, revision_line_id TEXT,
 FOREIGN KEY(revision_line_id,invoice_id,product_id,original_quantity_q,original_paid_m,original_cost_m) REFERENCES invoice_revision_lines(id,invoice_id,product_id,quantity_q,charged_m,cost_snapshot_m),
 CHECK((original_line_source_id=sale_line_id AND original_line_source_id IS NOT NULL AND revision_line_id IS NULL) OR (original_line_source_id IS NULL AND revision_line_id IS NOT NULL)),
 FOREIGN KEY(return_id,invoice_id) REFERENCES returns(id,invoice_id),
 FOREIGN KEY(original_line_source_id,invoice_id,product_id,original_quantity_q,original_paid_m,original_cost_m) REFERENCES sale_lines(id,invoice_id,product_id,quantity_q,charged_m,cost_snapshot_m),
 CHECK(after_q=prior_q+quantity_q AND after_q<=original_quantity_q AND after_m=prior_m+refund_m AND after_m<=original_paid_m),
 CHECK(original_cost_allocation_m/(quantity_q/1000000)=original_cost_m AND original_cost_allocation_m%(quantity_q/1000000)=0),
 UNIQUE(return_id,sale_line_id),
 UNIQUE(sale_line_id,after_q),
 UNIQUE(id,product_id)
) STRICT;

-- INVOICES39 STEP
INSERT INTO return_lines_invoices_next(rowid,id,return_id,invoice_id,sale_line_id,product_id,original_quantity_q,original_paid_m,original_cost_m,quantity_q,refund_m,prior_q,prior_m,after_q,after_m,original_cost_allocation_m,exact_numerator,policy,original_line_source_id) SELECT rowid,id,return_id,invoice_id,sale_line_id,product_id,original_quantity_q,original_paid_m,original_cost_m,quantity_q,refund_m,prior_q,prior_m,after_q,after_m,original_cost_allocation_m,exact_numerator,policy,sale_line_id FROM return_lines;

-- INVOICES39 STEP
DROP TABLE return_lines;

-- INVOICES39 STEP
ALTER TABLE return_lines_invoices_next RENAME TO return_lines;

-- INVOICES39 STEP
CREATE TABLE refund_payments_invoices_next (
 id TEXT NOT NULL CHECK(length(id)=36) PRIMARY KEY,
 return_id TEXT NOT NULL CHECK(length(return_id)=36) REFERENCES returns(id) ON DELETE RESTRICT UNIQUE,
 invoice_id TEXT NOT NULL CHECK(length(invoice_id)=36),
 original_payment_id TEXT NOT NULL CHECK(length(original_payment_id)=36),
 amount_m INTEGER NOT NULL CHECK(amount_m>0 AND amount_m%100=0),
 cash_date TEXT NOT NULL CHECK(length(cash_date)=10),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 confirmation TEXT NOT NULL CHECK(confirmation IN ('CASH_HANDED_OVER','ADMIN_VERIFIED_PRIOR_PAYOUT')),
 invoice_settlement_id TEXT, FOREIGN KEY(invoice_settlement_id,invoice_id) REFERENCES invoice_settlements(id,invoice_id),
 FOREIGN KEY(original_payment_id,invoice_id) REFERENCES sale_payments(id,invoice_id),
 UNIQUE(id,return_id,amount_m)
) STRICT;

-- INVOICES39 STEP
INSERT INTO refund_payments_invoices_next(rowid,id,return_id,invoice_id,original_payment_id,amount_m,cash_date,recorded_at_ms,confirmation) SELECT rowid,id,return_id,invoice_id,original_payment_id,amount_m,cash_date,recorded_at_ms,confirmation FROM refund_payments;

-- INVOICES39 STEP
DROP TABLE refund_payments;

-- INVOICES39 STEP
ALTER TABLE refund_payments_invoices_next RENAME TO refund_payments;

-- INVOICES39 STEP
CREATE UNIQUE INDEX stock_opening_unique ON stock_movements(product_id) WHERE kind='OPENING';

-- INVOICES39 STEP
CREATE INDEX returns_invoice ON returns(invoice_id,recorded_at_ms,id);

-- INVOICES39 STEP
CREATE INDEX return_lines_original ON return_lines(sale_line_id,after_q);

-- INVOICES39 STEP
CREATE INDEX cash_movements_date ON cash_movements(cash_date,recorded_at_ms,id);

-- INVOICES39 STEP
CREATE INDEX financial_events_date ON financial_events(effective_date,recorded_at_ms,id);

-- INVOICES39 STEP
CREATE INDEX invoice_revisions_latest ON invoice_revisions(invoice_id,revision);

-- INVOICES39 STEP
CREATE INDEX invoice_revisions_period ON invoice_revisions(effective_date,recorded_at_ms,id);

-- INVOICES39 STEP
CREATE INDEX invoice_requests_target ON invoice_correction_requests(invoice_id,created_at_ms,id);

-- INVOICES39 STEP
CREATE INDEX invoice_adjustments_invoice ON invoice_cash_adjustments(invoice_id,recorded_at_ms,id);

-- INVOICES39 STEP
CREATE INDEX invoice_revision_lines_product ON invoice_revision_lines(product_id,revision_id);

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_requests_insert_guard BEFORE INSERT ON invoice_correction_requests WHEN EXISTS(SELECT 1 FROM invoice_correction_requests WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM invoice_correction_requests WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM invoice_correction_requests WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM invoice_correction_cancellations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_requests_no_update BEFORE UPDATE ON invoice_correction_requests BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_requests_no_delete BEFORE DELETE ON invoice_correction_requests BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_requests_positive_rowid AFTER INSERT ON invoice_correction_requests WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_authorizations_insert_guard BEFORE INSERT ON invoice_correction_authorizations WHEN EXISTS(SELECT 1 FROM invoice_correction_authorizations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM invoice_correction_authorizations WHERE id=NEW.id AND request_id=NEW.request_id) OR EXISTS(SELECT 1 FROM invoice_correction_authorizations WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_authorizations_no_update BEFORE UPDATE ON invoice_correction_authorizations BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_authorizations_no_delete BEFORE DELETE ON invoice_correction_authorizations BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_authorizations_positive_rowid AFTER INSERT ON invoice_correction_authorizations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_operations_insert_guard BEFORE INSERT ON invoice_correction_operations WHEN EXISTS(SELECT 1 FROM invoice_correction_operations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM invoice_correction_operations WHERE revision_id=NEW.revision_id) OR EXISTS(SELECT 1 FROM invoice_correction_operations WHERE authorization_id=NEW.authorization_id) OR EXISTS(SELECT 1 FROM invoice_correction_operations WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM invoice_correction_operations WHERE request_id=NEW.request_id) OR EXISTS(SELECT 1 FROM invoice_correction_operations WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM invoice_correction_cancellations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_operations_no_update BEFORE UPDATE ON invoice_correction_operations BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_operations_no_delete BEFORE DELETE ON invoice_correction_operations BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_operations_positive_rowid AFTER INSERT ON invoice_correction_operations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_revisions_insert_guard BEFORE INSERT ON invoice_revisions WHEN EXISTS(SELECT 1 FROM invoice_revisions WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM invoice_revisions WHERE id=NEW.id AND invoice_id=NEW.invoice_id) OR EXISTS(SELECT 1 FROM invoice_revisions WHERE invoice_id=NEW.invoice_id AND revision=NEW.revision) OR EXISTS(SELECT 1 FROM invoice_revisions WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM invoice_revisions WHERE previous_id=NEW.previous_id) OR EXISTS(SELECT 1 FROM invoice_revisions WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_revisions_no_update BEFORE UPDATE ON invoice_revisions BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_revisions_no_delete BEFORE DELETE ON invoice_revisions BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_revisions_positive_rowid AFTER INSERT ON invoice_revisions WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_revision_lines_insert_guard BEFORE INSERT ON invoice_revision_lines WHEN EXISTS(SELECT 1 FROM invoice_revision_lines WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM invoice_revision_lines WHERE id=NEW.id AND invoice_id=NEW.invoice_id AND product_id=NEW.product_id AND quantity_q=NEW.quantity_q AND charged_m=NEW.charged_m AND cost_snapshot_m=NEW.cost_snapshot_m) OR EXISTS(SELECT 1 FROM invoice_revision_lines WHERE id=NEW.id AND product_id=NEW.product_id) OR EXISTS(SELECT 1 FROM invoice_revision_lines WHERE revision_id=NEW.revision_id AND line_no=NEW.line_no) OR EXISTS(SELECT 1 FROM invoice_revision_lines WHERE revision_id=NEW.revision_id AND sale_line_id=NEW.sale_line_id) OR EXISTS(SELECT 1 FROM invoice_revision_lines WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_revision_lines_no_update BEFORE UPDATE ON invoice_revision_lines BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_revision_lines_no_delete BEFORE DELETE ON invoice_revision_lines BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_revision_lines_positive_rowid AFTER INSERT ON invoice_revision_lines WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_cash_adjustments_insert_guard BEFORE INSERT ON invoice_cash_adjustments WHEN EXISTS(SELECT 1 FROM invoice_cash_adjustments WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM invoice_cash_adjustments WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM invoice_cash_adjustments WHERE revision_id=NEW.revision_id) OR EXISTS(SELECT 1 FROM invoice_cash_adjustments WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_cash_adjustments_no_update BEFORE UPDATE ON invoice_cash_adjustments BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_cash_adjustments_no_delete BEFORE DELETE ON invoice_cash_adjustments BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_cash_adjustments_positive_rowid AFTER INSERT ON invoice_cash_adjustments WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_settlements_insert_guard BEFORE INSERT ON invoice_settlements WHEN EXISTS(SELECT 1 FROM invoice_settlements WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM invoice_settlements WHERE id=NEW.id AND revision_id=NEW.revision_id AND invoice_id=NEW.invoice_id) OR EXISTS(SELECT 1 FROM invoice_settlements WHERE id=NEW.id AND invoice_id=NEW.invoice_id) OR EXISTS(SELECT 1 FROM invoice_settlements WHERE revision_id=NEW.revision_id) OR EXISTS(SELECT 1 FROM invoice_settlements WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_settlements_no_update BEFORE UPDATE ON invoice_settlements BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_settlements_no_delete BEFORE DELETE ON invoice_settlements BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_settlements_positive_rowid AFTER INSERT ON invoice_settlements WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_cancellations_insert_guard BEFORE INSERT ON invoice_correction_cancellations WHEN EXISTS(SELECT 1 FROM invoice_correction_cancellations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM invoice_correction_cancellations WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM invoice_correction_operations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_cancellations_no_update BEFORE UPDATE ON invoice_correction_cancellations BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_cancellations_no_delete BEFORE DELETE ON invoice_correction_cancellations BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER invoice_correction_cancellations_positive_rowid AFTER INSERT ON invoice_correction_cancellations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER stock_movements_insert_guard BEFORE INSERT ON stock_movements WHEN EXISTS(SELECT 1 FROM stock_movements WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM stock_movements WHERE product_id=NEW.product_id AND balance_version=NEW.balance_version) OR EXISTS(SELECT 1 FROM stock_movements WHERE correction_line_id=NEW.correction_line_id) OR EXISTS(SELECT 1 FROM stock_movements WHERE return_disposition_id=NEW.return_disposition_id) OR EXISTS(SELECT 1 FROM stock_movements WHERE sale_line_id=NEW.sale_line_id) OR EXISTS(SELECT 1 FROM stock_movements WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM stock_movements WHERE id=NEW.id) OR (NEW.kind='OPENING' AND EXISTS(SELECT 1 FROM stock_movements WHERE kind='OPENING' AND product_id=NEW.product_id)) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER stock_movements_no_update BEFORE UPDATE ON stock_movements BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER stock_movements_no_delete BEFORE DELETE ON stock_movements BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER stock_movements_positive_rowid AFTER INSERT ON stock_movements WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER cash_movements_insert_guard BEFORE INSERT ON cash_movements WHEN EXISTS(SELECT 1 FROM cash_movements WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM cash_movements WHERE correction_adjustment_id=NEW.correction_adjustment_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE expense_revision_id=NEW.expense_revision_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE refund_payment_id=NEW.refund_payment_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE sale_payment_id=NEW.sale_payment_id) OR EXISTS(SELECT 1 FROM cash_movements WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER cash_movements_no_update BEFORE UPDATE ON cash_movements BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER cash_movements_no_delete BEFORE DELETE ON cash_movements BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER cash_movements_positive_rowid AFTER INSERT ON cash_movements WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER financial_events_insert_guard BEFORE INSERT ON financial_events WHEN EXISTS(SELECT 1 FROM financial_events WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM financial_events WHERE correction_line_id=NEW.correction_line_id) OR EXISTS(SELECT 1 FROM financial_events WHERE expense_revision_id=NEW.expense_revision_id) OR EXISTS(SELECT 1 FROM financial_events WHERE disposition_id=NEW.disposition_id) OR EXISTS(SELECT 1 FROM financial_events WHERE return_line_id=NEW.return_line_id) OR EXISTS(SELECT 1 FROM financial_events WHERE sale_line_id=NEW.sale_line_id) OR EXISTS(SELECT 1 FROM financial_events WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER financial_events_no_update BEFORE UPDATE ON financial_events BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER financial_events_no_delete BEFORE DELETE ON financial_events BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER financial_events_positive_rowid AFTER INSERT ON financial_events WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER returns_insert_guard BEFORE INSERT ON returns WHEN EXISTS(SELECT 1 FROM returns WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM returns WHERE id=NEW.id AND invoice_id=NEW.invoice_id) OR EXISTS(SELECT 1 FROM returns WHERE id=NEW.id AND operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM returns WHERE refund_payment_id=NEW.refund_payment_id) OR EXISTS(SELECT 1 FROM returns WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM returns WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER returns_no_update BEFORE UPDATE ON returns BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER returns_no_delete BEFORE DELETE ON returns BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER returns_positive_rowid AFTER INSERT ON returns WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER return_lines_insert_guard BEFORE INSERT ON return_lines WHEN EXISTS(SELECT 1 FROM return_lines WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM return_lines WHERE id=NEW.id AND product_id=NEW.product_id) OR EXISTS(SELECT 1 FROM return_lines WHERE sale_line_id=NEW.sale_line_id AND after_q=NEW.after_q) OR EXISTS(SELECT 1 FROM return_lines WHERE return_id=NEW.return_id AND sale_line_id=NEW.sale_line_id) OR EXISTS(SELECT 1 FROM return_lines WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER return_lines_no_update BEFORE UPDATE ON return_lines BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER return_lines_no_delete BEFORE DELETE ON return_lines BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER return_lines_positive_rowid AFTER INSERT ON return_lines WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER refund_payments_insert_guard BEFORE INSERT ON refund_payments WHEN EXISTS(SELECT 1 FROM refund_payments WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM refund_payments WHERE id=NEW.id AND return_id=NEW.return_id AND amount_m=NEW.amount_m) OR EXISTS(SELECT 1 FROM refund_payments WHERE return_id=NEW.return_id) OR EXISTS(SELECT 1 FROM refund_payments WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Invoice history conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER refund_payments_no_update BEFORE UPDATE ON refund_payments BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER refund_payments_no_delete BEFORE DELETE ON refund_payments BEGIN SELECT RAISE(ABORT,'Invoice history immutable.'); END;

-- INVOICES39 STEP
CREATE TRIGGER refund_payments_positive_rowid AFTER INSERT ON refund_payments WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid invoice history identity.'); END;

-- INVOICES39 STEP
CREATE TRIGGER stock_movements_sale_line_guard BEFORE INSERT ON stock_movements WHEN NEW.sale_line_id IS NOT NULL AND EXISTS(SELECT 1 FROM stock_movements WHERE sale_line_id=NEW.sale_line_id) BEGIN SELECT RAISE(ABORT,'Sale movement conflict.'); END;

-- INVOICES39 STEP
CREATE TRIGGER stock_movements_return_guard BEFORE INSERT ON stock_movements WHEN NEW.return_disposition_id IS NOT NULL AND EXISTS(SELECT 1 FROM stock_movements WHERE return_disposition_id=NEW.return_disposition_id) BEGIN SELECT RAISE(ABORT,'Return movement conflict.'); END;

