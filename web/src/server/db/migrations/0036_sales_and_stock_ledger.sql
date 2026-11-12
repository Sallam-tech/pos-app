-- SALES36 STEP
CREATE TABLE sale_operations (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 request_key TEXT NOT NULL UNIQUE CHECK(length(request_key)=36),
 context_fingerprint TEXT NOT NULL CHECK(length(context_fingerprint)=64 AND context_fingerprint NOT GLOB '*[^0-9a-f]*'),
 actor_id TEXT NOT NULL CHECK(actor_id='SALESPERSON') REFERENCES auth_principals(id) ON DELETE RESTRICT,
 actor_session_ref TEXT NOT NULL CHECK(length(actor_session_ref) BETWEEN 1 AND 128),
 payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64 AND payload_hash NOT GLOB '*[^0-9a-f]*'),
 payload_json TEXT NOT NULL CHECK(length(payload_json)<=64000 AND json_valid(payload_json)),
 invoice_id TEXT NOT NULL UNIQUE CHECK(length(invoice_id)=36),
 policy TEXT NOT NULL CHECK(policy='PKR_UNIT_HALF_UP_V1'),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 FOREIGN KEY(invoice_id,id) REFERENCES sales(id,operation_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
) STRICT;

-- SALES36 STEP
CREATE TABLE sales (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 invoice_number TEXT NOT NULL UNIQUE CHECK(invoice_number='TEST-'||id),
 operation_id TEXT NOT NULL UNIQUE REFERENCES sale_operations(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 actor_id TEXT NOT NULL CHECK(actor_id='SALESPERSON') REFERENCES auth_principals(id) ON DELETE RESTRICT,
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 business_date TEXT NOT NULL CHECK(length(business_date)=10),
 line_count INTEGER NOT NULL CHECK(line_count BETWEEN 1 AND 50),
 charged_m INTEGER NOT NULL CHECK(charged_m>0 AND charged_m%100=0),
 cogs_m INTEGER NOT NULL CHECK(cogs_m>0),
 profit_m INTEGER NOT NULL CHECK(profit_m>=0 AND profit_m=charged_m-cogs_m),
 policy TEXT NOT NULL CHECK(policy='PKR_UNIT_HALF_UP_V1'),
 UNIQUE(id,operation_id)
) STRICT;

-- SALES36 STEP
CREATE TABLE sale_lines (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 invoice_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
 line_no INTEGER NOT NULL CHECK(line_no BETWEEN 1 AND 50),
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 code TEXT NOT NULL CHECK(length(code) BETWEEN 1 AND 32),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 size_label TEXT CHECK(size_label IS NULL OR length(size_label) BETWEEN 1 AND 40),
 unit TEXT NOT NULL CHECK(unit IN ('PACK','BOX')),
 quantity_q INTEGER NOT NULL CHECK(quantity_q BETWEEN 1000000 AND 999999999999000000 AND quantity_q%1000000=0),
 unit_price_m INTEGER NOT NULL CHECK(unit_price_m BETWEEN 100 AND 99999999999900 AND unit_price_m%100=0),
 discount_percent INTEGER NOT NULL CHECK(discount_percent BETWEEN 0 AND 100),
 exact_unit_numerator INTEGER NOT NULL CHECK(exact_unit_numerator=unit_price_m/100*(100-discount_percent)),
 exact_unit_denominator INTEGER NOT NULL CHECK(exact_unit_denominator=100),
 unit_payable_m INTEGER NOT NULL CHECK(unit_payable_m>0 AND unit_payable_m%100=0 AND unit_payable_m/100=exact_unit_numerator/100+CASE WHEN exact_unit_numerator%100>=50 THEN 1 ELSE 0 END),
 charged_m INTEGER NOT NULL CHECK(charged_m>0 AND charged_m%100=0 AND charged_m/(quantity_q/1000000)=unit_payable_m AND charged_m%(quantity_q/1000000)=0),
 cost_snapshot_m INTEGER NOT NULL CHECK(cost_snapshot_m BETWEEN 1 AND 99999999999999),
 cogs_m INTEGER NOT NULL CHECK(cogs_m>0 AND cogs_m/(quantity_q/1000000)=cost_snapshot_m AND cogs_m%(quantity_q/1000000)=0 AND charged_m>=cogs_m),
 UNIQUE(invoice_id,line_no), UNIQUE(invoice_id,product_id), UNIQUE(id,product_id)
) STRICT;

-- SALES36 STEP
CREATE TABLE invoice_snapshots (
 invoice_id TEXT PRIMARY KEY NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
 format_version INTEGER NOT NULL CHECK(format_version=1),
 receipt_json TEXT NOT NULL CHECK(length(CAST(receipt_json AS BLOB))<=65536 AND json_valid(receipt_json)),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- SALES36 STEP
CREATE TABLE sale_payments (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 invoice_id TEXT NOT NULL UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
 tendered_m INTEGER NOT NULL CHECK(tendered_m>0 AND tendered_m%100=0),
 change_m INTEGER NOT NULL CHECK(change_m>=0 AND change_m%100=0),
 net_received_m INTEGER NOT NULL CHECK(net_received_m>0 AND net_received_m%100=0 AND tendered_m>=net_received_m AND change_m=tendered_m-net_received_m),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- SALES36 STEP
CREATE TABLE sale_cancellations (
 request_key TEXT PRIMARY KEY NOT NULL CHECK(length(request_key)=36),
 context_fingerprint TEXT NOT NULL CHECK(length(context_fingerprint)=64 AND context_fingerprint NOT GLOB '*[^0-9a-f]*'),
 actor_id TEXT NOT NULL CHECK(actor_id='ADMIN') REFERENCES auth_principals(id) ON DELETE RESTRICT,
 actor_session_ref TEXT NOT NULL CHECK(length(actor_session_ref) BETWEEN 1 AND 128),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0)
) STRICT;

-- SALES36 STEP
CREATE TABLE stock_movements_next (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 operation_id TEXT UNIQUE,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK(kind IN ('OPENING','RECEIVE','ADJUST','SALE')),
 before_q INTEGER NOT NULL CHECK(before_q BETWEEN 0 AND 999999999999000000 AND before_q%1000000=0),
 delta_q INTEGER NOT NULL CHECK(delta_q!=0 AND delta_q%1000000=0),
 after_q INTEGER NOT NULL CHECK(after_q BETWEEN 0 AND 999999999999000000 AND after_q%1000000=0),
 cost_snapshot_m INTEGER NOT NULL CHECK(cost_snapshot_m BETWEEN 1 AND 99999999999999),
 balance_version INTEGER NOT NULL CHECK(balance_version>0),
 sale_line_id TEXT UNIQUE,
 FOREIGN KEY(sale_line_id,product_id) REFERENCES sale_lines(id,product_id) ON DELETE RESTRICT,
 FOREIGN KEY(operation_id,product_id) REFERENCES inventory_operations(id,product_id) ON DELETE RESTRICT,
 UNIQUE(product_id,balance_version),
 CHECK(after_q-before_q=delta_q),
 CHECK((kind='OPENING' AND before_q=0 AND delta_q>0 AND balance_version=1) OR
       (kind='RECEIVE' AND delta_q>0 AND balance_version>1) OR
       (kind='ADJUST' AND balance_version>1) OR (kind='SALE' AND delta_q<0 AND balance_version>1)),
 CHECK((kind='SALE' AND operation_id IS NULL AND sale_line_id IS NOT NULL) OR (kind!='SALE' AND operation_id IS NOT NULL AND sale_line_id IS NULL))
) STRICT;

-- SALES36 STEP
INSERT INTO stock_movements_next(rowid,id,operation_id,product_id,kind,before_q,delta_q,after_q,cost_snapshot_m,balance_version,sale_line_id) SELECT rowid,id,operation_id,product_id,kind,before_q,delta_q,after_q,cost_snapshot_m,balance_version,NULL FROM stock_movements;

-- SALES36 STEP
DROP TABLE stock_movements;

-- SALES36 STEP
ALTER TABLE stock_movements_next RENAME TO stock_movements;

-- SALES36 STEP
CREATE UNIQUE INDEX stock_opening_unique ON stock_movements(product_id) WHERE kind='OPENING';

-- SALES36 STEP
CREATE TRIGGER stock_movements_insert_guard BEFORE INSERT ON stock_movements
WHEN EXISTS(SELECT 1 FROM stock_movements WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE id=NEW.id) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE operation_id=NEW.operation_id) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE product_id=NEW.product_id AND balance_version=NEW.balance_version) OR
 (NEW.kind='OPENING' AND EXISTS(SELECT 1 FROM stock_movements WHERE product_id=NEW.product_id AND kind='OPENING'))
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;

