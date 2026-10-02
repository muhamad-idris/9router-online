import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

const DEFAULT_MITM_ROUTER_BASE = "http://localhost:20128";
const DEFAULT_HEADROOM_URL = process.env.HEADROOM_URL || "http://localhost:8787";

const DEFAULT_SETTINGS = {
  cloudEnabled: false,
  tunnelEnabled: false,
  tunnelUrl: "",
  tunnelProvider: "cloudflare",
  tailscaleEnabled: false,
  tailscaleUrl: "",
  stickyRoundRobinLimit: 3,
  providerStrategies: {},
  quotaVisibility: {},
  comboStrategy: "fallback",
  comboStickyRoundRobinLimit: 1,
  comboStrategies: {},
  capacityAdapter: {
    vision: { enabled: true, roundRobin: false, models: [] },
    pdf: { enabled: false, roundRobin: false, models: [] },
    audioInput: { enabled: true, roundRobin: false, models: [] },
    videoInput: { enabled: false, roundRobin: false, models: [] },
  },
  requireLogin: true,
  requireApiKey: true,
  tunnelDashboardAccess: true,
  authMode: "password",
  ssoType: "oidc",
  oidcIssuerUrl: "",
  oidcClientId: "",
  oidcClientSecret: "",
  oidcScopes: "openid profile email",
  oidcLoginLabel: "Sign in with OIDC",
  samlEntryPoint: "",
  samlIssuer: "urn:9router:sp",
  samlCert: "",
  samlLoginLabel: "Sign in with SAML SSO",
  samlAttributeEmail: "email",
  samlAttributeName: "name",
  enableObservability: false,
  observabilityMaxRecords: 1000,
  observabilityBatchSize: 20,
  observabilityFlushIntervalMs: 5000,
  observabilityMaxJsonSize: 5,
  outboundProxyEnabled: false,
  outboundProxyUrl: "",
  outboundNoProxy: "",
  mitmRouterBaseUrl: DEFAULT_MITM_ROUTER_BASE,
  dnsToolEnabled: {},
  rtkEnabled: true,
  headroomEnabled: false,
  headroomUrl: DEFAULT_HEADROOM_URL,
  headroomCompressUserMessages: false,
  headroomTimeoutMs: 3000,
  cavemanEnabled: false,
  cavemanLevel: "full",
  ponytailEnabled: false,
  ponytailLevel: "full",
  pxpipeEnabled: false,
  pxpipeAutoInstall: true,
  pxpipeMinChars: 25000,
  pxpipeTimeoutMs: 15000,
  // Per-provider user header overrides applied at dispatch: { [providerId]: { headers: {..} } }
  providerOverrides: {},
};

async function readRaw() {
  const db = await getAdapter();
  const row = db.get(`SELECT data FROM settings WHERE id = 1`);
  return row ? parseJson(row.data, {}) : {};
}

// Merge raw settings with defaults; backward-compat for missing keys
export function mergeWithDefaults(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  for (const [key, defVal] of Object.entries(DEFAULT_SETTINGS)) {
    if (merged[key] === undefined) {
      if (
        key === "outboundProxyEnabled" &&
        typeof merged.outboundProxyUrl === "string" &&
        merged.outboundProxyUrl.trim()
      ) {
        merged[key] = true;
      } else {
        merged[key] = defVal;
      }
    }
  }
  if (merged.capacityAdapter && typeof merged.capacityAdapter === "object") {
    for (const capKey of Object.keys(merged.capacityAdapter)) {
      const entry = merged.capacityAdapter[capKey];
      if (Array.isArray(entry?.models)) {
        entry.models = entry.models.map((m) =>
          m === "oc/mimo-v2.5-free" ? "oc/mimo-v2.6-flash-free" : m
        );
      }
    }
  }
  return merged;
}

export async function getSettings() {
  const raw = await readRaw();
  return mergeWithDefaults(raw);
}

