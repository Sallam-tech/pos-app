CREATE TRIGGER inventory_operations_positive_rowid AFTER INSERT ON inventory_operations
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;
