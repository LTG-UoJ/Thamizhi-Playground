"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { authedFetch, errorMessage } from "../lib/auth";

type Role = "user" | "admin";
type User = { user_id: string; role: Role; disabled: boolean; created_at: string };

const input: React.CSSProperties = {
  padding: "7px 9px",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  fontSize: 14,
};
const smallBtn: React.CSSProperties = {
  padding: "4px 8px",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
};

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/admin/users");
      if (res.status === 403) {
        setError("Administrator access is required to manage users.");
      } else if (!res.ok) {
        setError(await errorMessage(res, "Could not load users."));
      } else {
        setUsers((await res.json()).users as User[]);
      }
    } catch {
      setError("Cannot reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<Response>, okMessage: string): Promise<boolean> {
    setError("");
    setNotice("");
    try {
      const res = await fn();
      if (!res.ok) {
        setError(await errorMessage(res, "Request failed."));
        return false;
      }
      setNotice(okMessage);
      await load();
      return true;
    } catch {
      setError("Cannot reach the server.");
      return false;
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const id = userId.trim();
    const ok = await act(
      () => authedFetch("/admin/users", { method: "POST", body: JSON.stringify({ user_id: id, password, role }) }),
      `Created ${id}.`,
    );
    if (ok) {
      setUserId("");
      setPassword("");
      setRole("user");
    }
  }

  const patch = (id: string, body: object, msg: string) =>
    act(() => authedFetch(`/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }), msg);

  function resetPassword(id: string) {
    const pw = window.prompt(`New password for ${id} (min 8 characters):`);
    if (pw) void patch(id, { password: pw }, `Password reset for ${id}. Their sessions were ended.`);
  }

  function remove(id: string) {
    if (!window.confirm(`Delete user ${id}? This cannot be undone.`)) return;
    void act(() => authedFetch(`/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" }), `Deleted ${id}.`);
  }

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Users</h1>
      <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 20 }}>
        <Link href="/">← Back to the playground</Link>
      </p>

      {error && <div style={{ color: "#b91c1c", marginBottom: 12, fontSize: 14 }}>{error}</div>}
      {notice && <div style={{ color: "#0f766e", marginBottom: 12, fontSize: 14 }}>{notice}</div>}

      <form onSubmit={onCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        <input style={input} placeholder="User id" value={userId} onChange={(e) => setUserId(e.target.value)} required />
        <input
          style={input}
          type="password"
          placeholder="Password (min 8)"
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <select style={input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" style={{ ...smallBtn, padding: "7px 14px", fontSize: 14 }}>
          Create user
        </button>
      </form>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #cbd5e1" }}>
                <th style={{ padding: 8 }}>User</th>
                <th style={{ padding: 8 }}>Role</th>
                <th style={{ padding: 8 }}>Status</th>
                <th style={{ padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: 8 }}>{u.user_id}</td>
                  <td style={{ padding: 8 }}>
                    <select
                      style={{ ...input, padding: "3px 6px" }}
                      value={u.role}
                      onChange={(e) => void patch(u.user_id, { role: e.target.value }, `Updated ${u.user_id}.`)}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td style={{ padding: 8 }}>{u.disabled ? "Disabled" : "Active"}</td>
                  <td style={{ padding: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      style={smallBtn}
                      onClick={() => void patch(u.user_id, { disabled: !u.disabled }, `${u.disabled ? "Enabled" : "Disabled"} ${u.user_id}.`)}
                    >
                      {u.disabled ? "Enable" : "Disable"}
                    </button>
                    <button style={smallBtn} onClick={() => resetPassword(u.user_id)}>
                      Reset password
                    </button>
                    <button style={{ ...smallBtn, color: "#b91c1c" }} onClick={() => remove(u.user_id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
