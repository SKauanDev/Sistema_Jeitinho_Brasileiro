import { API_URL } from "./admin-api";
import type { FinanceData, FinancialEntry } from "../types/finance";
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("urfood_token")}`,
      ...init?.headers,
    },
  });
  const data = (await response.json()) as T & { message?: string };
  if (!response.ok)
    throw new Error(data.message ?? "Falha ao consultar financeiro.");
  return data;
}
export const financeApi = {
  get: (period: string) =>
    request<FinanceData>(`/admin/finance?period=${period}`),
  getRange: (start: string, end: string) =>
    request<FinanceData>(
      `/admin/finance?period=custom&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    ),
  createEntry: (input: {
    type: "IN" | "OUT";
    category: string;
    description: string;
    amount: number;
    entryDate: string;
    notes: string;
  }) =>
    request<FinancialEntry>("/admin/finance/entries", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
