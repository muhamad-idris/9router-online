import { NextResponse } from "next/server";
import { verifyUserCredentials, updateUserPassword } from "@/lib/localDb";
import { getRequestUser } from "@/lib/auth/requestUser";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

// POST /api/auth/change-password { currentPassword, newPassword }
// Self-service password change for registered (email) users only.
export async function POST(request) {
  try {
    const user = await getRequestUser();
    if (!user?.id || !user?.email) {
      return NextResponse.json({ error: "Account login required" }, { status: 401, headers: NO_STORE_HEADERS });
    }
    const body = await request.json().catch(() => ({}));
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new password are required" }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const ok = await verifyUserCredentials(user.email, currentPassword);
    if (!ok) {
      return NextResponse.json({ error: "Invalid current password" }, { status: 401, headers: NO_STORE_HEADERS });
    }
    try {
      await updateUserPassword(user.id, newPassword);
    } catch (err) {
      if (err?.code === "WEAK_PASSWORD") {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400, headers: NO_STORE_HEADERS });
      }
      throw err;
    }
    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to change password" }, { status: 500 });
  }
}
