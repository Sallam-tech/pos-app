-- Disposable integration fixture only.
CREATE TABLE test_child (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER NOT NULL REFERENCES test_parent(id) ON DELETE RESTRICT,
  note TEXT NOT NULL
) STRICT;
