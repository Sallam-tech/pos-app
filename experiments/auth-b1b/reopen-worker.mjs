// TEST-only fresh-process read; path restricted by fixture helper.
import { openNative } from "./fixture.mjs";
const db = openNative(process.argv[2], true);
try {
  console.log(JSON.stringify({
    sessions: db.prepare("SELECT id FROM test_session ORDER BY id").all().map(r => r.id),
    password: db.prepare("SELECT password FROM test_credential WHERE id = ?").get("TEST-credential").password,
    integrity: db.pragma("integrity_check", { simple: true }),
    foreignKeyErrors: db.pragma("foreign_key_check")
  }));
} finally { db.close(); }
