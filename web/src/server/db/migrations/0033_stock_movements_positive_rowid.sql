CREATE TRIGGER stock_movements_positive_rowid AFTER INSERT ON stock_movements
WHEN NEW.rowid<=0
BEGIN
 SELECT RAISE(ABORT,'Inventory physical row identity is invalid.');
END;
