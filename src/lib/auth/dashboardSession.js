import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "@/lib/dataDir";
import { getSettings } from "@/lib/localDb";

const DEFAULT_PASSWORD = "123456";
const SESSION_MAX_AGE_SEC = 24 * 60 * 60;

function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, "jwt-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {}
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const generated = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

const SECRET = new TextEncoder().encode(loadJwtSecret());

export function shouldUseSecureCookie(request) {
  const forceSecureCookie = process.env.AUTH_COOKIE_SECURE === "true";
  const forwardedProto = request?.headers?.get?.("x-forwarded-proto");
  const isHttpsRequest = forwardedProto === "https";
  return forceSecureCookie || isHttpsRequest;
}

export async function createDashboardAuthToken(claims = {}) {
  return new SignJWT({ authenticated: true, ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function createUserAuthToken(user) {
  return createDashboardAuthToken({
    userId: user.id,
    email: user.email,
    name: user.name || null,
    loginMethod: "user",
  });
}

export function getSessionUser(session) {
  if (!session?.authenticated) return null;
  // Bridge mode: SSO logins are disabled (see auth/oidc+saml routes).
  // Tokens carrying SSO claims are never honored — otherwise an SSO user
  // would land here without a users-table row and inherit full admin access.
  if (!isSessionAllowed(session)) return null;
  // Legacy single-password sessions have no userId — treat as instance admin.
  if (!session.userId) return { id: null, email: null, name: "Admin", role: "admin" };
  return {
    id: session.userId,
    email: session.email || null,
    name: session.name || null,
    role: "user",
  };
}

// Central SSO kill-switch for session validation. OIDC/SAML endpoints are
// independently disabled; this ensures stale SSO tokens cannot authenticate
// anywhere even if one were somehow still issued.
export function isSessionAllowed(session) {
  if (!session) return false;
  if (session.oidc || session.saml) return false;
  return true;
}

export async function verifyDashboardAuthToken(token) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    // Registered users are re-validated against the users table on every
    // verification so blocked or deleted accounts lose access immediately
    // (JWTs are stateless). Legacy instance-admin sessions carry no userId
    // and skip the lookup. Fail closed: a failed lookup rejects the token.
    if (payload?.userId) {
      try {
        const { findUserById } = await import("@/lib/db/index.js");
        const record = await findUserById(payload.userId);
        if (!record || record.isActive === false) return false;
      } catch {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function getDashboardAuthSession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function setDashboardAuthCookie(cookieStore, request, claims = {}) {
  const token = await createDashboardAuthToken(claims);
  cookieStore.set("auth_token", token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export function clearDashboardAuthCookie(cookieStore) {
  cookieStore.delete("auth_token");
}

// Verify the current dashboard password (re-auth for sensitive actions).
export async function verifyDashboardPassword(password) {
  if (typeof password !== "string" || !password) return false;
  const settings = await getSettings();
  const storedHash = settings?.password;
  if (storedHash) return bcrypt.compare(password, storedHash);
  const initialPassword = process.env.INITIAL_PASSWORD || DEFAULT_PASSWORD;
  return password === initialPassword;
}
