CREATE TRIGGER product_events_no_update BEFORE UPDATE ON product_events
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
