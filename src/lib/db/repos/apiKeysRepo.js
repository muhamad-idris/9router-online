import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machineId,
    isActive: row.isActive === 1 || row.isActive === true,
    userId: row.userId ?? null,
    createdAt: row.createdAt,
  };
}

export async function getApiKeys(filter = {}) {
  const db = await getAdapter();
  if (filter.userId) {
    const rows = db.all(`SELECT * FROM apiKeys WHERE userId = ? ORDER BY createdAt ASC`, [filter.userId]);
    return rows.map(rowToKey);
  }
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

export async function createApiKey(name, machineId, userId = null) {
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    userId: userId || null,
    createdAt: new Date().toISOString(),
  };
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, userId, createdAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, apiKey.userId, apiKey.createdAt]
  );
  return apiKey;
}

export async function updateApiKey(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToKey(row), ...data };
    db.run(
      `UPDATE apiKeys SET key = ?, name = ?, machineId = ?, isActive = ?, userId = ? WHERE id = ?`,
      [merged.key, merged.name, merged.machineId, merged.isActive ? 1 : 0, merged.userId || null, id]
    );
    result = merged;
  });
  return result;
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

export async function validateApiKey(key) {
  if (!key) return false;
  const db = await getAdapter();
  const row = db.get(`SELECT k.isActive AS keyActive, k.userId AS userId, u.isActive AS userActive FROM apiKeys k LEFT JOIN users u ON u.id = k.userId WHERE k.key = ?`, [key]);
  if (!row) return false;
  if (!(row.keyActive === 1 || row.keyActive === true)) return false;
  // Ownerless legacy keys stay valid; owned keys require an active owner.
  if (row.userId && !(row.userActive === 1 || row.userActive === true)) return false;
  return true;
}

export async function getApiKeyByKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE key = ?`, [key]);
  return rowToKey(row);
}

// Resolve a gateway key (Bearer / x-api-key) to its owner for per-user routing.
// Returns { userId, keyId } or null when missing/inactive. Keys whose owner
// was deleted or deactivated stop working immediately.
export async function resolveGatewayIdentity(key) {
  if (!key) return null;
  const row = await getApiKeyByKey(key);
  if (!row || !row.isActive) return null;
  if (row.userId) {
    try {
      const db = await getAdapter();
      const owner = db.get(`SELECT isActive FROM users WHERE id = ?`, [row.userId]);
      if (!owner || !(owner.isActive === 1 || owner.isActive === true)) return null;
    } catch {
      return null;
    }
  }
  return { userId: row.userId || null, keyId: row.id };
}
