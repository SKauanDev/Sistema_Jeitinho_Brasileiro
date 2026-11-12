import type { PizzaRules } from "./pizza-rules.js";

type ProductData = { price: unknown; sizes?: unknown; promotionalPrice?: unknown; pizzaSlots?: number };
type CategoryData = { name: string; products: ProductData[] };

/** Project category prices at read time; product snapshots must not override the price table. */
export function applyCatalogPricing<T extends CategoryData>(categories: T[], rules: PizzaRules): T[] {
  if (!rules.menus?.length) return categories;
  return categories.map(category => {
    const name = category.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    if (!/pizza|premium/.test(name) || /combo/.test(name)) return category;
    const kind = /doce/.test(name) ? "SWEET" : /premium/.test(name) ? "PREMIUM" : "TRADITIONAL";
    const prices = rules.menus!.filter(menu => menu.kind === kind).flatMap(menu => menu.sizes);
    const sizes = (["P", "M", "G", "GG"] as const).flatMap(size => {
      const values = prices.filter(entry => entry.size === size).map(entry => entry.price);
      return values.length ? [{ size, price: Math.min(...values) }] : [];
    });
    return { ...category, products: category.products.map(product => ({
      ...product,
      price: (prices.length ? Math.min(...prices.map(entry => entry.price)) : 0).toFixed(2),
      promotionalPrice: null,
      sizes,
      pizzaSlots: 1,
      pricingSource: "CATEGORY_STYLE",
    })) };
  });
}
