CREATE TRIGGER stock_movements_insert_guard BEFORE INSERT ON stock_movements
WHEN EXISTS(SELECT 1 FROM stock_movements WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE id=NEW.id) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE operation_id=NEW.operation_id) OR
 EXISTS(SELECT 1 FROM stock_movements WHERE product_id=NEW.product_id AND balance_version=NEW.balance_version) OR
 (NEW.kind='OPENING' AND EXISTS(SELECT 1 FROM stock_movements WHERE product_id=NEW.product_id AND kind='OPENING'))
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;
