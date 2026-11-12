CREATE TABLE product_events (
 operation_id TEXT PRIMARY KEY NOT NULL,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 before_json TEXT CHECK(before_json IS NULL OR (length(before_json)<=16000 AND json_valid(before_json))),
 after_json TEXT NOT NULL CHECK(length(after_json)<=16000 AND json_valid(after_json)),
 recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms>0),
 FOREIGN KEY(operation_id,product_id) REFERENCES inventory_operations(id,product_id) ON DELETE RESTRICT
) STRICT;
