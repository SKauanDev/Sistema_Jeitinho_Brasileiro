import { parseSizes, PizzaValidationError, type SizePrice } from "./pizza-sizes.js";

export const PIZZA_STYLES = { NAPOLITANA: "Napolitana", TONDA_ROMANA: "Tonda romana" } as const;
export type PizzaStyle = keyof typeof PIZZA_STYLES;
export type PizzaKind = "TRADITIONAL" | "PREMIUM" | "SWEET";
export type PizzaMenu = {
  kind: PizzaKind | "MIXED";
  style: PizzaStyle;
  sizes: SizePrice[];
  borderMode: "NONE" | "PAID";
  borderPrice: number | null;
  borderIds: string[];
};

export function parseStyleMenus(value: unknown, borderIds: Set<string>): PizzaMenu[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 7) throw new PizzaValidationError("Tabela de estilos inválida.");
  const keys = new Set<string>();
  return value.map(menu => {
    if (!menu || !["TRADITIONAL", "PREMIUM", "SWEET", "MIXED"].includes(menu.kind) || !Object.hasOwn(PIZZA_STYLES, menu.style)) throw new PizzaValidationError("Categoria ou estilo de pizza inválido.");
    const key = `${menu.kind}:${menu.style}`;
    if (keys.has(key)) throw new PizzaValidationError("Não repita uma tabela de categoria e estilo.");
    keys.add(key);
    const sizes = parseSizes(menu.sizes);
    if (menu.style === "TONDA_ROMANA" && (menu.kind === "SWEET" || sizes.some(size => size.size === "GG"))) throw new PizzaValidationError("Tonda romana aceita apenas pizzas salgadas nos tamanhos P, M e G.");
    if (!["NONE", "PAID"].includes(menu.borderMode) || (menu.borderMode === "PAID" && menu.style !== "NAPOLITANA")) throw new PizzaValidationError("Borda recheada disponível apenas na napolitana.");
    if (menu.borderPrice !== null && (typeof menu.borderPrice !== "number" || !Number.isFinite(menu.borderPrice) || menu.borderPrice <= 0 || menu.borderPrice > 99999 || Math.abs(menu.borderPrice * 100 - Math.round(menu.borderPrice * 100)) > .00001)) throw new PizzaValidationError("Informe um valor positivo para a borda ou deixe pendente.");
    if (!Array.isArray(menu.borderIds) || menu.borderIds.length > 50 || menu.borderIds.some((id: unknown) => typeof id !== "string" || !borderIds.has(id)) || new Set(menu.borderIds).size !== menu.borderIds.length) throw new PizzaValidationError("Escolha recheios de borda cadastrados, sem repetições.");
    return { kind: menu.kind, style: menu.style, sizes, borderMode: menu.borderMode, borderPrice: menu.borderMode === "PAID" ? menu.borderPrice : null, borderIds: menu.borderMode === "PAID" ? menu.borderIds : [] };
  });
}

export function initialStyleMenus(borders: Array<{ id: string; type: string; active: boolean }>): PizzaMenu[] {
  const prices = (values: number[]) => values.map((price, index) => ({ size: (["P", "M", "G", "GG"] as const)[index]!, price }));
  const menu = (kind: PizzaMenu["kind"], style: PizzaStyle, values: number[], borderPrice: number | null): PizzaMenu => ({
    kind, style, sizes: prices(values), borderMode: style === "NAPOLITANA" && kind !== "MIXED" ? "PAID" : "NONE", borderPrice,
    borderIds: style === "NAPOLITANA" && kind !== "MIXED" ? borders.filter(border => border.active && border.type === (kind === "SWEET" ? "SWEET" : "SAVORY")).map(border => border.id) : [],
  });
  return [
    menu("TRADITIONAL", "NAPOLITANA", [32.9, 34, 67, 77], 15),
    menu("TRADITIONAL", "TONDA_ROMANA", [35, 50, 60], null),
    menu("PREMIUM", "NAPOLITANA", [49, 59, 77, 87], null),
    menu("PREMIUM", "TONDA_ROMANA", [44, 55, 70], null),
    menu("SWEET", "NAPOLITANA", [39, 54, 67, 77], 18),
    menu("MIXED", "NAPOLITANA", [], null),
    menu("MIXED", "TONDA_ROMANA", [], null),
  ];
}
