// Multi-user online mode: users table + userId columns (nullable for legacy rows).
// Additive only — syncSchemaFromTables() would add these anyway, but a versioned
// migration keeps the change explicit and triggers the pre-change safety backup.
import { TABLES, buildCreateTableSql } from "../schema.js";

export default {
  version: 2,
  name: "multi-user",
  up(db) {
    db.exec(buildCreateTableSql("users", TABLES.users));
    for (const idx of TABLES.users.indexes || []) db.exec(idx);
    // Columns/indexes for existing tables are added by syncSchemaFromTables(),
    // but declare them here too so a direct migration run is self-sufficient.
    const additions = [
      ["providerConnections", "userId", TABLES.providerConnections.columns.userId],
      ["providerNodes", "userId", TABLES.providerNodes.columns.userId],
      ["apiKeys", "userId", TABLES.apiKeys.columns.userId],
      ["combos", "userId", TABLES.combos.columns.userId],
      ["usageHistory", "userId", TABLES.usageHistory.columns.userId],
      ["requestDetails", "userId", TABLES.requestDetails.columns.userId],
    ];
    for (const [table, col, def] of additions) {
      try {
        const existing = db.all(`PRAGMA table_info(${table})`).map((r) => r.name);
        if (!existing.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      } catch {}
    }
    for (const table of ["providerConnections", "apiKeys", "combos", "usageHistory", "requestDetails", "providerNodes"]) {
      for (const idx of TABLES[table].indexes || []) {
        try { db.exec(idx); } catch {}
      }
    }
  },
};
