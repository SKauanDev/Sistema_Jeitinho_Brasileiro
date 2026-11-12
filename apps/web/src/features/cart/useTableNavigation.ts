import { useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

type TableView = { category: string | null; product: string | null; view: "cart" | "checkout" | null; flavors: boolean };
const keys = { category: "categoria", product: "produto", view: "etapa", flavors: "sabores" } as const;

/** UI steps stay in the same document and participate in browser Back/Forward. */
export function useTableNavigation() {
  const location = useLocation(), navigate = useNavigate();
  const latest = useRef({ location, navigate });
  latest.current = { location, navigate };
  const params = new URLSearchParams(location.search);
  const rawView = params.get(keys.view);
  const state: TableView = { category: params.get(keys.category), product: params.get(keys.product), view: rawView === "cart" || rawView === "checkout" ? rawView : null, flavors: params.get(keys.flavors) === "1" };
  const change = useCallback((patch: Partial<TableView>) => {
    const { location, navigate } = latest.current;
    const params = new URLSearchParams(location.search);
    for (const [field, value] of Object.entries(patch)) {
      const key = keys[field as keyof TableView];
      if (value === null || value === false) params.delete(key);
      else params.set(key, value === true ? "1" : String(value));
    }
    const search = params.toString();
    const target = location.pathname + (search ? `?${search}` : "");
    const current = location.pathname + location.search;
    if (target === current) return;
    const routeState = location.state && typeof location.state === "object" ? location.state : {};
    const trail: string[] = Array.isArray(routeState.tableFlowTrail) ? routeState.tableFlowTrail : [];
    const previous = trail.lastIndexOf(target);
    if (previous >= 0) navigate(previous - trail.length);
    else navigate(target, { state: { ...routeState, tableFlowTrail: [...trail, current] }, preventScrollReset: true });
  }, []);
  return { ...state, change };
}
