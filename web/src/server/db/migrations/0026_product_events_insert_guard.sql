CREATE TRIGGER product_events_insert_guard BEFORE INSERT ON product_events
WHEN EXISTS(SELECT 1 FROM product_events WHERE rowid=NEW.rowid) OR
 EXISTS(SELECT 1 FROM product_events WHERE operation_id=NEW.operation_id)
BEGIN
 SELECT RAISE(ABORT,'Inventory history conflict.');
END;
