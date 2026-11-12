CREATE TRIGGER stock_movements_no_delete BEFORE DELETE ON stock_movements
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
