-- REVIEW CANDIDATE ONLY: not an application migration or activation authority.

-- REVIEW PROGRAM 0019_inventory_cancellations.sql
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

-- REVIEW PROGRAM 0020_inventory_operations_insert_guard.sql
CREATE TRIGGER inventory_operations_insert_guard BEFORE INSERT ON inventory_operations
WHEN EXISTS(SELECT 1 FROM inventory_operations WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM inventory_operations WHERE id=NEW.id) OR
 EXISTS(SELECT 1 FROM inventory_operations WHERE request_key=NEW.request_key) OR
 EXISTS(SELECT 1 FROM inventory_cancellations WHERE request_key=NEW.request_key)
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;

-- REVIEW PROGRAM 0021_inventory_operations_no_update.sql
CREATE TRIGGER inventory_operations_no_update BEFORE UPDATE ON inventory_operations
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;

-- REVIEW PROGRAM 0022_inventory_operations_no_delete.sql
CREATE TRIGGER inventory_operations_no_delete BEFORE DELETE ON inventory_operations
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;

-- REVIEW PROGRAM 0023_stock_movements_insert_guard.sql
CREATE TRIGGER stock_movements_insert_guard BEFORE INSERT ON stock_movements
WHEN EXISTS(SELECT 1 FROM stock_movements WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE id=NEW.id) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE operation_id=NEW.operation_id) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE product_id=NEW.product_id AND balance_version=NEW.balance_version) OR
 (NEW.kind='OPENING' AND EXISTS(SELECT 1 FROM stock_movements WHERE product_id=NEW.product_id AND kind='OPENING'))
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;

-- REVIEW PROGRAM 0024_stock_movements_no_update.sql
CREATE TRIGGER stock_movements_no_update BEFORE UPDATE ON stock_movements
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;

-- REVIEW PROGRAM 0025_stock_movements_no_delete.sql
CREATE TRIGGER stock_movements_no_delete BEFORE DELETE ON stock_movements
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;

-- REVIEW PROGRAM 0026_product_events_insert_guard.sql
CREATE TRIGGER product_events_insert_guard BEFORE INSERT ON product_events
WHEN EXISTS(SELECT 1 FROM product_events WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM product_events WHERE operation_id=NEW.operation_id)
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;

-- REVIEW PROGRAM 0027_product_events_no_update.sql
CREATE TRIGGER product_events_no_update BEFORE UPDATE ON product_events
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;

-- REVIEW PROGRAM 0028_product_events_no_delete.sql
CREATE TRIGGER product_events_no_delete BEFORE DELETE ON product_events
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;

-- REVIEW PROGRAM 0029_inventory_cancellations_insert_guard.sql
CREATE TRIGGER inventory_cancellations_insert_guard BEFORE INSERT ON inventory_cancellations
WHEN EXISTS(SELECT 1 FROM inventory_cancellations WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM inventory_cancellations WHERE request_key=NEW.request_key) OR
 EXISTS(SELECT 1 FROM inventory_operations WHERE request_key=NEW.request_key)
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;

-- REVIEW PROGRAM 0030_inventory_cancellations_no_update.sql
CREATE TRIGGER inventory_cancellations_no_update BEFORE UPDATE ON inventory_cancellations
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;

-- REVIEW PROGRAM 0031_inventory_cancellations_no_delete.sql
CREATE TRIGGER inventory_cancellations_no_delete BEFORE DELETE ON inventory_cancellations
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;

-- REVIEW PROGRAM 0032_inventory_operations_positive_rowid.sql
CREATE TRIGGER inventory_operations_positive_rowid AFTER INSERT ON inventory_operations
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;

-- REVIEW PROGRAM 0033_stock_movements_positive_rowid.sql
CREATE TRIGGER stock_movements_positive_rowid AFTER INSERT ON stock_movements
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;

-- REVIEW PROGRAM 0034_product_events_positive_rowid.sql
CREATE TRIGGER product_events_positive_rowid AFTER INSERT ON product_events
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;

-- REVIEW PROGRAM 0035_inventory_cancellations_positive_rowid.sql
CREATE TRIGGER inventory_cancellations_positive_rowid AFTER INSERT ON inventory_cancellations
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;
