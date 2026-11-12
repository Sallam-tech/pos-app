CREATE TRIGGER product_events_positive_rowid AFTER INSERT ON product_events
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;
