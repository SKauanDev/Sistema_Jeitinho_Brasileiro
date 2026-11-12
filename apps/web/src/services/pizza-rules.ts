import { API_URL } from "./admin-api";
import type { SizePrice } from "../types/catalog";
export const PIZZA_STYLES = { NAPOLITANA: "Napolitana", TONDA_ROMANA: "Tonda romana" } as const;
export type PizzaStyle = keyof typeof PIZZA_STYLES;
export type PizzaKind = "TRADITIONAL" | "PREMIUM" | "SWEET";
export type PizzaMenu = { kind: PizzaKind | "MIXED"; style: PizzaStyle; sizes: SizePrice[]; borderMode: "NONE" | "PAID"; borderPrice: number | null; borderIds: string[] };
export type PizzaRules = { menus?: PizzaMenu[]; traditional: SizePrice[]; mixed: SizePrice[]; borders: Array<{ id: string; name: string; type: "SAVORY" | "SWEET"; price: number; active: boolean }> };
export const emptyPizzaRules = (): PizzaRules => ({ traditional: [], mixed: [], borders: [] });
export async function loadPizzaRules(): Promise<PizzaRules> {
  const response = await fetch(`${API_URL}/pizza-rules`, { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar as regras de pizzas.");
  return response.json();
}
export async function savePizzaRules(rules: PizzaRules): Promise<PizzaRules> {
  const response = await fetch(`${API_URL}/pizza-rules`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("urfood_token")}` }, body: JSON.stringify(rules) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Não foi possível salvar.");
  window.dispatchEvent(new Event("urfood:pizza-prices-updated"));
  try { localStorage.setItem("urfood_pizza_prices_revision", String(Date.now())); } catch { /* Prices also refresh on focus and periodically. */ }
  return data;
}
