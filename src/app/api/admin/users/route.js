import { NextResponse } from "next/server";
import { listUsers } from "@/lib/localDb";
import { getRequestUser } from "@/lib/auth/requestUser";

export const dynamic = "force-dynamic";

function requireAdmin(user) {
  if (user?.id) {
    return NextResponse.json({ error: "Only the instance admin can manage users" }, { status: 403 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// GET /api/admin/users - list registered users (admin only, no password hashes)
export async function GET() {
  try {
    const viewer = await getRequestUser();
    const denied = requireAdmin(viewer);
    if (denied) return denied;
    const users = await listUsers();
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
}
