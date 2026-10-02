// Per-user settings (bridge mode): each account keeps its own routing
// preferences; global row stays the admin-controlled fallback.
// Additive only.
import { TABLES, buildCreateTableSql } from "../schema.js";

export default {
  version: 4,
  name: "user-settings",
  up(db) {
    db.exec(buildCreateTableSql("user_settings", TABLES.user_settings));
  },
};
