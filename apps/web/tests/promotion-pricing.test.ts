import assert from "node:assert/strict";
import test from "node:test";
import {
  configuredPizzaPrice,
  configuredBorderPrice,
  productPrice,
} from "../src/utils/pizza.ts";
import type { Product } from "../src/data/menu.ts";
import type { PizzaRules } from "../src/services/pizza-rules.ts";
test("cardápio calcula promoção em pizzas por estilo/tamanho e preserva a borda e a regra do meio a meio", () => {
  const a: Product = {
    id: "a",
    name: "A",
    description: "",
    image: "",
    category: "Pizzas",
    price: 48,
    basePrice: 60,
    promotionPercent: 20,
    pizzaSlots: 1,
  };
  const b = { ...a, id: "b", promotionPercent: 10 };
  const rules: PizzaRules = {
    traditional: [],
    mixed: [],
    borders: [
      { id: "border", name: "Queijo", type: "SAVORY", price: 15, active: true },
    ],
    menus: [
      {
        style: "NAPOLITANA",
        kind: "TRADITIONAL",
        sizes: [{ size: "G", price: 60 }],
        borderMode: "PAID",
        borderPrice: 15,
        borderIds: ["border"],
      },
    ],
  };
  const whole = [{ mode: "whole" as const, leftId: a.id, borderId: "border" }];
  assert.equal(
    configuredPizzaPrice(a, "G", whole, [a, b], rules, "NAPOLITANA"),
    48,
  );
  assert.equal(
    configuredBorderPrice(a, whole, [a, b], rules, "NAPOLITANA"),
    15,
  );
  assert.equal(
    configuredPizzaPrice(
      a,
      "G",
      [{ mode: "half", leftId: a.id, rightId: b.id }],
      [a, b],
      rules,
      "NAPOLITANA",
    ),
    54,
  );
  assert.equal(productPrice({ ...a, category: "Bebidas", pizzaSlots: 0 }), 48);
  assert.equal(
    configuredPizzaPrice(
      { ...a, promotionPercent: 0 },
      "G",
      whole,
      [{ ...a, promotionPercent: 0 }],
      rules,
      "NAPOLITANA",
    ),
    60,
  );
});
