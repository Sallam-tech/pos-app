CREATE TABLE auth_users (
  id TEXT PRIMARY KEY NOT NULL CHECK(id IN ('ADMIN','SALESPERSON')),
  role TEXT NOT NULL UNIQUE CHECK(role = id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 128),
  email TEXT NOT NULL UNIQUE CHECK(
    (id = 'ADMIN' AND email = 'admin@shop-pos.invalid') OR
    (id = 'SALESPERSON' AND email = 'salesperson@shop-pos.invalid')
  ),
  emailVerified INTEGER NOT NULL CHECK(emailVerified IN (0,1)),
  image TEXT CHECK(image IS NULL),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
) STRICT;