// Atomic read-merge-write inside transaction (prevents losing concurrent updates)
export async function updateSettings(updates) {
  const db = await getAdapter();
  let next;
  db.transaction(function () {
    const row = db.get(`SELECT data FROM settings WHERE id = 1`);
    const current = row ? parseJson(row.data, {}) : {};
    next = { ...current, ...updates };
    db.run(
      `INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      [stringifyJson(next)],
    );
  });
  return mergeWithDefaults(next);
}

export async function isCloudEnabled() {
  const settings = await getSettings();
  return settings.cloudEnabled === true;
}

export async function getCloudUrl() {
  const settings = await getSettings();
  return (
    settings.cloudUrl ||
    process.env.CLOUD_URL ||
    process.env.NEXT_PUBLIC_CLOUD_URL ||
    ""
  );
}

export async function exportSettings() {
  return await readRaw();
}

// ─── Per-user settings (bridge mode) ─────────────────────────────────────
// Keys a registered user may keep for themselves. Everything else stays
// global + admin-only (password, requireLogin/ApiKey, SSO, tunnel/tailscale,
// outbound proxy, mitm, cloud, observability limits).
export const USER_SETTINGS_ALLOWLIST = new Set([
  "fallbackStrategy",
  "stickyRoundRobinLimit",
  "providerStrategies",
  "comboStrategy",
  "comboStickyRoundRobinLimit",
  "comboStrategies",
  "capacityAdapter",
  "providerThinking",
  "providerOverrides",
  "quotaVisibility",
  "rtkEnabled",
  "ccFilterNaming",
  "claudeAutoPing",
  "codexAutoPing",
  "enableObservability",
  "headroomEnabled",
  "headroomUrl",
  "headroomCompressUserMessages",
  "headroomTimeoutMs",
  "cavemanEnabled",
  "cavemanLevel",
  "ponytailEnabled",
  "ponytailLevel",
  "pxpipeEnabled",
  "pxpipeAutoInstall",
  "pxpipeMinChars",
  "pxpipeTimeoutMs",
]);

// Daemon-backed savers: a user may only opt OUT. If the instance disabled it,
// per-user opt-in must not re-enable it.
const GATED_BY_GLOBAL = new Set(["headroomEnabled", "pxpipeEnabled"]);

export function pickUserSettings(patch = {}) {
  const out = {};
  for (const key of USER_SETTINGS_ALLOWLIST) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = patch[key];
  }
  return out;
}

async function readUserRaw(userId) {
  if (!userId) return {};
  const db = await getAdapter();
  try {
    const row = db.get(`SELECT data FROM user_settings WHERE userId = ?`, [userId]);
    return row ? parseJson(row.data, {}) : {};
  } catch {
    return {};
  }
}

// Effective settings for a caller: DEFAULTS ← global row ← user's allowlisted
// keys. Null/legacy callers get the plain global settings (unchanged).
export async function getEffectiveSettings(userId = null) {
  const global = await getSettings();
  if (!userId) return global;
  const userRaw = await readUserRaw(userId);
  const eff = { ...global, ...pickUserSettings(userRaw) };
  for (const key of GATED_BY_GLOBAL) {
    if (!global[key]) eff[key] = false;
  }
  return eff;
}

export async function getUserSettings(userId) {
  if (!userId) return {};
  return pickUserSettings(await readUserRaw(userId));
}

export async function updateUserSettings(userId, patch) {
  if (!userId) throw new Error("userId is required");
  const clean = pickUserSettings(patch || {});
  const db = await getAdapter();
  let next;
  db.transaction(function () {
    let current = {};
    try {
      const row = db.get(`SELECT data FROM user_settings WHERE userId = ?`, [userId]);
      current = row ? parseJson(row.data, {}) : {};
    } catch {}
    next = { ...pickUserSettings(current), ...clean };
    db.run(
      `INSERT INTO user_settings(userId, data, updatedAt) VALUES(?, ?, ?) ON CONFLICT(userId) DO UPDATE SET data = excluded.data, updatedAt = excluded.updatedAt`,
      [userId, stringifyJson(next), new Date().toISOString()]
    );
  });
  return next;
}
