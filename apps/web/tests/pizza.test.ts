import assert from "node:assert/strict";
import test from "node:test";
import { configuredPizzaPrice, flavorAlreadyChosen } from "../src/utils/pizza";
import type { Product } from "../src/data/menu";
const base: Product = { id: "a", name: "Queijos", category: "Pizzas", description: "", image: "", price: 30, sizes: [{ size: "G", price: 60 }] };
const other: Product = { ...base, id: "b", price: 40, sizes: [{ size: "G", price: 75 }] };
test("avisa ao repetir um sabor em qualquer metade", () => {
  const pizza = { mode: "half" as const, leftId: "a", rightId: "b" };
  assert.equal(flavorAlreadyChosen(pizza, "a"), true);
  assert.equal(flavorAlreadyChosen(pizza, "b"), true);
  assert.equal(flavorAlreadyChosen(pizza, "c"), false);
  assert.equal(flavorAlreadyChosen({ mode: "whole", leftId: "a" }, "a"), false);
});
test("valor exibido acompanha tamanho e maior preço entre sabores", () => {
  assert.equal(configuredPizzaPrice(base, "G", [{ mode: "half", leftId: "a", rightId: "b" }], [base, other]), 75);
  assert.equal(configuredPizzaPrice(base, "G", [{ mode: "whole", leftId: "a" }], [base, other]), 60);
  assert.equal(configuredPizzaPrice({ ...base, category: "Combos", price: 100, sizes: [] }, undefined, [{ mode: "half", leftId: "a", rightId: "b" }], [base, other]), 100);
});
