CREATE TABLE stock_balances (
 product_id TEXT PRIMARY KEY NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 opening_operation_id TEXT NOT NULL UNIQUE,
 sellable_q INTEGER NOT NULL CHECK(sellable_q BETWEEN 0 AND 999999999999000000 AND sellable_q%1000000=0),
 cost_m INTEGER NOT NULL CHECK(cost_m BETWEEN 1 AND 99999999999999),
 stock_value_m INTEGER NOT NULL CHECK(stock_value_m>=0),
 version INTEGER NOT NULL CHECK(version>0),
 updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms>0),
 FOREIGN KEY(opening_operation_id,product_id) REFERENCES inventory_operations(id,product_id) ON DELETE RESTRICT,
 FOREIGN KEY(product_id,cost_m) REFERENCES products(id,current_cost_m) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 CHECK(CASE WHEN sellable_q=0 THEN stock_value_m=0
 ELSE stock_value_m/(sellable_q/1000000)=cost_m AND stock_value_m%(sellable_q/1000000)=0 END)
) STRICT;
