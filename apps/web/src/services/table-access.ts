import { API_URL } from "./admin-api";

export const TABLE_ACCESS_DENIED = "Não autorizado, validado apenas pelo sistema.";
const storageKey = (key: string) => `urfood_table_access:${key}`;
export function saveTableAccess(key: string, accessToken: string) {
  sessionStorage.setItem(storageKey(key), accessToken);
}
export function tableAccessHeaders(key: string): Record<string, string> {
  const token = sessionStorage.getItem(storageKey(key));
  return token ? { "X-Table-Access": token } : {};
}
export function clearTableAccess(key: string) { sessionStorage.removeItem(storageKey(key)); }
export async function authorizeTableScan(path: string, signal?: AbortSignal) {
  const key = /^\/mesa\/([a-f0-9]{64})$/.exec(path)?.[1];
  if (!key) throw new Error(TABLE_ACCESS_DENIED);
  const response = await fetch(`${API_URL}/tables/scan`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }), signal,
  });
  const data = await response.json();
  if (!response.ok || typeof data.accessToken !== "string") throw new Error(data.message ?? TABLE_ACCESS_DENIED);
  signal?.throwIfAborted();
  saveTableAccess(key, data.accessToken);
}
