"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  authedFetch,
  clearToken,
  errorMessage,
  getToken,
  login,
  signup,
} from "../lib/auth";

type Me = {
  user_id: string;
  is_admin: boolean;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  fontSize: 14,
  boxSizing: "border-box",
  marginTop: 6,
  marginBottom: 16,
  background: "#fff",
  color: "#0f172a",
};

const primaryStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px",
  background: "#0f766e",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
};

async function fetchMe(): Promise<Me> {
  const response = await authedFetch("/me");

  if (!response.ok) {
    if (response.status === 401) clearToken();
    throw new Error(
      await errorMessage(response, "Unable to verify your session.")
    );
  }

  return (await response.json()) as Me;
}

export function LoginGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "guest" | "authenticated">(
    "loading"
  );

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [, setMe] = useState<Me | null>(null);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!getToken()) {
        if (!cancelled) setStatus("guest");
        return;
      }

      try {
        const account = await fetchMe();

        if (!cancelled) {
          setMe(account);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) setStatus("guest");
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const id = userId.trim();

      if (!id) throw new Error("Enter your username.");

      if (mode === "signup") {
        if (password.length < 8) {
          throw new Error("Password must contain at least 8 characters.");
        }

        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        await signup(id, password);
      } else {
        await login(id, password);
      }

      const account = await fetchMe();

      setMe(account);
      setPassword("");
      setConfirmPassword("");
      setStatus("authenticated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }


  if (status === "loading") {
    return (
      <main style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        color: "#475569"
      }}>
        Loading Thamizhi AI…
      </main>
    );
  }

  if (status === "guest") {
    return (
      <main style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#f0fdfa,#f8fafc)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}>
        <div style={{
          width: "100%",
          maxWidth: 430,
          background: "#fff",
          borderRadius: 20,
          padding: 32,
          boxShadow: "0 16px 48px rgba(15,23,42,.08)",
          border: "1px solid #e2e8f0",
        }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: "#0f766e",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 28,
            marginBottom: 20,
          }}>
            த
          </div>

          <h1 style={{
            fontSize: 26,
            fontWeight: 700,
            color: "#0f172a",
            marginBottom: 6,
          }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>

          <p style={{
            fontSize: 14,
            color: "#64748b",
            marginBottom: 24,
          }}>
            Thamizhi AI Playground
          </p>

          <div style={{
            display: "flex",
            gap: 8,
            marginBottom: 24,
            background: "#f1f5f9",
            padding: 5,
            borderRadius: 10,
          }}>
            {(["login", "signup"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setError("");
                  setPassword("");
                  setConfirmPassword("");
                }}
                style={{
                  flex: 1,
                  padding: 10,
                  border: 0,
                  borderRadius: 8,
                  cursor: "pointer",
                  background: mode === item ? "#fff" : "transparent",
                  color: mode === item ? "#0f766e" : "#64748b",
                  fontWeight: 600,
                }}
              >
                {item === "login" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Username
              <input
                style={inputStyle}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                required
              />
            </label>

            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Password
              <input
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                required
              />
            </label>

            {mode === "signup" && (
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Confirm password
                <input
                  style={inputStyle}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  required
                />
              </label>
            )}

            {error && (
              <p role="alert" style={{
                background: "#fef2f2",
                color: "#b91c1c",
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                marginBottom: 16,
              }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} style={primaryStyle}>
              {busy
                ? "Please wait…"
                : mode === "login"
                ? "Sign in"
                : "Create account"}
            </button>
          </form>

          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "24px 0",
            color: "#94a3b8",
            fontSize: 12,
          }}>
            <span style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
            Other sign-in methods
            <span style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
          </div>

          <button
            type="button"
            disabled
            title="Google authentication requires OAuth configuration and security verification."
            style={{
              width: "100%",
              padding: 12,
              background: "#f8fafc",
              color: "#64748b",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              fontWeight: 600,
              cursor: "not-allowed",
            }}
          >
            Continue with Google — Coming soon
          </button>

          <p style={{
            marginTop: 24,
            textAlign: "center",
            fontSize: 12,
            color: "#94a3b8",
          }}>
            Tamil · English · Speech · Language AI
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      {children}
    </>
  );
}
