import { cookies } from "next/headers";
import { getDashboardAuthSession, getSessionUser } from "@/lib/auth/dashboardSession";

// Resolve the current dashboard user from the auth_token cookie.
// Returns null when unauthenticated, otherwise { id, email, name, role }.
// id === null means legacy single-password admin session (pre-multi-user).
// Registered users are re-validated against the users table on every call so
// deleted or deactivated accounts lose access immediately (JWTs are stateless).
export async function getRequestUser() {
  try {
    const cookieStore = await cookies();
    const session = await getDashboardAuthSession(cookieStore.get("auth_token")?.value);
    const user = getSessionUser(session);
    if (!user?.id) return user;
    try {
      const { findUserById } = await import("@/lib/db/index.js");
      const record = await findUserById(user.id);
      if (!record || record.isActive === false) return null;
    } catch {
      return null;
    }
    return user;
  } catch {
    return null;
  }
}
