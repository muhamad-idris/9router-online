// Per-user proxy pools: proxy URLs may embed credentials, so pools must be
// owned like connections. Additive only.
import { TABLES, buildCreateTableSql } from "../schema.js";

export default {
  version: 3,
  name: "proxy-pools-user",
  up(db) {
    db.exec(buildCreateTableSql("proxyPools", TABLES.proxyPools));
    try {
      const existing = db.all(`PRAGMA table_info(proxyPools)`).map((r) => r.name);
      if (!existing.includes("userId")) {
        db.exec(`ALTER TABLE proxyPools ADD COLUMN userId ${TABLES.proxyPools.columns.userId}`);
      }
    } catch {}
    for (const idx of TABLES.proxyPools.indexes || []) {
      try { db.exec(idx); } catch {}
    }
  },
};
