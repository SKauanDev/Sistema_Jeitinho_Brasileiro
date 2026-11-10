import { API_URL } from "./admin-api";
import type { InventoryCategory, InventoryData, InventoryItem, InventoryMovement } from "../types/inventory";
async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("urfood_token")}`, ...init?.headers } }); const data = await response.json() as T & { message?: string }; if (!response.ok) throw new Error(data.message ?? "Falha ao consultar o estoque."); return data; }
export const inventoryApi = {
  createCategory: (name: string) => request<InventoryCategory>("/admin/inventory/categories", { method: "POST", body: JSON.stringify({ name }) }),
  removeItem: (id: string) => request<void>(`/admin/inventory/items/${id}`, { method: "DELETE" }),
  list: () => request<InventoryData>("/admin/inventory"), movements: (itemId?: string) => request<InventoryMovement[]>(`/admin/inventory/movements${itemId ? `?itemId=${itemId}` : ""}`),
  createItem: (input: { name: string; category: string; unit: string; currentStock: number; minimumStock: number; unitCost: number }) => request<InventoryItem>("/admin/inventory/items", { method: "POST", body: JSON.stringify(input) }),
  updateItem: (id: string, input: { name?: string; category?: string; unit?: string; minimumStock?: number; unitCost?: number; active?: boolean }) => request<InventoryItem>(`/admin/inventory/items/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  move: (id: string, input: { type: "IN" | "OUT" | "ADJUST"; quantity: number; reason: string; notes?: string }) => request<{ item: InventoryItem; movement: InventoryMovement }>(`/admin/inventory/items/${id}/movements`, { method: "POST", body: JSON.stringify(input) }),
};
