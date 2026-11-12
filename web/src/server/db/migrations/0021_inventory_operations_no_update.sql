CREATE TRIGGER inventory_operations_no_update BEFORE UPDATE ON inventory_operations
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
