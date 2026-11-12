import assert from "node:assert/strict";
import test from "node:test";
import { parseSizes } from "../catalog/pizza-sizes.js";
import { resolvePizzaConfiguration, type PizzaProduct } from "./pizza-configuration.js";
import { emptyPizzaRules } from "../catalog/pizza-rules.js";

const cheese: PizzaProduct = { id: "cheese", name: "Queijos", category: "Pizzas", pizzaSlots: 1, price: 30, promotionalPrice: 1, sizes: [{ size: "P", price: 30 }, { size: "G", price: 60 }] };
const bacon: PizzaProduct = { ...cheese, id: "bacon", name: "Bacon", sizes: [{ size: "G", price: 75 }] };
const flavors = new Map([cheese, bacon].map(product => [product.id, product]));
const half = [{ mode: "half" as const, leftId: cheese.id, rightId: bacon.id }];

test("normaliza tamanhos e rejeita preços inválidos, casas extras e repetições", () => {
  assert.deepEqual(parseSizes([{ size: "GG", price: 80 }, { size: "P", price: "30.50" }]), [{ size: "P", price: 30.5 }, { size: "GG", price: 80 }]);
  for (const value of [[{ size: "X", price: 3 }], [{ size: "P", price: 0 }], [{ size: "G", price: 1.001 }], [{ size: "P", price: 3 }, { size: "P", price: 4 }], {}]) assert.throws(() => parseSizes(value));
});
test("meio a meio usa o maior preço cadastrado no tamanho, sem aplicar promoção de preço único", () => {
  const result = resolvePizzaConfiguration(cheese, "G", half, flavors);
  assert.equal(result.unitPrice, 75);
  assert.deepEqual(result.options.map(option => option.name), ["G", "Queijos", "Bacon"]);
  assert.ok(result.options.every(option => option.price === 0));
});
test("sabor inteiro cobra o preço do sabor escolhido no tamanho", () => {
  assert.equal(resolvePizzaConfiguration(cheese, "G", [{ mode: "whole", leftId: "bacon" }], flavors).unitPrice, 75);
});
test("rejeita tamanho ausente, inexistente e sabor indisponível nesse tamanho", () => {
  assert.throws(() => resolvePizzaConfiguration(cheese, undefined, half, flavors));
  assert.throws(() => resolvePizzaConfiguration(cheese, "GG", half, flavors));
  assert.throws(() => resolvePizzaConfiguration(cheese, "P", half, flavors));
});
test("rejeita duas metades iguais, pizza incompleta e sabores indisponíveis", () => {
  assert.throws(() => resolvePizzaConfiguration(cheese, "G", [{ mode: "half", leftId: "cheese", rightId: "cheese" }], flavors), /já foi escolhido/);
  assert.throws(() => resolvePizzaConfiguration(cheese, "G", [{ mode: "half", leftId: "cheese" }], flavors));
  assert.throws(() => resolvePizzaConfiguration(cheese, "G", half, new Map([[cheese.id, cheese]])));
  assert.throws(() => resolvePizzaConfiguration(cheese, "G", [], flavors));
});
test("combo mantém o próprio preço e valida cada pizza independentemente", () => {
  const combo: PizzaProduct = { id: "combo", name: "Família", category: "Combos", pizzaSlots: 2, price: 100 };
  assert.equal(resolvePizzaConfiguration(combo, undefined, [...half, ...half], flavors).unitPrice, 100);
  assert.throws(() => resolvePizzaConfiguration(combo, undefined, half, flavors));
});
test("produtos sem tamanhos continuam aceitando o preço único", () => {
  const legacy = { ...cheese, sizes: null, promotionalPrice: 25 };
  assert.equal(resolvePizzaConfiguration(legacy, undefined, undefined, flavors).unitPrice, 25);
  assert.throws(() => resolvePizzaConfiguration(legacy, "G", undefined, flavors));
});

test("comum tem preço fixo por tamanho e comum/premium usa regra própria", () => {
  const premium = { ...bacon, id: "premium", category: "Premium" };
  const rules = { ...emptyPizzaRules(), traditional: [{ size: "G" as const, price: 59 }], mixed: [{ size: "G" as const, price: 89 }] };
  const all = new Map([...flavors, [premium.id, premium]]);
  assert.equal(resolvePizzaConfiguration(cheese, "G", half, all, rules).unitPrice, 59);
  assert.equal(resolvePizzaConfiguration(cheese, "G", [{ mode: "whole", leftId: cheese.id }], all, rules).unitPrice, 59);
  const mixed = [{ mode: "half", leftId: cheese.id, rightId: premium.id }];
  assert.equal(resolvePizzaConfiguration(cheese, "G", mixed, all, rules).unitPrice, 89);
  assert.equal(resolvePizzaConfiguration(premium, "G", mixed, all, rules).unitPrice, 89);
});
test("doce só combina com doce, inclusive nos combos", () => {
  const sweet = { ...cheese, id: "sweet", category: "Pizza doce" }, other = { ...sweet, id: "other" };
  const all = new Map([...flavors, [sweet.id, sweet], [other.id, other]]);
  assert.throws(() => resolvePizzaConfiguration(cheese, "G", [{ mode: "half", leftId: cheese.id, rightId: sweet.id }], all), /doce/);
  assert.throws(() => resolvePizzaConfiguration(sweet, "G", half, all), /doce/);
  assert.equal(resolvePizzaConfiguration(sweet, "G", [{ mode: "half", leftId: sweet.id, rightId: other.id }], all).unitPrice, 60);
  const combo = { ...cheese, category: "Combos", pizzaSlots: 1, sizes: null };
  assert.throws(() => resolvePizzaConfiguration(combo, undefined, [{ mode: "half", leftId: cheese.id, rightId: sweet.id }], all), /doce/);
});
test("borda tem valor canônico por pizza, não altera preço base e rejeita borda oculta", () => {
  const rules = { ...emptyPizzaRules(), borders: [{ id: "border", name: "Catupiry", type: "SAVORY" as const, price: 12, active: true }] };
  const result = resolvePizzaConfiguration(cheese, "G", [{ mode: "half", leftId: cheese.id, rightId: bacon.id, borderId: "border" }], flavors, rules);
  assert.equal(result.unitPrice, 75);
  assert.deepEqual(result.options.at(-1), { name: "Catupiry", group: "Borda · Pizza 1", price: 12 });
  rules.borders[0]!.active = false;
  assert.throws(() => resolvePizzaConfiguration(cheese, "G", [{ mode: "whole", leftId: cheese.id, borderId: "border" }], flavors, rules), /borda/);
});
