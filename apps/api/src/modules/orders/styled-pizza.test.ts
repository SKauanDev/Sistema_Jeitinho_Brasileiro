import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { initialStyleMenus, parseStyleMenus, type PizzaStyle } from "../catalog/pizza-style-menu.js";
import { emptyPizzaRules } from "../catalog/pizza-rules.js";
import { resolvePizzaConfiguration, type PizzaProduct } from "./pizza-configuration.js";

const savory = { id: randomUUID(), name: "Recheio salgado QA", type: "SAVORY" as const, price: .01, active: true };
const sweetBorder = { id: randomUUID(), name: "Recheio doce QA", type: "SWEET" as const, price: .01, active: true };
const rules = () => ({ ...emptyPizzaRules(), borders: [savory, sweetBorder], menus: initialStyleMenus([savory, sweetBorder]) });
const common: PizzaProduct = { id: "common", name: "Comum", category: "Pizzas", pizzaSlots: 1, price: .01, promotionalPrice: .01, sizes: null };
const premium = { ...common, id: "premium", category: "Pizza premium" };
const sweet = { ...common, id: "sweet", category: "Pizza doce" };
const otherSweet = { ...sweet, id: "other-sweet" };
const all = new Map([common, premium, sweet, otherSweet].map(product => [product.id, product]));
const whole = (id: string, borderId?: string) => [{ mode: "whole" as const, leftId: id, borderId }];

test("18 preços informados são definidos pela categoria, estilo e tamanho, ignorando preço antigo e promoção", () => {
  for (const [product, style, expected] of [
    [common, "NAPOLITANA", [32.9, 34, 67, 77]], [common, "TONDA_ROMANA", [35, 50, 60]],
    [premium, "NAPOLITANA", [49, 59, 77, 87]], [premium, "TONDA_ROMANA", [44, 55, 70]], [sweet, "NAPOLITANA", [39, 54, 67, 77]],
  ] as Array<[PizzaProduct, PizzaStyle, number[]]>) {
    expected.forEach((price, i) => {
      const result = resolvePizzaConfiguration(product, ["P", "M", "G", "GG"][i], whole(product.id), all, rules(), style);
      assert.equal(result.unitPrice, price);
      assert.equal(result.options[0]!.group, "Estilo da massa");
      assert.equal(result.options[1]!.name, ["P", "M", "G", "GG"][i]);
    });
  }
});
test("bordas cobram 15 na comum e 18 na doce; preço antigo do recheio não interfere", () => {
  const normal = resolvePizzaConfiguration(common, "P", whole(common.id, savory.id), all, rules(), "NAPOLITANA");
  assert.equal(normal.unitPrice, 32.9); assert.equal(normal.options.at(-1)!.price, 15);
  const dessert = resolvePizzaConfiguration(sweet, "GG", whole(sweet.id, sweetBorder.id), all, rules(), "NAPOLITANA");
  assert.equal(dessert.unitPrice, 77); assert.equal(dessert.options.at(-1)!.price, 18);
  assert.equal(resolvePizzaConfiguration(common, "P", whole(common.id, sweetBorder.id), all, rules(), "NAPOLITANA").options.at(-1)!.price, 18);
  assert.equal(resolvePizzaConfiguration(sweet, "P", whole(sweet.id, savory.id), all, rules(), "NAPOLITANA").options.at(-1)!.price, 15);
});
test("bloqueia estilo ausente, tonda GG, doce tonda e borda tonda", () => {
  assert.throws(() => resolvePizzaConfiguration(common, "G", whole(common.id), all, rules()), /estilo/);
  assert.throws(() => resolvePizzaConfiguration(common, "GG", whole(common.id), all, rules(), "TONDA_ROMANA"), /disponível/);
  assert.throws(() => resolvePizzaConfiguration(sweet, "P", whole(sweet.id), all, rules(), "TONDA_ROMANA"), /disponível/);
  assert.throws(() => resolvePizzaConfiguration(common, "P", whole(common.id, savory.id), all, rules(), "TONDA_ROMANA"), /borda/);
});
test("premium usa o preço do tipo da borda, ignorando o acréscimo premium antigo", () => {
  assert.equal(resolvePizzaConfiguration(premium, "P", whole(premium.id), all, rules(), "NAPOLITANA").unitPrice, 49);
  assert.equal(resolvePizzaConfiguration(premium, "P", whole(premium.id, savory.id), all, rules(), "NAPOLITANA").options.at(-1)!.price, 15);
  const configured = rules(); configured.menus.find(menu => menu.kind === "PREMIUM" && menu.style === "NAPOLITANA")!.borderPrice = 20;
  assert.equal(resolvePizzaConfiguration(premium, "P", whole(premium.id, savory.id), all, configured, "NAPOLITANA").options.at(-1)!.price, 15);
  assert.equal(resolvePizzaConfiguration(premium, "P", whole(premium.id, sweetBorder.id), all, configured, "NAPOLITANA").options.at(-1)!.price, 18);
  configured.menus.find(menu => menu.kind === "SWEET" && menu.style === "NAPOLITANA")!.borderPrice = null;
  assert.throws(() => resolvePizzaConfiguration(common, "P", whole(common.id, sweetBorder.id), all, configured, "NAPOLITANA"), /borda/);
});
test("meio a meio comum/premium só libera com tabela própria; doce continua restrito à categoria", () => {
  const half = [{ mode: "half" as const, leftId: common.id, rightId: premium.id }];
  assert.throws(() => resolvePizzaConfiguration(common, "G", half, all, rules(), "NAPOLITANA"), /combinação/);
  const configured = rules(); configured.menus.find(menu => menu.kind === "MIXED" && menu.style === "NAPOLITANA")!.sizes = [{ size: "G", price: 91.5 }];
  assert.equal(resolvePizzaConfiguration(common, "G", half, all, configured, "NAPOLITANA").unitPrice, 91.5);
  assert.equal(resolvePizzaConfiguration(common, "G", [{ ...half[0], borderId: savory.id }], all, configured, "NAPOLITANA").options.at(-1)!.price, 15);
  assert.equal(resolvePizzaConfiguration(common, "G", [{ ...half[0], borderId: sweetBorder.id }], all, configured, "NAPOLITANA").options.at(-1)!.price, 18);
  assert.throws(() => resolvePizzaConfiguration(common, "G", [{ mode: "half", leftId: common.id, rightId: sweet.id }], all, configured, "NAPOLITANA"), /doce/);
  assert.equal(resolvePizzaConfiguration(sweet, "M", [{ mode: "half", leftId: sweet.id, rightId: otherSweet.id }], all, configured, "NAPOLITANA").unitPrice, 54);
});
test("valida duplicatas, recheios inexistentes e configurações de tonda; preserva pendências sem inventar valores", () => {
  const menus = initialStyleMenus([savory, sweetBorder]), ids = new Set([savory.id, sweetBorder.id]);
  assert.equal(parseStyleMenus(menus, ids).length, 7);
  assert.throws(() => parseStyleMenus([menus[0], menus[0]], ids), /repita/);
  assert.throws(() => parseStyleMenus([{ ...menus[0], borderIds: ["fake"] }], ids), /recheios/);
  assert.throws(() => parseStyleMenus([{ ...menus[1], sizes: [{ size: "GG", price: 10 }] }], ids), /Tonda/);
});