-- SALES36 STEP
CREATE TRIGGER stock_movements_no_update BEFORE UPDATE ON stock_movements
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;

-- SALES36 STEP
CREATE TRIGGER stock_movements_no_delete BEFORE DELETE ON stock_movements
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;

-- SALES36 STEP
CREATE TRIGGER stock_movements_positive_rowid AFTER INSERT ON stock_movements
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;

-- SALES36 STEP
CREATE TRIGGER sale_operations_insert_guard BEFORE INSERT ON sale_operations WHEN EXISTS(SELECT 1 FROM sale_operations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM sale_operations WHERE invoice_id=NEW.invoice_id) OR EXISTS(SELECT 1 FROM sale_operations WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM sale_operations WHERE id=NEW.id) OR EXISTS(SELECT 1 FROM sale_cancellations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Sale history conflict.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_operations_no_update BEFORE UPDATE ON sale_operations BEGIN SELECT RAISE(ABORT,'Sale history is immutable.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_operations_no_delete BEFORE DELETE ON sale_operations BEGIN SELECT RAISE(ABORT,'Sale history is immutable.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_operations_positive_rowid AFTER INSERT ON sale_operations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid history identity.'); END;

-- SALES36 STEP
CREATE TRIGGER sales_insert_guard BEFORE INSERT ON sales WHEN EXISTS(SELECT 1 FROM sales WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM sales WHERE id=NEW.id AND operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM sales WHERE operation_id=NEW.operation_id) OR EXISTS(SELECT 1 FROM sales WHERE invoice_number=NEW.invoice_number) OR EXISTS(SELECT 1 FROM sales WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Sale history conflict.'); END;

-- SALES36 STEP
CREATE TRIGGER sales_no_update BEFORE UPDATE ON sales BEGIN SELECT RAISE(ABORT,'Sale history is immutable.'); END;

-- SALES36 STEP
CREATE TRIGGER sales_no_delete BEFORE DELETE ON sales BEGIN SELECT RAISE(ABORT,'Sale history is immutable.'); END;

-- SALES36 STEP
CREATE TRIGGER sales_positive_rowid AFTER INSERT ON sales WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid history identity.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_lines_insert_guard BEFORE INSERT ON sale_lines WHEN EXISTS(SELECT 1 FROM sale_lines WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM sale_lines WHERE id=NEW.id AND product_id=NEW.product_id) OR EXISTS(SELECT 1 FROM sale_lines WHERE invoice_id=NEW.invoice_id AND product_id=NEW.product_id) OR EXISTS(SELECT 1 FROM sale_lines WHERE invoice_id=NEW.invoice_id AND line_no=NEW.line_no) OR EXISTS(SELECT 1 FROM sale_lines WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Sale history conflict.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_lines_no_update BEFORE UPDATE ON sale_lines BEGIN SELECT RAISE(ABORT,'Sale history is immutable.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_lines_no_delete BEFORE DELETE ON sale_lines BEGIN SELECT RAISE(ABORT,'Sale history is immutable.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_lines_positive_rowid AFTER INSERT ON sale_lines WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid history identity.'); END;

-- SALES36 STEP
CREATE TRIGGER invoice_snapshots_insert_guard BEFORE INSERT ON invoice_snapshots WHEN EXISTS(SELECT 1 FROM invoice_snapshots WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM invoice_snapshots WHERE invoice_id=NEW.invoice_id) BEGIN SELECT RAISE(ABORT,'Sale history conflict.'); END;

-- SALES36 STEP
CREATE TRIGGER invoice_snapshots_no_update BEFORE UPDATE ON invoice_snapshots BEGIN SELECT RAISE(ABORT,'Sale history is immutable.'); END;

-- SALES36 STEP
CREATE TRIGGER invoice_snapshots_no_delete BEFORE DELETE ON invoice_snapshots BEGIN SELECT RAISE(ABORT,'Sale history is immutable.'); END;

-- SALES36 STEP
CREATE TRIGGER invoice_snapshots_positive_rowid AFTER INSERT ON invoice_snapshots WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid history identity.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_payments_insert_guard BEFORE INSERT ON sale_payments WHEN EXISTS(SELECT 1 FROM sale_payments WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM sale_payments WHERE invoice_id=NEW.invoice_id) OR EXISTS(SELECT 1 FROM sale_payments WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Sale history conflict.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_payments_no_update BEFORE UPDATE ON sale_payments BEGIN SELECT RAISE(ABORT,'Sale history is immutable.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_payments_no_delete BEFORE DELETE ON sale_payments BEGIN SELECT RAISE(ABORT,'Sale history is immutable.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_payments_positive_rowid AFTER INSERT ON sale_payments WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid history identity.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_cancellations_insert_guard BEFORE INSERT ON sale_cancellations WHEN EXISTS(SELECT 1 FROM sale_cancellations WHERE rowid=NEW.rowid) OR EXISTS(SELECT 1 FROM sale_cancellations WHERE request_key=NEW.request_key) OR EXISTS(SELECT 1 FROM sale_operations WHERE request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'Sale history conflict.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_cancellations_no_update BEFORE UPDATE ON sale_cancellations BEGIN SELECT RAISE(ABORT,'Sale history is immutable.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_cancellations_no_delete BEFORE DELETE ON sale_cancellations BEGIN SELECT RAISE(ABORT,'Sale history is immutable.'); END;

-- SALES36 STEP
CREATE TRIGGER sale_cancellations_positive_rowid AFTER INSERT ON sale_cancellations WHEN NEW.rowid<=0 BEGIN SELECT RAISE(ABORT,'Invalid history identity.'); END;

-- SALES36 STEP
CREATE TRIGGER stock_movements_sale_line_guard BEFORE INSERT ON stock_movements WHEN NEW.sale_line_id IS NOT NULL AND EXISTS(SELECT 1 FROM stock_movements WHERE sale_line_id=NEW.sale_line_id) BEGIN SELECT RAISE(ABORT,'Sale movement conflict.'); END;

-- SALES36 STEP
CREATE INDEX sales_date ON sales(business_date,recorded_at_ms,id);

-- SALES36 STEP
CREATE INDEX sale_lines_product ON sale_lines(product_id,invoice_id);
