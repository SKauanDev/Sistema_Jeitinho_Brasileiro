import assert from "node:assert/strict";
import test from "node:test";
import { applyCatalogPricing } from "./catalog-pricing.js";
import { initialStyleMenus } from "./pizza-style-menu.js";
import { emptyPizzaRules } from "./pizza-rules.js";
import { createAsyncCache } from "../../shared/async-cache.js";

const product = { id: "old", price: "10.50", promotionalPrice: "0.01", pizzaSlots: 0, sizes: [{ size: "P", price: 39 }, { size: "G", price: 69 }] };
const categories = ["Pizzas", "Pizzas premium", "Pizzas doces", "Combos", "Bebidas"].map(name => ({ name, products: [{ ...product }] }));
const rules = () => ({ ...emptyPizzaRules(), menus: initialStyleMenus([]) });

test("catálogo público/admin herda preços e tamanhos das três categorias, apesar de valores antigos ou promoção individual", () => {
  const result = applyCatalogPricing(categories, rules());
  assert.deepEqual(result.slice(0, 3).map(category => category.products[0]!.price), ["32.90", "44.00", "39.00"]);
  assert.deepEqual(result[0]!.products[0]!.sizes, [{ size: "P", price: 32.9 }, { size: "M", price: 34 }, { size: "G", price: 60 }, { size: "GG", price: 77 }]);
  for (const category of result.slice(0, 3)) { assert.equal(category.products[0]!.promotionalPrice, null); assert.equal(category.products[0]!.pizzaSlots, 1); }
  assert.equal(result[3], categories[3]); assert.equal(result[4], categories[4]);
  assert.equal(categories[0]!.products[0]!.price, "10.50");
  assert.equal(categories[0]!.products[0]!.promotionalPrice, "0.01");
});
test("alterar a tabela muda a resposta imediatamente, mesmo com os produtos antigos no cache", async () => {
  let reads = 0;
  const cache = createAsyncCache(30_000, async () => { reads++; return categories; });
  const configured = rules();
  const first = applyCatalogPricing(await cache.get(), configured);
  for (const menu of configured.menus) if (menu.kind === "TRADITIONAL") menu.sizes = menu.sizes.map(entry => ({ ...entry, price: entry.price + 100 }));
  const second = applyCatalogPricing(await cache.get(), configured);
  assert.equal(reads, 1);
  assert.equal(first[0]!.products[0]!.price, "32.90"); assert.equal(second[0]!.products[0]!.price, "132.90");
  assert.equal(first[1]!.products[0]!.price, second[1]!.products[0]!.price);
});
test("sem tabela por estilos, preços legados são preservados", () => {
  assert.equal(applyCatalogPricing(categories, emptyPizzaRules()), categories);
});
