CREATE TRIGGER inventory_cancellations_no_update BEFORE UPDATE ON inventory_cancellations
BEGIN
 SELECT RAISE(ABORT,'Inventory history is immutable.');
END;
