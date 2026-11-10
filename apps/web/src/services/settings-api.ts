import { API_URL } from "./admin-api";
import type { DeliveryZone, SettingsData, StoreHour, StoreSettings } from "../types/settings";
async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("urfood_token")}`, ...init?.headers } }); if (response.status === 204) return undefined as T; const data = await response.json() as T & { message?: string }; if (!response.ok) throw new Error(data.message ?? "Falha ao salvar configurações."); return data; }
type ZoneInput = { name: string; fee: number; estimatedMinutesMin: number; estimatedMinutesMax: number; minimumOrder: number; active: boolean };
export const settingsApi = {
  get: () => request<SettingsData>("/admin/settings"),
  saveStore: (input: Partial<StoreSettings>) => request<StoreSettings>("/admin/settings/store", { method: "PATCH", body: JSON.stringify(input) }),
  saveHours: (hours: StoreHour[]) => request<StoreHour[]>("/admin/settings/hours", { method: "PUT", body: JSON.stringify({ hours }) }),
  createZone: (input: ZoneInput) => request<DeliveryZone>("/admin/settings/zones", { method: "POST", body: JSON.stringify(input) }),
  updateZone: (id: string, input: Partial<ZoneInput>) => request<DeliveryZone>(`/admin/settings/zones/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  removeZone: (id: string) => request<void>(`/admin/settings/zones/${id}`, { method: "DELETE" }),
};
