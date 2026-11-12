CREATE TABLE stock_movements (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 operation_id TEXT NOT NULL UNIQUE,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK(kind IN ('OPENING','RECEIVE','ADJUST')),
 before_q INTEGER NOT NULL CHECK(before_q BETWEEN 0 AND 999999999999000000 AND before_q%1000000=0),
 delta_q INTEGER NOT NULL CHECK(delta_q!=0 AND delta_q%1000000=0),
 after_q INTEGER NOT NULL CHECK(after_q BETWEEN 0 AND 999999999999000000 AND after_q%1000000=0),
 cost_snapshot_m INTEGER NOT NULL CHECK(cost_snapshot_m BETWEEN 1 AND 99999999999999),
 balance_version INTEGER NOT NULL CHECK(balance_version>0),
 FOREIGN KEY(operation_id,product_id) REFERENCES inventory_operations(id,product_id) ON DELETE RESTRICT,
 UNIQUE(product_id,balance_version),
 CHECK(after_q-before_q=delta_q),
 CHECK((kind='OPENING' AND before_q=0 AND delta_q>0 AND balance_version=1) OR
       (kind='RECEIVE' AND delta_q>0 AND balance_version>1) OR
       (kind='ADJUST' AND balance_version>1))
) STRICT;
