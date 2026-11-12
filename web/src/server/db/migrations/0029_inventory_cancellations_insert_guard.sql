CREATE TRIGGER inventory_cancellations_insert_guard BEFORE INSERT ON inventory_cancellations
WHEN EXISTS(SELECT 1 FROM inventory_cancellations WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM inventory_cancellations WHERE request_key=NEW.request_key) OR
 EXISTS(SELECT 1 FROM inventory_operations WHERE request_key=NEW.request_key)
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;
