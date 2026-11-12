CREATE UNIQUE INDEX stock_opening_unique ON stock_movements(product_id) WHERE kind='OPENING';
