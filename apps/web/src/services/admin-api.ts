import type { DashboardData, Order, OrderStatus } from "../types/admin";

export const API_URL = (import.meta.env.VITE_API_URL?.trim() || "/api").replace(/\/+$/, "");
export const SOCKET_URL = import.meta.env.VITE_API_URL ? new URL(import.meta.env.VITE_API_URL, window.location.origin).origin : window.location.origin;

const pendingReads = new Map<string, Promise<unknown>>();

function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isRead = !init?.method || init.method.toUpperCase() === "GET";
  // Share simultaneous reads, not cached results; tokens isolate authenticated users.
  if (!isRead) { pendingReads.clear(); return performAuthFetch<T>(path, init); }
  const key = `${localStorage.getItem("urfood_token")}\n${path}`;
  const existing = pendingReads.get(key);
  if (existing) return existing as Promise<T>;
  const task = performAuthFetch<T>(path, init).finally(() => {
    if (pendingReads.get(key) === task) pendingReads.delete(key);
  });
  pendingReads.set(key, task);
  return task;
}

async function performAuthFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("urfood_token");
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
  const data = await response.json() as T & { message?: string };
  if (response.status === 401) { localStorage.removeItem("urfood_token"); localStorage.removeItem("urfood_user"); window.location.href = "/"; }
  if (!response.ok) throw new Error(data.message ?? "Falha ao consultar a API.");
  return data;
}

export const adminApi = {
  dashboard: (period: string, start?: string, end?: string) => authFetch<DashboardData>(`/admin/dashboard?period=${encodeURIComponent(period)}${start ? `&start=${encodeURIComponent(start)}` : ""}${end ? `&end=${encodeURIComponent(end)}` : ""}`),
  orders: () => authFetch<Order[]>("/admin/orders"),
  updateOrderStatus: (id: string, status: OrderStatus, reason?: string) => authFetch<Order>(`/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) }),
  store: () => authFetch<{ id: string; storeName: string; isOpen: boolean; configuredOpen: boolean; averagePreparationMinutes: number }>("/admin/store"),
  updateStoreStatus: (isOpen: boolean) => authFetch<{ id: string; storeName: string; isOpen: boolean; configuredOpen: boolean }>("/admin/store/status", { method: "PATCH", body: JSON.stringify({ isOpen }) }),
};
