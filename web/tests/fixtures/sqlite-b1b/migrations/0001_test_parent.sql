-- Disposable integration fixture only; never a business table.
CREATE TABLE test_parent (
  id INTEGER PRIMARY KEY,
  value INTEGER NOT NULL,
  label TEXT NOT NULL UNIQUE
) STRICT;
