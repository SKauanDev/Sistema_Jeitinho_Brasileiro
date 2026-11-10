import { API_URL } from "./admin-api";
import type { AdminUser, AdminUserInput } from "../types/user";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("urfood_token")}`, ...init?.headers },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json() as T & { message?: string } : null;
  if (!response.ok) throw new Error(data?.message ?? "Falha ao gerenciar usuários.");
  return data as T;
}

export const userApi = {
  list: () => request<AdminUser[]>("/admin/users"),
  create: (input: AdminUserInput & { password: string }) => request<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: AdminUserInput & { active?: boolean }) => request<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  setActive: (id: string, active: boolean) => request<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }),
};
