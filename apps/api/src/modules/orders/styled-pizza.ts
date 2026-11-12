import { PizzaValidationError } from "../catalog/pizza-sizes.js";
import { PIZZA_STYLES, type PizzaMenu, type PizzaStyle } from "../catalog/pizza-style-menu.js";
import { pizzaKind, type PizzaRules } from "../catalog/pizza-rules.js";
import type { PizzaProduct, PizzaSelection } from "./pizza-configuration.js";

export function resolveStyledPizza(product: PizzaProduct, size: unknown, selections: unknown, products: Map<string, PizzaProduct>, rules: PizzaRules, style: unknown) {
  if (typeof style !== "string" || !Object.hasOwn(PIZZA_STYLES, style)) throw new PizzaValidationError("Escolha o estilo da pizza.");
  if (typeof size !== "string") throw new PizzaValidationError("Escolha o tamanho da pizza.");
  if (!Array.isArray(selections) || selections.length !== 1) throw new PizzaValidationError("Escolha os sabores da pizza.");
  const selection = selections[0] as PizzaSelection;
  if (!selection || !["whole", "half"].includes(selection.mode) || !selection.leftId || (selection.mode === "half" && !selection.rightId)) throw new PizzaValidationError("Escolha os sabores da pizza.");
  if (selection.mode === "half" && selection.leftId === selection.rightId) throw new PizzaValidationError("Esse sabor já foi escolhido.");
  const ids = selection.mode === "half" ? [selection.leftId, selection.rightId!] : [selection.leftId];
  const flavors = ids.map(id => {
    const flavor = products.get(id);
    if (!flavor || /combo/i.test(flavor.category) || (!/pizza|premium/i.test(flavor.category) && flavor.pizzaSlots !== 1)) throw new PizzaValidationError("Um sabor escolhido não está disponível.");
    return flavor;
  });
  const kinds = flavors.map(flavor => pizzaKind(flavor.category));
  if (kinds.some(kind => (kind === "SWEET") !== (pizzaKind(product.category) === "SWEET"))) throw new PizzaValidationError("Pizza doce só pode combinar com outra pizza doce.");
  const find = (kind: PizzaMenu["kind"]) => rules.menus?.find(menu => menu.kind === kind && menu.style === style);
  if (!find(pizzaKind(product.category))?.sizes.some(entry => entry.size === size) || kinds.some(kind => !find(kind)?.sizes.some(entry => entry.size === size))) throw new PizzaValidationError("Este sabor não está disponível nesse estilo e tamanho.");
  const mixed = kinds.includes("PREMIUM") && kinds.includes("TRADITIONAL");
  const menu = find(mixed ? "MIXED" : kinds[0]!);
  const price = menu?.sizes.find(entry => entry.size === size)?.price;
  if (price === undefined) throw new PizzaValidationError("Esta combinação não está disponível nesse estilo e tamanho.");
  const options = [
    { name: PIZZA_STYLES[style as PizzaStyle], group: "Estilo da massa", price: 0 },
    { name: size, group: "Tamanho", price: 0 },
    ...flavors.map((flavor, index) => ({ name: flavor.name, group: `Pizza 1 · ${selection.mode === "whole" ? "sabor inteiro" : index === 0 ? "1ª metade" : "2ª metade"}`, price: 0 })),
  ];
  if (selection.borderId) {
    const borderMenu = mixed ? find("PREMIUM") : menu;
    const border = rules.borders.find(border => border.id === selection.borderId && border.active);
    if (!border || borderMenu?.borderMode !== "PAID" || borderMenu.borderPrice === null || !borderMenu.borderIds.includes(border.id)) throw new PizzaValidationError("Esta borda não está disponível para a pizza escolhida.");
    options.push({ name: border.name, group: "Borda · Pizza 1", price: borderMenu.borderPrice });
  }
  return { unitPrice: price, options };
}
