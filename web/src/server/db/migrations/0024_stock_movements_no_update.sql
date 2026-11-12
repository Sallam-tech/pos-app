CREATE TRIGGER stock_movements_no_update BEFORE UPDATE ON stock_movements
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
