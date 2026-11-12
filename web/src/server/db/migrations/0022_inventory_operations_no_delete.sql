CREATE TRIGGER inventory_operations_no_delete BEFORE DELETE ON inventory_operations
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
