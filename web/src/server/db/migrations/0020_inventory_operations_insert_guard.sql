CREATE TRIGGER inventory_operations_insert_guard BEFORE INSERT ON inventory_operations
WHEN EXISTS(SELECT 1 FROM inventory_operations WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM inventory_operations WHERE id=NEW.id) OR
 EXISTS(SELECT 1 FROM inventory_operations WHERE request_key=NEW.request_key) OR
 EXISTS(SELECT 1 FROM inventory_cancellations WHERE request_key=NEW.request_key)
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;
