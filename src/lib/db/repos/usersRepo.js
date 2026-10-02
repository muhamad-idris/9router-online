import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { getAdapter } from "../driver.js";

const SALT_ROUNDS = 10;

function rowToUser(row, includeHash = false) {
  if (!row) return null;
  const user = {
    id: row.id,
    email: row.email,
    name: row.name || null,
    isActive: row.isActive === undefined || row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (includeHash) user.passwordHash = row.passwordHash;
  return user;
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

export async function findUserByEmail(email) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM users WHERE email = ?`, [normalizeEmail(email)]);
  return rowToUser(row, true);
}

export async function findUserById(id) {
  if (!id) return null;
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM users WHERE id = ?`, [id]);
  return rowToUser(row);
}

export async function countUsers() {
  const db = await getAdapter();
  try {
    return db.get(`SELECT COUNT(*) AS n FROM users`)?.n ?? 0;
  } catch {
    return 0;
  }
}

export async function createUser({ email, password, name = null }) {
  const cleanEmail = normalizeEmail(email);
  if (!isValidEmail(cleanEmail)) {
    const err = new Error("Invalid email address");
    err.code = "INVALID_EMAIL";
    throw err;
  }
  if (!password || String(password).length < 6) {
    const err = new Error("Password must be at least 6 characters");
    err.code = "WEAK_PASSWORD";
    throw err;
  }
  const db = await getAdapter();
  const existing = db.get(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
  if (existing) {
    const err = new Error("Email already registered");
    err.code = "EMAIL_TAKEN";
    throw err;
  }
  const now = new Date().toISOString();
  const user = {
    id: uuidv4(),
    email: cleanEmail,
    name: name ? String(name).trim().slice(0, 120) || null : null,
    passwordHash: await bcrypt.hash(String(password), SALT_ROUNDS),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  db.run(`INSERT INTO users(id, email, name, passwordHash, isActive, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?, ?)`, [
    user.id, user.email, user.name, user.passwordHash, 1, user.createdAt, user.updatedAt,
  ]);
  return rowToUser({ ...user });
}

export async function verifyUserCredentials(email, password) {
  const user = await findUserByEmail(email);
  if (!user?.passwordHash) return null;
  if (user.isActive === false) return null;
  const ok = await bcrypt.compare(String(password || ""), user.passwordHash);
  if (!ok) return null;
  const { passwordHash: _omit, ...safe } = user;
  return safe;
}

export async function updateUserPassword(id, newPassword) {
  if (!newPassword || String(newPassword).length < 6) {
    const err = new Error("Password must be at least 6 characters");
    err.code = "WEAK_PASSWORD";
    throw err;
  }
  const db = await getAdapter();
  const row = db.get(`SELECT id FROM users WHERE id = ?`, [id]);
  if (!row) {
    const err = new Error("User not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  const hash = await bcrypt.hash(String(newPassword), SALT_ROUNDS);
  const now = new Date().toISOString();
  db.run(`UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?`, [hash, now, id]);
  return true;
}

// ─── Operator management ─────────────────────────────────────────────────

export async function listUsers() {
  const db = await getAdapter();
  try {
    const rows = db.all(`SELECT * FROM users ORDER BY createdAt ASC`);
    return rows.map((r) => rowToUser(r));
  } catch {
    return [];
  }
}

export async function setUserActive(id, isActive) {
  const db = await getAdapter();
  const res = db.run(`UPDATE users SET isActive = ?, updatedAt = ? WHERE id = ?`, [
    isActive ? 1 : 0, new Date().toISOString(), id,
  ]);
  return (res?.changes ?? 0) > 0;
}

export async function deleteUser(id) {
  const db = await getAdapter();
  let ok = false;
  db.transaction(() => {
    const row = db.get(`SELECT id FROM users WHERE id = ?`, [id]);
    if (!row) return;
    db.run(`DELETE FROM apiKeys WHERE userId = ?`, [id]);
    db.run(`DELETE FROM providerConnections WHERE userId = ?`, [id]);
    db.run(`DELETE FROM providerNodes WHERE userId = ?`, [id]);
    db.run(`DELETE FROM proxyPools WHERE userId = ?`, [id]);
    db.run(`DELETE FROM combos WHERE userId = ?`, [id]);
    db.run(`DELETE FROM usageHistory WHERE userId = ?`, [id]);
    db.run(`DELETE FROM requestDetails WHERE userId = ?`, [id]);
    db.run(`DELETE FROM user_settings WHERE userId = ?`, [id]);
    db.run(`DELETE FROM users WHERE id = ?`, [id]);
    ok = true;
  });
  return ok;
}
