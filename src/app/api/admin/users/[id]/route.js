import { NextResponse } from "next/server";
import { findUserById, setUserActive, deleteUser, updateUserPassword } from "@/lib/localDb";
import { getRequestUser } from "@/lib/auth/requestUser";

export const dynamic = "force-dynamic";

function requireAdmin(user) {
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user?.id) {
    return NextResponse.json({ error: "Only the instance admin can manage users" }, { status: 403 });
  }
  return null;
}

// GET /api/admin/users/[id] - user detail (admin only)
export async function GET(request, { params }) {
  try {
    const viewer = await getRequestUser();
    const denied = requireAdmin(viewer);
    if (denied) return denied;
    const { id } = await params;
    const user = await findUserById(id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

// PATCH /api/admin/users/[id] - block/unblock or reset password (admin only)
// body: { isActive?: boolean, newPassword?: string (min 6) }
export async function PATCH(request, { params }) {
  try {
    const viewer = await getRequestUser();
    const denied = requireAdmin(viewer);
    if (denied) return denied;
    const { id } = await params;
    const existing = await findUserById(id);
    if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const updated = {};
    if (typeof body.isActive === "boolean") {
      await setUserActive(id, body.isActive);
      updated.isActive = body.isActive;
    }
    if (body.newPassword) {
      try {
        await updateUserPassword(id, body.newPassword);
        updated.passwordReset = true;
      } catch (err) {
        if (err?.code === "WEAK_PASSWORD") {
          return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
        }
        throw err;
      }
    }
    if (Object.keys(updated).length === 0) {
      return NextResponse.json({ error: "Nothing to update (isActive, newPassword)" }, { status: 400 });
    }
    return NextResponse.json({ success: true, user: await findUserById(id) });
  } catch {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] - delete user + all owned rows (admin only)
export async function DELETE(request, { params }) {
  try {
    const viewer = await getRequestUser();
    const denied = requireAdmin(viewer);
    if (denied) return denied;
    const { id } = await params;
    const ok = await deleteUser(id);
    if (!ok) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
