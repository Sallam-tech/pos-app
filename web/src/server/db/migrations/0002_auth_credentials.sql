CREATE TABLE auth_credentials (
  id TEXT PRIMARY KEY NOT NULL CHECK(id = userId),
  accountId TEXT NOT NULL CHECK(accountId = userId),
  providerId TEXT NOT NULL CHECK(providerId = 'credential'),
  userId TEXT NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE RESTRICT,
  password TEXT NOT NULL CHECK(
    length(password) = 161 AND substr(password,33,1) = ':' AND
    substr(password,1,32) NOT GLOB '*[^0-9a-f]*' AND
    substr(password,34,128) NOT GLOB '*[^0-9a-f]*'
  ),
  accessToken TEXT CHECK(accessToken IS NULL),
  refreshToken TEXT CHECK(refreshToken IS NULL),
  idToken TEXT CHECK(idToken IS NULL),
  accessTokenExpiresAt TEXT CHECK(accessTokenExpiresAt IS NULL),
  refreshTokenExpiresAt TEXT CHECK(refreshTokenExpiresAt IS NULL),
  scope TEXT CHECK(scope IS NULL),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
) STRICT;
