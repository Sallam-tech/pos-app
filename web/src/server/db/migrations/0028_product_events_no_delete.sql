CREATE TRIGGER product_events_no_delete BEFORE DELETE ON product_events
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
