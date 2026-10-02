import { getRequestUser } from "@/lib/auth/requestUser";

// Online multi-user mode: attribute dashboard-driven provider connections to
// the logged-in user. CLI/auto-import flows have no session → null (legacy
// shared rows, invisible to per-user routing).
export async function ownerIdFromSession() {
  try {
    return (await getRequestUser())?.id || null;
  } catch {
    return null;
  }
}

// True when a session user must NOT see/touch this row. Legacy admin sessions
// (id null) keep full access; legacy shared rows (userId null) are hidden
// from registered users to avoid cross-account access.
export function isForeignRow(row, user) {
  if (!user?.id) return false;
  if (row?.userId && row.userId !== user.id) return true;
  if (!row?.userId) return true;
  return false;
}
