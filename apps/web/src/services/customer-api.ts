import { API_URL } from "./admin-api";
import type { Customer, CustomerDetails } from "../types/customer";
async function request<T>(path: string): Promise<T> { const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem("urfood_token")}` } }); const data = await response.json() as T & { message?: string }; if (!response.ok) throw new Error(data.message ?? "Falha ao consultar clientes."); return data; }
export const customerApi = { list: () => request<Customer[]>("/admin/customers"), details: (phone: string) => request<CustomerDetails>(`/admin/customers/${encodeURIComponent(phone.replace(/\D/g, ""))}`) };
