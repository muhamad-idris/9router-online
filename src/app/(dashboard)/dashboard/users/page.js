"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, Input } from "@/shared/components";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resetFor, setResetFor] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState("");
  // Admin = legacy password session (user null). Registered users are blocked
  // client-side for UX; the API returns 403 regardless.
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      // First setState only after an await (react-hooks/set-state-in-effect).
      const statusRes = await fetch("/api/auth/status", { cache: "no-store" });
      setError("");
      const status = await statusRes.json().catch(() => ({}));
      if (status?.user?.id) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load users");
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // load() performs setState only after `await fetch(...)` — no cascading
    // sync render from the effect body itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const patchUser = async (id, body) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy("");
    }
  };

  const deleteUser = async (id, email) => {
    if (!confirm(`Delete ${email} and ALL of their connections, keys, combos and usage?`)) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy("");
    }
  };

  const resetPassword = async (id) => {
    if (!newPassword || newPassword.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }
    await patchUser(id, { newPassword });
    setResetFor(null);
    setNewPassword("");
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-0">
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">Users</h2>
          <p className="text-sm text-text-muted">Registered accounts on this instance. Blocked users cannot login and their gateway keys stop working immediately.</p>
        </div>
        <Card>
          {forbidden ? (
            <p className="text-sm text-text-muted">Admin only — user management is restricted to the instance admin.</p>
          ) : loading ? (
            <p className="text-sm text-text-muted">Loading...</p>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-text-muted">No registered users yet. Share the /register page to onboard.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {users.map((u) => (
                <div key={u.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg bg-bg border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{u.email}</p>
                    <p className="text-xs text-text-muted">
                      {u.name || "—"} · joined {new Date(u.createdAt).toLocaleDateString()} ·{" "}
                      <span className={u.isActive === false ? "text-red-500" : "text-green-600"}>{u.isActive === false ? "blocked" : "active"}</span>
                    </p>
                    {resetFor === u.id && (
                      <div className="flex gap-2 mt-2">
                        <Input
                          type="password"
                          placeholder="New password (min 6)"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                        <Button size="sm" variant="primary" onClick={() => resetPassword(u.id)} loading={busy === u.id}>
                          Set
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setResetFor(null); setNewPassword(""); }}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => patchUser(u.id, { isActive: !(u.isActive !== false) })} loading={busy === u.id}>
                      {u.isActive === false ? "Unblock" : "Block"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setResetFor(u.id); setNewPassword(""); }}>
                      Reset PW
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-500" onClick={() => deleteUser(u.id, u.email)} loading={busy === u.id}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
