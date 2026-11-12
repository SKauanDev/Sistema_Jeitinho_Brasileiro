import { API_URL } from "./admin-api";

export const TABLE_ACCESS_DENIED = "Não autorizado, validado apenas pelo sistema.";
const storageKey = (key: string) => `urfood_table_access:${key}`;
// A grant belongs to this running document, never a saved tab/browser session.
// Opening the QR URL through the phone camera creates a new document with no grant.
const grants = new Map<string, string>();
const discardLegacyAccess = (key: string) => {
  try { sessionStorage.removeItem(storageKey(key)); } catch { /* Storage is not required for scanning. */ }
};
export function saveTableAccess(key: string, accessToken: string) {
  discardLegacyAccess(key);
  if (grants.get(key) === accessToken) return;
  grants.set(key, accessToken);
  window.dispatchEvent(new CustomEvent("urfood:table-authorized", { detail: key }));
}
export function tableAccessHeaders(key: string): Record<string, string> {
  discardLegacyAccess(key);
  const token = grants.get(key);
  return token ? { "X-Table-Access": token } : {};
}
export function clearTableAccess(key: string) { grants.delete(key); discardLegacyAccess(key); }
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
