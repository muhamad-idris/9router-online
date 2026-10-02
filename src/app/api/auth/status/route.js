import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/localDb";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";

export async function GET() {
  try {
    const settings = await getSettings();
    const cookieStore = await cookies();
    const session = await getDashboardAuthSession(cookieStore.get("auth_token")?.value);
    const requireLogin = settings.requireLogin !== false;
    // Bridge mode: SSO is disabled — always report password mode so the UI
    // hides SSO buttons. Stale SSO tokens are treated as unauthenticated.
    const ssoSession = !!(session?.oidc || session?.saml);
    const ssoType = settings.ssoType || "oidc";
    const oidcName = String(session?.oidcName || "").trim();
    const oidcEmail = String(session?.oidcEmail || "").trim();
    const samlName = String(session?.samlName || "").trim();
    const samlEmail = String(session?.samlEmail || "").trim();

    const loginMethod = ssoSession ? "Password" : session?.loginMethod === "user" ? "User" : "Password";
    const displayName = ssoSession
      ? "Password user"
      : session?.email || (session?.userId ? "User" : "Password user");

    return NextResponse.json({
      requireLogin,
      authMode: "password",
      ssoType,
      oidcConfigured: false,
      oidcLoginLabel: (settings.oidcLoginLabel || "Sign in with OIDC").trim() || "Sign in with OIDC",
      samlConfigured: false,
      samlLoginLabel: (settings.samlLoginLabel || "Sign in with SAML SSO").trim() || "Sign in with SAML SSO",
      hasPassword: !!settings.password,
      displayName,
      loginMethod,
      authenticated: !!session && !ssoSession,
      user: !ssoSession && session?.userId ? { id: session.userId, email: session.email || null, name: session.name || null } : null,
      oidcName: oidcName || null,
      oidcEmail: oidcEmail || null,
      oidcLogin: !!session?.oidc,
      samlName: samlName || null,
      samlEmail: samlEmail || null,
      samlLogin: !!session?.saml,
    });
  } catch {
    return NextResponse.json({
      requireLogin: true,
      authMode: "password",
      ssoType: "oidc",
      oidcConfigured: false,
      oidcLoginLabel: "Sign in with OIDC",
      samlConfigured: false,
      samlLoginLabel: "Sign in with SAML SSO",
      hasPassword: false,
      displayName: "Password user",
      loginMethod: "Password",
      authenticated: false,
      oidcName: null,
      oidcEmail: null,
      oidcLogin: false,
      samlName: null,
      samlEmail: null,
      samlLogin: false,
    });
  }
}
