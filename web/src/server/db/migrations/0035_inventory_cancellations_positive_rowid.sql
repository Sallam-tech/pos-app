CREATE TRIGGER inventory_cancellations_positive_rowid AFTER INSERT ON inventory_cancellations
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;
