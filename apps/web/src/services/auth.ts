import { API_URL } from "./admin-api";

export type AuthUser = {
  id: string;
  name: string;
  username: string;
  role: string;
};

export async function login(username: string, password: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json() as { message?: string; token?: string; user?: AuthUser };

  if (!response.ok || !data.token || !data.user) {
    throw new Error(data.message ?? "Não foi possível entrar.");
  }

  localStorage.setItem("urfood_token", data.token);
  localStorage.setItem("urfood_user", JSON.stringify(data.user));
  return data.user;
}

export function logout(): void {
  localStorage.removeItem("urfood_token");
  localStorage.removeItem("urfood_user");
  window.dispatchEvent(new Event("urfood:admin-logout"));
}

export function getCurrentUser(): AuthUser | null {
  const raw = localStorage.getItem("urfood_user");
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUser; } catch { return null; }
}
