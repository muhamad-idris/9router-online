import { NextResponse } from "next/server";
import { getSettings, updateSettings, pickUserSettings, updateUserSettings, getEffectiveSettings, USER_SETTINGS_ALLOWLIST } from "@/lib/localDb";
import { getRequestUser } from "@/lib/auth/requestUser";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { resetComboRotation } from "open-sse/services/combo.js";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETTINGS_RESPONSE_HEADERS = {
  "Cache-Control": "no-store"
};

// Secrets must never be mass-assigned from request body (CWE-915)
const PROTECTED_SETTING_KEYS = ["password", "mitmSudoEncrypted"];

export async function GET() {
  try {
    // Bridge mode: registered users see their effective (global + own)
    // settings so the dashboard reflects what actually routes for them.
    let viewerId = null;
    try {
      viewerId = (await getRequestUser())?.id || null;
    } catch {}
    const settings = viewerId ? await getEffectiveSettings(viewerId) : await getSettings();
    const { password, oidcClientSecret, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    
    const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS === "true";
    const enableTranslator = process.env.ENABLE_TRANSLATOR === "true";
    
    return NextResponse.json({ 
      ...safeSettings, 
      enableRequestLogs,
      enableTranslator,
      hasPassword: !!password
    }, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error getting settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    // Bridge mode: registered users may only change their own allowlisted
    // preferences (stored per-user); global/infra keys stay admin-only.
    let viewer = null;
    try {
      viewer = await getRequestUser();
    } catch {}
    if (viewer?.id) {
      const body = await request.json().catch(() => ({}));
      // Users manage their own login password via /api/auth/change-password.
      if (body.newPassword || body.password || body.currentPassword) {
        return NextResponse.json(
          { error: "Use account password change instead" },
          { status: 400, headers: SETTINGS_RESPONSE_HEADERS }
        );
      }
      const userPatch = pickUserSettings(body);
      const foreignKeys = Object.keys(body).filter((k) => !USER_SETTINGS_ALLOWLIST.has(k));
      if (foreignKeys.length > 0) {
        return NextResponse.json(
          { error: `Only the instance admin can change: ${foreignKeys.join(", ")}` },
          { status: 403, headers: SETTINGS_RESPONSE_HEADERS }
        );
      }
      if (Object.keys(userPatch).length === 0) {
        return NextResponse.json({ error: "No user settings to update" }, { status: 400, headers: SETTINGS_RESPONSE_HEADERS });
      }
      const saved = await updateUserSettings(viewer.id, userPatch);
      if (
        Object.prototype.hasOwnProperty.call(userPatch, "comboStrategy") ||
        Object.prototype.hasOwnProperty.call(userPatch, "comboStickyRoundRobinLimit") ||
        Object.prototype.hasOwnProperty.call(userPatch, "comboStrategies")
      ) {
        resetComboRotation(undefined, viewer.id);
      }
      return NextResponse.json({ success: true, updated: Object.keys(userPatch), settings: saved }, { headers: SETTINGS_RESPONSE_HEADERS });
    }
    const body = await request.json();

    // Strip protected secrets before any internal handling sets them
    for (const key of PROTECTED_SETTING_KEYS) delete body[key];

    // If updating password, hash it
    if (body.newPassword) {
      const settings = await getSettings();
      const currentHash = settings.password;

      // Verify current password if it exists
      if (currentHash) {
        if (!body.currentPassword) {
          return NextResponse.json({ error: "Current password required" }, { status: 400 });
        }
        const isValid = await bcrypt.compare(body.currentPassword, currentHash);
        if (!isValid) {
          return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      } else {
        // First time setting password, no current password needed
        // Allow empty currentPassword or default "123456"
        if (body.currentPassword && body.currentPassword !== "123456") {
           return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      }

      const salt = await bcrypt.genSalt(10);
      body.password = await bcrypt.hash(body.newPassword, salt);
      delete body.newPassword;
      delete body.currentPassword;
    }

    if (Object.prototype.hasOwnProperty.call(body, "oidcClientSecret")) {
      if (!body.oidcClientSecret || !String(body.oidcClientSecret).trim()) {
        delete body.oidcClientSecret;
      }
    }

    const settings = await updateSettings(body);

    // Apply outbound proxy settings immediately (no restart required)
    if (
      Object.prototype.hasOwnProperty.call(body, "outboundProxyEnabled") ||
      Object.prototype.hasOwnProperty.call(body, "outboundProxyUrl") ||
      Object.prototype.hasOwnProperty.call(body, "outboundNoProxy")
    ) {
      applyOutboundProxyEnv(settings);
    }

    // Invalidate combo rotation state when strategy settings change
    if (
      Object.prototype.hasOwnProperty.call(body, "comboStrategy") ||
      Object.prototype.hasOwnProperty.call(body, "comboStickyRoundRobinLimit") ||
      Object.prototype.hasOwnProperty.call(body, "comboStrategies")
    ) {
      resetComboRotation();
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "claudeAutoPing") ||
      Object.prototype.hasOwnProperty.call(body, "codexAutoPing")
    ) {
      // Keep the scheduler absent when no account opted in; load its provider graph only on demand.
      import("@/shared/services/quotaAutoPing")
        .then(({ configureQuotaAutoPing }) => {
          configureQuotaAutoPing(settings);
        })
        .catch((error) => console.warn("[AutoPing] settings update failed:", error.message));
    }

    const { password, oidcClientSecret, ...safeSettings } = settings;
    safeSettings.oidcConfigured = !!(safeSettings.oidcIssuerUrl && safeSettings.oidcClientId && oidcClientSecret);
    return NextResponse.json(safeSettings, { headers: SETTINGS_RESPONSE_HEADERS });
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
