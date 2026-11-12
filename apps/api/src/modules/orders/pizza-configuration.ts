import { parseSizes, sizePrice, PizzaValidationError } from "../catalog/pizza-sizes.js";
import { emptyPizzaRules, pizzaKind, type PizzaRules } from "../catalog/pizza-rules.js";
import { resolveStyledPizza } from "./styled-pizza.js";

export type PizzaSelection = { mode: "whole" | "half"; leftId?: string; rightId?: string; borderId?: string };
export type PizzaProduct = { id: string; name: string; category: string; pizzaSlots: number; sizes?: unknown; price: unknown; promotionalPrice?: unknown };
export const isPizzaFlavor = (product: PizzaProduct) => !/combo/i.test(product.category) && (/pizza|premium/i.test(product.category) || product.pizzaSlots === 1);

export function resolvePizzaConfiguration(product: PizzaProduct, size: unknown, selections: unknown, products: Map<string, PizzaProduct>, rules: PizzaRules = emptyPizzaRules(), style?: unknown) {
  if (rules.menus?.length && isPizzaFlavor(product)) return resolveStyledPizza(product, size, selections, products, rules, style);
  if (style !== undefined) throw new PizzaValidationError("Este produto não possui esse estilo de massa.");
  if (size !== undefined && typeof size !== "string") throw new PizzaValidationError("Tamanho inválido.");
  let unitPrice = sizePrice(product, size as string | undefined);
  const options: Array<{ name: string; group: string; price: number }> = [];
  if (size) options.push({ name: size as string, group: "Tamanho", price: 0 });
  const slots = product.pizzaSlots || (isPizzaFlavor(product) ? 1 : 0);
  if (selections === undefined) {
    if (parseSizes(product.sizes).length && slots) throw new PizzaValidationError("Escolha os sabores da pizza.");
    return { unitPrice, options };
  }
  if (!Array.isArray(selections) || selections.length !== slots || slots > 10) throw new PizzaValidationError("Escolha os sabores de todas as pizzas.");
  const flavorPrices: number[] = [];
  selections.forEach((selection: PizzaSelection, index) => {
    if (!selection || !["whole", "half"].includes(selection.mode) || !selection.leftId || (selection.mode === "half" && !selection.rightId)) throw new PizzaValidationError("Escolha os sabores de todas as pizzas.");
    if (selection.mode === "half" && selection.leftId === selection.rightId) throw new PizzaValidationError("Esse sabor já foi escolhido.");
    const ids = selection.mode === "half" ? [selection.leftId, selection.rightId!] : [selection.leftId];
    const selectedFlavors = ids.map(id => products.get(id));
    const kinds = selectedFlavors.filter((flavor): flavor is PizzaProduct => !!flavor).map(flavor => pizzaKind(flavor.category));
    if (kinds.includes("SWEET") && kinds.some(kind => kind !== "SWEET")) throw new PizzaValidationError("Pizza doce só pode combinar com outra pizza doce.");
    if (isPizzaFlavor(product) && kinds.some(kind => (kind === "SWEET") !== (pizzaKind(product.category) === "SWEET"))) throw new PizzaValidationError("Pizza doce só pode combinar com outra pizza doce.");
    ids.forEach((id, half) => {
      const flavor = products.get(id);
      if (!flavor || !isPizzaFlavor(flavor)) throw new PizzaValidationError("Um sabor escolhido não está disponível.");
      if (isPizzaFlavor(product) || size) flavorPrices.push(sizePrice(flavor, size as string | undefined));
      options.push({ name: flavor.name, group: `Pizza ${index + 1} · ${selection.mode === "whole" ? "sabor inteiro" : half === 0 ? "1ª metade" : "2ª metade"}`, price: 0 });
    });
    if (isPizzaFlavor(product) && size) {
      const prices = kinds.every(kind => kind === "TRADITIONAL") ? rules.traditional : kinds.includes("PREMIUM") && kinds.includes("TRADITIONAL") ? rules.mixed : [];
      const fixed = prices.find(entry => entry.size === size);
      if (prices.length && !fixed) throw new PizzaValidationError("Esta combinação não está disponível no tamanho escolhido.");
      if (fixed) { flavorPrices.length = 0; flavorPrices.push(fixed.price); }
    }
    if (selection.borderId) {
      const border = rules.borders.find(border => border.id === selection.borderId && border.active);
      if (!border || (rules.menus?.length && border.price <= 0)) throw new PizzaValidationError("A borda escolhida não está disponível.");
      options.push({ name: border.name, group: `Borda · Pizza ${index + 1}`, price: border.price });
    }
  });
  if (isPizzaFlavor(product) && flavorPrices.length) unitPrice = Math.max(...flavorPrices);
  return { unitPrice, options };
}
