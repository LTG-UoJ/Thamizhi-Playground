const TOKEN_KEY = "auth_token";

export function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8002`;
  }
  return "http://localhost:8002";
}

export const apiUrl = (path: string): string => `${apiBase()}${path}`;

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage unavailable: the user will have to log in again
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing to clear
  }
}

export async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function login(userId: string, password: string): Promise<void> {
  const res = await fetch(apiUrl("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, password }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Login failed."));
  const data = await res.json();
  setToken(data.token);
}

export function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Consent-Granted": "true",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

export async function signup(userId: string, password: string): Promise<void> {
  const res = await fetch(apiUrl("/auth/signup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, password }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Sign-up failed."));
  setToken((await res.json()).token);
}

export async function googleLogin(credential: string): Promise<void> {
  const res = await fetch(apiUrl("/auth/google"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Google sign-in failed."));
  setToken((await res.json()).token);
}

export async function signOutServer(): Promise<void> {
  const token = getToken();
  try {
    if (token) {
      await fetch(apiUrl("/auth/signout"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } finally {
    clearToken();
  }
}
