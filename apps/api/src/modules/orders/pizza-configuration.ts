import { parseSizes, sizePrice, PizzaValidationError } from "../catalog/pizza-sizes.js";

export type PizzaSelection = { mode: "whole" | "half"; leftId?: string; rightId?: string };
export type PizzaProduct = { id: string; name: string; category: string; pizzaSlots: number; sizes?: unknown; price: unknown; promotionalPrice?: unknown };
export const isPizzaFlavor = (product: PizzaProduct) => !/combo/i.test(product.category) && (/pizza/i.test(product.category) || product.pizzaSlots === 1);

export function resolvePizzaConfiguration(product: PizzaProduct, size: unknown, selections: unknown, products: Map<string, PizzaProduct>) {
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
    ids.forEach((id, half) => {
      const flavor = products.get(id);
      if (!flavor || !isPizzaFlavor(flavor)) throw new PizzaValidationError("Um sabor escolhido não está disponível.");
      if (isPizzaFlavor(product) || size) flavorPrices.push(sizePrice(flavor, size as string | undefined));
      options.push({ name: flavor.name, group: `Pizza ${index + 1} · ${selection.mode === "whole" ? "sabor inteiro" : half === 0 ? "1ª metade" : "2ª metade"}`, price: 0 });
    });
  });
  if (isPizzaFlavor(product) && flavorPrices.length) unitPrice = Math.max(...flavorPrices);
  return { unitPrice, options };
}
