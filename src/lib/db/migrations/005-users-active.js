// Operator user management: isActive flag for block/unblock.
// Additive only.
import { TABLES } from "../schema.js";

export default {
  version: 5,
  name: "users-active-flag",
  up(db) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, passwordHash TEXT NOT NULL, isActive INTEGER DEFAULT 1, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`
    );
    try {
      const existing = db.all(`PRAGMA table_info(users)`).map((r) => r.name);
      if (!existing.includes("isActive")) {
        db.exec(`ALTER TABLE users ADD COLUMN isActive ${TABLES.users.columns.isActive}`);
      }
    } catch {}
    for (const idx of TABLES.users.indexes || []) {
      try { db.exec(idx); } catch {}
    }
  },
};
