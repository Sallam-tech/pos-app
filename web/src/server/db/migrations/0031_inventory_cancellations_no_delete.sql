CREATE TRIGGER inventory_cancellations_no_delete BEFORE DELETE ON inventory_cancellations
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
