import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createUser, normalizeEmail, countUsers } from "@/lib/localDb";
import { createUserAuthToken, setDashboardAuthCookie } from "@/lib/auth/dashboardSession";
import { checkLock, recordFail, recordSuccess, getClientIp } from "@/lib/auth/loginLimiter";
import { createApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

// POST /api/auth/register { email, password, name? } — public self-signup.
export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const lock = checkLock(ip);
    if (lock.locked) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${lock.retryAfter}s.` },
        { status: 429, headers: { "Retry-After": String(lock.retryAfter) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const password = body.password;
    const name = typeof body.name === "string" ? body.name : null;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    let user;
    try {
      user = await createUser({ email, password, name });
    } catch (err) {
      recordFail(ip);
      if (err?.code === "EMAIL_TAKEN") {
        return NextResponse.json({ error: "Email already registered. Please login." }, { status: 409 });
      }
      if (err?.code === "WEAK_PASSWORD") {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      if (err?.code === "INVALID_EMAIL") {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }
      throw err;
    }
    recordSuccess(ip);

    // Provision a default gateway key so /v1 works immediately for the new user.
    let gatewayKey = null;
    try {
      const machineId = await getConsistentMachineId();
      const created = await createApiKey("default", machineId, user.id);
      gatewayKey = created.key;
    } catch {}

    const cookieStore = await cookies();
    await setDashboardAuthCookie(cookieStore, request, {
      userId: user.id,
      email: user.email,
      name: user.name,
      loginMethod: "user",
    });

    return NextResponse.json(
      { success: true, user, gatewayKey, token: await createUserAuthToken(user) },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json({ error: error.message || "Registration failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const total = await countUsers();
    return NextResponse.json({ registeredUsers: total, openRegistration: true });
  } catch {
    return NextResponse.json({ registeredUsers: 0, openRegistration: true });
  }
}
